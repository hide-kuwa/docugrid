"""Tax progress board API (firm-wide My Common–style tracker)."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from api.deps import _auth_context, _log_audit_event, _require_client_permission, _require_permission
from services.tenancy import DEFAULT_FIRM_ID

router = APIRouter()


class TaxProgressCellBody(BaseModel):
    client_id: str
    pack: str = "closing"
    stage_id: str
    status: str = Field(..., description="pending | done | na")
    note: Optional[str] = None
    cycle_key: Optional[str] = None


def _clients_for_board(firm_id: str, ctx) -> list[dict[str, Any]]:
    from api.master_store import _load_client_master
    from services.client_assignments import build_client_assignee_index
    from services.firm_members import get_member_by_id
    from services.tenancy import is_firm_wide_role, visible_client_ids
    from services.client_assignments import load_assignment_scope_map

    master = _load_client_master()
    clients_raw = list(getattr(master, "clients", None) or [])
    assignee_index = build_client_assignee_index(firm_id)
    scope_map = load_assignment_scope_map()
    allowed: set[str] | None = None
    if not is_firm_wide_role(ctx.role):
        allowed = visible_client_ids(ctx, scope_map)

    out: list[dict[str, Any]] = []
    for c in clients_raw:
        if hasattr(c, "model_dump"):
            raw = c.model_dump()
        elif isinstance(c, dict):
            raw = c
        else:
            raw = {
                "id": getattr(c, "id", ""),
                "name": getattr(c, "name", ""),
                "fiscalMonth": getattr(c, "fiscalMonth", None) or getattr(c, "fiscal_month", 3),
                "profile": getattr(c, "profile", {}) or {},
            }
        cid = str(raw.get("id") or "").strip()
        if not cid:
            continue
        if allowed is not None and cid not in allowed:
            continue
        pairs = assignee_index.get(cid, [])
        assignees = []
        primary_id = None
        primary_name = ""
        for mid, role in pairs:
            mem = get_member_by_id(mid)
            name = (mem.display_name if mem else None) or mid
            assignees.append({"id": mid, "name": name, "role": role})
            if role == "main" and not primary_id:
                primary_id = mid
                primary_name = name
        if not primary_id and assignees:
            primary_id = assignees[0]["id"]
            primary_name = assignees[0]["name"]
        profile = raw.get("profile") if isinstance(raw.get("profile"), dict) else {}
        out.append(
            {
                "id": cid,
                "name": raw.get("name") or cid,
                "code": profile.get("code") or profile.get("customer_code") or "",
                "fiscalMonth": int(raw.get("fiscalMonth") or raw.get("fiscal_month") or 3),
                "profile": profile,
                "assignees": assignees,
                "primary_assignee_id": primary_id,
                "primary_assignee_name": primary_name,
                "progress_note": profile.get("progress_note") or profile.get("memo") or "",
            }
        )
    return out


@router.get("/api/tax-progress/packs")
async def get_tax_progress_packs(request: Request):
    _require_permission(request, "client.view")
    from services.tax_progress_service import packs_public

    return {"packs": packs_public()}


@router.get("/api/tax-progress/board")
async def get_tax_progress_board(
    request: Request,
    pack: str = Query("closing"),
    cycle_key: Optional[str] = Query(None),
    fiscal_month: Optional[int] = Query(None, ge=1, le=12),
    assignee_id: Optional[str] = Query(None),
):
    _require_permission(request, "client.view")
    ctx = _auth_context(request)
    firm_id = ctx.firm_id or DEFAULT_FIRM_ID
    from services.tax_progress_service import board_payload

    clients = _clients_for_board(firm_id, ctx)

    try:
        payload = board_payload(
            firm_id,
            pack=pack,
            clients=clients,
            cycle_key=cycle_key,
            fiscal_month=fiscal_month,
            assignee_id=assignee_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return payload


@router.put("/api/tax-progress/cell")
async def put_tax_progress_cell(request: Request, body: TaxProgressCellBody):
    _require_client_permission(request, "client.edit", body.client_id)
    ctx = _auth_context(request)
    firm_id = ctx.firm_id or DEFAULT_FIRM_ID
    from services.tax_progress_service import upsert_cell

    try:
        cell = upsert_cell(
            firm_id,
            client_id=body.client_id,
            pack=body.pack,
            stage_id=body.stage_id,
            status=body.status,
            note=body.note,
            cycle_key=body.cycle_key,
            source="manual",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(
        request,
        "tax_progress.cell",
        "success",
        f"client={body.client_id} pack={body.pack} stage={body.stage_id} status={body.status}",
    )
    return {"ok": True, "cell": cell}
