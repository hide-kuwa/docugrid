"""DocuGrid API — metric_mappings routes."""

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


def _require_authenticated(request: Request) -> None:
    identity = resolve_identity(request)
    if not identity.email and not identity.role:
        raise HTTPException(status_code=401, detail="Authentication required")


# --- Metric mappings (dev.metrics) ---


@router.get("/api/metric-mappings", response_model=MetricMappingsListPayload)
async def list_metric_mappings_api(request: Request, status: Optional[str] = Query(None)):
    _require_authenticated(request)
    summary = metric_mappings_config_summary()
    rows = list_metric_mappings(status=status)  # type: ignore[arg-type]
    return MetricMappingsListPayload(
        version=int(summary["version"]),
        mapping_count=int(summary["mapping_count"]),
        config_path=str(summary["config_path"]),
        mappings=[MetricMappingItem(**m) for m in rows],
    )


@router.get("/api/dev/metric-mappings", response_model=MetricMappingsListPayload)
async def list_dev_metric_mappings(request: Request, status: Optional[str] = Query(None)):
    _require_platform_settings(request)
    summary = metric_mappings_config_summary()
    rows = list_metric_mappings(status=status)  # type: ignore[arg-type]
    _log_audit_event(request, "dev.metric_mappings.list", "success", f"count={len(rows)}")
    return MetricMappingsListPayload(
        version=int(summary["version"]),
        mapping_count=int(summary["mapping_count"]),
        config_path=str(summary["config_path"]),
        mappings=[MetricMappingItem(**m) for m in rows],
    )


@router.get("/api/dev/metric-mappings/export", response_model=MetricMappingsExportPayload)
async def export_dev_metric_mappings(request: Request):
    _require_platform_settings(request)
    summary = metric_mappings_config_summary()
    _log_audit_event(request, "dev.metric_mappings.export", "success")
    return MetricMappingsExportPayload(
        version=int(summary["version"]),
        mapping_count=int(summary["mapping_count"]),
        yaml_text=export_metric_mappings_yaml(),
        csv_text=export_metric_mappings_csv(),
    )


@router.post("/api/dev/metric-mappings/validate")
async def validate_dev_metric_mappings(request: Request, body: MetricMappingsValidateBody):
    _require_platform_settings(request)
    if body.yaml_text:
        errors, parsed = validate_metric_mappings_yaml(body.yaml_text)
        return {"valid": not errors, "errors": errors, "row_count": len(parsed["mappings"]) if parsed else 0}
    if body.csv_text:
        errors, rows = validate_metric_mappings_csv(body.csv_text)
        return {"valid": not errors, "errors": errors, "row_count": len(rows)}
    raise HTTPException(status_code=400, detail="yaml_text or csv_text required")


@router.post("/api/dev/metric-mappings/import")
async def import_dev_metric_mappings(request: Request, body: MetricMappingsImportBody):
    _require_platform_settings(request)
    try:
        if body.yaml_text:
            import_metric_mappings_yaml(body.yaml_text, mode=body.mode)  # type: ignore[arg-type]
        elif body.csv_text:
            import_metric_mappings_csv(body.csv_text, mode=body.mode)  # type: ignore[arg-type]
        else:
            raise HTTPException(status_code=400, detail="yaml_text or csv_text required")
        refresh_metric_index()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "dev.metric_mappings.import", "success", f"mode={body.mode}")
    return metric_mappings_config_summary()


@router.post("/api/dev/metric-mappings/reload")
async def reload_dev_metric_mappings(request: Request):
    _require_platform_settings(request)
    try:
        reload_metric_mappings_config()
        refresh_metric_index()
    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    _log_audit_event(request, "dev.metric_mappings.reload", "success")
    return metric_mappings_config_summary()


@router.post("/api/dev/metric-mappings", response_model=MetricMappingItem, status_code=201)
async def create_dev_metric_mapping(request: Request, body: MetricMappingWriteBody):
    _require_platform_settings(request)
    try:
        row = create_metric_mapping(body.model_dump())
        refresh_metric_index()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "dev.metric_mappings.create", "success", row["metric_key"])
    return MetricMappingItem(**row)


@router.get("/api/dev/metric-mappings/{metric_key}", response_model=MetricMappingItem)
async def get_dev_metric_mapping(request: Request, metric_key: str):
    _require_platform_settings(request)
    row = get_metric_mapping(metric_key)
    if not row:
        raise HTTPException(status_code=404, detail=f"Mapping not found: {metric_key}")
    return MetricMappingItem(**row)


@router.put("/api/dev/metric-mappings/{metric_key}", response_model=MetricMappingItem)
async def update_dev_metric_mapping(
    request: Request, metric_key: str, body: MetricMappingWriteBody
):
    _require_platform_settings(request)
    try:
        row = update_metric_mapping(metric_key, body.model_dump())
        refresh_metric_index()
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Mapping not found: {metric_key}") from None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "dev.metric_mappings.update", "success", metric_key)
    return MetricMappingItem(**row)


@router.delete("/api/dev/metric-mappings/{metric_key}")
async def delete_dev_metric_mapping(request: Request, metric_key: str):
    _require_platform_settings(request)
    try:
        delete_metric_mapping(metric_key)
        refresh_metric_index()
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Mapping not found: {metric_key}") from None
    _log_audit_event(request, "dev.metric_mappings.delete", "success", metric_key)
    return {"status": "deleted", "metric_key": metric_key}


@router.get("/api/platform/executive/dashboard")
async def get_platform_executive_dashboard(request: Request):
    """DocuGrid 経営者向け — 全テナント MRR/ARR/チャーン等。"""
    _require_platform_settings(request)
    payload = build_executive_dashboard(record_snapshot=True)
    _log_audit_event(request, "platform.executive.dashboard", "success")
    return payload


@router.get("/api/platform/executive/ma-goals")
async def get_platform_ma_goals(
    request: Request,
    target_arr_yen: int = 1_000_000_000,
    horizon_months: int = 60,
    annual_logo_churn: float = 0.05,
    avg_clients_per_firm: int | None = None,
    avg_clients_mode: str | None = None,
    partner_attach_rate: float = 0.5,
):
    """MA 目標逆算 — 10億円 ARR 達成に必要な事務所数・獲得ペース等。"""
    _require_platform_settings(request)
    if target_arr_yen < 1:
        raise HTTPException(status_code=400, detail="invalid_target_arr")
    if horizon_months < 1 or horizon_months > 240:
        raise HTTPException(status_code=400, detail="invalid_horizon_months")
    if annual_logo_churn < 0 or annual_logo_churn > 0.5:
        raise HTTPException(status_code=400, detail="invalid_churn")
    if partner_attach_rate < 0 or partner_attach_rate > 1:
        raise HTTPException(status_code=400, detail="invalid_partner_rate")
    if avg_clients_mode is not None and avg_clients_mode not in ("planning", "actual", "auto"):
        raise HTTPException(status_code=400, detail="invalid_avg_clients_mode")
    payload = build_ma_goals(
        target_arr_yen=target_arr_yen,
        horizon_months=horizon_months,
        annual_logo_churn=annual_logo_churn,
        avg_clients_per_firm=avg_clients_per_firm,
        avg_clients_mode=avg_clients_mode,
        partner_attach_rate=partner_attach_rate,
    )
    _log_audit_event(request, "platform.executive.ma_goals", "success")
    return payload


@router.put("/api/platform/executive/ma-assumptions")
async def put_platform_ma_assumptions(request: Request, body: MaAssumptionsBody):
    """MA 計画仮定（平均顧問先数・実績/仮定モード）を保存。"""
    _require_platform_settings(request)
    try:
        saved = save_ma_assumptions(
            planning_avg_clients_per_firm=body.planning_avg_clients_per_firm,
            avg_clients_mode=body.avg_clients_mode,
        )
    except ValueError as exc:
        if str(exc) == "invalid_avg_clients_mode":
            raise HTTPException(status_code=400, detail="invalid_avg_clients_mode") from exc
        raise
    _log_audit_event(request, "platform.executive.ma_assumptions", "success")
    return saved


@router.get("/api/platform/executive/firms/{firm_id}")
async def get_platform_executive_firm(request: Request, firm_id: str):
    _require_platform_settings(request)
    detail = build_firm_detail(firm_id.strip())
    if not detail:
        raise HTTPException(status_code=404, detail="firm_not_found")
    _log_audit_event(request, "platform.executive.firm", "success", firm_id)
    return detail


