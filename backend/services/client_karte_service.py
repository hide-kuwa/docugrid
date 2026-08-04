"""顧問先カルテ — 永続 / 期ごと / 期末メモ / 短期タスク。

RAG 向けに title+body の content_sha256 と firm/client/horizon/period メタを保持する。
"""

from __future__ import annotations

import hashlib
import json
import logging
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
KARTE_DB_PATH = STORAGE_DIR / "client_karte.db"

# permanent: ずっと残す / period: 期ごと / period_end: 期末に思い出す / task: 宿題・短期
VALID_HORIZONS = frozenset({"permanent", "period", "period_end", "task"})
VALID_STATUSES = frozenset({"open", "done", "archived"})


def init_client_karte_db() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(KARTE_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS client_karte_entries (
                id TEXT PRIMARY KEY,
                firm_id TEXT NOT NULL,
                client_id TEXT NOT NULL,
                horizon TEXT NOT NULL,
                period_key TEXT,
                title TEXT NOT NULL DEFAULT '',
                body TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'open',
                due_date TEXT,
                meeting_at TEXT,
                tags_json TEXT,
                content_sha256 TEXT,
                created_by TEXT,
                updated_by TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_karte_client_horizon
                ON client_karte_entries (firm_id, client_id, horizon, period_key, updated_at DESC)
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_karte_sha
                ON client_karte_entries (firm_id, content_sha256)
            """
        )


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


def _content_sha(title: str, body: str) -> str:
    raw = f"{title}\n{body}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    tags: list[str] = []
    if row["tags_json"]:
        try:
            parsed = json.loads(row["tags_json"])
            if isinstance(parsed, list):
                tags = [str(t) for t in parsed]
        except Exception:
            tags = []
    return {
        "id": row["id"],
        "client_id": row["client_id"],
        "horizon": row["horizon"],
        "period_key": row["period_key"],
        "title": row["title"],
        "body": row["body"],
        "status": row["status"],
        "due_date": row["due_date"],
        "meeting_at": row["meeting_at"],
        "tags": tags,
        "content_sha256": row["content_sha256"],
        "created_by": row["created_by"],
        "updated_by": row["updated_by"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "sort_order": row["sort_order"],
    }


def list_karte_entries(
    firm_id: str,
    client_id: str,
    *,
    horizon: Optional[str] = None,
    period_key: Optional[str] = None,
    status: Optional[str] = None,
    include_archived: bool = False,
) -> list[dict[str, Any]]:
    init_client_karte_db()
    sql = """
        SELECT * FROM client_karte_entries
        WHERE firm_id = ? AND client_id = ?
    """
    params: list[Any] = [firm_id, client_id]
    if horizon:
        if horizon not in VALID_HORIZONS:
            raise ValueError(f"horizon must be one of {sorted(VALID_HORIZONS)}")
        sql += " AND horizon = ?"
        params.append(horizon)
    if period_key:
        sql += " AND period_key = ?"
        params.append(period_key.strip())
    if status:
        if status not in VALID_STATUSES:
            raise ValueError(f"status must be one of {sorted(VALID_STATUSES)}")
        sql += " AND status = ?"
        params.append(status)
    elif not include_archived:
        sql += " AND status != 'archived'"
    sql += " ORDER BY horizon, sort_order, updated_at DESC"
    with sqlite3.connect(KARTE_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(sql, params).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_karte_entry(firm_id: str, entry_id: str) -> dict[str, Any] | None:
    init_client_karte_db()
    with sqlite3.connect(KARTE_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM client_karte_entries WHERE id=? AND firm_id=?",
            (entry_id, firm_id),
        ).fetchone()
    return _row_to_dict(row) if row else None


def upsert_karte_entry(
    firm_id: str,
    client_id: str,
    payload: dict[str, Any],
    *,
    actor: str | None = None,
) -> dict[str, Any]:
    init_client_karte_db()
    horizon = str(payload.get("horizon") or "").strip()
    if horizon not in VALID_HORIZONS:
        raise ValueError(f"horizon must be one of {sorted(VALID_HORIZONS)}")
    status = str(payload.get("status") or "open").strip()
    if status not in VALID_STATUSES:
        raise ValueError(f"status must be one of {sorted(VALID_STATUSES)}")

    period_key = (payload.get("period_key") or "").strip() or None
    if horizon == "permanent":
        period_key = None
    elif horizon in ("period", "period_end") and not period_key:
        raise ValueError("period_key required for period / period_end horizons")

    title = str(payload.get("title") or "").strip()
    body = str(payload.get("body") or "")
    if not title and not body.strip():
        raise ValueError("title or body required")

    tags = payload.get("tags") or []
    if not isinstance(tags, list):
        tags = []
    tags_json = json.dumps([str(t) for t in tags], ensure_ascii=False)
    due_date = (payload.get("due_date") or "").strip() or None
    meeting_at = (payload.get("meeting_at") or "").strip() or None
    sort_order = int(payload.get("sort_order") or 0)
    entry_id = str(payload.get("id") or uuid.uuid4().hex)
    now = _utc_now()
    sha = _content_sha(title, body)

    with sqlite3.connect(KARTE_DB_PATH) as conn:
        existing = conn.execute(
            "SELECT id, created_at, created_by FROM client_karte_entries WHERE id=? AND firm_id=?",
            (entry_id, firm_id),
        ).fetchone()
        if existing:
            conn.execute(
                """
                UPDATE client_karte_entries SET
                    horizon=?, period_key=?, title=?, body=?, status=?,
                    due_date=?, meeting_at=?, tags_json=?, content_sha256=?,
                    updated_by=?, updated_at=?, sort_order=?
                WHERE id=? AND firm_id=?
                """,
                (
                    horizon,
                    period_key,
                    title,
                    body,
                    status,
                    due_date,
                    meeting_at,
                    tags_json,
                    sha,
                    actor,
                    now,
                    sort_order,
                    entry_id,
                    firm_id,
                ),
            )
        else:
            conn.execute(
                """
                INSERT INTO client_karte_entries (
                    id, firm_id, client_id, horizon, period_key, title, body, status,
                    due_date, meeting_at, tags_json, content_sha256,
                    created_by, updated_by, created_at, updated_at, sort_order
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    entry_id,
                    firm_id,
                    client_id,
                    horizon,
                    period_key,
                    title,
                    body,
                    status,
                    due_date,
                    meeting_at,
                    tags_json,
                    sha,
                    actor,
                    actor,
                    now,
                    now,
                    sort_order,
                ),
            )
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM client_karte_entries WHERE id=? AND firm_id=?",
            (entry_id, firm_id),
        ).fetchone()
    item = _row_to_dict(row)
    _sync_karte_to_rag(firm_id, client_id, item)
    return item


def delete_karte_entry(firm_id: str, entry_id: str) -> bool:
    init_client_karte_db()
    with sqlite3.connect(KARTE_DB_PATH) as conn:
        cur = conn.execute(
            "DELETE FROM client_karte_entries WHERE firm_id=? AND id=?",
            (firm_id, entry_id),
        )
    if cur.rowcount <= 0:
        return False
    try:
        from services.rag_index_service import SOURCE_KARTE, delete_source_chunks

        delete_source_chunks(firm_id, SOURCE_KARTE, entry_id)
    except Exception:
        logger.exception("rag delete failed for karte entry=%s firm=%s", entry_id, firm_id)
    return True


def _sync_karte_to_rag(firm_id: str, client_id: str, item: dict[str, Any]) -> None:
    """Best-effort index update after karte write (search path must not do this)."""
    try:
        from services.rag_index_service import ingest_karte_entry

        ingest_karte_entry(
            firm_id=firm_id,
            client_id=client_id,
            entry_id=str(item["id"]),
            content_sha256=str(item.get("content_sha256") or ""),
            text=f"{item.get('title') or ''}\n{item.get('body') or ''}".strip(),
        )
    except Exception:
        logger.exception(
            "rag ingest failed for karte entry=%s client=%s",
            item.get("id"),
            client_id,
        )


def list_karte_for_rag_export(
    firm_id: str,
    client_id: str,
    *,
    horizons: Optional[list[str]] = None,
) -> list[dict[str, Any]]:
    """Flat text chunks suitable for future RAG ingest (metadata included)."""
    entries = list_karte_entries(firm_id, client_id, include_archived=False)
    if horizons:
        allow = set(horizons)
        entries = [e for e in entries if e["horizon"] in allow]
    out: list[dict[str, Any]] = []
    for e in entries:
        text = f"{e['title']}\n{e['body']}".strip()
        if not text:
            continue
        out.append(
            {
                "id": e["id"],
                "text": text,
                "content_sha256": e["content_sha256"],
                "metadata": {
                    "firm_id": firm_id,
                    "client_id": client_id,
                    "source": "client_karte",
                    "horizon": e["horizon"],
                    "period_key": e["period_key"],
                    "status": e["status"],
                    "tags": e["tags"],
                    "updated_at": e["updated_at"],
                },
            }
        )
    return out
