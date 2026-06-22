"""キャプチャギャラリー — 画像・PDF の即時アップロードと監査ステータス（G1）。"""

from __future__ import annotations

import hashlib
import json
import mimetypes
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
CAPTURE_DB_PATH = STORAGE_DIR / "capture_items.db"

VALID_STATUSES = {"processing", "ok", "needs_review", "confirmed"}
VALID_CATEGORIES = {"general", "expense", "marufu", "deduction_cert"}
IMAGE_MIME = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}


def _now() -> str:
    return datetime.utcnow().isoformat()


def init_capture_db() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(CAPTURE_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS capture_items (
                id TEXT PRIMARY KEY,
                firm_id TEXT NOT NULL,
                client_id TEXT NOT NULL,
                file_name TEXT NOT NULL,
                storage_path TEXT NOT NULL,
                content_sha256 TEXT NOT NULL,
                byte_size INTEGER NOT NULL DEFAULT 0,
                mime_type TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'general',
                status TEXT NOT NULL DEFAULT 'processing',
                title TEXT,
                audit_message TEXT,
                period_key TEXT,
                slot_id TEXT,
                metadata_json TEXT,
                pinned INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                created_by TEXT,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_capture_items_client
            ON capture_items (firm_id, client_id, status, pinned DESC, created_at DESC)
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_capture_items_hash
            ON capture_items (firm_id, client_id, content_sha256)
            """
        )


def _capture_dir(firm_id: str) -> Path:
    path = STORAGE_DIR / "firms" / firm_id / "capture"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _row_item(row: sqlite3.Row) -> dict:
    meta = None
    if row["metadata_json"]:
        try:
            meta = json.loads(row["metadata_json"])
        except json.JSONDecodeError:
            meta = None
    return {
        "id": row["id"],
        "client_id": row["client_id"],
        "file_name": row["file_name"],
        "byte_size": row["byte_size"],
        "mime_type": row["mime_type"],
        "category": row["category"],
        "status": row["status"],
        "title": row["title"],
        "audit_message": row["audit_message"],
        "period_key": row["period_key"],
        "slot_id": row["slot_id"],
        "metadata": meta,
        "pinned": bool(row["pinned"]),
        "content_sha256": row["content_sha256"],
        "created_at": row["created_at"],
        "created_by": row["created_by"],
        "updated_at": row["updated_at"],
    }


def _guess_mime(file_name: str, content_type: Optional[str]) -> str:
    if content_type and content_type.split(";")[0].strip():
        return content_type.split(";")[0].strip().lower()
    guessed, _ = mimetypes.guess_type(file_name or "")
    return (guessed or "application/octet-stream").lower()


def _validate_upload(mime: str) -> None:
    if mime == "application/pdf" or mime in IMAGE_MIME:
        return
    raise ValueError(f"Unsupported file type: {mime}")


def _find_duplicate(firm_id: str, client_id: str, content_sha256: str) -> Optional[dict]:
    init_capture_db()
    with sqlite3.connect(CAPTURE_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            """
            SELECT * FROM capture_items
            WHERE firm_id = ? AND client_id = ? AND content_sha256 = ?
            ORDER BY created_at DESC LIMIT 1
            """,
            (firm_id, client_id, content_sha256),
        ).fetchone()
    return _row_item(row) if row else None


def create_capture_item(
    *,
    firm_id: str,
    client_id: str,
    file_name: str,
    content: bytes,
    content_type: Optional[str] = None,
    category: str = "general",
    period_key: Optional[str] = None,
    slot_id: Optional[str] = None,
    metadata: Optional[dict] = None,
    created_by: Optional[str] = None,
) -> dict:
    init_capture_db()
    if not content:
        raise ValueError("Empty file")
    mime = _guess_mime(file_name, content_type)
    _validate_upload(mime)

    if category not in VALID_CATEGORIES:
        category = "general"

    content_sha256 = hashlib.sha256(content).hexdigest()
    duplicate = _find_duplicate(firm_id, client_id, content_sha256)

    item_id = uuid.uuid4().hex
    ext = Path(file_name or "capture").suffix or (".pdf" if mime == "application/pdf" else ".jpg")
    safe_name = (file_name or f"capture{ext}").replace("\\", "_").replace("/", "_")
    storage_path = _capture_dir(firm_id) / f"{item_id}_{safe_name}"
    storage_path.write_bytes(content)

    now = _now()
    if duplicate:
        status = "needs_review"
        audit_message = "同一画像の重複が検出されました"
        pinned = 1
    else:
        status = "processing"
        audit_message = None
        pinned = 0

    row = {
        "id": item_id,
        "firm_id": firm_id,
        "client_id": client_id,
        "file_name": safe_name,
        "storage_path": str(storage_path),
        "content_sha256": content_sha256,
        "byte_size": len(content),
        "mime_type": mime,
        "category": category,
        "status": status,
        "title": None,
        "audit_message": audit_message,
        "period_key": period_key,
        "slot_id": slot_id,
        "metadata_json": json.dumps(metadata, ensure_ascii=False) if metadata else None,
        "pinned": pinned,
        "created_at": now,
        "created_by": created_by,
        "updated_at": now,
    }
    with sqlite3.connect(CAPTURE_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO capture_items (
                id, firm_id, client_id, file_name, storage_path, content_sha256, byte_size,
                mime_type, category, status, title, audit_message, period_key, slot_id,
                metadata_json, pinned, created_at, created_by, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row["id"],
                row["firm_id"],
                row["client_id"],
                row["file_name"],
                row["storage_path"],
                row["content_sha256"],
                row["byte_size"],
                row["mime_type"],
                row["category"],
                row["status"],
                row["title"],
                row["audit_message"],
                row["period_key"],
                row["slot_id"],
                row["metadata_json"],
                row["pinned"],
                row["created_at"],
                row["created_by"],
                row["updated_at"],
            ),
        )

    if not duplicate:
        pass  # 解析は main.py 側で非同期適用（processing のまま）
    else:
        item = get_capture_item(firm_id, item_id)
        if not item:
            raise RuntimeError("Failed to create capture item")
        return item
    item = get_capture_item(firm_id, item_id)
    if not item:
        raise RuntimeError("Failed to create capture item")
    return item


def list_capture_items(
    firm_id: str,
    client_id: str,
    *,
    status: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = 200,
) -> List[dict]:
    init_capture_db()
    sql = """
        SELECT * FROM capture_items
        WHERE firm_id = ? AND client_id = ?
    """
    params: list = [firm_id, client_id]
    if status:
        sql += " AND status = ?"
        params.append(status)
    if category:
        sql += " AND category = ?"
        params.append(category)
    sql += """
        ORDER BY
            CASE status
                WHEN 'needs_review' THEN 0
                WHEN 'processing' THEN 1
                WHEN 'ok' THEN 2
                ELSE 3
            END,
            pinned DESC,
            created_at DESC
        LIMIT ?
    """
    params.append(max(1, min(limit, 500)))
    with sqlite3.connect(CAPTURE_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(sql, params).fetchall()
    return [_row_item(r) for r in rows]


def get_capture_item(firm_id: str, item_id: str) -> Optional[dict]:
    init_capture_db()
    with sqlite3.connect(CAPTURE_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM capture_items WHERE firm_id = ? AND id = ?",
            (firm_id, item_id),
        ).fetchone()
    return _row_item(row) if row else None


def get_capture_file_path(firm_id: str, item_id: str) -> Optional[Path]:
    init_capture_db()
    with sqlite3.connect(CAPTURE_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT storage_path FROM capture_items WHERE firm_id = ? AND id = ?",
            (firm_id, item_id),
        ).fetchone()
    if not row:
        return None
    p = Path(row["storage_path"])
    return p if p.is_file() else None


def get_capture_mime(firm_id: str, item_id: str) -> Optional[str]:
    init_capture_db()
    with sqlite3.connect(CAPTURE_DB_PATH) as conn:
        row = conn.execute(
            "SELECT mime_type FROM capture_items WHERE firm_id = ? AND id = ?",
            (firm_id, item_id),
        ).fetchone()
    return row[0] if row else None


def get_capture_file_bytes(firm_id: str, item_id: str) -> Optional[bytes]:
    path = get_capture_file_path(firm_id, item_id)
    if not path:
        return None
    return path.read_bytes()


def apply_capture_analysis(firm_id: str, item_id: str, analysis: dict) -> Optional[dict]:
    """解析結果を capture_items に反映。"""
    init_capture_db()
    metadata = analysis.get("metadata")
    now = _now()
    with sqlite3.connect(CAPTURE_DB_PATH) as conn:
        conn.execute(
            """
            UPDATE capture_items SET
                title = ?,
                status = ?,
                audit_message = ?,
                period_key = ?,
                slot_id = ?,
                metadata_json = ?,
                pinned = ?,
                updated_at = ?
            WHERE firm_id = ? AND id = ?
            """,
            (
                analysis.get("title"),
                analysis.get("status", "ok"),
                analysis.get("audit_message"),
                analysis.get("period_key"),
                analysis.get("slot_id"),
                json.dumps(metadata, ensure_ascii=False) if metadata else None,
                1 if analysis.get("pinned") else 0,
                now,
                firm_id,
                item_id,
            ),
        )
    return get_capture_item(firm_id, item_id)


def update_capture_item(
    firm_id: str,
    item_id: str,
    *,
    status: Optional[str] = None,
    title: Optional[str] = None,
    audit_message: Optional[str] = None,
    pinned: Optional[bool] = None,
    category: Optional[str] = None,
    period_key: Optional[str] = None,
    slot_id: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> Optional[dict]:
    init_capture_db()
    if status is not None and status not in VALID_STATUSES:
        raise ValueError(f"status must be one of {sorted(VALID_STATUSES)}")
    if category is not None and category not in VALID_CATEGORIES:
        raise ValueError(f"category must be one of {sorted(VALID_CATEGORIES)}")

    fields = []
    params: list = []
    if status is not None:
        fields.append("status = ?")
        params.append(status)
    if title is not None:
        fields.append("title = ?")
        params.append(title)
    if audit_message is not None:
        fields.append("audit_message = ?")
        params.append(audit_message)
    if pinned is not None:
        fields.append("pinned = ?")
        params.append(1 if pinned else 0)
    if category is not None:
        fields.append("category = ?")
        params.append(category)
    if period_key is not None:
        fields.append("period_key = ?")
        params.append(period_key)
    if slot_id is not None:
        fields.append("slot_id = ?")
        params.append(slot_id)
    if metadata is not None:
        fields.append("metadata_json = ?")
        params.append(json.dumps(metadata, ensure_ascii=False))
    if not fields:
        return get_capture_item(firm_id, item_id)

    fields.append("updated_at = ?")
    params.append(_now())
    params.extend([firm_id, item_id])

    with sqlite3.connect(CAPTURE_DB_PATH) as conn:
        conn.execute(
            f"UPDATE capture_items SET {', '.join(fields)} WHERE firm_id = ? AND id = ?",
            params,
        )
    return get_capture_item(firm_id, item_id)


def finalize_capture_status(
    firm_id: str,
    item_id: str,
    *,
    status: str,
    audit_message: Optional[str],
    pinned: bool,
) -> Optional[dict]:
    return update_capture_item(
        firm_id,
        item_id,
        status=status,
        audit_message=audit_message,
        pinned=pinned,
    )


def delete_capture_item(firm_id: str, item_id: str) -> bool:
    init_capture_db()
    path: Optional[Path] = None
    with sqlite3.connect(CAPTURE_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT storage_path FROM capture_items WHERE firm_id = ? AND id = ?",
            (firm_id, item_id),
        ).fetchone()
        if not row:
            return False
        path = Path(row["storage_path"])
        conn.execute(
            "DELETE FROM capture_items WHERE firm_id = ? AND id = ?",
            (firm_id, item_id),
        )
    if path and path.is_file():
        try:
            path.unlink()
        except OSError:
            pass
    return True
