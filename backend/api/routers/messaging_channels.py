"""Messaging channels API — email / Slack / LINE (firm no-code settings)."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from api.deps import _auth_context, _log_audit_event, _require_permission
from services.messaging_channels_service import (
    CHANNELS,
    get_channels_public,
    send_test_message,
    update_channels,
    validate_channel,
)
from services.tenancy import DEFAULT_FIRM_ID

router = APIRouter()


class EmailChannelUpdate(BaseModel):
    enabled: Optional[bool] = None
    provider: Optional[str] = None
    from_email: Optional[str] = None
    reply_to: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_use_tls: Optional[bool] = None
    api_key: Optional[str] = None
    clear_api_key: bool = False


class SlackChannelUpdate(BaseModel):
    enabled: Optional[bool] = None
    mode: Optional[str] = None
    default_channel: Optional[str] = None
    webhook_url: Optional[str] = None
    clear_webhook_url: bool = False
    bot_token: Optional[str] = None
    clear_bot_token: bool = False


class LineChannelUpdate(BaseModel):
    enabled: Optional[bool] = None
    mode: Optional[str] = None
    destination_user_id: Optional[str] = None
    channel_access_token: Optional[str] = None
    clear_channel_access_token: bool = False


class MessagingChannelsUpdateBody(BaseModel):
    email: Optional[EmailChannelUpdate] = None
    slack: Optional[SlackChannelUpdate] = None
    line: Optional[LineChannelUpdate] = None


class MessagingTestBody(BaseModel):
    channel: str = Field(..., description="email | slack | line")
    to: Optional[str] = None
    dry_run: bool = True


@router.get("/api/messaging-channels")
async def get_messaging_channels(request: Request):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    return get_channels_public(ctx.firm_id or DEFAULT_FIRM_ID)


@router.put("/api/messaging-channels")
async def put_messaging_channels(request: Request, body: MessagingChannelsUpdateBody):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    firm_id = ctx.firm_id or DEFAULT_FIRM_ID
    patch: dict[str, Any] = {}
    if body.email is not None:
        patch["email"] = body.email.model_dump(exclude_none=False)
    if body.slack is not None:
        patch["slack"] = body.slack.model_dump(exclude_none=False)
    if body.line is not None:
        patch["line"] = body.line.model_dump(exclude_none=False)
    try:
        saved = update_channels(firm_id, patch)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(
        request,
        "messaging_channels.put",
        "success",
        f"keys={list(patch.keys())}",
    )
    return saved


@router.post("/api/messaging-channels/validate")
async def validate_messaging_channel(request: Request, body: MessagingTestBody):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    if body.channel not in CHANNELS:
        raise HTTPException(status_code=400, detail="Invalid channel")
    result = validate_channel(ctx.firm_id or DEFAULT_FIRM_ID, body.channel)
    return result


@router.post("/api/messaging-channels/test")
async def test_messaging_channel(request: Request, body: MessagingTestBody):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    if body.channel not in CHANNELS:
        raise HTTPException(status_code=400, detail="Invalid channel")
    result = send_test_message(
        ctx.firm_id or DEFAULT_FIRM_ID,
        body.channel,
        to=body.to,
        dry_run=body.dry_run,
    )
    if result.get("ok"):
        try:
            from services.dm_inbox_service import ensure_channel_connected_notice, ingest_item

            firm_id = ctx.firm_id or DEFAULT_FIRM_ID
            ensure_channel_connected_notice(firm_id, body.channel)
            if not body.dry_run:
                ingest_item(
                    firm_id=firm_id,
                    channel=body.channel,
                    direction="outbound",
                    title=f"テスト送信（{body.channel}）",
                    body=str(result.get("message") or "接続テストを送信しました"),
                    participants=ctx.email or "DocuGrid",
                    external_id=f"test:{body.channel}:{result.get('ts') or 'ok'}",
                    meta={"event": "channel_test", "dry_run": False},
                )
            else:
                ingest_item(
                    firm_id=firm_id,
                    channel=body.channel,
                    direction="system",
                    title=f"設定検証OK（{body.channel}）",
                    body="チャネル設定は送信準備完了です。実メッセージは接続後ここに流入します。",
                    participants="DocuGrid",
                    external_id=f"validate:{body.channel}",
                    meta={"event": "channel_validate", "dry_run": True},
                )
        except Exception:
            pass
    _log_audit_event(
        request,
        "messaging_channels.test",
        "success" if result.get("ok") else "failed",
        f"channel={body.channel} dry_run={body.dry_run}",
    )
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result)
    return result
