"""Platform super-admin — billing bypass + full permissions for a fixed operator email."""

from __future__ import annotations

import os

from docugrid_auth import is_production, staging_local_enabled
from services.firm_members import (
    MEMBER_STATUS_ACTIVE,
    FirmMember,
    list_members_by_email,
    upsert_member,
)
from services.personas import PERSONA_PLATFORM_ADMIN
from services.tenancy import DEFAULT_FIRM_ID

# Dev default only outside production. Production requires an explicit env override
# that is not the legacy admin@taxx.jp mailbox (see validate_production_env.py).
_DEV_SUPER_ADMIN_EMAIL = "admin@taxx.jp"


def _resolve_super_admin_email() -> str:
    raw = os.environ.get("DOCUGRID_SUPER_ADMIN_EMAIL")
    if raw is not None:
        return raw.strip().lower()
    if is_production() and not staging_local_enabled():
        return ""
    return _DEV_SUPER_ADMIN_EMAIL


SUPER_ADMIN_EMAIL = ""  # resolved lazily via getter for env changes in tests
SUPER_ADMIN_STAKEHOLDER_ID = "super-admin"
SUPER_ADMIN_ROLE = "platform_admin"
LEGACY_DEV_SUPER_ADMIN_EMAIL = _DEV_SUPER_ADMIN_EMAIL


def get_super_admin_email() -> str:
    return _resolve_super_admin_email()


def is_super_admin_email(email: str | None) -> bool:
    configured = get_super_admin_email()
    return bool(configured) and (email or "").strip().lower() == configured


def all_app_permissions(known: set[str]) -> set[str]:
    """Union of configured permissions plus platform settings."""
    perms = set(known)
    perms.add("settings.platform")
    perms.add("settings.manage")
    perms.add("dashboard.view")
    return perms


def ensure_super_admin_member(email: str) -> FirmMember:
    normalized = (email or "").strip().lower()
    if not is_super_admin_email(normalized):
        raise ValueError("not_super_admin_email")

    active = [m for m in list_members_by_email(normalized) if m.status == MEMBER_STATUS_ACTIVE]
    if active:
        member = active[0]
        if member.firm_role != SUPER_ADMIN_ROLE or member.stakeholder_id != SUPER_ADMIN_STAKEHOLDER_ID:
            return upsert_member(
                member_id=member.id,
                firm_id=member.firm_id,
                email=normalized,
                stakeholder_id=SUPER_ADMIN_STAKEHOLDER_ID,
                firm_role=SUPER_ADMIN_ROLE,
                status=MEMBER_STATUS_ACTIVE,
                display_name=member.display_name,
                persona_id=PERSONA_PLATFORM_ADMIN,
            )
        return member

    return upsert_member(
        member_id=SUPER_ADMIN_STAKEHOLDER_ID,
        firm_id=DEFAULT_FIRM_ID,
        email=normalized,
        stakeholder_id=SUPER_ADMIN_STAKEHOLDER_ID,
        firm_role=SUPER_ADMIN_ROLE,
        status=MEMBER_STATUS_ACTIVE,
        persona_id=PERSONA_PLATFORM_ADMIN,
    )
