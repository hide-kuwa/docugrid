"""DocuGrid API — core routes."""

from __future__ import annotations

from fastapi import APIRouter

from api.router_imports import *  # noqa: F403
from api.constants import *  # noqa: F403
from api.deps import *  # noqa: F403
from api.persistence import *  # noqa: F403
from api.master_store import *  # noqa: F403
from api.session import *  # noqa: F403
from api.billing_access import *  # noqa: F403
from api.schemas import *  # noqa: F403
from api.route_helpers import *  # noqa: F403

router = APIRouter()

@router.get("/")
def root() -> dict:
    """ブラウザで http://127.0.0.1:8000/ を開いたときに 404 にならないようにする。"""
    return {
        "ok": True,
        "service": "DocuGrid API",
        "docs": "/docs",
        "health": "/health",
        "api": "/api",
    }


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}






@router.get("/api/system-config", response_model=SystemConfigPayload)
async def get_system_config(request: Request):
    role = _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    payload = _load_system_config(ctx.firm_id)
    payload = _mask_system_config_for_role(payload, role)
    _log_audit_event(request, "system_config.get", "success")
    return payload


@router.put("/api/system-config", response_model=SystemConfigPayload)
async def update_system_config(request: Request, payload: SystemConfigUpdateBody):
    role = _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    existing = _load_system_config(ctx.firm_id)
    perms = _get_role_permissions().get(role, set())
    if "settings.platform" not in perms:
        # Preserve platform-only fields so firm Drive saves don't wipe AI config
        # and don't trip the platform gate via masked GET values.
        payload = payload.model_copy(
            update={
                "ocr_auto_extract_enabled": existing.ocr_auto_extract_enabled,
                "ai_openai_enabled": existing.ai_openai_enabled,
                "ai_openai_model": existing.ai_openai_model,
                "ai_gemini_enabled": existing.ai_gemini_enabled,
                "ai_gemini_model": existing.ai_gemini_model,
                "ai_openai_api_key": None,
                "ai_gemini_api_key": None,
                "clear_ai_openai_key": False,
                "clear_ai_gemini_key": False,
            }
        )
    if _system_config_update_touches_platform(payload, existing):
        _require_platform_settings(request)
    if payload.alert_consumption_tax_months_before_due < 0 or payload.alert_corporate_tax_months_before_due < 0:
        raise HTTPException(status_code=400, detail="Alert months must be non-negative")
    saved = _save_system_config(ctx.firm_id, payload)
    saved = _mask_system_config_for_role(saved, role)
    _log_audit_event(
        request,
        "system_config.put",
        "success",
        f"drive={saved.google_drive_connected} ocr={saved.ocr_auto_extract_enabled} ai_openai={saved.ai_openai_enabled}",
    )
    return saved


@router.get("/api/dev/integration-ports", response_model=IntegrationPortsListPayload)
async def list_dev_integration_ports(request: Request):
    """連携ポートカタログ — settings.platform 必須。"""
    _require_platform_settings(request)
    summary = integration_ports_config_summary()
    ports = list_integration_ports()
    _log_audit_event(request, "dev.integration_ports.list", "success", f"count={len(ports)}")
    return IntegrationPortsListPayload(
        version=int(summary["version"]),
        port_count=int(summary["port_count"]),
        config_path=str(summary["config_path"]),
        ports=[IntegrationPortItem(**p) for p in ports],
    )


@router.get("/api/dev/integration-ports/export", response_model=IntegrationPortsExportPayload)
async def export_dev_integration_ports(request: Request):
    _require_platform_settings(request)
    try:
        yaml_text = export_integration_ports_yaml()
        cfg = reload_integration_ports_config()
    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    _log_audit_event(request, "dev.integration_ports.export", "success")
    return IntegrationPortsExportPayload(
        version=cfg["version"],
        port_count=len(cfg["ports"]),
        yaml_text=yaml_text,
    )


@router.post("/api/dev/integration-ports/validate", response_model=IntegrationPortsValidatePayload)
async def validate_dev_integration_ports(request: Request, body: IntegrationPortsValidateBody):
    _require_platform_settings(request)
    errors, parsed = validate_integration_ports_yaml(body.yaml_text)
    _log_audit_event(
        request,
        "dev.integration_ports.validate",
        "success" if not errors else "error",
        f"errors={len(errors)}",
    )
    if errors or parsed is None:
        return IntegrationPortsValidatePayload(valid=False, errors=errors)
    return IntegrationPortsValidatePayload(
        valid=True,
        errors=[],
        version=parsed["version"],
        port_count=len(parsed["ports"]),
    )


@router.post("/api/dev/integration-ports/import", response_model=IntegrationPortsImportPayload)
async def import_dev_integration_ports(request: Request, body: IntegrationPortsImportBody):
    _require_platform_settings(request)
    try:
        cfg = import_integration_ports_yaml(body.yaml_text, mode=body.mode)  # type: ignore[arg-type]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (FileNotFoundError, RuntimeError) as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    _log_audit_event(request, "dev.integration_ports.import", "success", f"mode={body.mode}")
    return IntegrationPortsImportPayload(
        version=cfg["version"],
        port_count=len(cfg["ports"]),
        message=f"Imported ({body.mode}) into {integration_ports_config_path()}",
    )


@router.post("/api/dev/integration-ports/reload", response_model=IntegrationPortsReloadPayload)
async def reload_dev_integration_ports(request: Request):
    """YAML を再読み込み（ファイル編集後）。"""
    _require_platform_settings(request)
    try:
        cfg = reload_integration_ports_config()
    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    _log_audit_event(request, "dev.integration_ports.reload", "success")
    return IntegrationPortsReloadPayload(
        version=cfg["version"],
        port_count=len(cfg["ports"]),
        message=f"Reloaded from {integration_ports_config_path()}",
    )


@router.post("/api/dev/integration-ports", response_model=IntegrationPortItem, status_code=201)
async def create_dev_integration_port(request: Request, body: IntegrationPortWriteBody):
    _require_platform_settings(request)
    try:
        port = create_integration_port(body.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "dev.integration_ports.create", "success", port["port_id"])
    return IntegrationPortItem(**port)


@router.get("/api/dev/integration-ports/{port_id}", response_model=IntegrationPortItem)
async def get_dev_integration_port(request: Request, port_id: str):
    _require_platform_settings(request)
    port = get_integration_port(port_id)
    if not port:
        raise HTTPException(status_code=404, detail=f"Port not found: {port_id}")
    _log_audit_event(request, "dev.integration_ports.get", "success", port_id)
    return IntegrationPortItem(**port)


@router.put("/api/dev/integration-ports/{port_id}", response_model=IntegrationPortItem)
async def update_dev_integration_port(
    request: Request, port_id: str, body: IntegrationPortWriteBody
):
    _require_platform_settings(request)
    try:
        port = update_integration_port(port_id, body.model_dump())
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Port not found: {port_id}") from None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "dev.integration_ports.update", "success", port_id)
    return IntegrationPortItem(**port)


@router.delete("/api/dev/integration-ports/{port_id}")
async def delete_dev_integration_port(request: Request, port_id: str):
    _require_platform_settings(request)
    try:
        delete_integration_port(port_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Port not found: {port_id}") from None
    _log_audit_event(request, "dev.integration_ports.delete", "success", port_id)
    return {"status": "deleted", "port_id": port_id}


def _test_context_from_body(body: IntegrationPortTestBody) -> HandoffTestContext:
    return HandoffTestContext(
        client_id=body.client_id,
        period_key=body.period_key,
        target_base_url=body.target_base_url.strip(),
        batch_id=body.batch_id,
        journal_id=body.journal_id,
        user_id=body.user_id,
    )


@router.get("/api/dev/integration-ports/health")
async def list_dev_integration_ports_health(request: Request):
    _require_platform_settings(request)
    store = list_test_health()
    items = [
        IntegrationPortHealthItem(
            port_id=pid,
            last_test=IntegrationPortTestResultPayload(**row) if row else None,
        )
        for pid, row in sorted(store.items())
    ]
    return {"items": items, "count": len(items)}


@router.get(
    "/api/dev/integration-ports/{port_id}/sample",
    response_model=IntegrationPortSamplePayload,
)
async def get_dev_integration_port_sample(
    request: Request,
    port_id: str,
    client_id: str = Query("client-demo"),
    period_key: str = Query("2025-03"),
    target_base_url: str = Query(""),
):
    _require_platform_settings(request)
    try:
        data = sample_response(
            port_id,
            HandoffTestContext(client_id=client_id, period_key=period_key, target_base_url=target_base_url),
        )
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Port not found: {port_id}") from None
    _log_audit_event(request, "dev.integration_ports.sample", "success", port_id)
    return IntegrationPortSamplePayload(**data)


@router.get(
    "/api/dev/integration-ports/{port_id}/health",
    response_model=IntegrationPortHealthItem,
)
async def get_dev_integration_port_health(request: Request, port_id: str):
    _require_platform_settings(request)
    if not get_integration_port(port_id):
        raise HTTPException(status_code=404, detail=f"Port not found: {port_id}")
    row = get_last_test_result(port_id)
    return IntegrationPortHealthItem(
        port_id=port_id,
        last_test=IntegrationPortTestResultPayload(**row) if row else None,
    )


@router.post(
    "/api/dev/integration-ports/{port_id}/test",
    response_model=IntegrationPortTestResultPayload,
)
async def test_dev_integration_port(
    request: Request, port_id: str, body: IntegrationPortTestBody
):
    _require_platform_settings(request)
    try:
        result = run_port_test(
            port_id,
            payload=body.payload,
            dry_run=body.dry_run,
            ctx=_test_context_from_body(body),
        )
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Port not found: {port_id}") from None
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    action = "dev.integration_ports.test.dry_run" if body.dry_run else "dev.integration_ports.test.send"
    _log_audit_event(request, action, result.status, port_id)
    return IntegrationPortTestResultPayload(**result.to_dict())


