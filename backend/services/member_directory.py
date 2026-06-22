"""Email → stakeholder (member) resolution for login — prevents client-side role escalation."""

from __future__ import annotations

import json
import os
from pathlib import Path

from docugrid_auth import is_production

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
MEMBER_DIRECTORY_PATH = STORAGE_DIR / "member_directory.json"

# Dev defaults aligned with frontend STAKEHOLDER_MASTER personas.
DEFAULT_EMAIL_TO_STAKEHOLDER: dict[str, str] = {
    "admin@tax.co.jp": "actor-admin",
    "tanaka@tax.co.jp": "actor-s1",
    "sato@tax.co.jp": "actor-s2",
    "yamamoto@tax.co.jp": "actor-s3",
    "c1@client.example": "actor-c1",
    "ceo@client.example": "actor-c-ceo",
    "sales@client.example": "actor-c-sales",
    "controller@client.example": "actor-c-controller",
    "bank@example.com": "actor-b1",
    "audit@example.com": "actor-tp1",
    "taxoffice@example.go.jp": "actor-tax1",
    "beta-admin@example.com": "actor-beta-admin",
    "beta-staff@example.com": "actor-beta-staff",
}


def password_login_allowed() -> bool:
    """Password login is for local dev/tests only; disabled in production by default."""
    raw = os.environ.get("DOCUGRID_ALLOW_PASSWORD_LOGIN")
    if raw is not None:
        return raw.lower() in ("1", "true", "yes")
    return not is_production()


def login_stakeholder_pick_allowed() -> bool:
    """When false, login ignores client-supplied stakeholder_id (production default)."""
    raw = os.environ.get("DOCUGRID_ALLOW_LOGIN_STAKEHOLDER_PICK")
    if raw is not None:
        return raw.lower() in ("1", "true", "yes")
    return not is_production()


def _load_email_map() -> dict[str, str]:
    merged: dict[str, str] = {}
    if MEMBER_DIRECTORY_PATH.exists():
        try:
            raw = json.loads(MEMBER_DIRECTORY_PATH.read_text(encoding="utf-8"))
            for email, sid in (raw.get("emailToStakeholderId") or {}).items():
                if isinstance(email, str) and isinstance(sid, str) and email.strip():
                    merged[email.strip().lower()] = sid.strip()
        except Exception:
            pass
    # Dev personas always keep default emails (example file must not break admin@tax.co.jp login).
    for email, sid in DEFAULT_EMAIL_TO_STAKEHOLDER.items():
        merged[email.lower()] = sid
    return merged


def bootstrap_member_directory_example() -> None:
    """Copy example member directory when missing (dev convenience; no user setup required)."""
    if MEMBER_DIRECTORY_PATH.exists():
        return
    example = STORAGE_DIR / "member_directory.json.example"
    if not example.exists():
        return
    try:
        MEMBER_DIRECTORY_PATH.write_text(example.read_text(encoding="utf-8"), encoding="utf-8")
    except OSError:
        pass


def resolve_stakeholder_for_login(email: str, requested_stakeholder_id: str) -> str | None:
    """
    Resolve stakeholder_id from email. Client-supplied stakeholder_id is used only when
    login_stakeholder_pick_allowed() is true AND email is not in the directory.
    """
    normalized = (email or "").strip().lower()
    if not normalized:
        return None
    directory = _load_email_map()
    mapped = directory.get(normalized)
    if mapped:
        return mapped
    if login_stakeholder_pick_allowed() and (requested_stakeholder_id or "").strip():
        return requested_stakeholder_id.strip()
    return None
