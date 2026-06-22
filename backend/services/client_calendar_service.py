"""顧問先カレンダー SSOT — 経費突合用イベント（将来 Google Calendar 取り込み先）。"""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
CALENDAR_DB_PATH = STORAGE_DIR / "client_calendar.db"
LEGACY_JSON_PATH = STORAGE_DIR / "demo_calendar_events.json"


def init_client_calendar_db() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(CALENDAR_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS client_calendar_events (
                id TEXT PRIMARY KEY,
                firm_id TEXT NOT NULL,
                client_id TEXT NOT NULL,
                event_date TEXT NOT NULL,
                event_time TEXT,
                title TEXT NOT NULL,
                company TEXT,
                contact TEXT,
                attendees INTEGER NOT NULL DEFAULT 1,
                event_type TEXT NOT NULL DEFAULT 'meeting',
                source_type TEXT NOT NULL DEFAULT 'manual',
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_client_calendar_client_date
                ON client_calendar_events (firm_id, client_id, event_date)
            """
        )


def _row_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "client_id": row["client_id"],
        "date": row["event_date"],
        "time": row["event_time"],
        "title": row["title"],
        "company": row["company"],
        "contact": row["contact"],
        "attendees": row["attendees"],
        "type": row["event_type"],
        "source_type": row["source_type"],
        "updated_at": row["updated_at"],
    }


def _load_legacy_json() -> Dict[str, List[dict]]:
    if LEGACY_JSON_PATH.exists():
        try:
            raw = json.loads(LEGACY_JSON_PATH.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                return {str(k): list(v) for k, v in raw.items() if isinstance(v, list)}
        except Exception:
            pass
    return {}


def seed_calendar_if_empty(firm_id: str, client_id: str) -> None:
    init_client_calendar_db()
    with sqlite3.connect(CALENDAR_DB_PATH) as conn:
        count = conn.execute(
            "SELECT COUNT(*) FROM client_calendar_events WHERE firm_id=? AND client_id=?",
            (firm_id, client_id),
        ).fetchone()[0]
        if count > 0:
            return
        legacy = _load_legacy_json()
        events = legacy.get(client_id) or legacy.get("c1") or []
        now = datetime.utcnow().isoformat()
        for ev in events:
            conn.execute(
                """
                INSERT INTO client_calendar_events
                    (id, firm_id, client_id, event_date, event_time, title, company,
                     contact, attendees, event_type, source_type, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'legacy_seed', ?)
                """,
                (
                    uuid.uuid4().hex,
                    firm_id,
                    client_id,
                    str(ev.get("date", "")),
                    ev.get("time"),
                    str(ev.get("title", "")),
                    ev.get("company"),
                    ev.get("contact"),
                    int(ev.get("attendees") or 1),
                    str(ev.get("type") or "meeting"),
                    now,
                ),
            )


def list_calendar_events(firm_id: str, client_id: str, *, event_date: Optional[str] = None) -> List[dict]:
    init_client_calendar_db()
    seed_calendar_if_empty(firm_id, client_id)
    sql = """
        SELECT * FROM client_calendar_events
        WHERE firm_id = ? AND client_id = ?
    """
    params: list = [firm_id, client_id]
    if event_date:
        sql += " AND event_date = ?"
        params.append(event_date)
    sql += " ORDER BY event_date DESC, event_time DESC"
    with sqlite3.connect(CALENDAR_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(sql, params).fetchall()
    return [_row_to_dict(r) for r in rows]


def upsert_calendar_event(firm_id: str, client_id: str, payload: dict) -> dict:
    init_client_calendar_db()
    event_id = str(payload.get("id") or uuid.uuid4().hex)
    now = datetime.utcnow().isoformat()
    with sqlite3.connect(CALENDAR_DB_PATH) as conn:
        existing = conn.execute(
            "SELECT id FROM client_calendar_events WHERE id=? AND firm_id=?",
            (event_id, firm_id),
        ).fetchone()
        fields = (
            str(payload.get("date") or payload.get("event_date") or ""),
            payload.get("time") or payload.get("event_time"),
            str(payload.get("title") or ""),
            payload.get("company"),
            payload.get("contact"),
            int(payload.get("attendees") or 1),
            str(payload.get("type") or payload.get("event_type") or "meeting"),
            str(payload.get("source_type") or "manual"),
            now,
        )
        if existing:
            conn.execute(
                """
                UPDATE client_calendar_events SET
                    event_date=?, event_time=?, title=?, company=?, contact=?,
                    attendees=?, event_type=?, source_type=?, updated_at=?
                WHERE id=? AND firm_id=?
                """,
                (*fields, event_id, firm_id),
            )
        else:
            conn.execute(
                """
                INSERT INTO client_calendar_events
                    (id, firm_id, client_id, event_date, event_time, title, company,
                     contact, attendees, event_type, source_type, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (event_id, firm_id, client_id, *fields),
            )
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM client_calendar_events WHERE id=? AND firm_id=?",
            (event_id, firm_id),
        ).fetchone()
    return _row_to_dict(row)


def events_for_expense_context(firm_id: str, client_id: str) -> List[dict]:
    """expense_context 用 — レガシー JSON 互換の dict リスト。"""
    return list_calendar_events(firm_id, client_id)
