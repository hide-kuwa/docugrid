"""
Multi-tenant authorization (firm boundary + client assignment).

See docs/auth-tenancy-design.md.
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Callable, Optional

from fastapi import HTTPException

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
CLIENT_MASTER_PATH = STORAGE_DIR / "client_master.json"
SLOT_DOCS_DB_PATH = STORAGE_DIR / "slot_documents.db"

DEFAULT_FIRM_ID = "firm_default"
FIRM_BETA_ID = "firm_beta"

FIRM_LABELS: dict[str, str] = {
    DEFAULT_FIRM_ID: "デフォルト事務所",
    FIRM_BETA_ID: "ベータ事務所",
}


def firm_label(firm_id: str) -> str:
    if not firm_id:
        return FIRM_LABELS.get(DEFAULT_FIRM_ID, DEFAULT_FIRM_ID)
    return FIRM_LABELS.get(firm_id, firm_id)

# Stakeholder → firm fallback when firm_members row is missing (legacy / header auth)
STAKEHOLDER_FIRM_BY_ID: dict[str, str] = {
    "actor-admin": DEFAULT_FIRM_ID,
    "actor-s1": DEFAULT_FIRM_ID,
    "actor-s2": DEFAULT_FIRM_ID,
    "actor-s3": DEFAULT_FIRM_ID,
    "actor-c1": DEFAULT_FIRM_ID,
    "actor-c-ceo": DEFAULT_FIRM_ID,
    "actor-c-sales": DEFAULT_FIRM_ID,
    "actor-c-controller": DEFAULT_FIRM_ID,
    "actor-b1": DEFAULT_FIRM_ID,
    "actor-tp1": DEFAULT_FIRM_ID,
    "actor-tax1": DEFAULT_FIRM_ID,
    "actor-beta-admin": FIRM_BETA_ID,
    "actor-beta-staff": FIRM_BETA_ID,
}

FIRM_WIDE_ROLES = frozenset({"admin", "firm_admin", "platform_admin", "approver"})


@dataclass(frozen=True)
class AuthContext:
    firm_id: str
    member_id: str
    role: str
    email: str
    stakeholder_id: str


def stakeholder_firm_id(stakeholder_id: str) -> str:
    if not stakeholder_id:
        return DEFAULT_FIRM_ID
    return STAKEHOLDER_FIRM_BY_ID.get(stakeholder_id, DEFAULT_FIRM_ID)


def is_firm_wide_role(role: str) -> bool:
    return role in FIRM_WIDE_ROLES


def _load_client_master_raw() -> dict:
    if not CLIENT_MASTER_PATH.exists():
        return {}
    try:
        return json.loads(CLIENT_MASTER_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


@lru_cache(maxsize=1)
def _client_firm_map_cached(mtime: float) -> dict[str, str]:
    del mtime
    raw = _load_client_master_raw()
    out: dict[str, str] = {}
    for item in raw.get("clients") or []:
        if not isinstance(item, dict):
            continue
        cid = str(item.get("id") or "").strip()
        if not cid:
            continue
        fid = str(item.get("firmId") or item.get("firm_id") or DEFAULT_FIRM_ID).strip()
        out[cid] = fid or DEFAULT_FIRM_ID
    return out


def invalidate_client_firm_cache() -> None:
    _client_firm_map_cached.cache_clear()


def get_client_firm_map() -> dict[str, str]:
    mtime = CLIENT_MASTER_PATH.stat().st_mtime if CLIENT_MASTER_PATH.exists() else 0.0
    mapped = dict(_client_firm_map_cached(mtime))
    if mapped:
        return mapped
    return {f"c{i}": DEFAULT_FIRM_ID for i in range(1, 6)}


def get_client_firm_id(client_id: str) -> str:
    if not client_id:
        return DEFAULT_FIRM_ID
    return get_client_firm_map().get(client_id, DEFAULT_FIRM_ID)


def firm_client_ids(firm_id: str) -> set[str]:
    return {cid for cid, fid in get_client_firm_map().items() if fid == firm_id}


def visible_client_ids(
    ctx: AuthContext,
    scope_map: dict[str, set[str]],
) -> set[str]:
    in_firm = firm_client_ids(ctx.firm_id)
    if is_firm_wide_role(ctx.role):
        return in_firm
    assigned = scope_map.get(ctx.member_id, set()) or scope_map.get(ctx.stakeholder_id, set())
    return in_firm & assigned


def authorize_firm_resource(ctx: AuthContext, resource_firm_id: str) -> None:
    if resource_firm_id != ctx.firm_id:
        raise HTTPException(status_code=403, detail="Cross-firm access denied")


def authorize_client_access(
    ctx: AuthContext,
    client_id: str,
    scope_map: dict[str, set[str]],
) -> None:
    if not client_id:
        raise HTTPException(status_code=401, detail="Missing client_id")
    authorize_firm_resource(ctx, get_client_firm_id(client_id))
    if client_id not in visible_client_ids(ctx, scope_map):
        raise HTTPException(status_code=403, detail="Client scope denied")


def authorize_client_scope_header(
    ctx: AuthContext,
    header_client_id: str,
    scope_map: dict[str, set[str]],
) -> str:
    if not header_client_id:
        if is_firm_wide_role(ctx.role):
            return ""
        raise HTTPException(status_code=401, detail="Missing stakeholder/client scope")
    authorize_client_access(ctx, header_client_id, scope_map)
    return header_client_id


def resolve_docugrid_client_id(document_id: str) -> Optional[str]:
    if not document_id:
        return None
    if not SLOT_DOCS_DB_PATH.exists():
        return None
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        row = conn.execute(
            "SELECT client_id FROM slot_documents WHERE docugrid_document_id=? LIMIT 1",
            (document_id,),
        ).fetchone()
    return str(row[0]) if row else None


def resolve_slot_document_client_id(doc_id: str) -> Optional[str]:
    if not doc_id or not SLOT_DOCS_DB_PATH.exists():
        return None
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        row = conn.execute(
            "SELECT client_id, firm_id FROM slot_documents WHERE id=? LIMIT 1",
            (doc_id,),
        ).fetchone()
    if not row:
        return None
    return str(row[0])


def resolve_version_client_id(version_id: str) -> Optional[str]:
    from services.document_version_service import get_logical_by_id, get_version

    ver = get_version(version_id)
    if not ver:
        return None
    logical = get_logical_by_id(ver.logical_document_id)
    return logical.client_id if logical else None


def resolve_version_firm_id(version_id: str) -> Optional[str]:
    from services.document_version_service import get_logical_by_id, get_version

    ver = get_version(version_id)
    if not ver:
        return None
    logical = get_logical_by_id(ver.logical_document_id)
    if not logical:
        return None
    return logical.firm_id or get_client_firm_id(logical.client_id)


def build_auth_context(
    *,
    role: str,
    email: str,
    stakeholder_id: str,
    firm_id: Optional[str] = None,
    member_id: Optional[str] = None,
) -> AuthContext:
    fid = (firm_id or "").strip() or stakeholder_firm_id(stakeholder_id)
    mid = (member_id or "").strip() or stakeholder_id
    return AuthContext(
        firm_id=fid,
        member_id=mid,
        role=role,
        email=email,
        stakeholder_id=stakeholder_id,
    )


def filter_client_master_clients(
    clients: list,
    ctx: AuthContext,
    scope_map: dict[str, set[str]],
) -> list:
    allowed = visible_client_ids(ctx, scope_map)
    return [c for c in clients if c.id in allowed]
