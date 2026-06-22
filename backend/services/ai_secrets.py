"""AI プロバイダ API キーのサーバー側保管（GET では返さない）。"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
AI_SECRETS_PATH = STORAGE_DIR / "ai_secrets.json"


def _load_raw() -> dict:
    if not AI_SECRETS_PATH.exists():
        return {}
    try:
        data = json.loads(AI_SECRETS_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def configured_flags() -> dict[str, bool]:
    raw = _load_raw()
    return {
        "ai_openai_key_configured": bool((raw.get("openai_api_key") or "").strip()),
        "ai_gemini_key_configured": bool((raw.get("gemini_api_key") or "").strip()),
    }


def get_openai_key() -> Optional[str]:
    key = (_load_raw().get("openai_api_key") or "").strip()
    return key or None


def get_gemini_key() -> Optional[str]:
    key = (_load_raw().get("gemini_api_key") or "").strip()
    return key or None


def update_secrets(
    *,
    openai_api_key: Optional[str] = None,
    gemini_api_key: Optional[str] = None,
    clear_openai: bool = False,
    clear_gemini: bool = False,
) -> None:
    raw = _load_raw()
    if clear_openai:
        raw.pop("openai_api_key", None)
    elif openai_api_key is not None and openai_api_key.strip():
        raw["openai_api_key"] = openai_api_key.strip()
    if clear_gemini:
        raw.pop("gemini_api_key", None)
    elif gemini_api_key is not None and gemini_api_key.strip():
        raw["gemini_api_key"] = gemini_api_key.strip()
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    AI_SECRETS_PATH.write_text(json.dumps(raw, indent=2), encoding="utf-8")
