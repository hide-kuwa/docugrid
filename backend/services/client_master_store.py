"""client_master.json の読み書き — FastAPI 層から独立した SSOT アクセス。"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from services.client_profile_fields import (
    MAX_PROFILE_HISTORY_PER_FIELD,
    sanitize_client_profile,
    sanitize_client_profile_history,
    sanitize_client_profile_meta,
)
from services.tenancy import invalidate_client_firm_cache

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
CLIENT_MASTER_PATH = STORAGE_DIR / "client_master.json"


def _now() -> str:
    return datetime.utcnow().isoformat()


def load_raw() -> dict[str, Any]:
    if not CLIENT_MASTER_PATH.exists():
        return {"clients": [], "groups": [], "updated_at": None}
    try:
        return json.loads(CLIENT_MASTER_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {"clients": [], "groups": [], "updated_at": None}


def save_raw(payload: dict[str, Any]) -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    payload["updated_at"] = _now()
    CLIENT_MASTER_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    invalidate_client_firm_cache()


def find_client(client_id: str) -> Optional[dict[str, Any]]:
    for client in load_raw().get("clients") or []:
        if isinstance(client, dict) and client.get("id") == client_id:
            return client
    return None


def update_client_record(client_id: str, mutator) -> bool:
    """mutator(client_dict) -> None。見つかった場合 True。"""
    payload = load_raw()
    clients = payload.get("clients") or []
    for client in clients:
        if not isinstance(client, dict) or client.get("id") != client_id:
            continue
        mutator(client)
        client["profile"] = sanitize_client_profile(client.get("profile"))
        client["profileMeta"] = sanitize_client_profile_meta(client.get("profileMeta"))
        client["profileHistory"] = sanitize_client_profile_history(client.get("profileHistory"))
        save_raw(payload)
        return True
    return False


def append_history_entry(
    client: dict[str, Any],
    field_id: str,
    *,
    value: str,
    previous_value: str,
    source: str,
    updated_by: Optional[str],
    updated_by_id: Optional[str],
) -> None:
    history = client.setdefault("profileHistory", {})
    if not isinstance(history, dict):
        history = {}
        client["profileHistory"] = history
    entries = history.setdefault(field_id, [])
    if not isinstance(entries, list):
        entries = []
        history[field_id] = entries
    entry: dict[str, str] = {
        "value": value,
        "previousValue": previous_value,
        "source": source,
        "updatedAt": _now(),
    }
    if updated_by:
        entry["updatedBy"] = updated_by
    if updated_by_id:
        entry["updatedById"] = updated_by_id
    entries.insert(0, entry)
    history[field_id] = entries[:MAX_PROFILE_HISTORY_PER_FIELD]
