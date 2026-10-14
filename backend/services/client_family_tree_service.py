"""顧問先カルテ — 家系図（世代別の家族メンバー表）。

家族メンバーは顧問先に登録されていない個人も直接持てる。``linked_client_id`` を付けると
同じ事務所の顧問先にひも付く（表示名は顧客マスタ側を正とする）。
"""

from __future__ import annotations

import json
import re
import sqlite3
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Optional

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
FAMILY_TREE_DB_PATH = STORAGE_DIR / "client_family_tree.db"

MAX_MEMBERS = 80
MIN_GENERATION = 1
MAX_GENERATION = 4
COHABITATION_VALUES = frozenset({"", "same", "separate"})

_MEMBER_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,40}$")
_TEXT_LIMITS = {
    "relation": 30,
    "name": 80,
    "kana": 80,
    "occupation": 120,
    "address": 200,
    "note": 300,
}


def init_client_family_tree_db() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(FAMILY_TREE_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS client_family_trees (
                firm_id TEXT NOT NULL,
                client_id TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                updated_by TEXT,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (firm_id, client_id)
            )
            """
        )


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


def _empty_tree() -> dict[str, Any]:
    return {"members": [], "decedent_id": None, "updated_at": None, "updated_by": None}


def _clean_text(value: Any, field: str) -> str:
    text = str(value or "").strip()
    limit = _TEXT_LIMITS[field]
    if len(text) > limit:
        raise ValueError(f"{field} too long (max {limit})")
    return text


def _clean_date(value: Any, field: str) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    try:
        date.fromisoformat(text)
    except ValueError:
        raise ValueError(f"{field} must be YYYY-MM-DD") from None
    return text


def _clean_member(raw: Any, linkable_client_ids: set[str]) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValueError("member must be an object")
    member_id = str(raw.get("id") or "").strip()
    if not _MEMBER_ID_RE.match(member_id):
        raise ValueError("invalid member id")
    try:
        generation = int(raw.get("generation"))
    except (TypeError, ValueError):
        raise ValueError("generation must be an integer") from None
    if not MIN_GENERATION <= generation <= MAX_GENERATION:
        raise ValueError(f"generation must be {MIN_GENERATION}-{MAX_GENERATION}")
    cohabitation = str(raw.get("cohabitation") or "").strip()
    if cohabitation not in COHABITATION_VALUES:
        raise ValueError("invalid cohabitation")
    linked = str(raw.get("linked_client_id") or "").strip() or None
    if linked is not None and linked not in linkable_client_ids:
        raise ValueError("linked_client_id is not a client of this firm")
    parent_ids = raw.get("parent_ids") or []
    if not isinstance(parent_ids, list) or len(parent_ids) > 2:
        raise ValueError("parent_ids must be a list of up to 2 ids")
    try:
        sort_order = int(raw.get("sort_order") or 0)
    except (TypeError, ValueError):
        sort_order = 0
    return {
        "id": member_id,
        "generation": generation,
        "relation": _clean_text(raw.get("relation"), "relation"),
        "name": _clean_text(raw.get("name"), "name"),
        "kana": _clean_text(raw.get("kana"), "kana"),
        "birth_date": _clean_date(raw.get("birth_date"), "birth_date"),
        "death_date": _clean_date(raw.get("death_date"), "death_date"),
        "deceased": bool(raw.get("deceased")) or bool(raw.get("death_date")),
        "adopted": bool(raw.get("adopted")),
        "occupation": _clean_text(raw.get("occupation"), "occupation"),
        "cohabitation": cohabitation,
        "address": _clean_text(raw.get("address"), "address"),
        "note": _clean_text(raw.get("note"), "note"),
        "linked_client_id": linked,
        "spouse_id": str(raw.get("spouse_id") or "").strip() or None,
        "parent_ids": [str(p).strip() for p in parent_ids if str(p).strip()],
        "sort_order": sort_order,
    }


def validate_family_tree(payload: dict[str, Any], linkable_client_ids: set[str]) -> dict[str, Any]:
    raw_members = payload.get("members") or []
    if not isinstance(raw_members, list):
        raise ValueError("members must be a list")
    if len(raw_members) > MAX_MEMBERS:
        raise ValueError(f"too many members (max {MAX_MEMBERS})")
    members = [_clean_member(m, linkable_client_ids) for m in raw_members]
    by_id = {m["id"]: m for m in members}
    if len(by_id) != len(members):
        raise ValueError("duplicate member id")
    for m in members:
        spouse = m["spouse_id"]
        if spouse is not None and (spouse == m["id"] or spouse not in by_id):
            raise ValueError("spouse_id must reference another member")
        for pid in m["parent_ids"]:
            parent = by_id.get(pid)
            if parent is None or pid == m["id"]:
                raise ValueError("parent_ids must reference other members")
            if parent["generation"] >= m["generation"]:
                raise ValueError("parent must be in an earlier generation")
    decedent = str(payload.get("decedent_id") or "").strip() or None
    if decedent is not None and decedent not in by_id:
        raise ValueError("decedent_id must reference a member")
    return {"members": members, "decedent_id": decedent}


def get_family_tree(firm_id: str, client_id: str) -> dict[str, Any]:
    with sqlite3.connect(FAMILY_TREE_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT payload_json, updated_by, updated_at FROM client_family_trees "
            "WHERE firm_id = ? AND client_id = ?",
            (firm_id, client_id),
        ).fetchone()
    if row is None:
        return _empty_tree()
    try:
        data = json.loads(row["payload_json"])
    except json.JSONDecodeError:
        data = {}
    return {
        "members": data.get("members") or [],
        "decedent_id": data.get("decedent_id"),
        "updated_at": row["updated_at"],
        "updated_by": row["updated_by"],
    }


def save_family_tree(
    firm_id: str,
    client_id: str,
    payload: dict[str, Any],
    *,
    linkable_client_ids: set[str],
    actor: Optional[str] = None,
) -> dict[str, Any]:
    cleaned = validate_family_tree(payload, linkable_client_ids)
    now = _utc_now()
    with sqlite3.connect(FAMILY_TREE_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO client_family_trees (firm_id, client_id, payload_json, updated_by, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (firm_id, client_id) DO UPDATE SET
                payload_json = excluded.payload_json,
                updated_by = excluded.updated_by,
                updated_at = excluded.updated_at
            """,
            (firm_id, client_id, json.dumps(cleaned, ensure_ascii=False), actor, now),
        )
    return {**cleaned, "updated_at": now, "updated_by": actor}
