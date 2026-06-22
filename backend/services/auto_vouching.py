"""Auto-Vouching: PDF 上の数値を自動検索し、監査メタデータ付きハイライトを刻み込む。"""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Literal

import fitz

from services.auto_vouch_fields import resolve_context_hint
STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
AUTO_VOUCH_DB_PATH = STORAGE_DIR / "auto_vouch_stamps.db"
AUTO_VOUCH_QUEUE_DB_PATH = STORAGE_DIR / "auto_vouch_queue.db"
# 監査スタンプの視覚色（琥珀系 — Acrobat でも識別しやすい）
_AUDIT_HIGHLIGHT = (1.0, 0.85, 0.2)
_STAMP_SUBJECT = "TAXX-AutoVouch"


class MatchStrategy(str, Enum):
    """複数ヒット時の採用方針。"""

    ALL = "all"
    BEST = "best"
    FIRST = "first"


class AutoVouchErrorCode(str, Enum):
    NOT_FOUND = "not_found"
    NO_TEXT_LAYER = "no_text_layer"
    NO_MATCH = "no_match"
    INVALID_PATH = "invalid_path"
    INVALID_INPUT = "invalid_input"


@dataclass(frozen=True)
class MatchedCoordinate:
    """マッチしたテキストの位置（API 応答用）。"""

    page: int  # 1-based
    x: float
    y: float
    width: float
    height: float
    matched_text: str
    x_norm: float = 0.0
    y_norm: float = 0.0
    width_norm: float = 0.0
    height_norm: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class AutoVouchResult:
    status: Literal["success", "error"]
    output_pdf_path: str = ""
    matched_coordinates: list[MatchedCoordinate] = field(default_factory=list)
    message: str = ""
    ocr_recommended: bool = False
    stamp_id: str = ""
    error_code: str = ""
    dry_run: bool = False
    source_pdf_path: str = ""
    total_matches_found: int = 0
    new_version_id: str = ""
    queue_id: str = ""
    ocr_job_id: str = ""
    match_source: str = ""

    def to_response(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "output_pdf_path": self.output_pdf_path,
            "matched_coordinates": [c.to_dict() for c in self.matched_coordinates],
            "message": self.message,
            "ocr_recommended": self.ocr_recommended,
            "stamp_id": self.stamp_id,
            "error_code": self.error_code or None,
            "dry_run": self.dry_run,
            "source_pdf_path": self.source_pdf_path or None,
            "total_matches_found": self.total_matches_found,
            "new_version_id": self.new_version_id or None,
            "queue_id": self.queue_id or None,
            "ocr_job_id": self.ocr_job_id or None,
            "match_source": self.match_source or None,
        }

    def http_status(self) -> int:
        if self.status == "success":
            return 200
        if self.error_code == AutoVouchErrorCode.NOT_FOUND.value:
            return 404
        if self.error_code == AutoVouchErrorCode.INVALID_PATH.value:
            return 400
        if self.error_code in (
            AutoVouchErrorCode.NO_TEXT_LAYER.value,
            AutoVouchErrorCode.NO_MATCH.value,
            AutoVouchErrorCode.INVALID_INPUT.value,
        ):
            return 422
        return 422


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def resolve_vouching_pdf_path(pdf_file_path: str) -> Path:
    """storage 配下の PDF パスを安全に解決する。

    Raises:
        ValueError: storage 外のパス、または PDF 以外。
        FileNotFoundError: ファイルが存在しない。
    """
    raw = Path(pdf_file_path.strip())
    storage_root = STORAGE_DIR.resolve()
    if raw.is_absolute():
        resolved = raw.resolve()
    else:
        resolved = (storage_root / raw).resolve()
    try:
        resolved.relative_to(storage_root)
    except ValueError as exc:
        raise ValueError("pdf_file_path must be under backend/storage") from exc
    if not resolved.exists():
        raise FileNotFoundError(f"PDF not found: {resolved}")
    if resolved.suffix.lower() != ".pdf":
        raise ValueError("pdf_file_path must point to a .pdf file")
    return resolved


def init_auto_vouch_db() -> None:
    """auto_vouch_stamps テーブルを初期化する。"""
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(AUTO_VOUCH_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS auto_vouch_stamps (
                id TEXT PRIMARY KEY,
                source_pdf_path TEXT NOT NULL,
                output_pdf_path TEXT NOT NULL,
                field_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                target_value TEXT NOT NULL,
                match_count INTEGER NOT NULL,
                matches_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                version_id TEXT,
                dry_run INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        columns = {row[1] for row in conn.execute("PRAGMA table_info(auto_vouch_stamps)").fetchall()}
        if "version_id" not in columns:
            conn.execute("ALTER TABLE auto_vouch_stamps ADD COLUMN version_id TEXT")
        if "dry_run" not in columns:
            conn.execute("ALTER TABLE auto_vouch_stamps ADD COLUMN dry_run INTEGER NOT NULL DEFAULT 0")


def _relative_storage_path(path: Path) -> str:
    return str(path.relative_to(STORAGE_DIR.resolve())).replace("\\", "/")


def resolve_pdf_input(
    *,
    pdf_file_path: str | None = None,
    version_id: str | None = None,
) -> tuple[Path, str | None]:
    """pdf_file_path または version_id から storage 内 PDF を解決する。"""
    if version_id:
        from services.document_version_service import get_version, version_file_path

        version = get_version(version_id.strip())
        if version is None:
            raise FileNotFoundError(f"Document version not found: {version_id}")
        path = version_file_path(version).resolve()
        storage_root = STORAGE_DIR.resolve()
        try:
            path.relative_to(storage_root)
        except ValueError as exc:
            raise ValueError("version file path must be under backend/storage") from exc
        if not path.exists():
            raise FileNotFoundError(f"PDF not found for version: {version_id}")
        if path.suffix.lower() != ".pdf":
            raise ValueError("version file must be a PDF")
        return path, version_id.strip()

    if not pdf_file_path or not pdf_file_path.strip():
        raise ValueError("pdf_file_path or version_id is required")
    return resolve_vouching_pdf_path(pdf_file_path), None


def _to_halfwidth(text: str) -> str:
    out: list[str] = []
    for ch in text:
        code = ord(ch)
        if 0xFF10 <= code <= 0xFF19:
            out.append(chr(code - 0xFEE0))
        elif ch in ("，", "．", "　"):
            out.append({"，": ",", "．": ".", "　": " "}[ch])
        else:
            out.append(ch)
    return "".join(out)


def normalize_numeric_text(value: str | float | int) -> str:
    """数値文字列を桁のみの正規形に変換する（カンマ・通貨記号・空白を除去）。"""
    s = _to_halfwidth(str(value).strip())
    digits = re.sub(r"[^\d]", "", s)
    return digits


def build_search_variants(target_value: str | float | int) -> list[str]:
    """PyMuPDF search_for 用の表示バリアントを生成する。"""
    canonical = normalize_numeric_text(target_value)
    if not canonical:
        return [str(target_value).strip()]
    variants: set[str] = {canonical, str(target_value).strip()}
    try:
        n = int(canonical)
        formatted = f"{n:,}"
        variants.add(formatted)
        variants.add(f"¥{formatted}")
        variants.add(f"¥{canonical}")
        variants.add(f"￥{formatted}")
        if len(canonical) >= 4:
            variants.add(f"{canonical[:2]},{canonical[2:]}")
    except ValueError:
        pass
    return [v for v in variants if v]


def pdf_has_text_layer(doc: fitz.Document) -> bool:
    """PDF に抽出可能なテキストレイヤーがあるか判定する。"""
    for page in doc:
        if page.get_text().strip():
            return True
        if page.get_text("words"):
            return True
    return False


def _rect_to_coordinate(page: fitz.Page, rect: fitz.Rect, matched_text: str, page_index: int) -> MatchedCoordinate:
    pw, ph = page.rect.width, page.rect.height
    return MatchedCoordinate(
        page=page_index + 1,
        x=round(rect.x0, 2),
        y=round(rect.y0, 2),
        width=round(rect.width, 2),
        height=round(rect.height, 2),
        matched_text=matched_text,
        x_norm=round(rect.x0 / pw, 6) if pw else 0.0,
        y_norm=round(rect.y0 / ph, 6) if ph else 0.0,
        width_norm=round(rect.width / pw, 6) if pw else 0.0,
        height_norm=round(rect.height / ph, 6) if ph else 0.0,
    )


def _dedupe_hits(hits: list[tuple[int, fitz.Rect, str]]) -> list[tuple[int, fitz.Rect, str]]:
    seen: set[tuple[int, int, int, int, int]] = set()
    out: list[tuple[int, fitz.Rect, str]] = []
    for page_idx, rect, text in hits:
        key = (page_idx, int(rect.x0), int(rect.y0), int(rect.x1), int(rect.y1))
        if key in seen:
            continue
        seen.add(key)
        out.append((page_idx, rect, text))
    return out


def _match_on_page(page: fitz.Page, page_index: int, canonical: str, variants: list[str]) -> list[tuple[int, fitz.Rect, str]]:
    """1 ページ内で target 数値に合致する矩形を収集する。"""
    hits: list[tuple[int, fitz.Rect, str]] = []

    for variant in variants:
        for rect in page.search_for(variant):
            hits.append((page_index, rect, variant))

    words = page.get_text("words")
    line_groups: dict[tuple[int, int], list[tuple]] = {}
    for w in words:
        if len(w) < 5:
            continue
        line_groups.setdefault((int(w[5]), int(w[6])), []).append(w)

    for group in line_groups.values():
        group.sort(key=lambda w: float(w[7]))
        for start in range(len(group)):
            merged_rect: fitz.Rect | None = None
            accum_raw = ""
            for offset in range(min(6, len(group) - start)):
                w = group[start + offset]
                token = str(w[4])
                accum_raw += token
                part = fitz.Rect(w[0], w[1], w[2], w[3])
                merged_rect = part if merged_rect is None else merged_rect | part
                if merged_rect is None:
                    continue
                if normalize_numeric_text(accum_raw) == canonical:
                    hits.append((page_index, merged_rect, accum_raw))
                    break
                if normalize_numeric_text(token) == canonical:
                    hits.append((page_index, part, token))
                    break

    return hits


def _is_valid_numeric_match(matched_text: str, canonical: str) -> bool:
    """マッチ文字列の桁列が target と一致するか検証する。"""
    if not canonical:
        return False
    return normalize_numeric_text(matched_text) == canonical


def find_value_coordinates(doc: fitz.Document, target_value: str | float | int) -> list[MatchedCoordinate]:
    """全ページを走査し、target_value に合致する座標リストを返す。"""
    canonical = normalize_numeric_text(target_value)
    if not canonical:
        return []
    variants = build_search_variants(target_value)
    raw_hits: list[tuple[int, fitz.Rect, str]] = []
    for page_index in range(len(doc)):
        raw_hits.extend(_match_on_page(doc[page_index], page_index, canonical, variants))

    coordinates: list[MatchedCoordinate] = []
    for page_index, rect, matched_text in _dedupe_hits(raw_hits):
        if not _is_valid_numeric_match(matched_text, canonical):
            continue
        coordinates.append(_rect_to_coordinate(doc[page_index], rect, matched_text, page_index))
    return coordinates


def _context_score(page: fitz.Page, rect: fitz.Rect, context_hint: str | None) -> float:
    """context_hint が同一行付近にあるほどスコアを上げる。"""
    if not context_hint or not context_hint.strip():
        return 0.0
    hint = context_hint.strip().lower()
    score = 0.0
    for w in page.get_text("words"):
        if len(w) < 5:
            continue
        token = str(w[4]).lower()
        if hint not in token and token not in hint:
            continue
        word_rect = fitz.Rect(w[0], w[1], w[2], w[3])
        if abs(word_rect.y0 - rect.y0) > 12:
            continue
        dist = abs(word_rect.x0 - rect.x0)
        score = max(score, 120.0 - min(dist, 120.0))
    return score


def select_matches(
    doc: fitz.Document,
    matches: list[MatchedCoordinate],
    *,
    strategy: MatchStrategy = MatchStrategy.BEST,
    context_hint: str | None = None,
) -> list[MatchedCoordinate]:
    """複数ヒットから採用する座標を選ぶ。"""
    if not matches:
        return []
    if strategy == MatchStrategy.ALL:
        return matches
    if strategy == MatchStrategy.FIRST:
        return [matches[0]]

    ranked: list[tuple[float, int, float, MatchedCoordinate]] = []
    for match in matches:
        page = doc[match.page - 1]
        rect = fitz.Rect(match.x, match.y, match.x + match.width, match.y + match.height)
        ranked.append(
            (
                _context_score(page, rect, context_hint),
                match.page,
                match.y,
                match,
            )
        )
    ranked.sort(key=lambda item: (-item[0], item[1], item[2]))
    return [ranked[0][3]]


def _row_to_stamp_record(row: sqlite3.Row) -> dict[str, Any]:
    matches = []
    if row["matches_json"]:
        try:
            matches = json.loads(row["matches_json"])
        except json.JSONDecodeError:
            matches = []
    return {
        "id": row["id"],
        "source_pdf_path": row["source_pdf_path"],
        "output_pdf_path": row["output_pdf_path"],
        "field_id": row["field_id"],
        "user_id": row["user_id"],
        "target_value": row["target_value"],
        "match_count": row["match_count"],
        "matched_coordinates": matches,
        "created_at": row["created_at"],
        "version_id": row["version_id"],
        "dry_run": bool(row["dry_run"]),
    }


def list_vouch_stamps(
    *,
    source_pdf_path: str | None = None,
    version_id: str | None = None,
    field_id: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """監査スタンプ履歴を取得する。"""
    init_auto_vouch_db()
    clauses: list[str] = []
    params: list[Any] = []
    if source_pdf_path:
        clauses.append("source_pdf_path = ?")
        params.append(source_pdf_path.replace("\\", "/"))
    if version_id:
        clauses.append("version_id = ?")
        params.append(version_id)
    if field_id:
        clauses.append("field_id = ?")
        params.append(field_id)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    params.append(max(1, min(limit, 200)))
    with sqlite3.connect(AUTO_VOUCH_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            f"""
            SELECT id, source_pdf_path, output_pdf_path, field_id, user_id,
                   target_value, match_count, matches_json, created_at, version_id, dry_run
            FROM auto_vouch_stamps
            {where}
            ORDER BY created_at DESC
            LIMIT ?
            """,
            params,
        ).fetchall()
    return [_row_to_stamp_record(row) for row in rows]


def get_vouch_stamp(stamp_id: str) -> dict[str, Any] | None:
    """スタンプ ID で 1 件取得する。"""
    init_auto_vouch_db()
    with sqlite3.connect(AUTO_VOUCH_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            """
            SELECT id, source_pdf_path, output_pdf_path, field_id, user_id,
                   target_value, match_count, matches_json, created_at, version_id, dry_run
            FROM auto_vouch_stamps
            WHERE id = ?
            """,
            (stamp_id,),
        ).fetchone()
    return _row_to_stamp_record(row) if row else None


def resolve_stamp_output_path(stamp_id: str) -> Path:
    """スタンプ済み PDF の実パスを解決する（dry_run は source を返す）。"""
    row = get_vouch_stamp(stamp_id)
    if not row:
        raise FileNotFoundError(f"Stamp not found: {stamp_id}")
    rel = row.get("output_pdf_path") or row.get("source_pdf_path")
    if not rel:
        raise FileNotFoundError(f"No PDF path for stamp: {stamp_id}")
    return resolve_vouching_pdf_path(str(rel))


def init_auto_vouch_queue_db() -> None:
    """OCR 後リトライ用キュー。"""
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(AUTO_VOUCH_QUEUE_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS auto_vouch_queue (
                id TEXT PRIMARY KEY,
                version_id TEXT NOT NULL,
                target_value TEXT NOT NULL,
                field_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                context_hint TEXT,
                match_strategy TEXT NOT NULL DEFAULT 'best',
                status TEXT NOT NULL,
                ocr_job_id TEXT,
                result_stamp_id TEXT,
                create_version INTEGER NOT NULL DEFAULT 0,
                error_message TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )


def enqueue_auto_vouch(
    *,
    version_id: str,
    target_value: str | float | int,
    field_id: str,
    user_id: str,
    context_hint: str | None = None,
    match_strategy: str = "best",
    create_version: bool = False,
    ocr_job_id: str | None = None,
) -> str:
    init_auto_vouch_queue_db()
    queue_id = str(uuid.uuid4())
    now = _utc_now_iso()
    with sqlite3.connect(AUTO_VOUCH_QUEUE_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO auto_vouch_queue (
                id, version_id, target_value, field_id, user_id, context_hint,
                match_strategy, status, ocr_job_id, create_version, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_ocr', ?, ?, ?, ?)
            """,
            (
                queue_id,
                version_id,
                str(target_value),
                field_id,
                user_id,
                context_hint,
                match_strategy,
                ocr_job_id,
                1 if create_version else 0,
                now,
                now,
            ),
        )
    return queue_id


def _update_queue_status(
    queue_id: str,
    *,
    status: str,
    result_stamp_id: str | None = None,
    error_message: str | None = None,
) -> None:
    with sqlite3.connect(AUTO_VOUCH_QUEUE_DB_PATH) as conn:
        conn.execute(
            """
            UPDATE auto_vouch_queue
            SET status=?, result_stamp_id=?, error_message=?, updated_at=?
            WHERE id=?
            """,
            (status, result_stamp_id, error_message, _utc_now_iso(), queue_id),
        )


def list_pending_queue_for_version(version_id: str) -> list[dict[str, Any]]:
    init_auto_vouch_queue_db()
    with sqlite3.connect(AUTO_VOUCH_QUEUE_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT * FROM auto_vouch_queue
            WHERE version_id=? AND status IN ('pending_ocr', 'processing')
            ORDER BY created_at ASC
            """,
            (version_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def _load_ocr_page_texts(version_id: str | None) -> list[dict[str, Any]]:
    if not version_id:
        return []
    from services.document_version_service import get_version

    version = get_version(version_id)
    if not version or not version.metadata_json:
        return []
    try:
        meta = json.loads(version.metadata_json)
    except json.JSONDecodeError:
        return []
    pages = meta.get("ocr_page_texts")
    return pages if isinstance(pages, list) else []


def _ocr_page_contains_value(page_text: str, canonical: str) -> bool:
    if not canonical:
        return False
    return canonical in normalize_numeric_text(page_text)


def find_value_in_ocr_metadata(
    doc: fitz.Document,
    target_value: str | float | int,
    version_id: str | None,
) -> list[MatchedCoordinate]:
    """OCR 済みメタデータから数値を検索し、該当ページ中央付近に座標を生成する。"""
    canonical = normalize_numeric_text(target_value)
    if not canonical:
        return []
    page_texts = _load_ocr_page_texts(version_id)
    if not page_texts:
        return []

    hits: list[MatchedCoordinate] = []
    for entry in page_texts:
        page_no = int(entry.get("page") or 0)
        text = str(entry.get("text") or "")
        if page_no < 1 or page_no > len(doc):
            continue
        if not _ocr_page_contains_value(text, canonical):
            continue
        page = doc[page_no - 1]
        pw, ph = page.rect.width, page.rect.height
        w, h = pw * 0.25, ph * 0.06
        x, y = pw * 0.35, ph * 0.45
        hits.append(
            MatchedCoordinate(
                page=page_no,
                x=round(x, 2),
                y=round(y, 2),
                width=round(w, 2),
                height=round(h, 2),
                matched_text=str(target_value),
                x_norm=round(x / pw, 6),
                y_norm=round(y / ph, 6),
                width_norm=round(w / pw, 6),
                height_norm=round(h / ph, 6),
            )
        )
    return hits


def register_stamped_version(
    *,
    parent_version_id: str,
    stamped_pdf_path: Path,
    stamp_id: str,
    field_id: str,
    user_id: str,
    stakeholder_id: str | None = None,
    email: str | None = None,
):
    """スタンプ済み PDF を immutable 新版として登録する。"""
    from services.document_version_service import create_document_version, get_version

    parent = get_version(parent_version_id)
    if parent is None:
        raise ValueError(f"parent version not found: {parent_version_id}")

    content = stamped_pdf_path.read_bytes()
    meta = json.dumps(
        {
            "auto_vouch_stamp_id": stamp_id,
            "auto_vouch_field_id": field_id,
            "auto_vouch_by": user_id,
            "source": "auto_vouch",
        },
        ensure_ascii=False,
    )
    return create_document_version(
        logical_id=parent.logical_document_id,
        content=content,
        original_name=f"vouched_{field_id}_{stamped_pdf_path.name}",
        content_sha256=hashlib.sha256(content).hexdigest(),
        source="auto_vouch",
        bump="minor",
        parent_version_id=parent_version_id,
        created_by_stakeholder_id=stakeholder_id,
        created_by_email=email,
        metadata_json=meta,
    )


def process_auto_vouch_queue_for_version(version_id: str) -> list[dict[str, Any]]:
    """OCR 完了後にキュー内の Auto-Vouch を再実行する。"""
    results: list[dict[str, Any]] = []
    for row in list_pending_queue_for_version(version_id):
        queue_id = row["id"]
        _update_queue_status(queue_id, status="processing")
        result = run_auto_vouch(
            version_id=version_id,
            target_value=row["target_value"],
            user_id=row["user_id"],
            field_id=row["field_id"],
            context_hint=row.get("context_hint"),
            match_strategy=row.get("match_strategy") or "best",
            create_version=bool(row.get("create_version")),
            stakeholder_id=row["user_id"],
        )
        payload = result.to_response()
        payload["queue_id"] = queue_id
        if result.status == "success":
            _update_queue_status(queue_id, status="done", result_stamp_id=result.stamp_id)
        else:
            _update_queue_status(queue_id, status="failed", error_message=result.message[:500])
        results.append(payload)
    return results


def _audit_metadata_payload(
    *,
    field_id: str,
    user_id: str,
    target_value: str | float | int,
    matched_text: str,
    timestamp: str,
    stamp_id: str,
    match_source: str = "text_layer",
) -> dict[str, Any]:
    return {
        "schema": "taxx.auto_vouch.v1",
        "stamp_id": stamp_id,
        "field_id": field_id,
        "user_id": user_id,
        "target_value": str(target_value),
        "matched_text": matched_text,
        "timestamp": timestamp,
        "locked": True,
        "match_source": match_source,
    }


def apply_audit_stamps(
    doc: fitz.Document,
    matches: list[MatchedCoordinate],
    *,
    field_id: str,
    user_id: str,
    target_value: str | float | int,
    stamp_id: str,
    timestamp: str,
    match_source: str = "text_layer",
) -> int:
    """マッチ位置にハイライト注釈と FreeText スタンプを付与する。付与数を返す。"""
    applied = 0
    for match in matches:
        page = doc[match.page - 1]
        rect = fitz.Rect(match.x, match.y, match.x + match.width, match.y + match.height)
        meta = _audit_metadata_payload(
            field_id=field_id,
            user_id=user_id,
            target_value=target_value,
            matched_text=match.matched_text,
            timestamp=timestamp,
            stamp_id=stamp_id,
        )
        meta_json = json.dumps(meta, ensure_ascii=False)

        highlight = page.add_highlight_annot(rect)
        highlight.set_colors(stroke=_AUDIT_HIGHLIGHT)
        highlight.set_info(
            {
                "title": f"TAXX:{field_id}",
                "subject": _STAMP_SUBJECT,
                "content": meta_json,
            }
        )
        highlight.set_opacity(0.45)
        highlight.update()

        stamp_rect = fitz.Rect(rect.x1 + 2, rect.y0 - 2, rect.x1 + 72, rect.y0 + 12)
        stamp_rect = stamp_rect & page.rect
        if not stamp_rect.is_empty:
            stamp = page.add_freetext_annot(
                stamp_rect,
                f"OK {field_id}",
                fontsize=7,
                fontname="helv",
                text_color=(0.1, 0.35, 0.1),
                fill_color=(0.9, 1.0, 0.9),
            )
            stamp.set_info({"subject": _STAMP_SUBJECT, "content": meta_json})
            stamp.update()

        applied += 1
    return applied


def build_output_path(source: Path, field_id: str, stamp_id: str) -> Path:
    """スタンプ済み PDF の保存先パスを生成する（storage 内・別名保存）。"""
    safe_field = re.sub(r"[^\w\-]", "_", field_id)[:48] or "field"
    stamp_ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out_dir = source.parent / "vouched"
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir / f"{source.stem}_vouched_{safe_field}_{stamp_ts}_{stamp_id[:8]}.pdf"


def persist_vouch_record(
    *,
    stamp_id: str,
    source_pdf_path: str,
    output_pdf_path: str,
    field_id: str,
    user_id: str,
    target_value: str | float | int,
    matches: list[MatchedCoordinate],
    version_id: str | None = None,
    dry_run: bool = False,
) -> None:
    init_auto_vouch_db()
    with sqlite3.connect(AUTO_VOUCH_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO auto_vouch_stamps (
                id, source_pdf_path, output_pdf_path, field_id, user_id,
                target_value, match_count, matches_json, created_at, version_id, dry_run
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                stamp_id,
                source_pdf_path,
                output_pdf_path,
                field_id,
                user_id,
                str(target_value),
                len(matches),
                json.dumps([m.to_dict() for m in matches], ensure_ascii=False),
                _utc_now_iso(),
                version_id,
                1 if dry_run else 0,
            ),
        )


def run_auto_vouch(
    *,
    pdf_file_path: str | None = None,
    version_id: str | None = None,
    target_value: str | float | int,
    user_id: str,
    field_id: str,
    match_strategy: MatchStrategy | str = MatchStrategy.BEST,
    context_hint: str | None = None,
    dry_run: bool = False,
    create_version: bool = False,
    queue_on_ocr: bool = False,
    stakeholder_id: str | None = None,
    email: str | None = None,
    ocr_job_id: str | None = None,
) -> AutoVouchResult:
    """Auto-Vouching パイプライン全体を実行する。"""
    if not field_id.strip():
        return AutoVouchResult(
            status="error",
            message="field_id is required",
            error_code=AutoVouchErrorCode.INVALID_INPUT.value,
        )
    if not str(target_value).strip():
        return AutoVouchResult(
            status="error",
            message="target_value is required",
            error_code=AutoVouchErrorCode.INVALID_INPUT.value,
        )

    strategy = match_strategy if isinstance(match_strategy, MatchStrategy) else MatchStrategy(str(match_strategy))
    effective_hint = resolve_context_hint(field_id, context_hint)

    try:
        source, resolved_version_id = resolve_pdf_input(
            pdf_file_path=pdf_file_path,
            version_id=version_id,
        )
    except FileNotFoundError as exc:
        return AutoVouchResult(
            status="error",
            message=str(exc),
            error_code=AutoVouchErrorCode.NOT_FOUND.value,
        )
    except ValueError as exc:
        return AutoVouchResult(
            status="error",
            message=str(exc),
            error_code=AutoVouchErrorCode.INVALID_PATH.value,
        )

    rel_source = _relative_storage_path(source)
    doc = fitz.open(str(source))
    try:
        match_source = "text_layer"
        all_matches: list[MatchedCoordinate] = []

        if pdf_has_text_layer(doc):
            all_matches = find_value_coordinates(doc, target_value)
        else:
            ocr_matches = find_value_in_ocr_metadata(doc, target_value, resolved_version_id)
            if ocr_matches:
                all_matches = ocr_matches
                match_source = "ocr_text"
            elif queue_on_ocr and resolved_version_id:
                queue_id = enqueue_auto_vouch(
                    version_id=resolved_version_id,
                    target_value=target_value,
                    field_id=field_id,
                    user_id=user_id,
                    context_hint=effective_hint,
                    match_strategy=strategy.value,
                    create_version=create_version,
                    ocr_job_id=ocr_job_id,
                )
                return AutoVouchResult(
                    status="error",
                    message=(
                        "PDF にテキストレイヤーがありません。"
                        " OCR 完了後に自動再試行をキューに登録しました。"
                    ),
                    ocr_recommended=True,
                    error_code=AutoVouchErrorCode.NO_TEXT_LAYER.value,
                    source_pdf_path=rel_source,
                    queue_id=queue_id,
                    ocr_job_id=ocr_job_id or "",
                )
            else:
                return AutoVouchResult(
                    status="error",
                    message=(
                        "PDF にテキストレイヤーがありません（スキャン画像のみの可能性）。"
                        " OCR ジョブ（POST /api/ocr/jobs）を実行するか queue_on_ocr=true を指定してください。"
                    ),
                    ocr_recommended=True,
                    error_code=AutoVouchErrorCode.NO_TEXT_LAYER.value,
                    source_pdf_path=rel_source,
                )

        total_found = len(all_matches)
        if not all_matches:
            canonical = normalize_numeric_text(target_value)
            return AutoVouchResult(
                status="error",
                message=(
                    f"対象数値 '{target_value}'（正規化: {canonical or '—'}）に合致するテキストが見つかりませんでした。"
                ),
                error_code=AutoVouchErrorCode.NO_MATCH.value,
                source_pdf_path=rel_source,
                total_matches_found=0,
            )

        matches = select_matches(
            doc,
            all_matches,
            strategy=strategy,
            context_hint=effective_hint,
        )
        stamp_id = str(uuid.uuid4())
        timestamp = _utc_now_iso()
        rel_output = ""
        new_version_id = ""

        if dry_run:
            message = (
                f"プレビュー: {total_found} 件ヒット、{len(matches)} 件を採用"
                f"（strategy={strategy.value}, source={match_source}）。スタンプは付与していません。"
            )
        else:
            apply_audit_stamps(
                doc,
                matches,
                field_id=field_id,
                user_id=user_id,
                target_value=target_value,
                stamp_id=stamp_id,
                timestamp=timestamp,
                match_source=match_source,
            )
            output_path = build_output_path(source, field_id, stamp_id)
            doc.save(str(output_path), garbage=4, deflate=True, clean=True)
            rel_output = _relative_storage_path(output_path)
            if total_found > len(matches):
                message = (
                    f"{len(matches)} 箇所に監査スタンプを付与し保存しました"
                    f"（全 {total_found} 件中, source={match_source}）。"
                )
            else:
                message = f"{len(matches)} 箇所に監査スタンプを付与し保存しました（source={match_source}）。"

            if create_version and resolved_version_id:
                try:
                    new_version = register_stamped_version(
                        parent_version_id=resolved_version_id,
                        stamped_pdf_path=output_path,
                        stamp_id=stamp_id,
                        field_id=field_id,
                        user_id=user_id,
                        stakeholder_id=stakeholder_id,
                        email=email,
                    )
                    new_version_id = new_version.id
                    message += f" 新版 {new_version.version_label} を登録しました。"
                except ValueError as exc:
                    message += f" （版登録失敗: {exc}）"

        persist_vouch_record(
            stamp_id=stamp_id,
            source_pdf_path=rel_source,
            output_pdf_path=rel_output,
            field_id=field_id,
            user_id=user_id,
            target_value=target_value,
            matches=matches,
            version_id=resolved_version_id,
            dry_run=dry_run,
        )

        return AutoVouchResult(
            status="success",
            output_pdf_path=rel_output,
            matched_coordinates=matches,
            message=message,
            stamp_id=stamp_id,
            dry_run=dry_run,
            source_pdf_path=rel_source,
            total_matches_found=total_found,
            new_version_id=new_version_id,
            match_source=match_source,
        )
    finally:
        doc.close()
