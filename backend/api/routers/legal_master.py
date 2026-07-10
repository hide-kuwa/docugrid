"""DocuGrid API — legal_master routes."""

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

# --- Legal master (Temporal Master Pattern) ---


@router.get("/api/v1/legal-master/rates/consumption-tax", response_model=LegalMasterRatePayload)
async def get_consumption_tax_rate(
    request: Request,
    as_of: str = Query(..., description="基準日 YYYY-MM-DD"),
    jurisdiction: Optional[str] = Query(None),
    rate_type: str = Query("standard", pattern="^(standard|reduced)$"),
):
    """消費税率 — as_of 必須（temporal-master-pattern §3.1）。"""
    _require_authenticated(request)
    master_key = (
        "consumption_tax.reduced_rate"
        if rate_type == "reduced"
        else "consumption_tax.standard_rate"
    )
    row = lookup_legal_master_rate(master_key, as_of, jurisdiction=jurisdiction)
    if not row:
        raise HTTPException(status_code=404, detail=f"No rate for {master_key} at {as_of}")
    return LegalMasterRatePayload(
        master_key=row["master_key"],
        as_of=as_of,
        value=row.get("value"),
        value_numeric=row.get("value_numeric"),
        value_text=row.get("value_text"),
        valid_from=row["valid_from"],
        valid_to=row.get("valid_to"),
        master_version_id=row.get("master_version_id"),
        jurisdiction=row.get("jurisdiction"),
        label_ja=row.get("label_ja"),
    )


@router.get("/api/v1/legal-master/rates")
async def get_legal_master_rate(
    request: Request,
    master_key: str = Query(...),
    as_of: str = Query(...),
    jurisdiction: Optional[str] = Query(None),
):
    _require_authenticated(request)
    row = lookup_legal_master_rate(master_key, as_of, jurisdiction=jurisdiction)
    if not row:
        raise HTTPException(status_code=404, detail=f"No entry for {master_key} at {as_of}")
    return row


@router.get("/api/v1/legal-master/brackets/income-tax")
async def get_income_tax_brackets_api(request: Request, as_of: str = Query(...)):
    _require_authenticated(request)
    return {"as_of": as_of, "brackets": list_income_tax_brackets(as_of)}


@router.get("/api/dev/legal-master", response_model=LegalMasterListPayload)
async def list_dev_legal_master(
    request: Request,
    domain: Optional[str] = Query(None),
    as_of: Optional[str] = Query(None),
):
    _require_platform_settings(request)
    meta = legal_master_summary()
    entries = list_legal_master_entries(domain=domain, as_of=as_of)
    _log_audit_event(request, "dev.legal_master.list", "success", f"count={len(entries)}")
    return LegalMasterListPayload(
        entry_count=meta["entry_count"],
        db_path=meta["db_path"],
        domains=meta["domains"],
        entries=[LegalMasterEntryItem(**e) for e in entries],
    )


@router.get("/api/dev/legal-master/export", response_model=LegalMasterCsvExportPayload)
async def export_dev_legal_master(request: Request, domain: Optional[str] = Query(None)):
    _require_platform_settings(request)
    csv_text = export_legal_master_csv(domain=domain)
    _log_audit_event(request, "dev.legal_master.export", "success")
    return LegalMasterCsvExportPayload(entry_count=legal_master_summary()["entry_count"], csv_text=csv_text)


@router.post("/api/dev/legal-master/validate", response_model=LegalMasterCsvValidatePayload)
async def validate_dev_legal_master_csv(request: Request, body: LegalMasterCsvValidateBody):
    _require_platform_settings(request)
    errors, rows = validate_legal_master_csv(body.csv_text)
    return LegalMasterCsvValidatePayload(valid=not errors, errors=errors, row_count=len(rows))


@router.post("/api/dev/legal-master/import")
async def import_dev_legal_master_csv(request: Request, body: LegalMasterCsvImportBody):
    _require_platform_settings(request)
    try:
        result = import_legal_master_csv(body.csv_text, mode=body.mode)  # type: ignore[arg-type]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "dev.legal_master.import", "success", f"mode={body.mode}")
    return result


@router.post("/api/dev/legal-master/seed")
async def seed_dev_legal_master(request: Request):
    _require_platform_settings(request)
    try:
        result = seed_legal_master_from_file()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "dev.legal_master.seed", "success")
    return result


@router.post("/api/dev/legal-master", response_model=LegalMasterEntryItem, status_code=201)
async def create_dev_legal_master_entry(request: Request, body: LegalMasterWriteBody):
    _require_platform_settings(request)
    try:
        entry = create_legal_master_entry(body.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "dev.legal_master.create", "success", entry["master_key"])
    return LegalMasterEntryItem(**entry)


@router.put("/api/dev/legal-master/{entry_id}", response_model=LegalMasterEntryItem)
async def update_dev_legal_master_entry(
    request: Request, entry_id: str, body: LegalMasterWriteBody
):
    _require_platform_settings(request)
    try:
        entry = update_legal_master_entry(entry_id, body.model_dump())
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Entry not found: {entry_id}") from None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "dev.legal_master.update", "success", entry_id)
    return LegalMasterEntryItem(**entry)


@router.delete("/api/dev/legal-master/{entry_id}")
async def delete_dev_legal_master_entry(request: Request, entry_id: str):
    _require_platform_settings(request)
    try:
        delete_legal_master_entry(entry_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Entry not found: {entry_id}") from None
    _log_audit_event(request, "dev.legal_master.delete", "success", entry_id)
    return {"status": "deleted", "id": entry_id}


