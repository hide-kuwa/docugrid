"""シミュレーションオーバーレイ — 正規 metrics とは別ストア。画面表示用の試算値のみ。"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
SIMULATION_DB_PATH = STORAGE_DIR / "client_simulation.db"

VALID_PANEL_KEYS = frozenset({"charts", "valuation"})


def init_client_simulation_db() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(SIMULATION_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS client_simulation_overlays (
                firm_id TEXT NOT NULL,
                client_id TEXT NOT NULL,
                panel_key TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (firm_id, client_id, panel_key)
            )
            """
        )


def get_simulation_overlay(
    firm_id: str,
    client_id: str,
    panel_key: str,
) -> Optional[Dict[str, Any]]:
    if panel_key not in VALID_PANEL_KEYS:
        raise ValueError(f"invalid panel_key: {panel_key}")
    init_client_simulation_db()
    with sqlite3.connect(SIMULATION_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            """
            SELECT payload_json, updated_at FROM client_simulation_overlays
            WHERE firm_id=? AND client_id=? AND panel_key=?
            """,
            (firm_id, client_id, panel_key),
        ).fetchone()
    if not row:
        return None
    try:
        payload = json.loads(row["payload_json"])
    except Exception:
        payload = None
    return {
        "client_id": client_id,
        "panel_key": panel_key,
        "payload": payload,
        "updated_at": row["updated_at"],
    }


def upsert_simulation_overlay(
    firm_id: str,
    client_id: str,
    panel_key: str,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    if panel_key not in VALID_PANEL_KEYS:
        raise ValueError(f"invalid panel_key: {panel_key}")
    init_client_simulation_db()
    now = datetime.utcnow().isoformat(timespec="seconds") + "Z"
    blob = json.dumps(payload, ensure_ascii=False)
    with sqlite3.connect(SIMULATION_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO client_simulation_overlays
                (firm_id, client_id, panel_key, payload_json, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(firm_id, client_id, panel_key) DO UPDATE SET
                payload_json=excluded.payload_json,
                updated_at=excluded.updated_at
            """,
            (firm_id, client_id, panel_key, blob, now),
        )
    return {
        "client_id": client_id,
        "panel_key": panel_key,
        "payload": payload,
        "updated_at": now,
    }


def delete_simulation_overlay(firm_id: str, client_id: str, panel_key: str) -> bool:
    if panel_key not in VALID_PANEL_KEYS:
        raise ValueError(f"invalid panel_key: {panel_key}")
    init_client_simulation_db()
    with sqlite3.connect(SIMULATION_DB_PATH) as conn:
        cur = conn.execute(
            """
            DELETE FROM client_simulation_overlays
            WHERE firm_id=? AND client_id=? AND panel_key=?
            """,
            (firm_id, client_id, panel_key),
        )
    return cur.rowcount > 0
