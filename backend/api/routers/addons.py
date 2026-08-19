"""Addon catalog API — firm install/uninstall + platform draft/promote."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from api.deps import _auth_context, _log_audit_event, _require_permission, _require_platform_settings
from services.addon_catalog import (
    AddonError,
    create_custom_addon,
    list_for_firm,
    list_for_platform,
    promote_addon,
    public_addon,
    sanitize_firm_id,
    set_installed,
    update_custom_addon,
)
from services.tenancy import DEFAULT_FIRM_ID

router = APIRouter()


class AddonCreateBody(BaseModel):
    id: str | None = None
    title: str
    summary: str = ""
    group: str = "other"
    installableBy: str = "platform"
    provides: list[str] = Field(default_factory=list)
    pilotFirmIds: list[str] = Field(default_factory=list)


class AddonPatchBody(BaseModel):
    title: str | None = None
    summary: str | None = None
    group: str | None = None
    status: str | None = None
    installableBy: str | None = None
    provides: list[str] | None = None
    pilotFirmIds: list[str] | None = None


class AddonPromoteBody(BaseModel):
    installableBy: str = "firm"


class AddonAssignBody(BaseModel):
    firmId: str
    installed: bool = True


def _raise_addon(exc: AddonError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.get("/api/addons")
async def get_firm_addons(request: Request):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    firm_id = ctx.firm_id or DEFAULT_FIRM_ID
    rows = [public_addon(item) for item in list_for_firm(firm_id)]
    return {"firmId": firm_id, "addons": rows}


@router.post("/api/addons/{addon_id}/install")
async def install_addon(addon_id: str, request: Request):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    try:
        result = set_installed(
            ctx.firm_id or DEFAULT_FIRM_ID,
            addon_id,
            on=True,
            actor=ctx.email or "",
            allow_platform=False,
        )
    except AddonError as exc:
        _raise_addon(exc)
    _log_audit_event(request, "addons.install", "success", addon_id)
    return {"ok": True, "id": result["id"], "installed": True}


@router.post("/api/addons/{addon_id}/uninstall")
async def uninstall_addon(addon_id: str, request: Request):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    try:
        result = set_installed(
            ctx.firm_id or DEFAULT_FIRM_ID,
            addon_id,
            on=False,
            actor=ctx.email or "",
            allow_platform=False,
        )
    except AddonError as exc:
        _raise_addon(exc)
    _log_audit_event(request, "addons.uninstall", "success", addon_id)
    return {"ok": True, "id": result["id"], "installed": False}


@router.get("/api/addons/admin")
async def get_admin_addons(request: Request):
    _require_platform_settings(request)
    rows = [public_addon(item, include_pilots=True) for item in list_for_platform()]
    return {"addons": rows}


@router.post("/api/addons")
async def create_addon(request: Request, body: AddonCreateBody):
    _require_platform_settings(request)
    ctx = _auth_context(request)
    try:
        addon = create_custom_addon(
            addon_id=body.id,
            title=body.title,
            summary=body.summary,
            group=body.group,
            installable_by=body.installableBy,
            provides=body.provides,
            pilot_firm_ids=body.pilotFirmIds,
            actor=ctx.email or "",
        )
    except AddonError as exc:
        _raise_addon(exc)
    _log_audit_event(request, "addons.create", "success", addon["id"])
    return public_addon(addon, include_pilots=True)


@router.patch("/api/addons/{addon_id}")
async def patch_addon(addon_id: str, request: Request, body: AddonPatchBody):
    _require_platform_settings(request)
    ctx = _auth_context(request)
    try:
        addon = update_custom_addon(
            addon_id,
            title=body.title,
            summary=body.summary,
            group=body.group,
            status=body.status,
            installable_by=body.installableBy,
            provides=body.provides,
            pilot_firm_ids=body.pilotFirmIds,
            actor=ctx.email or "",
        )
    except AddonError as exc:
        _raise_addon(exc)
    _log_audit_event(request, "addons.patch", "success", addon_id)
    return public_addon(addon, include_pilots=True)


@router.post("/api/addons/{addon_id}/promote")
async def promote(addon_id: str, request: Request, body: AddonPromoteBody):
    _require_platform_settings(request)
    ctx = _auth_context(request)
    try:
        addon = promote_addon(
            addon_id,
            installable_by=body.installableBy,
            actor=ctx.email or "",
        )
    except AddonError as exc:
        _raise_addon(exc)
    _log_audit_event(request, "addons.promote", "success", addon_id)
    return public_addon(addon, include_pilots=True)


@router.post("/api/addons/{addon_id}/assign")
async def assign_addon(addon_id: str, request: Request, body: AddonAssignBody):
    _require_platform_settings(request)
    ctx = _auth_context(request)
    try:
        firm_id = sanitize_firm_id(body.firmId)
        result = set_installed(
            firm_id,
            addon_id,
            on=body.installed,
            actor=ctx.email or "",
            allow_platform=True,
        )
    except AddonError as exc:
        _raise_addon(exc)
    _log_audit_event(
        request,
        "addons.assign" if body.installed else "addons.unassign",
        "success",
        f"{addon_id}:{result['firm_id']}",
    )
    return {"ok": True, "id": result["id"], "firmId": result["firm_id"], "installed": body.installed}
