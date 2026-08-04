"""Feature surface (工事中 / 見本 / 本番) API — no-code mode overrides."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from api.deps import _auth_context, _log_audit_event, _require_permission, _require_platform_settings
from services.feature_surfaces import (
    ALLOWED_MODES,
    load_firm_overrides,
    load_platform_overrides,
    resolve_feature_surfaces,
    save_firm_overrides,
    save_platform_overrides,
)
from services.tenancy import DEFAULT_FIRM_ID

router = APIRouter()


class FeatureSurfaceModesBody(BaseModel):
    modes: dict[str, str] = Field(default_factory=dict)


@router.get("/api/feature-surfaces")
async def get_feature_surfaces(request: Request):
    """Resolved surfaces for the caller's firm (any authenticated user with client.view)."""
    _require_permission(request, "client.view")
    ctx = _auth_context(request)
    payload = resolve_feature_surfaces(ctx.firm_id or DEFAULT_FIRM_ID)
    return {
        "version": payload["version"],
        "firmId": payload["firm_id"],
        "surfaces": payload["surfaces"],
        "modesById": payload["modes_by_id"],
    }


@router.get("/api/feature-surfaces/editor")
async def get_feature_surfaces_editor(request: Request):
    """Editor payload: catalog + platform/firm overrides + resolved."""
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    firm_id = ctx.firm_id or DEFAULT_FIRM_ID
    resolved = resolve_feature_surfaces(firm_id)
    can_edit_platform = False
    try:
        _require_platform_settings(request)
        can_edit_platform = True
    except HTTPException:
        can_edit_platform = False
    return {
        "resolved": {
            "firmId": resolved["firm_id"],
            "surfaces": resolved["surfaces"],
            "modesById": resolved["modes_by_id"],
        },
        "platform": load_platform_overrides(),
        "firm": load_firm_overrides(firm_id),
        "canEditPlatform": can_edit_platform,
        "canEditFirm": True,
        "allowedModes": sorted(ALLOWED_MODES),
    }


@router.put("/api/feature-surfaces/platform")
async def put_feature_surfaces_platform(request: Request, body: FeatureSurfaceModesBody):
    _require_platform_settings(request)
    ctx = _auth_context(request)
    invalid = {k: v for k, v in body.modes.items() if v not in ALLOWED_MODES}
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid modes: {invalid}")
    saved = save_platform_overrides(body.modes, updated_by=ctx.email)
    _log_audit_event(request, "feature_surfaces.platform.put", "success", f"n={len(body.modes)}")
    return saved


@router.put("/api/feature-surfaces/firm")
async def put_feature_surfaces_firm(request: Request, body: FeatureSurfaceModesBody):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    invalid = {k: v for k, v in body.modes.items() if v not in ALLOWED_MODES}
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid modes: {invalid}")
    saved = save_firm_overrides(ctx.firm_id or DEFAULT_FIRM_ID, body.modes, updated_by=ctx.email)
    _log_audit_event(request, "feature_surfaces.firm.put", "success", f"n={len(body.modes)}")
    return saved
