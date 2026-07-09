"""AuthZ dependencies, stakeholder maps, audit helpers."""

from __future__ import annotations

import json
import sqlite3
import urllib.parse
from datetime import datetime
from pathlib import Path
from typing import Optional

import fitz
from fastapi import HTTPException, Request, UploadFile

from docugrid_auth import is_production, peek_identity_for_audit, resolve_identity
from services.client_assignments import (
    backfill_assignments_from_legacy,
    init_client_assignments_db,
    load_assignment_scope_map,
)
from services.document_version_service import is_logical_deleted, is_logical_purged
from services.tenancy import (
    AuthContext,
    authorize_client_access,
    authorize_client_permission,
    authorize_client_scope_header,
    authorize_firm_resource,
    build_auth_context,
)
from services.upload_limits import enforce_upload_size
from docugrid_auth import STAKEHOLDER_ROLE_BY_ID

from api.constants import (
    AUDIT_EVENTS_DB_PATH,
    BILLING_ACTIVE_STATUSES,
    BILLING_BLOCKED_PERMISSIONS,
    DEFAULT_ROLE_PERMISSIONS,
    DEFAULT_STAKEHOLDER_CLIENT_SCOPES,
    KNOWN_APP_PERMISSIONS,
    ROLE_PERMISSIONS_PATH,
    STAKEHOLDER_MASTER_PATH,
    _role_permissions_cache,
    _stakeholder_maps_cache,
)
from api.persistence import _init_audit_events_db

def _invalidate_role_permissions_cache() -> None:
    global _role_permissions_cache
    _role_permissions_cache = None


def _get_role_permissions() -> dict[str, set[str]]:
    global _role_permissions_cache
    if _role_permissions_cache is not None:
        return _role_permissions_cache
    merged = {role: set(perms) for role, perms in DEFAULT_ROLE_PERMISSIONS.items()}
    if ROLE_PERMISSIONS_PATH.exists():
        try:
            raw = json.loads(ROLE_PERMISSIONS_PATH.read_text(encoding="utf-8"))
            for role, perms in (raw.get("permissionsByRole") or {}).items():
                if role in merged and isinstance(perms, list):
                    merged[role] = {str(p) for p in perms if isinstance(p, str)}
        except Exception:
            pass
    if not is_production():
        merged.setdefault("admin", set()).add("settings.platform")
    _role_permissions_cache = merged
    return _role_permissions_cache


def _invalidate_stakeholder_maps_cache() -> None:
    global _stakeholder_maps_cache
    _stakeholder_maps_cache = None


def _legacy_stakeholder_scopes() -> dict[str, set[str]]:
    scopes = {k: set(v) for k, v in DEFAULT_STAKEHOLDER_CLIENT_SCOPES.items()}
    if STAKEHOLDER_MASTER_PATH.exists():
        try:
            raw = json.loads(STAKEHOLDER_MASTER_PATH.read_text(encoding="utf-8"))
            for k, v in (raw.get("clientScopesByStakeholderId") or {}).items():
                if isinstance(k, str) and isinstance(v, list):
                    scopes[k] = {str(x) for x in v}
        except Exception:
            pass
    return scopes


def _get_stakeholder_merged_maps() -> tuple[dict[str, str], dict[str, set[str]]]:
    global _stakeholder_maps_cache
    if _stakeholder_maps_cache is not None:
        return _stakeholder_maps_cache
    roles = dict(STAKEHOLDER_ROLE_BY_ID)
    if STAKEHOLDER_MASTER_PATH.exists():
        try:
            raw = json.loads(STAKEHOLDER_MASTER_PATH.read_text(encoding="utf-8"))
            for k, v in (raw.get("roleByStakeholderId") or {}).items():
                if isinstance(k, str) and isinstance(v, str) and k not in STAKEHOLDER_ROLE_BY_ID:
                    roles[k] = v
        except Exception:
            pass
    roles.update(STAKEHOLDER_ROLE_BY_ID)
    init_client_assignments_db()
    assignment_scopes = load_assignment_scope_map()
    if not assignment_scopes:
        backfill_assignments_from_legacy(_legacy_stakeholder_scopes())
        assignment_scopes = load_assignment_scope_map()
    scopes = assignment_scopes if assignment_scopes else _legacy_stakeholder_scopes()
    _stakeholder_maps_cache = (roles, scopes)
    return _stakeholder_maps_cache


def _get_stakeholder_role_map() -> dict[str, str]:
    return _get_stakeholder_merged_maps()[0]


def _get_stakeholder_client_scope_map() -> dict[str, set[str]]:
    return _get_stakeholder_merged_maps()[1]


def _enforce_billing_active_for_permission(
    firm_id: str,
    required_permission: str,
    *,
    email: str | None = None,
) -> None:
    from services.super_admin import is_super_admin_email

    if is_super_admin_email(email):
        return
    if required_permission not in BILLING_BLOCKED_PERMISSIONS:
        return
    # Stripe key or catalog prices missing => keep app usable for local dev.
    from services.stripe_billing_service import is_billing_enforced

    if not is_billing_enforced():
        return
    from services.stripe_billing_service import load_billing_record

    record = load_billing_record(firm_id)
    status = str(record.get("status") or "none")
    if status in BILLING_ACTIVE_STATUSES:
        return

    raise HTTPException(
        status_code=403,
        detail={
            "code": "billing_inactive",
            "status": status,
            "redirect": "/settings?tab=billing",
        },
    )


def _require_permission(request: Request, required_permission: str) -> str:
    identity = resolve_identity(request)
    from services.super_admin import all_app_permissions, is_super_admin_email

    if is_super_admin_email(identity.email):
        if required_permission not in all_app_permissions(KNOWN_APP_PERMISSIONS):
            raise HTTPException(status_code=403, detail=f"Permission denied: {required_permission}")
        return identity.role or "platform_admin"
    permissions = _get_role_permissions().get(identity.role, set())
    if required_permission not in permissions:
        raise HTTPException(status_code=403, detail=f"Permission denied: {required_permission}")
    _enforce_billing_active_for_permission(
        identity.firm_id,
        required_permission,
        email=identity.email,
    )
    return identity.role


def _require_any_permission(request: Request, *required_permissions: str) -> tuple[str, set[str]]:
    identity = resolve_identity(request)
    permissions = _get_role_permissions().get(identity.role, set())
    if not any(p in permissions for p in required_permissions):
        names = ", ".join(required_permissions)
        raise HTTPException(status_code=403, detail=f"Permission denied: need one of {names}")
    return identity.role, permissions


def _require_platform_settings(request: Request) -> str:
    """Global settings (role matrix, AI keys) — platform_admin only in production."""
    return _require_permission(request, "settings.platform")


def _require_platform(request: Request) -> str:
    """Alias for platform-only endpoints (billing partners, executive dashboard)."""
    return _require_platform_settings(request)


def _auth_context(request: Request) -> AuthContext:
    identity = resolve_identity(request)
    return build_auth_context(
        role=identity.role,
        email=identity.email,
        stakeholder_id=identity.stakeholder_id,
        firm_id=identity.firm_id,
        member_id=identity.member_id,
    )


def _require_client_scope(request: Request, role: str) -> str:
    ctx = _auth_context(request)
    client_id = (request.headers.get("X-Docugrid-Client") or "").strip()
    return authorize_client_scope_header(ctx, client_id, _get_stakeholder_client_scope_map())


def _require_client_access(
    request: Request,
    role: str,
    client_id: str,
    *,
    required_permission: str | None = None,
) -> None:
    """Verify firm boundary + assignment for an explicit client_id."""
    ctx = _auth_context(request)
    scope_map = _get_stakeholder_client_scope_map()
    if required_permission:
        authorize_client_permission(
            ctx,
            client_id,
            required_permission,
            scope_map,
            base_permissions=_get_role_permissions().get(ctx.role, set()),
        )
    else:
        authorize_client_access(ctx, client_id, scope_map)


def _require_client_permission(request: Request, permission: str, client_id: str) -> str:
    role = _require_permission(request, permission)
    _require_client_access(request, role, client_id, required_permission=permission)
    return role


async def _read_upload_content(upload: UploadFile) -> bytes:
    content = await upload.read()
    enforce_upload_size(content)
    return content


def _validate_pdf_bytes(content: bytes) -> int:
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    try:
        doc = fitz.open("pdf", content)
        return len(doc)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid PDF")


def _require_moneytree_client(
    request: Request,
    client_id: str,
    *,
    write: bool = False,
) -> AuthContext:
    """顧問先スコープの Moneytree 連携（接続は顧問先ユーザーが実施）。"""
    cid = (client_id or "").strip()
    if not cid:
        raise HTTPException(status_code=400, detail="client_id_required")
    if write:
        _require_permission(request, "document.upload")
    else:
        _require_any_permission(request, "client.view")
    ctx = _auth_context(request)
    authorize_client_access(ctx, cid, _get_stakeholder_client_scope_map())
    return ctx


def _format_http_detail(detail: object) -> str:
    if isinstance(detail, str):
        return detail
    try:
        return json.dumps(detail, ensure_ascii=False)
    except Exception:
        return str(detail)


def _attachment_content_disposition(filename: str) -> str:
    """HTTP ヘッダー用 Content-Disposition（日本語ファイル名対応 RFC 5987）。"""
    safe = (filename or "download").replace('"', "_").replace("\\", "_")
    if all(ord(c) < 128 for c in safe):
        ascii_fallback = safe
    else:
        suffix = Path(safe).suffix if "." in safe else ""
        ascii_fallback = f"document{suffix}" if suffix else "document"
    encoded = urllib.parse.quote(safe)
    return f'attachment; filename="{ascii_fallback}"; filename*=UTF-8\'\'{encoded}'


def _audit_detail(request: Request, detail: str = "") -> str:
    """Annotate audit rows when the caller is DocuGrid MCP (AI channel)."""
    if (request.headers.get("X-Docugrid-MCP") or "").strip():
        return f"channel=mcp; {detail}" if detail else "channel=mcp"
    return detail


def _can_manage_deleted_documents(request: Request) -> bool:
    identity = resolve_identity(request)
    return "document.purge" in _get_role_permissions().get(identity.role, set())


def _slot_row_is_soft_deleted(row: sqlite3.Row) -> bool:
    deleted_at = row["deleted_at"] if "deleted_at" in row.keys() else None
    if deleted_at:
        return True
    return str(row["slot_id"]).startswith("deleted_")


def _deny_soft_deleted_row_unless_purge(request: Request, row: sqlite3.Row) -> None:
    if _slot_row_is_soft_deleted(row) and not _can_manage_deleted_documents(request):
        raise HTTPException(status_code=404, detail="Not found")


_DIRECTOR_ONLY_REVIEW_EVENT_TYPES = frozenset({"document_soft_delete", "document_restore"})


def _is_client_portal_role(role: str) -> bool:
    return role == "client_uploader"


def _slot_access_sql_filters(request: Request, *, include_deleted: bool = False) -> str:
    parts: list[str] = []
    if not include_deleted:
        parts.append("(deleted_at IS NULL OR deleted_at = '')")
    identity = resolve_identity(request)
    if _is_client_portal_role(identity.role):
        parts.append("(client_shared_at IS NOT NULL AND client_shared_at != '')")
    if not parts:
        return ""
    return " AND " + " AND ".join(parts)


def _deny_client_slot_unless_shared(request: Request, row: sqlite3.Row) -> None:
    identity = resolve_identity(request)
    if not _is_client_portal_role(identity.role):
        return
    shared_at = row["client_shared_at"] if "client_shared_at" in row.keys() else None
    if not shared_at:
        raise HTTPException(status_code=404, detail="Not found")


def _filter_review_event_rows(request: Request, rows: list[sqlite3.Row]) -> list[sqlite3.Row]:
    if _can_manage_deleted_documents(request):
        return rows
    return [r for r in rows if r["event_type"] not in _DIRECTOR_ONLY_REVIEW_EVENT_TYPES]


def _deny_if_logical_purged(logical_id: Optional[str]) -> None:
    if logical_id and is_logical_purged(logical_id):
        raise HTTPException(status_code=410, detail="Document deleted")


def _deny_if_logical_deleted(logical_id: Optional[str]) -> None:
    if logical_id and is_logical_deleted(logical_id):
        raise HTTPException(status_code=410, detail="Document deleted")


def _log_audit_event(request: Request, action: str, result: str, detail: str = "") -> None:
    role, email, stid = peek_identity_for_audit(request)
    firm_id = ""
    try:
        firm_id = _auth_context(request).firm_id
    except HTTPException:
        pass
    _init_audit_events_db()
    detail = _audit_detail(request, detail)
    with sqlite3.connect(AUDIT_EVENTS_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO audit_events (
                created_at, stakeholder_id, user_email, role, client_id, path, action, result, detail, http_status, firm_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
            """,
            (
                datetime.utcnow().isoformat(),
                stid or "",
                email or "",
                role or "",
                (request.headers.get("X-Docugrid-Client") or "").strip(),
                str(request.url.path),
                action,
                result,
                detail,
                firm_id,
            ),
        )


def _log_audit_denial(request: Request, status_code: int, detail: str) -> None:
    if getattr(request.state, "_audit_denial_logged", False):
        return
    request.state._audit_denial_logged = True
    role, email, stid = peek_identity_for_audit(request)
    firm_id = ""
    try:
        firm_id = _auth_context(request).firm_id
    except HTTPException:
        pass
    detail = _audit_detail(request, detail)
    _init_audit_events_db()
    with sqlite3.connect(AUDIT_EVENTS_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO audit_events (
                created_at, stakeholder_id, user_email, role, client_id, path, action, result, detail, http_status, firm_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                datetime.utcnow().isoformat(),
                stid or "",
                email or "",
                role or "",
                (request.headers.get("X-Docugrid-Client") or "").strip() or None,
                str(request.url.path),
                "access.denied",
                "denied",
                detail,
                status_code,
                firm_id,
            ),
        )

__all__ = [
    "_attachment_content_disposition",
    "_audit_detail",
    "_auth_context",
    "_can_manage_deleted_documents",
    "_deny_client_slot_unless_shared",
    "_deny_if_logical_deleted",
    "_deny_if_logical_purged",
    "_deny_soft_deleted_row_unless_purge",
    "_enforce_billing_active_for_permission",
    "_filter_review_event_rows",
    "_format_http_detail",
    "_get_role_permissions",
    "_get_stakeholder_client_scope_map",
    "_get_stakeholder_merged_maps",
    "_get_stakeholder_role_map",
    "_invalidate_role_permissions_cache",
    "_invalidate_stakeholder_maps_cache",
    "_is_client_portal_role",
    "_legacy_stakeholder_scopes",
    "_log_audit_denial",
    "_log_audit_event",
    "_require_any_permission",
    "_require_client_access",
    "_require_client_permission",
    "_require_client_scope",
    "_require_moneytree_client",
    "_require_permission",
    "_require_platform",
    "_require_platform_settings",
    "_read_upload_content",
    "_slot_access_sql_filters",
    "_slot_row_is_soft_deleted",
    "_validate_pdf_bytes",
]
