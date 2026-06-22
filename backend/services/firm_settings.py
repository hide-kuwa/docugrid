"""Per-firm system config and AI secrets (tenant-isolated settings)."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from services.tenancy import DEFAULT_FIRM_ID

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
LEGACY_SYSTEM_CONFIG_PATH = STORAGE_DIR / "system_config.json"
LEGACY_AI_SECRETS_PATH = STORAGE_DIR / "ai_secrets.json"


def _firm_dir(firm_id: str) -> Path:
    fid = (firm_id or "").strip() or DEFAULT_FIRM_ID
    return STORAGE_DIR / "firms" / fid


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
    data["updated_at"] = datetime.utcnow().isoformat()
    _write_json(system_config_path(firm_id), data)


def configured_flags(firm_id: str) -> dict[str, bool]:
    raw = _load_json(ai_secrets_path(firm_id))
    if not raw and firm_id != DEFAULT_FIRM_ID:
        raw = _load_json(ai_secrets_path(DEFAULT_FIRM_ID))
    if not raw and LEGACY_AI_SECRETS_PATH.exists():
        raw = _load_json(LEGACY_AI_SECRETS_PATH)
    return {
        "ai_openai_key_configured": bool((raw.get("openai_api_key") or "").strip()),
        "ai_gemini_key_configured": bool((raw.get("gemini_api_key") or "").strip()),
    }


def get_openai_key(firm_id: str) -> Optional[str]:
    for path in (ai_secrets_path(firm_id), ai_secrets_path(DEFAULT_FIRM_ID), LEGACY_AI_SECRETS_PATH):
        key = (_load_json(path).get("openai_api_key") or "").strip()
        if key:
            return key
    return None


def get_gemini_key(firm_id: str) -> Optional[str]:
    for path in (ai_secrets_path(firm_id), ai_secrets_path(DEFAULT_FIRM_ID), LEGACY_AI_SECRETS_PATH):
        key = (_load_json(path).get("gemini_api_key") or "").strip()
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
        raw.pop("openai_api_key", None)
    elif openai_api_key is not None and openai_api_key.strip():
        raw["openai_api_key"] = openai_api_key.strip()
    if clear_gemini:
        raw.pop("gemini_api_key", None)
    elif gemini_api_key is not None and gemini_api_key.strip():
        raw["gemini_api_key"] = gemini_api_key.strip()
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
