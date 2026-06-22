"""顧問先レコード SSOT — 調査事項・特殊事項・税務アラート等の構造化テキスト。"""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
RECORDS_DB_PATH = STORAGE_DIR / "client_records.db"

VALID_DOMAINS = frozenset({"investigation", "special_note", "tax_alert"})


def init_client_records_db() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(RECORDS_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS client_record_items (
                id TEXT PRIMARY KEY,
                firm_id TEXT NOT NULL,
                client_id TEXT NOT NULL,
                domain TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                body TEXT NOT NULL DEFAULT '',
                meta_json TEXT,
                sort_order INTEGER NOT NULL DEFAULT 0,
                source_type TEXT NOT NULL DEFAULT 'manual',
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_client_records_domain
                ON client_record_items (firm_id, client_id, domain, sort_order)
            """
        )


def _row_to_dict(row: sqlite3.Row) -> dict:
    meta = None
    if row["meta_json"]:
        try:
            meta = json.loads(row["meta_json"])
        except Exception:
            meta = None
    return {
        "id": row["id"],
        "client_id": row["client_id"],
        "domain": row["domain"],
        "title": row["title"],
        "body": row["body"],
        "meta": meta,
        "sort_order": row["sort_order"],
        "source_type": row["source_type"],
        "updated_at": row["updated_at"],
    }


def _split_profile_lines(text: str) -> List[str]:
    return [ln.strip() for ln in text.replace("\r\n", "\n").split("\n") if ln.strip()]


def seed_records_from_profile(
    firm_id: str,
    client_id: str,
    profile: Optional[Dict[str, str]],
) -> None:
    init_client_records_db()
    profile = profile or {}
    with sqlite3.connect(RECORDS_DB_PATH) as conn:
        for domain, field, default_title in (
            ("investigation", "tax_audit_history", "調査事項"),
            ("special_note", "handling_notes", "対応時の注意点"),
            ("special_note", "remarks", "備考"),
        ):
            count = conn.execute(
                """
                SELECT COUNT(*) FROM client_record_items
                WHERE firm_id=? AND client_id=? AND domain=?
                """,
                (firm_id, client_id, domain),
            ).fetchone()[0]
            if count > 0:
                continue
            raw = (profile.get(field) or "").strip()
            if not raw:
                continue
            now = datetime.utcnow().isoformat()
            lines = _split_profile_lines(raw)
            for idx, line in enumerate(lines):
                title = default_title if len(lines) == 1 else f"{default_title} {idx + 1}"
                conn.execute(
                    """
                    INSERT INTO client_record_items
                        (id, firm_id, client_id, domain, title, body, meta_json,
                         sort_order, source_type, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'profile_seed', ?)
                    """,
                    (uuid.uuid4().hex, firm_id, client_id, domain, title, line, idx, now),
                )


def list_record_items(firm_id: str, client_id: str, *, domain: Optional[str] = None) -> List[dict]:
    init_client_records_db()
    sql = """
        SELECT * FROM client_record_items
        WHERE firm_id = ? AND client_id = ?
    """
    params: list[Any] = [firm_id, client_id]
    if domain:
        sql += " AND domain = ?"
        params.append(domain)
    sql += " ORDER BY domain, sort_order, updated_at DESC"
    with sqlite3.connect(RECORDS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(sql, params).fetchall()
    return [_row_to_dict(r) for r in rows]


def upsert_record_item(firm_id: str, client_id: str, payload: dict) -> dict:
    init_client_records_db()
    domain = str(payload.get("domain") or "").strip()
    if domain not in VALID_DOMAINS:
        raise ValueError(f"domain must be one of {sorted(VALID_DOMAINS)}")
    item_id = str(payload.get("id") or uuid.uuid4().hex)
    now = datetime.utcnow().isoformat()
    title = str(payload.get("title") or "").strip()
    body = str(payload.get("body") or "")
    sort_order = int(payload.get("sort_order") or 0)
    meta = payload.get("meta")
    meta_json = json.dumps(meta, ensure_ascii=False) if meta is not None else None
    source_type = str(payload.get("source_type") or "manual")

    with sqlite3.connect(RECORDS_DB_PATH) as conn:
        existing = conn.execute(
            "SELECT id FROM client_record_items WHERE id=? AND firm_id=?",
            (item_id, firm_id),
        ).fetchone()
        if existing:
            conn.execute(
                """
                UPDATE client_record_items SET
                    domain=?, title=?, body=?, meta_json=?, sort_order=?,
                    source_type=?, updated_at=?
                WHERE id=? AND firm_id=?
                """,
                (domain, title, body, meta_json, sort_order, source_type, now, item_id, firm_id),
            )
        else:
            conn.execute(
                """
                INSERT INTO client_record_items
                    (id, firm_id, client_id, domain, title, body, meta_json,
                     sort_order, source_type, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    item_id,
                    firm_id,
                    client_id,
                    domain,
                    title,
                    body,
                    meta_json,
                    sort_order,
                    source_type,
                    now,
                ),
            )
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM client_record_items WHERE id=? AND firm_id=?",
            (item_id, firm_id),
        ).fetchone()
    return _row_to_dict(row)


def delete_record_item(firm_id: str, item_id: str) -> bool:
    init_client_records_db()
    with sqlite3.connect(RECORDS_DB_PATH) as conn:
        cur = conn.execute(
            "DELETE FROM client_record_items WHERE firm_id=? AND id=?",
            (firm_id, item_id),
        )
    return cur.rowcount > 0
