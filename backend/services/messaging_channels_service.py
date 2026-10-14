"""Firm messaging channels (email / Slack / LINE) — no-code after login."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from services.firm_settings import STORAGE_DIR, _decrypt_secret, _encrypt_secret, _secret_last4
from services.tenancy import DEFAULT_FIRM_ID, safe_firm_id

CHANNELS = ("email", "slack", "line")
EMAIL_PROVIDERS = frozenset({"resend", "sendgrid", "smtp", "local"})
SLACK_MODES = frozenset({"webhook", "bot", "local"})
LINE_MODES = frozenset({"messaging_api", "notify", "local"})


def _firm_dir(firm_id: str) -> Path:
    return STORAGE_DIR / "firms" / safe_firm_id(firm_id)


def channels_path(firm_id: str) -> Path:
    return _firm_dir(firm_id) / "messaging_channels.json"


def _now() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


def _load_raw(firm_id: str) -> dict[str, Any]:
    path = channels_path(firm_id)
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _write_raw(firm_id: str, data: dict[str, Any]) -> None:
    path = channels_path(firm_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    data = dict(data)
    data["updated_at"] = _now()
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _channel_block(raw: dict[str, Any], channel: str) -> dict[str, Any]:
    block = raw.get(channel)
    return block if isinstance(block, dict) else {}


def _set_secret(block: dict[str, Any], field: str, value: Optional[str], *, clear: bool) -> None:
    enc_key = f"{field}_encrypted"
    last4_key = f"{field}_last4"
    if clear:
        block.pop(enc_key, None)
        block.pop(last4_key, None)
        block.pop(field, None)
        return
    if value is None:
        return
    clean = value.strip()
    if not clean:
        return
    block[enc_key] = _encrypt_secret(clean)
    block[last4_key] = _secret_last4(clean)
    block.pop(field, None)


def _read_secret(block: dict[str, Any], field: str) -> Optional[str]:
    enc = (block.get(f"{field}_encrypted") or "").strip()
    if enc:
        return _decrypt_secret(enc)
    plain = (block.get(field) or "").strip()
    return plain or None


def _secret_status(block: dict[str, Any], field: str) -> dict[str, Any]:
    secret = _read_secret(block, field)
    return {
        f"{field}_configured": bool(secret),
        f"{field}_last4": _secret_last4(secret or "") if secret else None,
    }


def _default_public() -> dict[str, Any]:
    return {
        "email": {
            "enabled": False,
            "provider": "resend",
            "from_email": "",
            "reply_to": "",
            "smtp_host": "",
            "smtp_port": 587,
            "smtp_user": "",
            "smtp_use_tls": True,
            "api_key_configured": False,
            "api_key_last4": None,
            "ready": False,
        },
        "slack": {
            "enabled": False,
            "mode": "webhook",
            "default_channel": "",
            "webhook_url_configured": False,
            "webhook_url_last4": None,
            "bot_token_configured": False,
            "bot_token_last4": None,
            "signing_secret_configured": False,
            "ready": False,
        },
        "line": {
            "enabled": False,
            "mode": "messaging_api",
            "destination_user_id": "",
            "channel_access_token_configured": False,
            "channel_access_token_last4": None,
            "channel_secret_configured": False,
            "ready": False,
        },
        "inbound_token_configured": False,
        "updated_at": None,
    }


def _email_ready(block: dict[str, Any]) -> bool:
    if not block.get("enabled"):
        return False
    provider = str(block.get("provider") or "resend")
    from_email = str(block.get("from_email") or "").strip()
    if not from_email or "@" not in from_email:
        return False
    if provider == "local":
        return True
    if provider == "smtp":
        return bool(
            str(block.get("smtp_host") or "").strip()
            and _read_secret(block, "api_key")
            and str(block.get("smtp_user") or "").strip()
        )
    return bool(_read_secret(block, "api_key"))


def _slack_ready(block: dict[str, Any]) -> bool:
    if not block.get("enabled"):
        return False
    mode = str(block.get("mode") or "webhook")
    if mode == "local":
        return True
    if mode == "bot":
        return bool(_read_secret(block, "bot_token"))
    return bool(_read_secret(block, "webhook_url"))


def _line_ready(block: dict[str, Any]) -> bool:
    if not block.get("enabled"):
        return False
    mode = str(block.get("mode") or "messaging_api")
    if mode == "local":
        return True
    if not _read_secret(block, "channel_access_token"):
        return False
    if mode == "notify":
        return bool(str(block.get("destination_user_id") or "").strip())
    return True


def get_channels_public(firm_id: str) -> dict[str, Any]:
    raw = _load_raw(firm_id)
    out = _default_public()
    email = _channel_block(raw, "email")
    slack = _channel_block(raw, "slack")
    line = _channel_block(raw, "line")

    out["email"].update(
        {
            "enabled": bool(email.get("enabled")),
            "provider": str(email.get("provider") or "resend")
            if str(email.get("provider") or "resend") in EMAIL_PROVIDERS
            else "resend",
            "from_email": str(email.get("from_email") or ""),
            "reply_to": str(email.get("reply_to") or ""),
            "smtp_host": str(email.get("smtp_host") or ""),
            "smtp_port": int(email.get("smtp_port") or 587),
            "smtp_user": str(email.get("smtp_user") or ""),
            "smtp_use_tls": bool(email.get("smtp_use_tls", True)),
            **_secret_status(email, "api_key"),
        }
    )
    out["email"]["ready"] = _email_ready(email if email else out["email"])

    out["slack"].update(
        {
            "enabled": bool(slack.get("enabled")),
            "mode": str(slack.get("mode") or "webhook")
            if str(slack.get("mode") or "webhook") in SLACK_MODES
            else "webhook",
            "default_channel": str(slack.get("default_channel") or ""),
            **_secret_status(slack, "webhook_url"),
            **_secret_status(slack, "bot_token"),
            "signing_secret_configured": bool(_read_secret(slack, "signing_secret")),
        }
    )
    out["slack"]["ready"] = _slack_ready(slack if slack else out["slack"])

    out["line"].update(
        {
            "enabled": bool(line.get("enabled")),
            "mode": str(line.get("mode") or "messaging_api")
            if str(line.get("mode") or "messaging_api") in LINE_MODES
            else "messaging_api",
            "destination_user_id": str(line.get("destination_user_id") or ""),
            **_secret_status(line, "channel_access_token"),
            **{
                "channel_secret_configured": bool(_read_secret(line, "channel_secret")),
            },
        }
    )
    out["line"]["ready"] = _line_ready(line if line else out["line"])
    out["inbound_token_configured"] = bool(_read_secret(raw, "inbound_token"))
    out["updated_at"] = raw.get("updated_at")
    out["summary"] = {
        "any_ready": any(out[c]["ready"] for c in CHANNELS),
        "ready_channels": [c for c in CHANNELS if out[c]["ready"]],
        "enabled_channels": [c for c in CHANNELS if out[c]["enabled"]],
    }
    return out


def update_channels(firm_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    raw = _load_raw(firm_id)

    if "email" in patch and isinstance(patch["email"], dict):
        email = dict(_channel_block(raw, "email"))
        body = patch["email"]
        if "enabled" in body:
            email["enabled"] = bool(body["enabled"])
        if "provider" in body:
            provider = str(body["provider"] or "resend")
            if provider not in EMAIL_PROVIDERS:
                raise ValueError("invalid_email_provider")
            email["provider"] = provider
        for key in ("from_email", "reply_to", "smtp_host", "smtp_user"):
            if key in body and body[key] is not None:
                email[key] = str(body[key]).strip()
        if "smtp_port" in body and body["smtp_port"] is not None:
            email["smtp_port"] = max(1, min(65535, int(body["smtp_port"])))
        if "smtp_use_tls" in body:
            email["smtp_use_tls"] = bool(body["smtp_use_tls"])
        _set_secret(
            email,
            "api_key",
            body.get("api_key"),
            clear=bool(body.get("clear_api_key")),
        )
        raw["email"] = email

    if "slack" in patch and isinstance(patch["slack"], dict):
        slack = dict(_channel_block(raw, "slack"))
        body = patch["slack"]
        if "enabled" in body:
            slack["enabled"] = bool(body["enabled"])
        if "mode" in body:
            mode = str(body["mode"] or "webhook")
            if mode not in SLACK_MODES:
                raise ValueError("invalid_slack_mode")
            slack["mode"] = mode
        if "default_channel" in body and body["default_channel"] is not None:
            slack["default_channel"] = str(body["default_channel"]).strip()
        _set_secret(
            slack,
            "webhook_url",
            body.get("webhook_url"),
            clear=bool(body.get("clear_webhook_url")),
        )
        _set_secret(
            slack,
            "bot_token",
            body.get("bot_token"),
            clear=bool(body.get("clear_bot_token")),
        )
        _set_secret(
            slack,
            "signing_secret",
            body.get("signing_secret"),
            clear=bool(body.get("clear_signing_secret")),
        )
        raw["slack"] = slack

    if "line" in patch and isinstance(patch["line"], dict):
        line = dict(_channel_block(raw, "line"))
        body = patch["line"]
        if "enabled" in body:
            line["enabled"] = bool(body["enabled"])
        if "mode" in body:
            mode = str(body["mode"] or "messaging_api")
            if mode not in LINE_MODES:
                raise ValueError("invalid_line_mode")
            line["mode"] = mode
        if "destination_user_id" in body and body["destination_user_id"] is not None:
            line["destination_user_id"] = str(body["destination_user_id"]).strip()
        _set_secret(
            line,
            "channel_access_token",
            body.get("channel_access_token"),
            clear=bool(body.get("clear_channel_access_token")),
        )
        _set_secret(
            line,
            "channel_secret",
            body.get("channel_secret"),
            clear=bool(body.get("clear_channel_secret")),
        )
        raw["line"] = line

    if patch.get("rotate_inbound_token"):
        ensure_inbound_token(firm_id, force=True)
        return get_channels_public(firm_id)

    _write_raw(firm_id, raw)
    return get_channels_public(firm_id)


def ensure_inbound_token(firm_id: str, *, force: bool = False) -> str:
    """Public webhook shared secret (no paid contract)."""
    import secrets as py_secrets

    raw = _load_raw(firm_id)
    existing = _read_secret(raw, "inbound_token")
    if existing and not force:
        return existing
    token = py_secrets.token_urlsafe(24)
    _set_secret(raw, "inbound_token", token, clear=False)
    _write_raw(firm_id, raw)
    return token


def enable_local_lab(firm_id: str) -> dict[str, Any]:
    """Turn on email/slack/line in local mode so DM send+inbox works without vendor keys."""
    fid = (firm_id or "").strip() or DEFAULT_FIRM_ID
    update_channels(
        fid,
        {
            "email": {
                "enabled": True,
                "provider": "local",
                "from_email": "noreply@localhost",
            },
            "slack": {
                "enabled": True,
                "mode": "local",
            },
            "line": {
                "enabled": True,
                "mode": "local",
            },
        },
    )
    ensure_inbound_token(fid)
    return get_channels_public(fid)


def get_inbound_token(firm_id: str) -> Optional[str]:
    return _read_secret(_load_raw(firm_id), "inbound_token")


def verify_inbound_token(firm_id: str, token: Optional[str]) -> bool:
    expected = get_inbound_token(firm_id)
    if not expected:
        return False
    return bool(token) and secrets_compare(expected, str(token))


def secrets_compare(a: str, b: str) -> bool:
    import hmac

    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def get_line_channel_secret(firm_id: str) -> Optional[str]:
    return _read_secret(_channel_block(_load_raw(firm_id), "line"), "channel_secret")


def get_slack_signing_secret(firm_id: str) -> Optional[str]:
    return _read_secret(_channel_block(_load_raw(firm_id), "slack"), "signing_secret")


def get_channel_secrets(firm_id: str, channel: str) -> dict[str, Optional[str]]:
    """Internal: decrypted secrets for senders (never expose via API)."""
    block = _channel_block(_load_raw(firm_id), channel)
    if channel == "email":
        return {"api_key": _read_secret(block, "api_key")}
    if channel == "slack":
        return {
            "webhook_url": _read_secret(block, "webhook_url"),
            "bot_token": _read_secret(block, "bot_token"),
        }
    if channel == "line":
        return {
            "channel_access_token": _read_secret(block, "channel_access_token"),
            "channel_secret": _read_secret(block, "channel_secret"),
        }
    return {}


def send_test_message(
    firm_id: str,
    channel: str,
    *,
    to: Optional[str] = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Validate and optionally send a real lightweight test."""
    check = validate_channel(firm_id, channel)
    if not check.get("ok"):
        return check

    text = f"[DocuGrid] 接続テスト ({channel}) — {_now()}"
    if dry_run:
        return {
            "ok": True,
            "channel": channel,
            "dry_run": True,
            "message": text,
            "hint": "設定は揃っています。実際の送信は dry_run=false で実行できます。",
        }

    from services.messaging_send_service import send_channel_message

    result = send_channel_message(firm_id, channel, text=text, to=to, subject="[DocuGrid] 接続テスト")
    if result.get("ok") and "message" not in result:
        result["message"] = text
    return result


_SLACK_WEBHOOK_RE = re.compile(r"^https://hooks\.slack\.com/services/", re.I)


def validate_channel(firm_id: str, channel: str) -> dict[str, Any]:
    pub = get_channels_public(firm_id)
    if channel not in CHANNELS:
        return {"ok": False, "channel": channel, "error": "unknown_channel"}
    block = pub[channel]
    if not block.get("enabled"):
        return {"ok": False, "channel": channel, "error": "disabled", "hint": "有効化してください"}
    if not block.get("ready"):
        return {
            "ok": False,
            "channel": channel,
            "error": "incomplete",
            "hint": "必須項目とシークレットを入力してください",
            "status": block,
        }

    if channel == "slack" and block.get("mode") == "webhook":
        url = get_channel_secrets(firm_id, "slack").get("webhook_url") or ""
        if not _SLACK_WEBHOOK_RE.match(url):
            return {
                "ok": False,
                "channel": channel,
                "error": "invalid_webhook",
                "hint": "Slack Incoming Webhook URL（hooks.slack.com）を設定してください",
            }

    if channel == "email":
        from_email = str(block.get("from_email") or "")
        if "@" not in from_email:
            return {"ok": False, "channel": channel, "error": "invalid_from_email"}

    return {"ok": True, "channel": channel, "status": "ready", "mode": block.get("mode") or block.get("provider")}
