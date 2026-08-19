"""ZIP 一括取り込み・要確認キュー・ジョブ管理。"""

from __future__ import annotations

import json
import sqlite3
import uuid
import zipfile
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any, List, Optional

from services.ai_prompts import get_prompt_template, PROMPT_KEY_CLASSIFY_VISION
from services.firm_settings import get_gemini_key, get_openai_key, load_system_config_raw
from services.migration_aliases import learn_from_migration_path, learning_scope_payload, load_aliases
from services.migration_classify import AUTO_PLACE_THRESHOLD, classify_migration_pdf
from services.migration_path_parse import (
    clients_for_firm,
    match_client_from_path,
    parse_period_from_path,
)
from services.migration_persist import persist_pdf_to_slot
from services.migration_wallet import (
    check_migration_budget,
    get_migration_wallet,
    migration_estimate_tokens_per_pdf,
    VISION_TOKEN_FLOOR,
    yen_from_migration_tokens,
)
from services.tax_document_types import label_for_type

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
MIGRATION_DB_PATH = STORAGE_DIR / "migration_ingest.db"

PRIVACY_SUMMARY = {
    "stored": [
        "PDF 本体（当該事務所の storage 内のみ）",
        "ZIP 内のフォルダパス・ファイル名",
        "分類メタ（書類種別・確信度・使用エンジン名）",
        "確定後に学習するフォルダ名→顧問先 ID のエイリアス（当該事務所のみ）",
    ],
    "notStored": [
        "他事務所とのデータ共有・横断学習",
        "分類用に一時利用した OCR/Vision 全文の恒久保存（通常はメタのみ）",
        "ZIP 以外の個人情報の外部送信",
    ],
    "learningScope": "firm_local_plus_global_doc_types",
    "learningScopeNote": (
        "顧問先の紐づけは事務所内のみ。"
        "PROLEXT税理士法人（1社目）の確定から、書類種別フォルダ名だけ全事務所が参照します。"
        "顧問先名・client_id は共有しません。"
    ),
}


def _now() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


def init_migration_ingest_db() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(MIGRATION_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS migration_jobs (
                id TEXT PRIMARY KEY,
                firm_id TEXT NOT NULL,
                status TEXT NOT NULL,
                source_name TEXT,
                total_files INTEGER NOT NULL DEFAULT 0,
                processed INTEGER NOT NULL DEFAULT 0,
                auto_placed INTEGER NOT NULL DEFAULT 0,
                pending_count INTEGER NOT NULL DEFAULT 0,
                failed INTEGER NOT NULL DEFAULT 0,
                tokens_used INTEGER NOT NULL DEFAULT 0,
                error TEXT,
                created_at TEXT NOT NULL,
                created_by TEXT,
                finished_at TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS migration_pending_items (
                id TEXT PRIMARY KEY,
                firm_id TEXT NOT NULL,
                job_id TEXT NOT NULL,
                source_path TEXT NOT NULL,
                file_name TEXT NOT NULL,
                storage_path TEXT NOT NULL,
                byte_size INTEGER NOT NULL DEFAULT 0,
                suggested_client_id TEXT,
                client_match_confidence REAL NOT NULL DEFAULT 0,
                suggested_period_key TEXT,
                period_match_confidence REAL NOT NULL DEFAULT 0,
                suggested_slot_id TEXT,
                suggested_type TEXT,
                slot_label TEXT,
                confidence REAL NOT NULL DEFAULT 0,
                engine TEXT,
                classify_metadata_json TEXT,
                created_at TEXT NOT NULL,
                created_by TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_migration_pending_firm
            ON migration_pending_items (firm_id, created_at DESC)
            """
        )
        _ensure_job_columns(conn)


def _ensure_job_columns(conn: sqlite3.Connection) -> None:
    cols = {row[1] for row in conn.execute("PRAGMA table_info(migration_jobs)").fetchall()}
    if "estimated_tokens" not in cols:
        conn.execute("ALTER TABLE migration_jobs ADD COLUMN estimated_tokens INTEGER NOT NULL DEFAULT 0")
    if "estimated_yen" not in cols:
        conn.execute("ALTER TABLE migration_jobs ADD COLUMN estimated_yen INTEGER NOT NULL DEFAULT 0")
    if "estimated_tokens_low" not in cols:
        conn.execute("ALTER TABLE migration_jobs ADD COLUMN estimated_tokens_low INTEGER NOT NULL DEFAULT 0")
    if "estimated_tokens_high" not in cols:
        conn.execute("ALTER TABLE migration_jobs ADD COLUMN estimated_tokens_high INTEGER NOT NULL DEFAULT 0")


def _pending_dir(firm_id: str) -> Path:
    path = STORAGE_DIR / "firms" / firm_id / "migration_pending"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _default_slot_candidates() -> list[dict[str, str]]:
    from services.tax_document_types import TAX_DOCUMENT_TYPES, label_for_type, slot_id_for_type

    out: list[dict[str, str]] = []
    for doc_type in TAX_DOCUMENT_TYPES:
        if doc_type == "UNKNOWN":
            continue
        out.append({"id": slot_id_for_type(doc_type), "label": label_for_type(doc_type)})
    return out


def privacy_payload() -> dict[str, Any]:
    return dict(PRIVACY_SUMMARY)


def get_status_payload(firm_id: str) -> dict[str, Any]:
    wallet = get_migration_wallet(firm_id)
    aliases = load_aliases(firm_id)
    scope = learning_scope_payload(firm_id)
    init_migration_ingest_db()
    with sqlite3.connect(MIGRATION_DB_PATH) as conn:
        pending = conn.execute(
            "SELECT COUNT(*) FROM migration_pending_items WHERE firm_id=?",
            (firm_id,),
        ).fetchone()[0]
    return {
        "wallet": wallet,
        "pendingCount": int(pending),
        "aliasCount": len(aliases),
        "globalAliasCount": scope.get("globalAliasCount", 0),
        "learningScope": scope,
        "privacy": privacy_payload(),
        "autoPlaceThreshold": AUTO_PLACE_THRESHOLD,
    }


def _serialize_pending(row: dict[str, Any]) -> dict[str, Any]:
    meta = None
    if row.get("classify_metadata_json"):
        try:
            meta = json.loads(row["classify_metadata_json"])
        except json.JSONDecodeError:
            meta = None
    return {
        "id": row["id"],
        "jobId": row["job_id"],
        "sourcePath": row["source_path"],
        "fileName": row["file_name"],
        "byteSize": int(row.get("byte_size") or 0),
        "suggestedClientId": row.get("suggested_client_id"),
        "clientMatchConfidence": float(row.get("client_match_confidence") or 0),
        "suggestedPeriodKey": row.get("suggested_period_key"),
        "periodMatchConfidence": float(row.get("period_match_confidence") or 0),
        "suggestedSlotId": row.get("suggested_slot_id"),
        "suggestedType": row.get("suggested_type"),
        "slotLabel": row.get("slot_label"),
        "confidence": float(row.get("confidence") or 0),
        "engine": row.get("engine") or "none",
        "classifyMetadata": meta,
        "createdAt": row.get("created_at"),
        "createdBy": row.get("created_by"),
    }


def list_pending_items(firm_id: str, job_id: Optional[str] = None) -> List[dict[str, Any]]:
    init_migration_ingest_db()
    with sqlite3.connect(MIGRATION_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        if job_id:
            rows = conn.execute(
                """
                SELECT * FROM migration_pending_items
                WHERE firm_id=? AND job_id=?
                ORDER BY source_path ASC
                """,
                (firm_id, job_id),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT * FROM migration_pending_items
                WHERE firm_id=?
                ORDER BY created_at DESC, source_path ASC
                """,
                (firm_id,),
            ).fetchall()
    return [_serialize_pending(dict(r)) for r in rows]


def get_pending_file_path(firm_id: str, item_id: str) -> Optional[Path]:
    init_migration_ingest_db()
    with sqlite3.connect(MIGRATION_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT storage_path FROM migration_pending_items WHERE id=? AND firm_id=?",
            (item_id, firm_id),
        ).fetchone()
    if not row:
        return None
    path = Path(row["storage_path"])
    return path if path.exists() else None


def _fetch_pending(firm_id: str, item_id: str) -> Optional[dict[str, Any]]:
    init_migration_ingest_db()
    with sqlite3.connect(MIGRATION_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM migration_pending_items WHERE id=? AND firm_id=?",
            (item_id, firm_id),
        ).fetchone()
    return dict(row) if row else None


def delete_pending_item(firm_id: str, item_id: str) -> bool:
    row = _fetch_pending(firm_id, item_id)
    if not row:
        return False
    path = Path(row["storage_path"])
    if path.exists():
        try:
            path.unlink()
        except OSError:
            pass
    with sqlite3.connect(MIGRATION_DB_PATH) as conn:
        conn.execute(
            "DELETE FROM migration_pending_items WHERE id=? AND firm_id=?",
            (item_id, firm_id),
        )
    return True


def get_job(firm_id: str, job_id: str) -> Optional[dict[str, Any]]:
    init_migration_ingest_db()
    with sqlite3.connect(MIGRATION_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM migration_jobs WHERE id=? AND firm_id=?",
            (job_id, firm_id),
        ).fetchone()
    if not row:
        return None
    return _serialize_job(dict(row))


def _serialize_job(row: dict[str, Any]) -> dict[str, Any]:
    tokens_used = int(row.get("tokens_used") or 0)
    estimated_tokens = int(row.get("estimated_tokens") or 0)
    estimated_yen = int(row.get("estimated_yen") or 0)
    if not estimated_yen and estimated_tokens:
        estimated_yen = yen_from_migration_tokens(estimated_tokens)
    return {
        "id": row["id"],
        "status": row["status"],
        "sourceName": row.get("source_name"),
        "totalFiles": int(row.get("total_files") or 0),
        "processed": int(row.get("processed") or 0),
        "autoPlaced": int(row.get("auto_placed") or 0),
        "pendingCount": int(row.get("pending_count") or 0),
        "failed": int(row.get("failed") or 0),
        "estimatedTokens": estimated_tokens,
        "estimatedTokensLow": int(row.get("estimated_tokens_low") or 0),
        "estimatedTokensHigh": int(row.get("estimated_tokens_high") or 0),
        "estimatedYen": estimated_yen,
        "tokensUsed": tokens_used,
        "actualYen": yen_from_migration_tokens(tokens_used),
        "error": row.get("error"),
        "createdAt": row.get("created_at"),
        "createdBy": row.get("created_by"),
        "finishedAt": row.get("finished_at"),
    }


def list_recent_jobs(firm_id: str, limit: int = 10) -> List[dict[str, Any]]:
    init_migration_ingest_db()
    with sqlite3.connect(MIGRATION_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT * FROM migration_jobs
            WHERE firm_id=?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (firm_id, max(1, min(limit, 50))),
        ).fetchall()
    return [_serialize_job(dict(r)) for r in rows]


def _vision_capable(firm_id: str) -> bool:
    cfg = load_system_config_raw(firm_id)
    openai_key = get_openai_key(firm_id)
    gemini_key = get_gemini_key(firm_id)
    return bool(
        cfg.get("ocr_auto_extract_enabled")
        and (
            (cfg.get("ai_openai_enabled") and openai_key)
            or (cfg.get("ai_gemini_enabled") and gemini_key)
        )
    )


def count_pdfs_in_zip(zip_bytes: bytes) -> int:
    try:
        with zipfile.ZipFile(BytesIO(zip_bytes)) as zf:
            return sum(
                1
                for info in zf.infolist()
                if not info.is_dir()
                and info.filename.lower().endswith(".pdf")
                and info.file_size > 0
            )
    except zipfile.BadZipFile:
        return 0


def estimate_zip_ingest(firm_id: str, zip_bytes: bytes) -> dict[str, Any]:
    pdf_count = count_pdfs_in_zip(zip_bytes)
    per_pdf = migration_estimate_tokens_per_pdf()
    vision = _vision_capable(firm_id)
    low = 0
    high = pdf_count * (VISION_TOKEN_FLOOR if vision else 50)
    mid = pdf_count * per_pdf
    estimated_tokens = mid
    estimated_yen = yen_from_migration_tokens(estimated_tokens)
    wallet = get_migration_wallet(firm_id)
    budget = check_migration_budget(firm_id, estimated_tokens=estimated_tokens)
    return {
        "pdfCount": pdf_count,
        "visionCapable": vision,
        "estimatedTokens": estimated_tokens,
        "estimatedTokensLow": low,
        "estimatedTokensHigh": high,
        "estimatedYen": estimated_yen,
        "estimatedYenLow": yen_from_migration_tokens(low),
        "estimatedYenHigh": yen_from_migration_tokens(high),
        "estimateTokensPerPdf": per_pdf,
        "wallet": wallet,
        "budget": budget,
    }


def _update_job(job_id: str, **fields: Any) -> None:
    keys = list(fields.keys())
    if not keys:
        return
    assigns = ", ".join(f"{k}=?" for k in keys)
    vals = list(fields.values()) + [job_id]
    with sqlite3.connect(MIGRATION_DB_PATH) as conn:
        conn.execute(f"UPDATE migration_jobs SET {assigns} WHERE id=?", vals)


def _create_pending(
    *,
    firm_id: str,
    job_id: str,
    source_path: str,
    file_name: str,
    content: bytes,
    suggestions: dict[str, Any],
    created_by: Optional[str],
) -> None:
    item_id = uuid.uuid4().hex
    safe_name = (file_name or "document.pdf").replace("\\", "_").replace("/", "_")
    storage_path = _pending_dir(firm_id) / f"{item_id}_{safe_name}"
    storage_path.write_bytes(content)
    meta = suggestions.get("classifyMetadata")
    with sqlite3.connect(MIGRATION_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO migration_pending_items (
                id, firm_id, job_id, source_path, file_name, storage_path, byte_size,
                suggested_client_id, client_match_confidence,
                suggested_period_key, period_match_confidence,
                suggested_slot_id, suggested_type, slot_label,
                confidence, engine, classify_metadata_json, created_at, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                item_id,
                firm_id,
                job_id,
                source_path,
                file_name,
                str(storage_path),
                len(content),
                suggestions.get("suggestedClientId"),
                float(suggestions.get("clientMatchConfidence") or 0),
                suggestions.get("suggestedPeriodKey"),
                float(suggestions.get("periodMatchConfidence") or 0),
                suggestions.get("suggestedSlotId"),
                suggestions.get("suggestedType"),
                suggestions.get("slotLabel"),
                float(suggestions.get("confidence") or 0),
                suggestions.get("engine"),
                json.dumps(meta, ensure_ascii=False) if meta else None,
                _now(),
                created_by,
            ),
        )


def _learn_from_path(
    firm_id: str,
    source_path: str,
    client_id: str,
    slot_id: str,
    identified_type: str,
) -> None:
    learn_from_migration_path(firm_id, source_path, client_id, slot_id, identified_type)


def create_migration_job(
    firm_id: str,
    source_name: str,
    created_by: Optional[str],
) -> str:
    init_migration_ingest_db()
    job_id = uuid.uuid4().hex
    now = _now()
    with sqlite3.connect(MIGRATION_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO migration_jobs (
                id, firm_id, status, source_name, created_at, created_by
            ) VALUES (?, ?, 'queued', ?, ?, ?)
            """,
            (job_id, firm_id, source_name, now, created_by),
        )
    return job_id


def run_migration_job(
    firm_id: str,
    job_id: str,
    zip_bytes: bytes,
    created_by: Optional[str],
    *,
    vision_mode: str = "auto",
) -> dict[str, Any]:
    init_migration_ingest_db()
    estimate = estimate_zip_ingest(firm_id, zip_bytes)
    budget = estimate.get("budget") or check_migration_budget(firm_id, estimated_tokens=500)
    if not budget.get("allowed"):
        _update_job(
            job_id,
            status="failed",
            error="insufficient_migration_tokens",
            finished_at=_now(),
        )
        return {
            "ok": False,
            "reason": "insufficient_migration_tokens",
            "wallet": budget,
            "jobId": job_id,
        }

    _update_job(
        job_id,
        status="processing",
        estimated_tokens=estimate["estimatedTokens"],
        estimated_yen=estimate["estimatedYen"],
        estimated_tokens_low=estimate["estimatedTokensLow"],
        estimated_tokens_high=estimate["estimatedTokensHigh"],
    )

    cfg = load_system_config_raw(firm_id)
    openai_key = get_openai_key(firm_id)
    gemini_key = get_gemini_key(firm_id)
    vision_prompt_tpl, _ = get_prompt_template(firm_id, PROMPT_KEY_CLASSIFY_VISION)
    slot_candidates = _default_slot_candidates()
    clients = clients_for_firm(firm_id)

    pdf_entries: list[tuple[str, bytes]] = []
    try:
        with zipfile.ZipFile(BytesIO(zip_bytes)) as zf:
            for info in zf.infolist():
                if info.is_dir():
                    continue
                name = info.filename
                if not name.lower().endswith(".pdf"):
                    continue
                if info.file_size <= 0:
                    continue
                try:
                    data = zf.read(info)
                except (zipfile.BadZipFile, RuntimeError, OSError):
                    continue
                if data:
                    pdf_entries.append((name, data))
    except zipfile.BadZipFile:
        _update_job(
            job_id,
            status="failed",
            error="invalid_zip",
            finished_at=_now(),
        )
        return {"ok": False, "jobId": job_id, "reason": "invalid_zip"}

    total = len(pdf_entries)
    processed = 0
    auto_placed = 0
    pending_count = 0
    failed = 0
    tokens_used = 0

    _update_job(job_id, total_files=total)

    for source_path, content in pdf_entries:
        processed += 1
        file_name = Path(source_path.replace("\\", "/")).name
        try:
            client_id, client_conf = match_client_from_path(source_path, firm_id, clients)
            period_key, period_conf = parse_period_from_path(source_path)
            classify = classify_migration_pdf(
                firm_id,
                content,
                file_name,
                slot_candidates=slot_candidates,
                cfg=cfg,
                openai_key=openai_key,
                gemini_key=gemini_key,
                vision_prompt_tpl=vision_prompt_tpl,
                source_path=source_path,
                vision_mode=vision_mode,
            )
            tokens_used += int(classify.get("tokensCharged") or 0)
            slot_id = str(classify.get("slotId") or "")
            doc_type = str(classify.get("identifiedType") or "UNKNOWN")
            confidence = float(classify.get("confidence") or 0)
            slot_label = label_for_type(doc_type)
            classify_meta = {
                "identifiedType": doc_type,
                "confidence": confidence,
                "engine": classify.get("engine"),
                "reason": classify.get("reason"),
                "source": "migration",
                "sourcePath": source_path,
            }

            can_auto = (
                client_id
                and period_key
                and slot_id
                and confidence >= AUTO_PLACE_THRESHOLD
            )
            if can_auto:
                persist_pdf_to_slot(
                    client_id=client_id,
                    period_key=period_key,
                    slot_id=slot_id,
                    slot_label=slot_label,
                    content=content,
                    filename=file_name,
                    uploaded_by=created_by or "migration",
                    classify_metadata=classify_meta,
                )
                _learn_from_path(firm_id, source_path, client_id, slot_id, doc_type)
                auto_placed += 1
            else:
                _create_pending(
                    firm_id=firm_id,
                    job_id=job_id,
                    source_path=source_path,
                    file_name=file_name,
                    content=content,
                    suggestions={
                        "suggestedClientId": client_id,
                        "clientMatchConfidence": client_conf,
                        "suggestedPeriodKey": period_key,
                        "periodMatchConfidence": period_conf,
                        "suggestedSlotId": slot_id,
                        "suggestedType": doc_type,
                        "slotLabel": slot_label,
                        "confidence": confidence,
                        "engine": classify.get("engine"),
                        "classifyMetadata": classify_meta,
                    },
                    created_by=created_by,
                )
                pending_count += 1
        except Exception:
            failed += 1

        _update_job(
            job_id,
            processed=processed,
            auto_placed=auto_placed,
            pending_count=pending_count,
            failed=failed,
            tokens_used=tokens_used,
        )

    _update_job(
        job_id,
        status="completed",
        finished_at=_now(),
    )
    job = get_job(firm_id, job_id)
    return {"ok": True, "job": job, "jobId": job_id, "wallet": get_migration_wallet(firm_id)}


def start_zip_ingest(
    firm_id: str,
    zip_bytes: bytes,
    source_name: str,
    created_by: Optional[str],
    *,
    vision_mode: str = "auto",
) -> dict[str, Any]:
    job_id = create_migration_job(firm_id, source_name, created_by)
    return run_migration_job(
        firm_id, job_id, zip_bytes, created_by, vision_mode=vision_mode,
    )


def _update_pending_suggestions(
    firm_id: str,
    item_id: str,
    *,
    classify: dict[str, Any],
    client_id: Optional[str],
    client_conf: float,
    period_key: Optional[str],
    period_conf: float,
) -> None:
    doc_type = str(classify.get("identifiedType") or "UNKNOWN")
    slot_id = str(classify.get("slotId") or "")
    confidence = float(classify.get("confidence") or 0)
    slot_label = label_for_type(doc_type)
    classify_meta = {
        "identifiedType": doc_type,
        "confidence": confidence,
        "engine": classify.get("engine"),
        "reason": classify.get("reason"),
        "source": "migration",
        "visionMode": classify.get("visionMode"),
    }
    init_migration_ingest_db()
    with sqlite3.connect(MIGRATION_DB_PATH) as conn:
        conn.execute(
            """
            UPDATE migration_pending_items SET
                suggested_client_id=?,
                client_match_confidence=?,
                suggested_period_key=?,
                period_match_confidence=?,
                suggested_slot_id=?,
                suggested_type=?,
                slot_label=?,
                confidence=?,
                engine=?,
                classify_metadata_json=?
            WHERE id=? AND firm_id=?
            """,
            (
                client_id,
                client_conf,
                period_key,
                period_conf,
                slot_id,
                doc_type,
                slot_label,
                confidence,
                classify.get("engine"),
                json.dumps(classify_meta, ensure_ascii=False),
                item_id,
                firm_id,
            ),
        )


def reclassify_pending_items(
    firm_id: str,
    item_ids: list[str],
    *,
    vision_mode: str = "on",
    source_path_prefix: Optional[str] = None,
) -> dict[str, Any]:
    """要確認キューの一部だけ Vision 等で再分類（提案値を更新、自動配置はしない）。"""
    init_migration_ingest_db()
    ids = [i.strip() for i in item_ids if i and i.strip()]
    if not ids and source_path_prefix:
        prefix = source_path_prefix.replace("\\", "/").strip()
        items = list_pending_items(firm_id)
        ids = [
            i["id"]
            for i in items
            if str(i.get("sourcePath") or "").replace("\\", "/").startswith(prefix)
        ]
    if not ids:
        return {"ok": False, "reason": "no_items", "updated": 0, "tokensUsed": 0}

    cfg = load_system_config_raw(firm_id)
    openai_key = get_openai_key(firm_id)
    gemini_key = get_gemini_key(firm_id)
    vision_prompt_tpl, _ = get_prompt_template(firm_id, PROMPT_KEY_CLASSIFY_VISION)
    slot_candidates = _default_slot_candidates()
    clients = clients_for_firm(firm_id)

    updated = 0
    tokens_used = 0
    errors: list[dict[str, str]] = []

    for item_id in ids:
        row = _fetch_pending(firm_id, item_id)
        if not row:
            errors.append({"id": item_id, "reason": "not_found"})
            continue
        path = Path(row["storage_path"])
        if not path.exists():
            errors.append({"id": item_id, "reason": "file_missing"})
            continue
        content = path.read_bytes()
        source_path = row["source_path"]
        file_name = row["file_name"]
        try:
            client_id, client_conf = match_client_from_path(source_path, firm_id, clients)
            period_key, period_conf = parse_period_from_path(source_path)
            classify = classify_migration_pdf(
                firm_id,
                content,
                file_name,
                slot_candidates=slot_candidates,
                cfg=cfg,
                openai_key=openai_key,
                gemini_key=gemini_key,
                vision_prompt_tpl=vision_prompt_tpl,
                source_path=source_path,
                vision_mode=vision_mode,
            )
            tokens_used += int(classify.get("tokensCharged") or 0)
            _update_pending_suggestions(
                firm_id,
                item_id,
                classify=classify,
                client_id=client_id,
                client_conf=client_conf,
                period_key=period_key,
                period_conf=period_conf,
            )
            updated += 1
        except Exception:
            errors.append({"id": item_id, "reason": "classify_failed"})

    return {
        "ok": True,
        "updated": updated,
        "tokensUsed": tokens_used,
        "actualYen": yen_from_migration_tokens(tokens_used),
        "errors": errors,
        "wallet": get_migration_wallet(firm_id),
    }


def confirm_pending_item(
    firm_id: str,
    item_id: str,
    *,
    client_id: str,
    period_key: str,
    slot_id: str,
    slot_label: Optional[str],
    actor: Optional[str],
) -> dict[str, Any]:
    row = _fetch_pending(firm_id, item_id)
    if not row:
        return {"ok": False, "reason": "not_found"}
    path = Path(row["storage_path"])
    if not path.exists():
        delete_pending_item(firm_id, item_id)
        return {"ok": False, "reason": "file_missing"}
    content = path.read_bytes()
    meta = None
    if row.get("classify_metadata_json"):
        try:
            meta = json.loads(row["classify_metadata_json"])
        except json.JSONDecodeError:
            meta = None
    label = slot_label or row.get("slot_label") or f"slot-{slot_id}"
    result = persist_pdf_to_slot(
        client_id=client_id,
        period_key=period_key,
        slot_id=slot_id,
        slot_label=label,
        content=content,
        filename=row["file_name"],
        uploaded_by=actor or "migration",
        classify_metadata=meta,
    )
    doc_type = str((meta or {}).get("identifiedType") or row.get("suggested_type") or "UNKNOWN")
    _learn_from_path(firm_id, row["source_path"], client_id, slot_id, doc_type)
    delete_pending_item(firm_id, item_id)
    return {"ok": True, "persist": result}


def batch_confirm_pending(
    firm_id: str,
    item_ids: list[str],
    *,
    client_id: str,
    period_key: str,
    slot_id: str,
    slot_label: Optional[str],
    actor: Optional[str],
) -> dict[str, Any]:
    confirmed = 0
    errors: list[dict[str, str]] = []
    for item_id in item_ids:
        out = confirm_pending_item(
            firm_id,
            item_id,
            client_id=client_id,
            period_key=period_key,
            slot_id=slot_id,
            slot_label=slot_label,
            actor=actor,
        )
        if out.get("ok"):
            confirmed += 1
        else:
            errors.append({"id": item_id, "reason": str(out.get("reason"))})
    return {"confirmed": confirmed, "errors": errors}
