"""Work assistant chat — coverage / extraction propose / RAG / help."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from api.deps import _auth_context, _log_audit_event, _require_client_access, _require_permission

router = APIRouter()


class ExpectedSlotBody(BaseModel):
    slotId: str = Field(..., min_length=1, max_length=120)
    label: str = Field(default="", max_length=200)


class WorkAssistantChatBody(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    client_id: Optional[str] = Field(default=None, max_length=120)
    period_key: Optional[str] = Field(default=None, max_length=80)
    client_label: Optional[str] = Field(default=None, max_length=200)
    surface_id: Optional[str] = Field(default=None, max_length=80)
    expected_slots: list[ExpectedSlotBody] = Field(default_factory=list)


@router.post("/api/assistant/chat")
async def post_work_assistant_chat(request: Request, body: WorkAssistantChatBody):
    _require_permission(request, "dashboard.view")
    ctx = _auth_context(request)
    client_id = (body.client_id or "").strip() or None
    period_key = (body.period_key or "").strip() or None
    if client_id:
        role = _require_permission(request, "client.view")
        _require_client_access(request, role, client_id, required_permission="client.view")

    from services.work_assistant_service import answer_work_question

    expected: list[dict[str, str]] = [
        {"slotId": s.slotId, "label": s.label or s.slotId} for s in body.expected_slots
    ]
    result = answer_work_question(
        message=body.message,
        firm_id=ctx.firm_id,
        client_id=client_id,
        period_key=period_key,
        client_label=(body.client_label or "").strip() or None,
        expected_slots=expected,
    )
    _log_audit_event(
        request,
        "assistant.chat",
        "ok",
        detail=(
            f"intent={result.get('intent')} engine={result.get('engine')} "
            f"client={client_id or '-'} period={period_key or '-'}"
        ),
    )
    return result
