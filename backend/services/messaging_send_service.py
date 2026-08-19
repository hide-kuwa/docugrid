"""Outbound senders for Slack / email / LINE (no paid DocuGrid contract required)."""

from __future__ import annotations

import json
import smtplib
import ssl
from email.message import EmailMessage
from typing import Any, Optional
from urllib import error, request

from services.messaging_channels_service import (
    get_channel_secrets,
    get_channels_public,
    validate_channel,
)


def send_channel_message(
    firm_id: str,
    channel: str,
    *,
    text: str,
    to: Optional[str] = None,
    subject: Optional[str] = None,
) -> dict[str, Any]:
    check = validate_channel(firm_id, channel)
    if not check.get("ok"):
        return check
    body = (text or "").strip()
    if not body:
        return {"ok": False, "error": "empty_message"}

    if channel == "slack":
        return _send_slack(firm_id, body, to=to)
    if channel == "email":
        return _send_email(firm_id, body, to=to, subject=subject)
    if channel == "line":
        return _send_line(firm_id, body, to=to)
    return {"ok": False, "error": "unknown_channel"}


def _send_slack(firm_id: str, text: str, *, to: Optional[str] = None) -> dict[str, Any]:
    pub = get_channels_public(firm_id)["slack"]
    secrets = get_channel_secrets(firm_id, "slack")
    mode = pub.get("mode") or "webhook"
    if mode == "local":
        return {
            "ok": True,
            "channel": "slack",
            "mode": "local",
            "to": (to or "").strip() or None,
            "message": text,
            "hint": "local モードのため外部 Slack へは送らず受信箱にのみ残します",
        }
    if mode == "webhook":
        url = secrets.get("webhook_url") or ""
        payload = json.dumps({"text": text}).encode("utf-8")
        req = request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=15) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
                if resp.status >= 400:
                    return {"ok": False, "channel": "slack", "error": raw or f"http_{resp.status}"}
                return {
                    "ok": True,
                    "channel": "slack",
                    "mode": "webhook",
                    "response": raw[:200],
                    "message": text,
                }
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace") if exc.fp else str(exc)
            return {"ok": False, "channel": "slack", "error": detail or str(exc)}
        except Exception as exc:
            return {"ok": False, "channel": "slack", "error": str(exc)}

    token = secrets.get("bot_token") or ""
    channel_id = (to or pub.get("default_channel") or "").strip()
    if not channel_id:
        return {
            "ok": False,
            "channel": "slack",
            "error": "missing_channel",
            "hint": "Bot 送信には default_channel（例: #general または C…）が必要です",
        }
    payload = json.dumps({"channel": channel_id, "text": text}).encode("utf-8")
    req = request.Request(
        "https://slack.com/api/chat.postMessage",
        data=payload,
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if not data.get("ok"):
                return {"ok": False, "channel": "slack", "error": data.get("error") or "slack_api_error"}
            return {
                "ok": True,
                "channel": "slack",
                "mode": "bot",
                "ts": data.get("ts"),
                "message": text,
            }
    except Exception as exc:
        return {"ok": False, "channel": "slack", "error": str(exc)}


def _send_email(
    firm_id: str,
    text: str,
    *,
    to: Optional[str] = None,
    subject: Optional[str] = None,
) -> dict[str, Any]:
    pub = get_channels_public(firm_id)["email"]
    secrets = get_channel_secrets(firm_id, "email")
    provider = str(pub.get("provider") or "resend")
    from_email = str(pub.get("from_email") or "").strip()
    reply_to = str(pub.get("reply_to") or "").strip()
    dest = (to or "").strip()
    if provider == "local":
        dest = dest if dest and "@" in dest else "local@inbox"
        return {
            "ok": True,
            "channel": "email",
            "mode": "local",
            "to": dest,
            "message": text,
            "subject": subject or "[DocuGrid]",
            "hint": "local プロバイダのため外部送信せず受信箱にのみ残します",
        }
    if not dest or "@" not in dest:
        return {
            "ok": False,
            "channel": "email",
            "error": "missing_to",
            "hint": "送信先メールアドレス（to）を指定してください",
        }

    # local handled above; remaining providers need secrets / SMTP

    if provider == "smtp":
        password = secrets.get("api_key") or ""
        host = str(pub.get("smtp_host") or "").strip()
        port = int(pub.get("smtp_port") or 587)
        user = str(pub.get("smtp_user") or "").strip()
        use_tls = bool(pub.get("smtp_use_tls", True))
        if not host or not user or not password:
            return {"ok": False, "channel": "email", "error": "smtp_incomplete"}
        msg = EmailMessage()
        msg["From"] = from_email
        msg["To"] = dest
        msg["Subject"] = subject or "[DocuGrid]"
        if reply_to:
            msg["Reply-To"] = reply_to
        msg.set_content(text)
        try:
            if use_tls:
                context = ssl.create_default_context()
                with smtplib.SMTP(host, port, timeout=20) as smtp:
                    smtp.starttls(context=context)
                    smtp.login(user, password)
                    smtp.send_message(msg)
            else:
                with smtplib.SMTP(host, port, timeout=20) as smtp:
                    smtp.login(user, password)
                    smtp.send_message(msg)
            return {
                "ok": True,
                "channel": "email",
                "mode": "smtp",
                "to": dest,
                "message": text,
                "subject": msg["Subject"],
            }
        except Exception as exc:
            return {"ok": False, "channel": "email", "error": str(exc)}

    # Resend / SendGrid HTTP (free tiers — user brings own key)
    api_key = secrets.get("api_key") or ""
    if provider == "resend":
        payload = {
            "from": from_email,
            "to": [dest],
            "subject": subject or "[DocuGrid]",
            "text": text,
        }
        if reply_to:
            payload["reply_to"] = reply_to
        req = request.Request(
            "https://api.resend.com/emails",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=20) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return {
                    "ok": True,
                    "channel": "email",
                    "mode": "resend",
                    "id": data.get("id"),
                    "to": dest,
                    "message": text,
                }
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace") if exc.fp else str(exc)
            return {"ok": False, "channel": "email", "error": detail or str(exc)}
        except Exception as exc:
            return {"ok": False, "channel": "email", "error": str(exc)}

    if provider == "sendgrid":
        payload = {
            "personalizations": [{"to": [{"email": dest}]}],
            "from": {"email": from_email},
            "subject": subject or "[DocuGrid]",
            "content": [{"type": "text/plain", "value": text}],
        }
        req = request.Request(
            "https://api.sendgrid.com/v3/mail/send",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=20) as resp:
                # SendGrid returns 202 with empty body
                return {
                    "ok": True,
                    "channel": "email",
                    "mode": "sendgrid",
                    "status": resp.status,
                    "to": dest,
                    "message": text,
                }
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace") if exc.fp else str(exc)
            return {"ok": False, "channel": "email", "error": detail or str(exc)}
        except Exception as exc:
            return {"ok": False, "channel": "email", "error": str(exc)}

    return {"ok": False, "channel": "email", "error": f"unsupported_provider:{provider}"}


def _send_line(firm_id: str, text: str, *, to: Optional[str] = None) -> dict[str, Any]:
    pub = get_channels_public(firm_id)["line"]
    secrets = get_channel_secrets(firm_id, "line")
    mode = str(pub.get("mode") or "messaging_api")
    if mode == "local":
        return {
            "ok": True,
            "channel": "line",
            "mode": "local",
            "to": (to or pub.get("destination_user_id") or "").strip() or None,
            "message": text,
            "hint": "local モードのため外部 LINE へは送らず受信箱にのみ残します",
        }
    token = secrets.get("channel_access_token") or ""
    dest = (to or pub.get("destination_user_id") or "").strip()
    if not dest:
        return {
            "ok": False,
            "channel": "line",
            "error": "missing_destination",
            "hint": "LINE の宛先 User ID（destination_user_id）を設定してください",
        }
    payload = json.dumps(
        {
            "to": dest,
            "messages": [{"type": "text", "text": text[:5000]}],
        }
    ).encode("utf-8")
    req = request.Request(
        "https://api.line.me/v2/bot/message/push",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return {
                "ok": True,
                "channel": "line",
                "mode": "messaging_api",
                "to": dest,
                "message": text,
                "response": raw[:200],
            }
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace") if exc.fp else str(exc)
        return {"ok": False, "channel": "line", "error": detail or str(exc)}
    except Exception as exc:
        return {"ok": False, "channel": "line", "error": str(exc)}
