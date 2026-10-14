"""Per-firm system config and AI secrets (tenant-isolated settings)."""

from __future__ import annotations

import json
import os
import base64
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from services.tenancy import DEFAULT_FIRM_ID, safe_firm_id

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
LEGACY_SYSTEM_CONFIG_PATH = STORAGE_DIR / "system_config.json"
LEGACY_AI_SECRETS_PATH = STORAGE_DIR / "ai_secrets.json"
SECRET_ENCRYPTION_KEY_ENV = "DOCUGRID_SECRET_ENCRYPTION_KEY"
_DEV_SECRET_ENCRYPTION_KEY = "docugrid-dev-local-ai-secret-key"


def _firm_dir(firm_id: str) -> Path:
    return STORAGE_DIR / "firms" / safe_firm_id(firm_id)


def system_config_path(firm_id: str) -> Path:
    return _firm_dir(firm_id) / "system_config.json"


def ai_secrets_path(firm_id: str) -> Path:
    return _firm_dir(firm_id) / "ai_secrets.json"


def drive_credentials_path(firm_id: str) -> Path:
    return _firm_dir(firm_id) / "drive_credentials.json"


def _load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def secret_encryption_key_configured() -> bool:
    return bool(os.environ.get(SECRET_ENCRYPTION_KEY_ENV, "").strip())


def _master_secret() -> str:
    explicit = os.environ.get(SECRET_ENCRYPTION_KEY_ENV, "").strip()
    if explicit:
        return explicit
    jwt_secret = os.environ.get("DOCUGRID_JWT_SECRET", "").strip()
    if jwt_secret:
        return jwt_secret
    return _DEV_SECRET_ENCRYPTION_KEY


def _fernet() -> Fernet:
    digest = hashlib.sha256(_master_secret().encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def _encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode("utf-8")).decode("utf-8")


def _decrypt_secret(token: str) -> Optional[str]:
    try:
        return _fernet().decrypt(token.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError):
        return None


def _secret_last4(value: str) -> str | None:
    clean = (value or "").strip()
    return clean[-4:] if clean else None


def _read_secret(raw: dict, provider: str) -> Optional[str]:
    encrypted = (raw.get(f"{provider}_api_key_encrypted") or "").strip()
    if encrypted:
        decrypted = _decrypt_secret(encrypted)
        return decrypted.strip() if decrypted and decrypted.strip() else None
    key = (raw.get(f"{provider}_api_key") or "").strip()
    return key or None


def _remove_secret_fields(raw: dict, provider: str) -> None:
    raw.pop(f"{provider}_api_key", None)
    raw.pop(f"{provider}_api_key_encrypted", None)
    raw.pop(f"{provider}_api_key_last4", None)


def _write_secret(raw: dict, provider: str, key: str) -> None:
    clean = key.strip()
    raw[f"{provider}_api_key_encrypted"] = _encrypt_secret(clean)
    raw[f"{provider}_api_key_last4"] = _secret_last4(clean)
    raw.pop(f"{provider}_api_key", None)


def migrate_legacy_settings_if_needed(firm_id: str = DEFAULT_FIRM_ID) -> None:
    """One-time copy of global JSON into default firm directory."""
    target_cfg = system_config_path(firm_id)
    if not target_cfg.exists() and LEGACY_SYSTEM_CONFIG_PATH.exists():
        target_cfg.parent.mkdir(parents=True, exist_ok=True)
        target_cfg.write_text(
            LEGACY_SYSTEM_CONFIG_PATH.read_text(encoding="utf-8"),
            encoding="utf-8",
        )
    target_sec = ai_secrets_path(firm_id)
    if not target_sec.exists() and LEGACY_AI_SECRETS_PATH.exists():
        target_sec.parent.mkdir(parents=True, exist_ok=True)
        target_sec.write_text(
            LEGACY_AI_SECRETS_PATH.read_text(encoding="utf-8"),
            encoding="utf-8",
        )


def load_system_config_raw(firm_id: str) -> dict:
    migrate_legacy_settings_if_needed(firm_id)
    return _load_json(system_config_path(firm_id))


def save_system_config_raw(firm_id: str, data: dict) -> None:
    data = dict(data)
    data["updated_at"] = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
    _write_json(system_config_path(firm_id), data)


def configured_flags(firm_id: str) -> dict[str, bool]:
    raw = _load_json(ai_secrets_path(firm_id))
    if not raw and firm_id != DEFAULT_FIRM_ID:
        raw = _load_json(ai_secrets_path(DEFAULT_FIRM_ID))
    if not raw and LEGACY_AI_SECRETS_PATH.exists():
        raw = _load_json(LEGACY_AI_SECRETS_PATH)
    openai_key = _read_secret(raw, "openai")
    gemini_key = _read_secret(raw, "gemini")
    return {
        "ai_openai_key_configured": bool(openai_key),
        "ai_openai_key_last4": _secret_last4(openai_key or ""),
        "ai_gemini_key_configured": bool(gemini_key),
        "ai_gemini_key_last4": _secret_last4(gemini_key or ""),
    }


def get_openai_key(firm_id: str) -> Optional[str]:
    for path in (ai_secrets_path(firm_id), ai_secrets_path(DEFAULT_FIRM_ID), LEGACY_AI_SECRETS_PATH):
        key = _read_secret(_load_json(path), "openai")
        if key:
            return key
    return None


def get_gemini_key(firm_id: str) -> Optional[str]:
    for path in (ai_secrets_path(firm_id), ai_secrets_path(DEFAULT_FIRM_ID), LEGACY_AI_SECRETS_PATH):
        key = _read_secret(_load_json(path), "gemini")
        if key:
            return key
    return None


def update_secrets(
    firm_id: str,
    *,
    openai_api_key: Optional[str] = None,
    gemini_api_key: Optional[str] = None,
    clear_openai: bool = False,
    clear_gemini: bool = False,
) -> None:
    path = ai_secrets_path(firm_id)
    raw = _load_json(path)
    if clear_openai:
        _remove_secret_fields(raw, "openai")
    elif openai_api_key is not None and openai_api_key.strip():
        _write_secret(raw, "openai", openai_api_key)
    if clear_gemini:
        _remove_secret_fields(raw, "gemini")
    elif gemini_api_key is not None and gemini_api_key.strip():
        _write_secret(raw, "gemini", gemini_api_key)
    raw["updated_at"] = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
    _write_json(path, raw)


def save_drive_credentials(firm_id: str, credentials: dict) -> None:
    _write_json(drive_credentials_path(firm_id), credentials)


def clear_drive_credentials(firm_id: str) -> None:
    path = drive_credentials_path(firm_id)
    if path.exists():
        path.unlink()


def get_drive_service_account_email(firm_id: str) -> Optional[str]:
    email = (_load_json(drive_credentials_path(firm_id)).get("client_email") or "").strip()
    return email or None
