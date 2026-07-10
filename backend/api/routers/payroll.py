"""DocuGrid API — payroll routes."""

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

# --- 源泉徴収簿（P-W1）---
@router.get("/api/clients/{client_id}/payroll/employees", response_model=PayrollEmployeesPayload)
async def get_payroll_employees(request: Request, client_id: str):
    role = _require_client_permission(request, "client.view", client_id)
    ctx = _auth_context(request)
    employees = list_employees(ctx.firm_id, client_id, include_inactive=True)
    return {"employees": employees}


@router.put("/api/clients/{client_id}/payroll/employees", response_model=PayrollEmployeesPayload)
async def put_payroll_employees(request: Request, client_id: str, body: PayrollEmployeesPayload):
    role = _require_client_permission(request, "settings.manage", client_id)
    ctx = _auth_context(request)
    try:
        saved = replace_employees(
            ctx.firm_id,
            client_id,
            [e.model_dump() for e in body.employees],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "payroll.employees.save", "success", f"count={len(saved)}")
    return {"employees": saved}


@router.get("/api/clients/{client_id}/payroll/ledger", response_model=WithholdingLedgerPayload)
async def get_withholding_ledger(
    request: Request,
    client_id: str,
    year_month: Optional[str] = Query(None),
):
    role = _require_client_permission(request, "client.view", client_id)
    ctx = _auth_context(request)
    rows = list_ledger_rows(ctx.firm_id, client_id, year_month=year_month)
    summary = ledger_summary(ctx.firm_id, client_id, year_month) if year_month else None
    return {"rows": rows, "summary": summary}


@router.post("/api/clients/{client_id}/payroll/ledger", response_model=WithholdingLedgerRowItem)
async def post_withholding_ledger_row(
    request: Request,
    client_id: str,
    body: WithholdingLedgerRowItem,
):
    role = _require_client_permission(request, "settings.manage", client_id)
    ctx = _auth_context(request)
    payload = body.model_dump()
    payload["client_id"] = client_id
    try:
        row = upsert_ledger_row(ctx.firm_id, client_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "payroll.ledger.upsert", "success", f"id={row['id']}")
    return row


@router.delete("/api/clients/{client_id}/payroll/ledger/{row_id}")
async def delete_withholding_ledger_row(request: Request, client_id: str, row_id: str):
    role = _require_client_permission(request, "settings.manage", client_id)
    ctx = _auth_context(request)
    if not delete_ledger_row(ctx.firm_id, client_id, row_id):
        raise HTTPException(status_code=404, detail="Ledger row not found")
    _log_audit_event(request, "payroll.ledger.delete", "success", f"id={row_id}")
    return {"ok": True}


def _run_capture_item_analysis(
    firm_id: str,
    item_id: str,
    *,
    manual_hints: dict | None = None,
) -> dict:
    from services.capture_service import get_capture_item

    item = get_capture_item(firm_id, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Capture item not found")
    raw = get_capture_file_bytes(firm_id, item_id)
    if not raw:
        raise HTTPException(status_code=404, detail="Capture file not found")
    mime = get_capture_mime(firm_id, item_id) or "application/octet-stream"
    analysis = analyze_capture_content(
        content=raw,
        mime_type=mime,
        file_name=item["file_name"],
        category=item.get("category") or "general",
        client_id=item["client_id"],
        manual_hints=manual_hints,
    )
    updated = apply_capture_analysis(firm_id, item_id, analysis)
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to apply capture analysis")
    return updated


