"""自動振り分け「要確認」キューのサーバー永続化。"""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
PENDING_CLASSIFY_DB_PATH = STORAGE_DIR / "pending_classify.db"


def _now() -> str:
    return datetime.utcnow().isoformat()


def init_pending_classify_db() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(PENDING_CLASSIFY_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS pending_classify_items (
                id TEXT PRIMARY KEY,
                firm_id TEXT NOT NULL,
                client_id TEXT NOT NULL,
                period_key TEXT NOT NULL,
                file_name TEXT NOT NULL,
                storage_path TEXT NOT NULL,
                byte_size INTEGER NOT NULL DEFAULT 0,
                confidence REAL NOT NULL DEFAULT 0,
                engine TEXT,
                suggested_slot_id TEXT,
                classify_metadata_json TEXT,
                ranked_json TEXT,
                created_at TEXT NOT NULL,
                created_by TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_pending_classify_client_period
            ON pending_classify_items (firm_id, client_id, period_key, created_at DESC)
            """
        )


def _pending_dir(firm_id: str) -> Path:
    path = STORAGE_DIR / "firms" / firm_id / "pending_classify"
    path.mkdir(parents=True, exist_ok=True)
    return path


def create_pending_item(
    *,
    firm_id: str,
    client_id: str,
    period_key: str,
    file_name: str,
    content: bytes,
    confidence: float = 0,
    engine: Optional[str] = None,
    suggested_slot_id: Optional[str] = None,
    classify_metadata: Optional[dict] = None,
    ranked: Optional[list] = None,
    created_by: Optional[str] = None,
) -> dict:
    init_pending_classify_db()
    item_id = uuid.uuid4().hex
    safe_name = (file_name or "document.pdf").replace("\\", "_").replace("/", "_")
    storage_path = _pending_dir(firm_id) / f"{item_id}_{safe_name}"
    storage_path.write_bytes(content)

    row = {
        "id": item_id,
        "firm_id": firm_id,
        "client_id": client_id,
        "period_key": period_key,
        "file_name": file_name or "document.pdf",
        "storage_path": str(storage_path),
        "byte_size": len(content),
        "confidence": confidence,
        "engine": engine,
        "suggested_slot_id": suggested_slot_id,
        "classify_metadata_json": json.dumps(classify_metadata, ensure_ascii=False)
        if classify_metadata
        else None,
        "ranked_json": json.dumps(ranked, ensure_ascii=False) if ranked else None,
        "created_at": _now(),
        "created_by": created_by,
    }
    with sqlite3.connect(PENDING_CLASSIFY_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO pending_classify_items (
                id, firm_id, client_id, period_key, file_name, storage_path, byte_size,
                confidence, engine, suggested_slot_id, classify_metadata_json, ranked_json,
                created_at, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row["id"],
                row["firm_id"],
                row["client_id"],
                row["period_key"],
                row["file_name"],
                row["storage_path"],
                row["byte_size"],
                row["confidence"],
                row["engine"],
                row["suggested_slot_id"],
                row["classify_metadata_json"],
                row["ranked_json"],
                row["created_at"],
                row["created_by"],
            ),
        )
    return serialize_pending_row(row)


def list_pending_items(firm_id: str, client_id: str, period_key: str) -> List[dict]:
    init_pending_classify_db()
    with sqlite3.connect(PENDING_CLASSIFY_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT * FROM pending_classify_items
            WHERE firm_id=? AND client_id=? AND period_key=?
            ORDER BY created_at DESC
            """,
            (firm_id, client_id, period_key),
        ).fetchall()
    return [serialize_pending_row(dict(r)) for r in rows]


def _fetch_pending_row(firm_id: str, item_id: str) -> Optional[dict]:
    init_pending_classify_db()
    with sqlite3.connect(PENDING_CLASSIFY_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM pending_classify_items WHERE id=? AND firm_id=?",
            (item_id, firm_id),
        ).fetchone()
    return dict(row) if row else None


def get_pending_item(firm_id: str, item_id: str) -> Optional[dict]:
    row = _fetch_pending_row(firm_id, item_id)
    return serialize_pending_row(row) if row else None


def get_pending_file_path(firm_id: str, item_id: str) -> Optional[Path]:
    row = _fetch_pending_row(firm_id, item_id)
    if not row:
        return None
    path = Path(row["storage_path"])
    return path if path.exists() else None


def delete_pending_item(firm_id: str, item_id: str) -> bool:
    init_pending_classify_db()
    row = _fetch_pending_row(firm_id, item_id)
    if not row:
        return False
    path = Path(row["storage_path"])
    if path.exists():
        try:
            path.unlink()
        except OSError:
            pass
    with sqlite3.connect(PENDING_CLASSIFY_DB_PATH) as conn:
        conn.execute(
            "DELETE FROM pending_classify_items WHERE id=? AND firm_id=?",
            (item_id, firm_id),
        )
    return True


def serialize_pending_row(row: dict) -> dict:
    meta = None
    if row.get("classify_metadata_json"):
        try:
            meta = json.loads(row["classify_metadata_json"])
        except json.JSONDecodeError:
            meta = None
    ranked = None
    if row.get("ranked_json"):
        try:
            ranked = json.loads(row["ranked_json"])
        except json.JSONDecodeError:
            ranked = None
    return {
        "id": row["id"],
        "client_id": row["client_id"],
        "period_key": row["period_key"],
        "file_name": row["file_name"],
        "byte_size": row.get("byte_size") or 0,
        "confidence": float(row.get("confidence") or 0),
        "engine": row.get("engine") or "none",
        "suggested_slot_id": row.get("suggested_slot_id"),
        "classify_metadata": meta,
        "ranked": ranked or [],
        "created_at": row.get("created_at"),
        "created_by": row.get("created_by"),
    }
