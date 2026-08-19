"""DM workspace API — unified inbox + tool status."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from api.deps import (
    _auth_context,
    _log_audit_event,
    _require_client_permission,
    _require_permission,
)
from services.dm_inbox_service import ingest_item, workspace_payload
from services.messaging_channels_service import CHANNELS, update_channels
from services.tenancy import DEFAULT_FIRM_ID

router = APIRouter()


class DmIngestBody(BaseModel):
    channel: str = Field(..., description="email | slack | line | system")
    title: str
    body: str = ""
    direction: str = "inbound"
    client_id: Optional[str] = None
    participants: str = ""
    external_id: Optional[str] = None
    meta: dict[str, Any] = Field(default_factory=dict)


class DmToolsPatchBody(BaseModel):
    """Thin wrapper — same shape as messaging-channels PUT, for in-DM setup."""
    email: Optional[dict[str, Any]] = None
    slack: Optional[dict[str, Any]] = None
    line: Optional[dict[str, Any]] = None
    rotate_inbound_token: bool = False


class DmSendBody(BaseModel):
    channel: str = Field(..., description="email | slack | line")
    text: str
    to: Optional[str] = None
    subject: Optional[str] = None
    client_id: Optional[str] = None


class DmSimulateBody(BaseModel):
    channel: str = Field(..., description="email | slack | line")
    client_id: Optional[str] = None
    count: int = Field(1, ge=1, le=5)


class DmEnableLocalBody(BaseModel):
    """Enable local lab modes and optionally seed sample inbound."""
    client_id: Optional[str] = None
    seed: bool = True
    count: int = Field(1, ge=1, le=5)


@router.get("/api/dm/workspace")
async def get_dm_workspace(
    request: Request,
    channel: Optional[str] = Query(None),
    client_id: Optional[str] = Query(None),
    limit: int = Query(80, ge=1, le=500),
):
    """Unified inbox + connected tools (any user with document.view if client scoped)."""
    ctx = _auth_context(request)
    firm_id = ctx.firm_id or DEFAULT_FIRM_ID
    if client_id:
        _require_client_permission(request, "document.view", client_id)
    else:
        _require_permission(request, "document.view")
    return workspace_payload(
        firm_id,
        channel=channel,
        client_id=client_id,
        limit=limit,
    )


@router.post("/api/dm/enable-local")
async def dm_enable_local(request: Request, body: DmEnableLocalBody):
    """Enable email/slack/line in local mode and seed inbox — usable without vendor keys."""
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    firm_id = ctx.firm_id or DEFAULT_FIRM_ID
    if body.client_id:
        _require_client_permission(request, "document.view", body.client_id)

    from services.dm_inbox_service import sync_connected_notices
    from services.messaging_channels_service import enable_local_lab

    channels = enable_local_lab(firm_id)
    sync_connected_notices(firm_id)

    seeded: list[dict[str, Any]] = []
    if body.seed:
        samples = {
            "email": ("Re: 決算資料の提出", "お世話になっております。源泉徴収票を添付します。"),
            "slack": ("#顧問先", "役員報酬の変更届、定款の確認お願いできますか？"),
            "line": ("LINE", "資料を写真で送ります"),
        }
        for ch, (title, text) in samples.items():
            for idx in range(body.count):
                seeded.append(
                    ingest_item(
                        firm_id=firm_id,
                        channel=ch,
                        direction="inbound",
                        title=title if idx == 0 else f"{title} ({idx + 1})",
                        body=text,
                        client_id=body.client_id,
                        participants="模擬送信者",
                        external_id=f"lab:{ch}:{ctx.email}:{idx}:{title}",
                        meta={"event": "enable_local_lab", "no_contract": True},
                    )
                )

    _log_audit_event(
        request,
        "dm.enable_local",
        "success",
        f"seed={body.seed} n={len(seeded)}",
    )
    return {
        "ok": True,
        "channels": channels,
        "seeded": seeded,
        "workspace": workspace_payload(firm_id, client_id=body.client_id),
    }


@router.post("/api/dm/inbox")
async def post_dm_inbox_item(request: Request, body: DmIngestBody):
    """Ingest a message into the unified inbox (manual, webhook bridge, or system)."""
    ctx = _auth_context(request)
    firm_id = ctx.firm_id or DEFAULT_FIRM_ID
    if body.client_id:
        _require_client_permission(request, "document.view", body.client_id)
    else:
        _require_permission(request, "settings.manage")
    if body.channel not in ("email", "slack", "line", "system"):
        raise HTTPException(status_code=400, detail="Invalid channel")
    item = ingest_item(
        firm_id=firm_id,
        channel=body.channel,
        title=body.title,
        body=body.body,
        direction=body.direction,
        client_id=body.client_id,
        participants=body.participants,
        external_id=body.external_id,
        meta=body.meta,
    )
    _log_audit_event(request, "dm.inbox.ingest", "success", f"id={item['id']} ch={body.channel}")
    return item


@router.put("/api/dm/tools")
async def put_dm_tools(request: Request, body: DmToolsPatchBody):
    """Configure messaging tools from the DM workspace (same storage as 通知連携)."""
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    firm_id = ctx.firm_id or DEFAULT_FIRM_ID
    patch: dict[str, Any] = {}
    if body.email is not None:
        patch["email"] = body.email
    if body.slack is not None:
        patch["slack"] = body.slack
    if body.line is not None:
        patch["line"] = body.line
    if body.rotate_inbound_token:
        patch["rotate_inbound_token"] = True
    try:
        update_channels(firm_id, patch)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    from services.dm_inbox_service import sync_connected_notices
    from services.messaging_channels_service import ensure_inbound_token

    ensure_inbound_token(firm_id)
    sync_connected_notices(firm_id)
    _log_audit_event(request, "dm.tools.put", "success", f"keys={list(patch.keys())}")
    return workspace_payload(firm_id)


@router.post("/api/dm/send")
async def dm_send_message(request: Request, body: DmSendBody):
    """Send via connected Slack / email / LINE and mirror into inbox."""
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    firm_id = ctx.firm_id or DEFAULT_FIRM_ID
    if body.channel not in CHANNELS:
        raise HTTPException(status_code=400, detail="Invalid channel")
    if body.client_id:
        _require_client_permission(request, "document.view", body.client_id)
    from services.messaging_send_service import send_channel_message

    result = send_channel_message(
        firm_id,
        body.channel,
        text=body.text,
        to=body.to,
        subject=body.subject,
    )
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result)
    item = ingest_item(
        firm_id=firm_id,
        channel=body.channel,
        direction="outbound",
        title=body.subject or f"送信（{body.channel}）",
        body=body.text,
        client_id=body.client_id,
        participants=ctx.email or "DocuGrid",
        meta={"event": "dm_send", "result": {k: result.get(k) for k in ("mode", "to", "ts", "id")}},
    )
    _log_audit_event(request, "dm.send", "success", f"ch={body.channel}")
    return {"ok": True, "send": result, "item": item}


@router.post("/api/dm/simulate-inbound")
async def dm_simulate_inbound(request: Request, body: DmSimulateBody):
    """契約なしで受信箱の流入を試す（サンプル inbound）。"""
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    firm_id = ctx.firm_id or DEFAULT_FIRM_ID
    if body.channel not in CHANNELS:
        raise HTTPException(status_code=400, detail="Invalid channel")
    samples = {
        "email": [
            ("Re: 決算資料の提出", "お世話になっております。源泉徴収票を添付します。"),
            ("請求書のご確認", "3月分の請求書をお送りします。"),
        ],
        "slack": [
            ("#顧問先", "役員報酬の変更届、定款の確認お願いできますか？"),
            ("DM", "今日の打合せ、15時で大丈夫ですか？"),
        ],
        "line": [
            ("LINE", "資料を写真で送ります"),
            ("LINE", "領収書の件、了解しました"),
        ],
    }
    picked = samples.get(body.channel, samples["email"])[: body.count]
    items = []
    for idx, (title, text) in enumerate(picked):
        items.append(
            ingest_item(
                firm_id=firm_id,
                channel=body.channel,
                direction="inbound",
                title=title,
                body=text,
                client_id=body.client_id,
                participants="模擬送信者",
                external_id=f"sim:{body.channel}:{ctx.email}:{idx}:{title}",
                meta={"event": "simulate_inbound", "no_contract": True},
            )
        )
    _log_audit_event(request, "dm.simulate", "success", f"ch={body.channel} n={len(items)}")
    return {"ok": True, "items": items, "workspace": workspace_payload(firm_id, client_id=body.client_id)}


@router.get("/api/dm/inbound-hooks")
async def get_dm_inbound_hooks(request: Request):
    """Webhook URLs + token for Slack/LINE/email inbound (firm admin)."""
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    firm_id = ctx.firm_id or DEFAULT_FIRM_ID
    from services.messaging_channels_service import ensure_inbound_token

    token = ensure_inbound_token(firm_id)
    base = str(request.base_url).rstrip("/")
    return {
        "firm_id": firm_id,
        "token": token,
        "hooks": {
            "slack": f"{base}/api/public/messaging/{firm_id}/slack?token={token}",
            "line": f"{base}/api/public/messaging/{firm_id}/line?token={token}",
            "email": f"{base}/api/public/messaging/{firm_id}/email?token={token}",
        },
            "notes": [
            "まず「ローカルで使えるようにする」で契約なしの送受信が動きます",
            "Slack: Events API の Request URL に slack hook を設定（無料ワークスペース可）",
            "LINE: Messaging API Webhook に line hook（無料の公式アカウント可）",
            "メール: Resend/SendGrid Inbound や自前転送から email hook へ POST",
            "契約なし検証: DM の「模擬受信」で受信箱の流れを確認できます",
        ],
    }
