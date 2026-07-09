"""Firm billing owner authorization."""

from __future__ import annotations

from fastapi import HTTPException, Request

from api.deps import _auth_context
from services.firm_members import get_member_by_id
from services.firm_onboarding import is_billing_owner_role
from services.super_admin import is_super_admin_email
from services.tenancy import AuthContext

def _can_manage_firm_billing(ctx: AuthContext) -> bool:
    from services.firm_onboarding import is_billing_owner_role
    from services.super_admin import is_super_admin_email

    if is_super_admin_email(ctx.email):
        return True
    if is_billing_owner_role(ctx.role):
        return True
    if ctx.member_id:
        member = get_member_by_id(ctx.member_id)
        if member and is_billing_owner_role(member.firm_role):
            return True
    return False


def _require_firm_billing_owner(request: Request) -> AuthContext:
    """Subscription checkout/portal — firm representative (firm_admin) only."""
    ctx = _auth_context(request)
    if not _can_manage_firm_billing(ctx):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "billing_owner_only",
                "message": "プラン・お支払いは事務所の代表アカウントのみ操作できます。",
            },
        )
    return ctx

__all__ = [
    "_can_manage_firm_billing",
    "_require_firm_billing_owner",
]
