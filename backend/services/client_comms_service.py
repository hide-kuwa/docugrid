"""コミュニケーション SSOT — COMMS タブのスレッド一覧（連携前の正規ストア）。"""

from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
COMMS_DB_PATH = STORAGE_DIR / "client_comms.db"


def init_client_comms_db() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(COMMS_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS client_comm_threads (
                id TEXT PRIMARY KEY,
                firm_id TEXT NOT NULL,
                client_id TEXT NOT NULL,
                channel TEXT NOT NULL DEFAULT 'email',
                subject TEXT NOT NULL,
                preview TEXT NOT NULL DEFAULT '',
                participants TEXT NOT NULL DEFAULT '',
                occurred_at TEXT NOT NULL,
                source_type TEXT NOT NULL DEFAULT 'manual',
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_client_comm_threads_client
                ON client_comm_threads (firm_id, client_id, occurred_at DESC)
            """
        )


def _row_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "client_id": row["client_id"],
        "channel": row["channel"],
        "subject": row["subject"],
        "preview": row["preview"],
        "participants": row["participants"],
        "occurred_at": row["occurred_at"],
        "source_type": row["source_type"],
        "updated_at": row["updated_at"],
    }


def seed_client_comms_if_empty(
    firm_id: str,
    client_id: str,
    *,
    contact_name: str = "経理担当",
) -> None:
    init_client_comms_db()
    with sqlite3.connect(COMMS_DB_PATH) as conn:
        count = conn.execute(
            "SELECT COUNT(*) FROM client_comm_threads WHERE firm_id=? AND client_id=?",
            (firm_id, client_id),
        ).fetchone()[0]
        if count > 0:
            return
        now = datetime.utcnow().isoformat()
        seeds = [
            (
                "email",
                "決算スケジュールの確認",
                "3月決算に向けた資料提出日程についてご連絡です…",
                f"{contact_name} ↔ 税理士事務所",
                "2026-06-10T14:32:00",
            ),
            (
                "slack",
                "#顧問先スレッド",
                "役員報酬の変更届について、定款の確認をお願いします",
                "山田（主担当）・佐藤",
                "2026-06-05T11:08:00",
            ),
            (
                "email",
                "Re: 消費税簡易課税の届出",
                "添付の届出書ドラフトをご確認ください…",
                f"{contact_name} ↔ 山田",
                "2026-05-28T09:15:00",
            ),
        ]
        for channel, subject, preview, participants, occurred in seeds:
            conn.execute(
                """
                INSERT INTO client_comm_threads
                    (id, firm_id, client_id, channel, subject, preview, participants,
                     occurred_at, source_type, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'seed', ?)
                """,
                (
                    uuid.uuid4().hex,
                    firm_id,
                    client_id,
                    channel,
                    subject,
                    preview,
                    participants,
                    occurred,
                    now,
                ),
            )


def list_comm_threads(firm_id: str, client_id: str) -> List[dict]:
    init_client_comms_db()
    with sqlite3.connect(COMMS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT * FROM client_comm_threads
            WHERE firm_id = ? AND client_id = ?
            ORDER BY occurred_at DESC
            """,
            (firm_id, client_id),
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def upsert_comm_thread(
    firm_id: str,
    client_id: str,
    payload: dict,
) -> dict:
    init_client_comms_db()
    thread_id = str(payload.get("id") or uuid.uuid4().hex)
    now = datetime.utcnow().isoformat()
    channel = str(payload.get("channel") or "email")
    subject = str(payload.get("subject") or "").strip() or "（件名なし）"
    preview = str(payload.get("preview") or "")
    participants = str(payload.get("participants") or "")
    occurred_at = str(payload.get("occurred_at") or now)
    source_type = str(payload.get("source_type") or "manual")

    with sqlite3.connect(COMMS_DB_PATH) as conn:
        existing = conn.execute(
            "SELECT id FROM client_comm_threads WHERE id=? AND firm_id=?",
            (thread_id, firm_id),
        ).fetchone()
        if existing:
            conn.execute(
                """
                UPDATE client_comm_threads SET
                    channel=?, subject=?, preview=?, participants=?,
                    occurred_at=?, source_type=?, updated_at=?
                WHERE id=? AND firm_id=?
                """,
                (
                    channel,
                    subject,
                    preview,
                    participants,
                    occurred_at,
                    source_type,
                    now,
                    thread_id,
                    firm_id,
                ),
            )
        else:
            conn.execute(
                """
                INSERT INTO client_comm_threads
                    (id, firm_id, client_id, channel, subject, preview, participants,
                     occurred_at, source_type, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    thread_id,
                    firm_id,
                    client_id,
                    channel,
                    subject,
                    preview,
                    participants,
                    occurred_at,
                    source_type,
                    now,
                ),
            )
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM client_comm_threads WHERE id=? AND firm_id=?",
            (thread_id, firm_id),
        ).fetchone()
    return _row_to_dict(row)


def delete_comm_thread(firm_id: str, client_id: str, thread_id: str) -> bool:
    init_client_comms_db()
    with sqlite3.connect(COMMS_DB_PATH) as conn:
        cur = conn.execute(
            """
            DELETE FROM client_comm_threads
            WHERE id=? AND firm_id=? AND client_id=?
            """,
            (thread_id, firm_id, client_id),
        )
    return cur.rowcount > 0
