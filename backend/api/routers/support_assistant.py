"""Support assistant chat + CS tickets API."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from api.deps import _auth_context, _log_audit_event, _require_permission

router = APIRouter()


class SupportChatBody(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    surface_id: str | None = Field(default=None, max_length=80)


class SupportTicketBody(BaseModel):
    kind: str = Field(..., description="bug | howto_unresolved | other")
    subject: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1, max_length=8000)
    surface_id: str | None = Field(default=None, max_length=80)
    error_message: str | None = Field(default=None, max_length=1000)
    preferred_channel: str = Field(default="email", description="email | phone_request")


@router.post("/api/support/chat")
async def post_support_chat(request: Request, body: SupportChatBody):
    _require_permission(request, "dashboard.view")
    ctx = _auth_context(request)
    from services.support_help_kb import answer_support_question

    result = answer_support_question(body.message)
    detail = {
        "firm_id": ctx.firm_id,
        "email": ctx.email,
        "surface_id": body.surface_id,
        "engine": result.get("engine"),
        "help_doc_id": result.get("help_doc_id"),
        "tour_id": result.get("tour_id"),
        "message_len": len(body.message),
    }
    _log_audit_event(request, "support.chat", "ok", detail=str(detail))
    return {
        "role": "assistant",
        "content": result["content"],
        "help_doc_id": result.get("help_doc_id"),
        "tour_id": result.get("tour_id"),
        "citations": result.get("citations") or [],
        "engine": result.get("engine") or "help_kb",
        "suggest_ticket": _suggest_ticket(body.message, result),
    }


def _suggest_ticket(message: str, result: dict) -> bool:
    q = (message or "").lower()
    if any(
        k in q
        for k in (
            "バグ",
            "不具合",
            "エラー",
            "動かない",
            "人に",
            "cs",
            "メールで",
            "まだだめ",
            "まだダメ",
            "解決しない",
            "わからない",
            "分からない",
            "だめだった",
            "ダメだった",
            "効かない",
        )
    ):
        return True
    if not result.get("help_doc_id") and not result.get("citations"):
        return True
    return False


@router.post("/api/support/tickets")
async def post_support_ticket(request: Request, body: SupportTicketBody):
    _require_permission(request, "dashboard.view")
    ctx = _auth_context(request)
    from services.support_ticket_service import create_ticket

    try:
        ticket = create_ticket(
            firm_id=ctx.firm_id,
            created_by_email=ctx.email or "",
            created_by_role=ctx.role or "",
            kind=body.kind,
            subject=body.subject,
            body=body.body,
            surface_id=body.surface_id or "",
            error_message=body.error_message or "",
            preferred_channel=body.preferred_channel or "email",
            meta={"source": "app_support_panel"},
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    _log_audit_event(
        request,
        "support.ticket",
        "ok",
        detail=f"id={ticket['id']} kind={ticket['kind']} email={ticket['email_status']}",
    )
    return {"ticket": ticket}


@router.get("/api/support/tickets")
async def get_support_tickets(
    request: Request,
    limit: int = Query(30, ge=1, le=100),
):
    """List tickets for the caller's firm only (no cross-firm)."""
    _require_permission(request, "dashboard.view")
    ctx = _auth_context(request)
    from services.support_ticket_service import list_tickets_for_firm

    items = list_tickets_for_firm(ctx.firm_id, limit=limit)
    return {"tickets": items, "firm_id": ctx.firm_id}


@router.get("/api/support/tickets/{ticket_id}")
async def get_support_ticket(request: Request, ticket_id: str):
    _require_permission(request, "dashboard.view")
    ctx = _auth_context(request)
    from services.support_ticket_service import get_ticket

    row = get_ticket(ctx.firm_id, ticket_id)
    if not row:
        raise HTTPException(status_code=404, detail="ticket not found")
    return {"ticket": row}


class SupportTicketStatusBody(BaseModel):
    status: str = Field(..., description="open | resolved | phone_requested | closed")
    note: str | None = Field(default=None, max_length=500)


@router.patch("/api/support/tickets/{ticket_id}")
async def patch_support_ticket(request: Request, ticket_id: str, body: SupportTicketStatusBody):
    """Update ticket status within the caller's firm (firm-wide roles)."""
    _require_permission(request, "dashboard.view")
    ctx = _auth_context(request)
    from services.tenancy import is_firm_wide_role
    from services.support_ticket_service import update_ticket_status

    if not is_firm_wide_role(ctx.role):
        raise HTTPException(status_code=403, detail="firm-wide role required to update tickets")
    try:
        ticket = update_ticket_status(
            ctx.firm_id,
            ticket_id,
            status=body.status,
            note=body.note or "",
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="ticket not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    _log_audit_event(
        request,
        "support.ticket.status",
        "ok",
        detail=f"id={ticket_id} status={body.status}",
    )
    return {"ticket": ticket}


@router.get("/api/support/metrics")
async def get_support_metrics(request: Request):
    """Firm-scoped support ticket metrics (S4)."""
    _require_permission(request, "dashboard.view")
    ctx = _auth_context(request)
    from services.tenancy import is_firm_wide_role
    from services.support_ticket_service import firm_support_metrics

    if not is_firm_wide_role(ctx.role):
        raise HTTPException(status_code=403, detail="firm-wide role required for metrics")
    return {"metrics": firm_support_metrics(ctx.firm_id)}
