"""OCR パネルの手動修正ドラフト（顧客マスタへは反映しない）。"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
EXTRACTION_DRAFT_DB_PATH = STORAGE_DIR / "extraction_drafts.db"


def _now() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


def init_extraction_draft_db() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(EXTRACTION_DRAFT_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS extraction_drafts (
                firm_id TEXT NOT NULL,
                client_id TEXT NOT NULL,
                period_key TEXT NOT NULL,
                slot_id TEXT NOT NULL,
                fields_json TEXT NOT NULL,
                edited_ids_json TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (firm_id, client_id, period_key, slot_id)
            )
            """
        )


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    fields: dict[str, str] = {}
    edited_ids: list[str] = []
    try:
        raw_fields = json.loads(row["fields_json"] or "{}")
        if isinstance(raw_fields, dict):
            fields = {
                str(k): str(v)
                for k, v in raw_fields.items()
                if isinstance(v, (str, int, float)) and str(v).strip()
            }
    except (json.JSONDecodeError, TypeError):
        fields = {}
    try:
        raw_ids = json.loads(row["edited_ids_json"] or "[]")
        if isinstance(raw_ids, list):
            edited_ids = [str(x) for x in raw_ids if str(x).strip()]
    except (json.JSONDecodeError, TypeError):
        edited_ids = []
    return {
        "firm_id": row["firm_id"],
        "client_id": row["client_id"],
        "period_key": row["period_key"],
        "slot_id": row["slot_id"],
        "fields": fields,
        "edited_ids": edited_ids,
        "updated_at": row["updated_at"],
    }


def get_extraction_draft(
    *,
    firm_id: str,
    client_id: str,
    period_key: str,
    slot_id: str,
) -> Optional[dict[str, Any]]:
    init_extraction_draft_db()
    with sqlite3.connect(EXTRACTION_DRAFT_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            """
            SELECT * FROM extraction_drafts
            WHERE firm_id=? AND client_id=? AND period_key=? AND slot_id=?
            """,
            (firm_id, client_id, period_key, slot_id),
        ).fetchone()
    if not row:
        return None
    return _row_to_dict(row)


def save_extraction_draft(
    *,
    firm_id: str,
    client_id: str,
    period_key: str,
    slot_id: str,
    fields: dict[str, str],
    edited_ids: list[str],
) -> dict[str, Any]:
    """手動修正の状態を upsert。空なら行を削除する。"""
    init_extraction_draft_db()
    clean_fields = {
        str(k).strip(): str(v).strip()
        for k, v in (fields or {}).items()
        if str(k).strip() and str(v).strip()
    }
    clean_ids = [str(x).strip() for x in (edited_ids or []) if str(x).strip()]
    # edited に無いキーは落とす（表示用の全 draft ではなく修正分だけ）
    clean_fields = {k: v for k, v in clean_fields.items() if k in set(clean_ids)}

    if not clean_ids:
        clear_extraction_draft(
            firm_id=firm_id,
            client_id=client_id,
            period_key=period_key,
            slot_id=slot_id,
        )
        return {
            "firm_id": firm_id,
            "client_id": client_id,
            "period_key": period_key,
            "slot_id": slot_id,
            "fields": {},
            "edited_ids": [],
            "updated_at": _now(),
        }

    updated_at = _now()
    with sqlite3.connect(EXTRACTION_DRAFT_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO extraction_drafts (
                firm_id, client_id, period_key, slot_id,
                fields_json, edited_ids_json, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(firm_id, client_id, period_key, slot_id) DO UPDATE SET
                fields_json=excluded.fields_json,
                edited_ids_json=excluded.edited_ids_json,
                updated_at=excluded.updated_at
            """,
            (
                firm_id,
                client_id,
                period_key,
                slot_id,
                json.dumps(clean_fields, ensure_ascii=False),
                json.dumps(clean_ids, ensure_ascii=False),
                updated_at,
            ),
        )
    return {
        "firm_id": firm_id,
        "client_id": client_id,
        "period_key": period_key,
        "slot_id": slot_id,
        "fields": clean_fields,
        "edited_ids": clean_ids,
        "updated_at": updated_at,
    }


def clear_extraction_draft(
    *,
    firm_id: str,
    client_id: str,
    period_key: str,
    slot_id: str,
) -> None:
    init_extraction_draft_db()
    with sqlite3.connect(EXTRACTION_DRAFT_DB_PATH) as conn:
        conn.execute(
            """
            DELETE FROM extraction_drafts
            WHERE firm_id=? AND client_id=? AND period_key=? AND slot_id=?
            """,
            (firm_id, client_id, period_key, slot_id),
        )


def remove_fields_from_draft(
    *,
    firm_id: str,
    client_id: str,
    period_key: str,
    slot_id: str,
    field_ids: list[str],
) -> Optional[dict[str, Any]]:
    """マスタ反映後に、反映済みフィールドだけドラフトから外す。"""
    current = get_extraction_draft(
        firm_id=firm_id,
        client_id=client_id,
        period_key=period_key,
        slot_id=slot_id,
    )
    if not current:
        return None
    drop = {str(x).strip() for x in field_ids if str(x).strip()}
    remaining_ids = [x for x in current["edited_ids"] if x not in drop]
    remaining_fields = {
        k: v for k, v in current["fields"].items() if k in set(remaining_ids)
    }
    return save_extraction_draft(
        firm_id=firm_id,
        client_id=client_id,
        period_key=period_key,
        slot_id=slot_id,
        fields=remaining_fields,
        edited_ids=remaining_ids,
    )
