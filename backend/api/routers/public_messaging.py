"""Public inbound webhooks for Slack / LINE / email (no auth cookie; token in path/query)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any, Optional

from fastapi import APIRouter, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse, PlainTextResponse

from services.dm_inbox_service import ingest_item
from services.messaging_channels_service import (
    get_line_channel_secret,
    get_slack_signing_secret,
    verify_inbound_token,
)

_SLACK_MAX_SKEW_SEC = 300
from services.tenancy import DEFAULT_FIRM_ID, is_valid_firm_id

router = APIRouter()


def _require_valid_firm_id(firm_id: str) -> None:
    if not is_valid_firm_id(firm_id):
        raise HTTPException(status_code=401, detail="Invalid inbound token")


def _require_token(firm_id: str, token: Optional[str]) -> None:
    _require_valid_firm_id(firm_id)
    if not verify_inbound_token(firm_id, token):
        raise HTTPException(status_code=401, detail="Invalid inbound token")


def _require_slack_signature(
    signing_secret: str,
    body: bytes,
    timestamp: Optional[str],
    signature: Optional[str],
) -> None:
    try:
        ts = int(timestamp or "")
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Slack signature") from None
    if abs(time.time() - ts) > _SLACK_MAX_SKEW_SEC:
        raise HTTPException(status_code=401, detail="Invalid Slack signature")
    base = b"v0:" + str(ts).encode("utf-8") + b":" + body
    expected = "v0=" + hmac.new(signing_secret.encode("utf-8"), base, hashlib.sha256).hexdigest()
    if not signature or not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=401, detail="Invalid Slack signature")


@router.post("/api/public/messaging/{firm_id}/slack")
async def public_slack_webhook(
    firm_id: str,
    request: Request,
    token: Optional[str] = Query(None),
    x_docugrid_token: Optional[str] = Header(None, alias="X-DocuGrid-Token"),
    x_slack_signature: Optional[str] = Header(None, alias="X-Slack-Signature"),
    x_slack_request_timestamp: Optional[str] = Header(None, alias="X-Slack-Request-Timestamp"),
):
    """Slack Events API / generic JSON → DM inbox."""
    auth = token or x_docugrid_token
    _require_token(firm_id or DEFAULT_FIRM_ID, auth)
    body_bytes = await request.body()
    signing_secret = get_slack_signing_secret(firm_id)
    if signing_secret:
        _require_slack_signature(
            signing_secret, body_bytes, x_slack_request_timestamp, x_slack_signature
        )
    try:
        payload = json.loads(body_bytes.decode("utf-8") or "{}")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON") from None

    # Slack URL verification
    if isinstance(payload, dict) and payload.get("type") == "url_verification":
        return PlainTextResponse(str(payload.get("challenge") or ""))

    items: list[dict[str, Any]] = []
    events = []
    if isinstance(payload, dict):
        if payload.get("type") == "event_callback" and isinstance(payload.get("event"), dict):
            events = [payload["event"]]
        elif payload.get("event"):
            events = [payload["event"]]
        elif payload.get("text"):
            events = [payload]

    for ev in events:
        if not isinstance(ev, dict):
            continue
        if ev.get("bot_id") or ev.get("subtype") == "bot_message":
            continue
        text = str(ev.get("text") or "").strip()
        if not text:
            continue
        user = str(ev.get("user") or ev.get("username") or "slack")
        channel = str(ev.get("channel") or "")
        ts = str(ev.get("ts") or "")
        item = ingest_item(
            firm_id=firm_id,
            channel="slack",
            direction="inbound",
            title=f"Slack メッセージ{f' · {channel}' if channel else ''}",
            body=text,
            participants=user,
            external_id=f"slack:{channel}:{ts}" if ts else None,
            meta={"source": "slack_webhook", "raw_type": ev.get("type")},
        )
        items.append(item)

    if not items and isinstance(payload, dict) and payload.get("type") == "event_callback":
        # ack empty events (retries etc.)
        return {"ok": True, "ingested": 0}
    if not items:
        # generic fallback
        text = json.dumps(payload, ensure_ascii=False)[:2000]
        items.append(
            ingest_item(
                firm_id=firm_id,
                channel="slack",
                direction="inbound",
                title="Slack Webhook",
                body=text,
                participants="webhook",
                meta={"source": "slack_webhook_raw"},
            )
        )
    return {"ok": True, "ingested": len(items), "items": items}


@router.post("/api/public/messaging/{firm_id}/line")
async def public_line_webhook(
    firm_id: str,
    request: Request,
    token: Optional[str] = Query(None),
    x_docugrid_token: Optional[str] = Header(None, alias="X-DocuGrid-Token"),
    x_line_signature: Optional[str] = Header(None, alias="X-Line-Signature"),
):
    """LINE Messaging API webhook → DM inbox."""
    auth = token or x_docugrid_token
    _require_valid_firm_id(firm_id)
    body_bytes = await request.body()
    channel_secret = get_line_channel_secret(firm_id)
    if channel_secret:
        digest = hmac.new(
            channel_secret.encode("utf-8"),
            body_bytes,
            hashlib.sha256,
        ).digest()
        expected = base64.b64encode(digest).decode("utf-8")
        if not x_line_signature or not hmac.compare_digest(expected, x_line_signature):
            raise HTTPException(status_code=401, detail="Invalid LINE signature")
    else:
        _require_token(firm_id or DEFAULT_FIRM_ID, auth)

    try:
        payload = json.loads(body_bytes.decode("utf-8") or "{}")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON") from None

    events = payload.get("events") if isinstance(payload, dict) else None
    if not isinstance(events, list):
        events = []

    items = []
    for ev in events:
        if not isinstance(ev, dict):
            continue
        msg = ev.get("message") if isinstance(ev.get("message"), dict) else {}
        text = str(msg.get("text") or "").strip()
        if not text and ev.get("type") != "message":
            continue
        if not text:
            text = f"(非テキスト: {msg.get('type') or ev.get('type')})"
        source = ev.get("source") if isinstance(ev.get("source"), dict) else {}
        user = str(source.get("userId") or "line-user")
        msg_id = str(msg.get("id") or ev.get("webhookEventId") or "")
        items.append(
            ingest_item(
                firm_id=firm_id,
                channel="line",
                direction="inbound",
                title="LINE メッセージ",
                body=text,
                participants=user,
                external_id=f"line:{msg_id}" if msg_id else None,
                meta={"source": "line_webhook", "reply_token": ev.get("replyToken")},
            )
        )
    return {"ok": True, "ingested": len(items), "items": items}


@router.post("/api/public/messaging/{firm_id}/email")
async def public_email_webhook(
    firm_id: str,
    request: Request,
    token: Optional[str] = Query(None),
    x_docugrid_token: Optional[str] = Header(None, alias="X-DocuGrid-Token"),
):
    """Generic inbound email JSON (Resend/SendGrid-style or simple {from,subject,text})."""
    auth = token or x_docugrid_token
    _require_token(firm_id or DEFAULT_FIRM_ID, auth)
    payload = await request.json()
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="JSON object required")

    subject = str(
        payload.get("subject")
        or (payload.get("data") or {}).get("subject")
        or "メール"
    )
    text = str(
        payload.get("text")
        or payload.get("body")
        or payload.get("html")
        or (payload.get("data") or {}).get("text")
        or ""
    ).strip()
    sender = str(
        payload.get("from")
        or payload.get("sender")
        or (payload.get("data") or {}).get("from")
        or "unknown"
    )
    ext = str(payload.get("id") or payload.get("message_id") or "").strip() or None
    if not text:
        text = json.dumps(payload, ensure_ascii=False)[:2000]
    item = ingest_item(
        firm_id=firm_id,
        channel="email",
        direction="inbound",
        title=subject[:300],
        body=text,
        participants=sender[:200],
        external_id=f"email:{ext}" if ext else None,
        meta={"source": "email_webhook"},
    )
    return {"ok": True, "item": item}
