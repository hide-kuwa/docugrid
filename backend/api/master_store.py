"""Master JSON stores."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException

from docugrid_auth import STAKEHOLDER_ROLE_BY_ID

from api.constants import (
    CLIENT_MASTER_PATH,
    DEFAULT_ROLE_PERMISSIONS,
    KNOWN_APP_PERMISSIONS,
    ROLE_PERMISSIONS_PATH,
    STAKEHOLDER_MASTER_PATH,
    SYSTEM_CONFIG_PATH,
    _role_permissions_cache,
)
from api.deps import (
    _get_role_permissions,
    _invalidate_role_permissions_cache,
    _invalidate_stakeholder_maps_cache,
)
from api.schemas import (
    ClientMasterClient,
    ClientMasterGroup,
    ClientMasterPayload,
    RolePermissionsPayload,
    StakeholderMasterPayload,
    SystemConfigPayload,
    SystemConfigUpdateBody,
)
from services.firm_settings import (
    configured_flags,
    get_gemini_key,
    get_openai_key,
    load_system_config_raw,
    save_system_config_raw,
    update_secrets,
)
from services.client_assignments import (
    sync_assignments_from_scope_map,
    validate_assignments_for_clients,
)
from services.client_profile_fields import (
    sanitize_client_profile,
    sanitize_client_profile_history,
    sanitize_client_profile_meta,
)
from services.drive_context import drive_credentials_configured, resolve_drive_mode
from services.tenancy import AuthContext, get_client_firm_id, get_client_firm_map, invalidate_client_firm_cache

def _load_system_config(firm_id: str) -> SystemConfigPayload:
    data = load_system_config_raw(firm_id)
    if data:
        try:
            base = SystemConfigPayload(
                **{k: v for k, v in data.items() if k in SystemConfigPayload.model_fields}
            )
        except Exception:
            base = SystemConfigPayload(google_drive_connected=False, updated_at=None)
    else:
        base = SystemConfigPayload(google_drive_connected=False, updated_at=None)
    flags = configured_flags(firm_id)
    return base.model_copy(
        update={
            **flags,
            "drive_credentials_configured": drive_credentials_configured(firm_id),
            "drive_mode": resolve_drive_mode(firm_id),
        }
    )


def _clamp_matrix_year_display_count(value: int) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return 5
    return max(1, min(30, n))


def _save_system_config(firm_id: str, body: SystemConfigUpdateBody) -> SystemConfigPayload:
    update_secrets(
        firm_id,
        openai_api_key=body.ai_openai_api_key,
        gemini_api_key=body.ai_gemini_api_key,
        clear_openai=body.clear_ai_openai_key,
        clear_gemini=body.clear_ai_gemini_key,
    )
    next_payload = SystemConfigPayload(
        google_drive_connected=body.google_drive_connected,
        notification_email_enabled=body.notification_email_enabled,
        ocr_auto_extract_enabled=body.ocr_auto_extract_enabled,
        alert_consumption_tax_months_before_due=body.alert_consumption_tax_months_before_due,
        alert_corporate_tax_months_before_due=body.alert_corporate_tax_months_before_due,
        ai_openai_enabled=body.ai_openai_enabled,
        ai_openai_model=body.ai_openai_model or "gpt-4o-mini",
        ai_gemini_enabled=body.ai_gemini_enabled,
        ai_gemini_model=body.ai_gemini_model or "gemini-2.5-flash",
        drive_root_folder_id=(body.drive_root_folder_id or "").strip() or None,
        matrix_year_display_count=_clamp_matrix_year_display_count(body.matrix_year_display_count),
        updated_at=datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
        **configured_flags(firm_id),
        drive_credentials_configured=drive_credentials_configured(firm_id),
        drive_mode=resolve_drive_mode(firm_id),
    )
    store = next_payload.model_dump(
        exclude={
            "ai_openai_key_configured",
            "ai_openai_key_last4",
            "ai_gemini_key_configured",
            "ai_gemini_key_last4",
            "drive_credentials_configured",
            "drive_mode",
        }
    )
    save_system_config_raw(firm_id, store)
    return next_payload


def _system_config_update_touches_platform(
    body: SystemConfigUpdateBody, existing: SystemConfigPayload
) -> bool:
    if body.ai_openai_api_key or body.ai_gemini_api_key:
        return True
    if body.clear_ai_openai_key or body.clear_ai_gemini_key:
        return True
    if body.ocr_auto_extract_enabled != existing.ocr_auto_extract_enabled:
        return True
    if body.ai_openai_enabled != existing.ai_openai_enabled:
        return True
    if body.ai_gemini_enabled != existing.ai_gemini_enabled:
        return True
    if (body.ai_openai_model or "gpt-4o-mini") != existing.ai_openai_model:
        return True
    if (body.ai_gemini_model or "gemini-2.5-flash") != existing.ai_gemini_model:
        return True
    if (body.drive_root_folder_id or "").strip() != (existing.drive_root_folder_id or "").strip():
        return True
    if body.google_drive_connected != existing.google_drive_connected:
        return True
    return False


def _mask_system_config_for_role(payload: SystemConfigPayload, role: str) -> SystemConfigPayload:
    perms = _get_role_permissions().get(role, set())
    if "settings.platform" in perms:
        return payload
    return payload.model_copy(
        update={
            "ocr_auto_extract_enabled": True,
            "ai_openai_enabled": False,
            "ai_gemini_enabled": False,
            "ai_openai_key_configured": False,
            "ai_openai_key_last4": None,
            "ai_gemini_key_configured": False,
            "ai_gemini_key_last4": None,
            "drive_credentials_configured": False,
            "drive_mode": "unconfigured",
            "drive_root_folder_id": None,
        }
    )


def _default_client_master() -> ClientMasterPayload:
    return ClientMasterPayload(
        clients=[
            ClientMasterClient(id="c1", name="株式会社 鈴木商店", fiscalMonth=3, category="corporate", tags=["製造"]),
            ClientMasterClient(id="c2", name="合同会社 テック", fiscalMonth=12, category="corporate", tags=["IT"]),
            ClientMasterClient(id="c3", name="佐藤商事", fiscalMonth=9, category="corporate", tags=["卸売"]),
            ClientMasterClient(id="c4", name="鈴木 太郎 (個人)", fiscalMonth=12, category="individual", tags=["個人事業"]),
            ClientMasterClient(id="c5", name="山田不動産", fiscalMonth=12, category="corporate", tags=["不動産"]),
        ],
        groups=[
            ClientMasterGroup(id="g1", name="鈴木グループ", relationType="group_company", clientIds=["c1", "c2"], note="グループ会社として連結管理"),
            ClientMasterGroup(id="g2", name="鈴木家資産管理", relationType="relative_group", clientIds=["c1", "c4"], note="親族保有資産・個人事業を含む"),
            ClientMasterGroup(id="g3", name="山田不動産 株主関係", relationType="shareholder", clientIds=["c5", "c3"], note="主要株主の関連先を監視"),
        ],
        updated_at=None,
    )


def _load_client_master() -> ClientMasterPayload:
    if not CLIENT_MASTER_PATH.exists():
        return _default_client_master()
    try:
        data = json.loads(CLIENT_MASTER_PATH.read_text(encoding="utf-8"))
        return ClientMasterPayload(**data)
    except Exception:
        return _default_client_master()


def _merge_client_master_for_firm(ctx: AuthContext, payload: ClientMasterPayload) -> ClientMasterPayload:
    existing = _load_client_master()
    firm = ctx.firm_id
    other_clients = [
        c
        for c in existing.clients
        if get_client_firm_id(c.id) != firm
    ]
    other_client_ids = {c.id for c in other_clients}
    firm_clients_by_id = {
        c.id: c
        for c in existing.clients
        if get_client_firm_id(c.id) == firm
    }
    for c in payload.clients:
        if c.id in other_client_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot modify client {c.id!r} belonging to another firm",
            )
        assigned_firm = (c.firmId or "").strip() or firm
        if assigned_firm != firm:
            raise HTTPException(
                status_code=400,
                detail=f"Client {c.id!r} firmId must be {firm!r}",
            )
        c.firmId = firm
        firm_clients_by_id[c.id] = c
    merged_clients = other_clients + list(firm_clients_by_id.values())
    if len({c.id for c in merged_clients}) != len(merged_clients):
        raise HTTPException(status_code=400, detail="Duplicate client id across firms")
    payload_client_ids = set(firm_clients_by_id.keys())
    kept_groups = [
        g
        for g in existing.groups
        if g.clientIds and all(cid in other_client_ids for cid in g.clientIds)
    ]
    merged_groups = kept_groups + [
        g
        for g in payload.groups
        if all(cid in payload_client_ids for cid in g.clientIds)
    ]
    return ClientMasterPayload(
        clients=merged_clients,
        groups=merged_groups,
        updated_at=datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
    )


def _save_client_master(payload: ClientMasterPayload) -> ClientMasterPayload:
    CLIENT_MASTER_PATH.write_text(payload.model_dump_json(indent=2), encoding="utf-8")
    invalidate_client_firm_cache()
    return payload


def _validate_client_master(payload: ClientMasterPayload) -> None:
    ids = [c.id for c in payload.clients]
    if len(ids) != len(set(ids)):
        raise HTTPException(status_code=400, detail="Duplicate client id")
    id_set = set(ids)
    gids = [g.id for g in payload.groups]
    if len(gids) != len(set(gids)):
        raise HTTPException(status_code=400, detail="Duplicate group id")
    for c in payload.clients:
        if not (c.id or "").strip():
            raise HTTPException(status_code=400, detail="Client id must not be empty")
        if not (c.name or "").strip():
            raise HTTPException(status_code=400, detail="Client name must not be empty")
        if not 1 <= c.fiscalMonth <= 12:
            raise HTTPException(
                status_code=400,
                detail=f"Client {c.id!r} fiscalMonth must be between 1 and 12",
            )
        c.profile = sanitize_client_profile(c.profile)
        c.profileMeta = sanitize_client_profile_meta(c.profileMeta)
        c.profileHistory = sanitize_client_profile_history(c.profileHistory)
    for g in payload.groups:
        if not (g.id or "").strip():
            raise HTTPException(status_code=400, detail="Group id must not be empty")
        for cid in g.clientIds:
            if cid not in id_set:
                raise HTTPException(
                    status_code=400,
                    detail=f"Group {g.id!r} references unknown client {cid!r}",
                )


def _role_permissions_payload_from_store() -> RolePermissionsPayload:
    perms = _get_role_permissions()
    updated_at: str | None = None
    if ROLE_PERMISSIONS_PATH.exists():
        try:
            raw = json.loads(ROLE_PERMISSIONS_PATH.read_text(encoding="utf-8"))
            updated_at = raw.get("updated_at")
        except Exception:
            pass
    return RolePermissionsPayload(
        permissionsByRole={role: sorted(perms.get(role, set())) for role in DEFAULT_ROLE_PERMISSIONS},
        updated_at=updated_at,
    )


def _validate_role_permissions(payload: RolePermissionsPayload) -> None:
    known_roles = set(DEFAULT_ROLE_PERMISSIONS.keys())
    for role, perms in payload.permissionsByRole.items():
        if role not in known_roles:
            raise HTTPException(status_code=400, detail=f"Unknown role: {role}")
        if not isinstance(perms, list):
            raise HTTPException(status_code=400, detail=f"Invalid permissions for role {role}")
        invalid = [p for p in perms if p not in KNOWN_APP_PERMISSIONS]
        if invalid:
            raise HTTPException(status_code=400, detail=f"Unknown permission(s) for {role}: {invalid}")
    admin_perms = set(payload.permissionsByRole.get("admin", []))
    if "settings.manage" not in admin_perms:
        raise HTTPException(
            status_code=400,
            detail="admin role must retain settings.manage permission",
        )


def _save_role_permissions(payload: RolePermissionsPayload) -> RolePermissionsPayload:
    _validate_role_permissions(payload)
    normalized = {
        role: sorted(set(payload.permissionsByRole.get(role, [])))
        for role in DEFAULT_ROLE_PERMISSIONS
    }
    saved = RolePermissionsPayload(
        permissionsByRole=normalized,
        updated_at=datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
    )
    ROLE_PERMISSIONS_PATH.write_text(
        json.dumps(saved.model_dump(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    _invalidate_role_permissions_cache()
    return saved


def _validate_stakeholder_master(payload: StakeholderMasterPayload) -> None:
    known_roles = set(_get_role_permissions().keys())
    for sid, role in payload.roleByStakeholderId.items():
        if role not in known_roles:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid role {role!r} for stakeholder {sid!r}",
            )
    cm = _load_client_master()
    valid_ids = set(get_client_firm_map().keys()) | {c.id for c in cm.clients}
    validate_assignments_for_clients(payload.clientScopesByStakeholderId, valid_ids)


def _save_stakeholder_master(payload: StakeholderMasterPayload) -> StakeholderMasterPayload:
    _validate_stakeholder_master(payload)
    roles = dict(payload.roleByStakeholderId)
    roles.update(STAKEHOLDER_ROLE_BY_ID)
    next_payload = StakeholderMasterPayload(
        roleByStakeholderId=roles,
        clientScopesByStakeholderId=payload.clientScopesByStakeholderId,
        updated_at=datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
    )
    STAKEHOLDER_MASTER_PATH.write_text(next_payload.model_dump_json(indent=2), encoding="utf-8")
    sync_assignments_from_scope_map(payload.clientScopesByStakeholderId)
    _invalidate_stakeholder_maps_cache()
    return next_payload

__all__ = [
    "_clamp_matrix_year_display_count",
    "_default_client_master",
    "_load_client_master",
    "_load_system_config",
    "_mask_system_config_for_role",
    "_merge_client_master_for_firm",
    "_role_permissions_payload_from_store",
    "_save_client_master",
    "_save_role_permissions",
    "_save_stakeholder_master",
    "_save_system_config",
    "_system_config_update_touches_platform",
    "_validate_client_master",
    "_validate_role_permissions",
    "_validate_stakeholder_master",
]
