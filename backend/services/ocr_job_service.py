"""非同期 OCR / 分類ジョブ（ExtractedDocumentMeta 更新）。"""

from __future__ import annotations

import json
import logging
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

import fitz

from services.doc_classifier import classify_pdf, extract_text_from_pdf
from services.document_version_service import get_version, version_file_path
from services.extracted_document_meta import enrich_classify_metadata
from services.profile_extractors import profile_fields_from_text

logger = logging.getLogger(__name__)

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
OCR_JOBS_DB_PATH = STORAGE_DIR / "ocr_jobs.db"


def init_ocr_jobs_db() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(OCR_JOBS_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS ocr_jobs (
                id TEXT PRIMARY KEY,
                firm_id TEXT NOT NULL,
                client_id TEXT NOT NULL,
                document_version_id TEXT NOT NULL,
                period_key TEXT,
                slot_id TEXT,
                slot_label TEXT,
                status TEXT NOT NULL,
                result_json TEXT,
                error_message TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        try:
            conn.execute("ALTER TABLE ocr_jobs ADD COLUMN content_sha256 TEXT")
        except sqlite3.OperationalError:
            pass
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS document_index_state (
                document_version_id TEXT PRIMARY KEY,
                firm_id TEXT NOT NULL,
                client_id TEXT NOT NULL,
                content_sha256 TEXT NOT NULL,
                ocr_status TEXT NOT NULL,
                indexed_at TEXT,
                last_job_id TEXT,
                text_excerpt TEXT,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_doc_index_firm_status
                ON document_index_state (firm_id, client_id, ocr_status)
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_doc_index_sha
                ON document_index_state (firm_id, content_sha256)
            """
        )
        for col_sql in (
            "ALTER TABLE document_index_state ADD COLUMN rag_status TEXT",
            "ALTER TABLE document_index_state ADD COLUMN rag_error TEXT",
        ):
            try:
                conn.execute(col_sql)
            except sqlite3.OperationalError:
                pass


def _now() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


def _row_to_dict(row: sqlite3.Row) -> dict:
    result = None
    if row["result_json"]:
        try:
            result = json.loads(row["result_json"])
        except Exception:
            result = None
    keys = row.keys()
    return {
        "id": row["id"],
        "firm_id": row["firm_id"],
        "client_id": row["client_id"],
        "document_version_id": row["document_version_id"],
        "period_key": row["period_key"],
        "slot_id": row["slot_id"],
        "slot_label": row["slot_label"],
        "status": row["status"],
        "result": result,
        "error_message": row["error_message"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "content_sha256": row["content_sha256"] if "content_sha256" in keys else None,
        "reused": False,
    }


def _index_row_to_dict(row: sqlite3.Row) -> dict:
    keys = row.keys()
    return {
        "document_version_id": row["document_version_id"],
        "firm_id": row["firm_id"],
        "client_id": row["client_id"],
        "content_sha256": row["content_sha256"],
        "ocr_status": row["ocr_status"],
        "indexed_at": row["indexed_at"],
        "last_job_id": row["last_job_id"],
        "text_excerpt": row["text_excerpt"],
        "updated_at": row["updated_at"],
        "rag_status": row["rag_status"] if "rag_status" in keys else None,
        "rag_error": row["rag_error"] if "rag_error" in keys else None,
    }


def get_index_state(document_version_id: str) -> Optional[dict]:
    init_ocr_jobs_db()
    with sqlite3.connect(OCR_JOBS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM document_index_state WHERE document_version_id=?",
            (document_version_id,),
        ).fetchone()
    return _index_row_to_dict(row) if row else None


def upsert_index_state(
    *,
    document_version_id: str,
    firm_id: str,
    client_id: str,
    content_sha256: str,
    ocr_status: str,
    last_job_id: Optional[str] = None,
    text_excerpt: Optional[str] = None,
    indexed_at: Optional[str] = None,
) -> dict:
    init_ocr_jobs_db()
    now = _now()
    with sqlite3.connect(OCR_JOBS_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO document_index_state (
                document_version_id, firm_id, client_id, content_sha256,
                ocr_status, indexed_at, last_job_id, text_excerpt, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(document_version_id) DO UPDATE SET
                firm_id=excluded.firm_id,
                client_id=excluded.client_id,
                content_sha256=excluded.content_sha256,
                ocr_status=excluded.ocr_status,
                indexed_at=COALESCE(excluded.indexed_at, document_index_state.indexed_at),
                last_job_id=COALESCE(excluded.last_job_id, document_index_state.last_job_id),
                text_excerpt=COALESCE(excluded.text_excerpt, document_index_state.text_excerpt),
                updated_at=excluded.updated_at
            """,
            (
                document_version_id,
                firm_id,
                client_id,
                content_sha256,
                ocr_status,
                indexed_at,
                last_job_id,
                (text_excerpt or "")[:2000] if text_excerpt is not None else None,
                now,
            ),
        )
    return get_index_state(document_version_id)  # type: ignore[return-value]


def update_rag_index_status(
    document_version_id: str,
    *,
    rag_status: str,
    rag_error: Optional[str] = None,
) -> None:
    """Persist RAG ingest outcome without changing OCR status."""
    init_ocr_jobs_db()
    with sqlite3.connect(OCR_JOBS_DB_PATH) as conn:
        conn.execute(
            """
            UPDATE document_index_state
            SET rag_status=?, rag_error=?, updated_at=?
            WHERE document_version_id=?
            """,
            (
                rag_status,
                (rag_error or "")[:500] if rag_error else None,
                _now(),
                document_version_id,
            ),
        )


def list_index_states(
    firm_id: str,
    *,
    client_id: Optional[str] = None,
    ocr_status: Optional[str] = None,
    limit: int = 100,
) -> list[dict]:
    init_ocr_jobs_db()
    sql = "SELECT * FROM document_index_state WHERE firm_id=?"
    params: list[Any] = [firm_id]
    if client_id:
        sql += " AND client_id=?"
        params.append(client_id)
    if ocr_status:
        sql += " AND ocr_status=?"
        params.append(ocr_status)
    sql += " ORDER BY updated_at DESC LIMIT ?"
    params.append(max(1, min(limit, 500)))
    with sqlite3.connect(OCR_JOBS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(sql, params).fetchall()
    return [_index_row_to_dict(r) for r in rows]


def get_document_ocr_payload(document_version_id: str) -> Optional[dict]:
    """Version meta + OCR text excerpt for MCP get_document."""
    version = get_version(document_version_id)
    if not version:
        return None
    state = get_index_state(document_version_id)
    meta: Dict[str, Any] = {}
    if version.metadata_json:
        try:
            meta = json.loads(version.metadata_json)
        except Exception:
            meta = {}
    excerpt = (state or {}).get("text_excerpt") or meta.get("text_excerpt") or ""
    full = meta.get("ocr_full_text") or ""
    return {
        "document_version_id": version.id,
        "logical_document_id": version.logical_document_id,
        "firm_id": (state or {}).get("firm_id"),
        "client_id": (state or {}).get("client_id"),
        "original_name": version.original_name,
        "content_sha256": version.content_sha256,
        "page_count": version.page_count,
        "ocr_status": (state or {}).get("ocr_status") or meta.get("status") or "pending",
        "indexed_at": (state or {}).get("indexed_at"),
        "text_excerpt": (excerpt or full)[:2000],
        "has_full_text": bool(full),
        "classify": {
            "confidence": meta.get("confidence"),
            "engine": meta.get("engine"),
            "best": meta.get("best"),
            "category_id": meta.get("category_id"),
        },
    }


def search_index_excerpts(
    firm_id: str,
    *,
    keyword: str,
    client_id: Optional[str] = None,
    limit: int = 50,
) -> list[dict]:
    """Keyword search over OCR excerpts (I1 — no vectors). Firm scoped first."""
    init_ocr_jobs_db()
    kw = (keyword or "").strip().lower()
    if not kw:
        return []
    sql = """
        SELECT * FROM document_index_state
        WHERE firm_id=? AND ocr_status='ready'
          AND text_excerpt IS NOT NULL AND text_excerpt != ''
    """
    params: list[Any] = [firm_id]
    if client_id:
        sql += " AND client_id=?"
        params.append(client_id)
    sql += " ORDER BY indexed_at DESC LIMIT ?"
    params.append(max(1, min(limit * 5, 500)))
    with sqlite3.connect(OCR_JOBS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(sql, params).fetchall()
    hits: list[dict] = []
    for row in rows:
        item = _index_row_to_dict(row)
        hay = (item.get("text_excerpt") or "").lower()
        if kw not in hay:
            continue
        hits.append(item)
        if len(hits) >= limit:
            break
    return hits


def create_ocr_job(
    *,
    firm_id: str,
    client_id: str,
    document_version_id: str,
    period_key: Optional[str] = None,
    slot_id: Optional[str] = None,
    slot_label: Optional[str] = None,
    force: bool = False,
) -> dict:
    """Enqueue OCR. Same content_sha256 already ready => reuse (no re-run) unless force."""
    init_ocr_jobs_db()
    version = get_version(document_version_id)
    sha = (version.content_sha256 if version else "") or ""

    if not force and version and sha:
        state = get_index_state(document_version_id)
        if (
            state
            and state.get("ocr_status") == "ready"
            and state.get("content_sha256") == sha
        ):
            reused = {
                "id": state.get("last_job_id") or f"reused-{document_version_id}",
                "firm_id": firm_id,
                "client_id": client_id,
                "document_version_id": document_version_id,
                "period_key": period_key,
                "slot_id": slot_id,
                "slot_label": slot_label,
                "status": "done",
                "result": {"reused": True, "ocr_status": "ready"},
                "error_message": None,
                "created_at": state.get("updated_at"),
                "updated_at": state.get("updated_at"),
                "content_sha256": sha,
                "reused": True,
            }
            return reused

    job_id = uuid.uuid4().hex
    now = _now()
    with sqlite3.connect(OCR_JOBS_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO ocr_jobs
                (id, firm_id, client_id, document_version_id, period_key, slot_id, slot_label,
                 status, result_json, error_message, created_at, updated_at, content_sha256)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'processing', NULL, NULL, ?, ?, ?)
            """,
            (
                job_id,
                firm_id,
                client_id,
                document_version_id,
                period_key,
                slot_id,
                slot_label,
                now,
                now,
                sha or None,
            ),
        )
    upsert_index_state(
        document_version_id=document_version_id,
        firm_id=firm_id,
        client_id=client_id,
        content_sha256=sha or f"unknown:{document_version_id}",
        ocr_status="processing",
        last_job_id=job_id,
    )
    return get_ocr_job(job_id)  # type: ignore[return-value]


def get_ocr_job(job_id: str) -> Optional[dict]:
    init_ocr_jobs_db()
    with sqlite3.connect(OCR_JOBS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM ocr_jobs WHERE id=?", (job_id,)).fetchone()
    return _row_to_dict(row) if row else None


def _update_job(job_id: str, *, status: str, result: Optional[dict] = None, error: Optional[str] = None) -> None:
    with sqlite3.connect(OCR_JOBS_DB_PATH) as conn:
        conn.execute(
            """
            UPDATE ocr_jobs
            SET status=?, result_json=?, error_message=?, updated_at=?
            WHERE id=?
            """,
            (
                status,
                json.dumps(result, ensure_ascii=False) if result else None,
                error,
                _now(),
                job_id,
            ),
        )


def update_version_metadata(document_version_id: str, metadata: dict) -> bool:
    from services.document_version_service import VERSIONS_DB_PATH, init_document_versions_db

    init_document_versions_db()
    payload = json.dumps(metadata, ensure_ascii=False)
    with sqlite3.connect(VERSIONS_DB_PATH) as conn:
        cur = conn.execute(
            "UPDATE document_versions SET metadata_json=? WHERE id=?",
            (payload, document_version_id),
        )
        return cur.rowcount > 0


def run_ocr_job(job_id: str) -> dict:
    """ジョブを同期的に実行（BackgroundTasks から呼ぶ）。"""
    job = get_ocr_job(job_id)
    if not job:
        raise ValueError("job not found")

    version = get_version(job["document_version_id"])
    if not version:
        _update_job(job_id, status="failed", error="document version not found")
        upsert_index_state(
            document_version_id=job["document_version_id"],
            firm_id=job["firm_id"],
            client_id=job["client_id"],
            content_sha256=job.get("content_sha256") or f"unknown:{job['document_version_id']}",
            ocr_status="failed",
            last_job_id=job_id,
        )
        return get_ocr_job(job_id)  # type: ignore[return-value]

    path = version_file_path(version)
    if not path.exists():
        _update_job(job_id, status="failed", error="pdf file missing")
        upsert_index_state(
            document_version_id=job["document_version_id"],
            firm_id=job["firm_id"],
            client_id=job["client_id"],
            content_sha256=version.content_sha256 or f"unknown:{job['document_version_id']}",
            ocr_status="failed",
            last_job_id=job_id,
        )
        return get_ocr_job(job_id)  # type: ignore[return-value]

    content = path.read_bytes()
    slot_id = job.get("slot_id") or ""
    slot_label = job.get("slot_label") or version.original_name or "document"
    candidates = [{"id": slot_id, "label": slot_label}] if slot_id else [{"id": "unknown", "label": slot_label}]

    try:
        doc = fitz.open("pdf", content)
        page_count = len(doc)
        ocr_page_texts: list[dict[str, object]] = []
        for i in range(page_count):
            try:
                page_text = doc[i].get_text().strip()
            except Exception:
                page_text = ""
            ocr_page_texts.append({"page": i + 1, "text": page_text})
        doc.close()
    except Exception:
        page_count = 5
        ocr_page_texts = []

    try:
        result = classify_pdf(content, version.original_name, candidates, max_pages=page_count)
        full_text, text_engine = extract_text_from_pdf(content, max_pages=page_count)
        if text_engine == "tesseract" and full_text:
            chunk_size = max(1, len(full_text) // max(page_count, 1))
            for i in range(page_count):
                if i < len(ocr_page_texts):
                    ocr_page_texts[i]["text"] = full_text[i * chunk_size : (i + 1) * chunk_size]

        try:
            from services.ocr_quality_service import apply_ocr_quality_boost

            result = apply_ocr_quality_boost(
                firm_id=job["firm_id"],
                client_id=job["client_id"],
                content=content,
                filename=version.original_name or "document.pdf",
                candidates=candidates,
                classify_result=result,
                full_text=full_text or "",
                text_engine=text_engine or "none",
            )
        except Exception:
            logger.exception("ocr quality boost failed job=%s", job_id)

        if slot_id and full_text and len(full_text.strip()) >= 8:
            from services.document_extraction_schema import extract_from_schema, has_extraction_schema

            if has_extraction_schema(slot_id):
                schema_result = extract_from_schema(slot_id, full_text)
                result["extracted_profile"] = schema_result.extracted_profile
                result["field_extractions"] = [f.to_dict() for f in schema_result.fields]
                result["extraction_review_status"] = schema_result.review_status
                result["schema_version"] = schema_result.schema_version
            else:
                extracted = profile_fields_from_text(slot_id, full_text)
                if extracted:
                    result["extracted_profile"] = extracted

        classify_meta = {
            "confidence": result.get("confidence"),
            "engine": result.get("engine"),
            "best": result.get("best"),
            "ranked": result.get("ranked"),
            "text_excerpt": result.get("text_excerpt"),
            "ai_reason": result.get("ai_reason"),
            "classified_at": _now(),
            "extracted_profile": result.get("extracted_profile"),
            "field_extractions": result.get("field_extractions"),
            "extraction_review_status": result.get("extraction_review_status"),
            "schema_version": result.get("schema_version"),
            "ocr_full_text": (full_text or "")[:50000],
            "ocr_text_engine": text_engine,
            "ocr_page_texts": ocr_page_texts,
            "vision_escalated": bool(result.get("vision_escalated")),
            "vision_type": result.get("vision_type"),
        }
        enriched = enrich_classify_metadata(
            classify_meta,
            client_id=job["client_id"],
            period_key=job.get("period_key") or "",
            slot_id=slot_id or "unknown",
        )
        update_version_metadata(job["document_version_id"], enriched)

        normalize_payload = None
        period_key = job.get("period_key") or ""
        if slot_id and period_key and job.get("firm_id"):
            try:
                from services.ssot_ingest import (
                    ingest_from_slot_document,
                    ingest_result_for_response,
                )

                norm = ingest_from_slot_document(
                    firm_id=job["firm_id"],
                    client_id=job["client_id"],
                    period_key=period_key,
                    slot_id=slot_id,
                    slot_label=slot_label,
                    pdf_content=content,
                    classify_metadata=enriched,
                )
                normalize_payload = ingest_result_for_response(norm)
            except Exception:
                normalize_payload = None

        job_result = {**enriched, "normalize_result": normalize_payload}
        _update_job(job_id, status="done", result=job_result)
        upsert_index_state(
            document_version_id=job["document_version_id"],
            firm_id=job["firm_id"],
            client_id=job["client_id"],
            content_sha256=version.content_sha256,
            ocr_status="ready",
            last_job_id=job_id,
            text_excerpt=str(enriched.get("text_excerpt") or full_text or "")[:2000],
            indexed_at=_now(),
        )
        try:
            from services.rag_index_service import ingest_ocr_document

            rag_text = str(full_text or enriched.get("text_excerpt") or "")
            rag_result = ingest_ocr_document(
                firm_id=job["firm_id"],
                client_id=job["client_id"],
                document_version_id=job["document_version_id"],
                content_sha256=version.content_sha256 or "",
                text=rag_text,
                logical_document_id=version.logical_document_id,
            )
            update_rag_index_status(
                job["document_version_id"],
                rag_status="ready",
                rag_error=None,
            )
            logger.info(
                "rag ingest ok ver=%s chunks=%s reused=%s",
                job["document_version_id"],
                rag_result.get("chunk_count"),
                rag_result.get("reused"),
            )
        except Exception as rag_exc:
            logger.exception(
                "rag ingest failed ver=%s job=%s",
                job["document_version_id"],
                job_id,
            )
            try:
                update_rag_index_status(
                    job["document_version_id"],
                    rag_status="failed",
                    rag_error=str(rag_exc)[:500],
                )
            except Exception:
                logger.exception(
                    "rag_status update failed ver=%s", job["document_version_id"]
                )
        try:
            from services.auto_vouching import process_auto_vouch_queue_for_version

            process_auto_vouch_queue_for_version(job["document_version_id"])
        except Exception:
            logger.exception(
                "auto_vouch after OCR failed ver=%s", job["document_version_id"]
            )
    except Exception as exc:
        _update_job(job_id, status="failed", error=str(exc)[:500])
        processing_meta = enrich_classify_metadata(
            {"confidence": 0, "engine": "none", "status": "failed"},
            client_id=job["client_id"],
            period_key=job.get("period_key") or "",
            slot_id=slot_id or "unknown",
        )
        processing_meta["status"] = "failed"
        update_version_metadata(job["document_version_id"], processing_meta)
        upsert_index_state(
            document_version_id=job["document_version_id"],
            firm_id=job["firm_id"],
            client_id=job["client_id"],
            content_sha256=version.content_sha256 if version else f"unknown:{job['document_version_id']}",
            ocr_status="failed",
            last_job_id=job_id,
        )

    return get_ocr_job(job_id)  # type: ignore[return-value]
