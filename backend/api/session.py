"""Login session helpers."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse, Response

from docugrid_auth import (
    SESSION_COOKIE_NAME,
    attach_csrf_cookie,
    create_access_token,
    get_jwt_exp_seconds,
    session_cookie_enabled,
    session_cookie_secure,
)
from api.constants import AUDIT_EVENTS_DB_PATH
from api.deps import _get_stakeholder_role_map
from api.persistence import _init_audit_events_db
from api.schemas import TokenResponse
from services.firm_members import resolve_member_for_login
from services.member_directory import login_stakeholder_pick_allowed

def _issue_session_token(
    *,
    request: Request,
    email: str,
    resolved_stakeholder_id: str,
    role: str,
    audit_action: str,
    firm_id: str,
    member_id: str,
) -> TokenResponse:
    token = create_access_token(
        sub=email,
        role=role,
        stid=resolved_stakeholder_id,
        firm_id=firm_id,
        member_id=member_id,
    )
    _init_audit_events_db()
    with sqlite3.connect(AUDIT_EVENTS_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO audit_events (
                created_at, stakeholder_id, user_email, role, client_id, path, action, result, detail, http_status, firm_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
            """,
            (
                datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
                resolved_stakeholder_id,
                email,
                role,
                "",
                str(request.url.path),
                audit_action,
                "success",
                "",
                firm_id,
            ),
        )
    return TokenResponse(access_token=token, expires_in=get_jwt_exp_seconds())


def _auth_token_response(token: str, expires_in: int) -> Response:
    """Issue JSON + httpOnly session cookie when enabled."""
    body: dict = {"access_token": token, "token_type": "bearer", "expires_in": expires_in}
    resp = JSONResponse(content=body)
    if session_cookie_enabled():
        resp.set_cookie(
            key=SESSION_COOKIE_NAME,
            value=token,
            httponly=True,
            secure=session_cookie_secure(),
            samesite="lax",
            max_age=expires_in,
            path="/",
        )
        attach_csrf_cookie(resp, max_age=expires_in)
    return resp


def _client_ip(request: Request) -> str:
    forwarded = (request.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
    if forwarded:
        return forwarded
    if request.client:
        return request.client.host or ""
    return ""




def _login_auth_error_for_email(email: str) -> HTTPException | None:
    from services.firm_members import list_members_by_email
    from services.firm_onboarding import MEMBER_STATUS_PENDING

    normalized = (email or "").strip().lower()
    rows = list_members_by_email(normalized)
    if any(m.status == MEMBER_STATUS_PENDING for m in rows):
        return HTTPException(
            status_code=403,
            detail={
                "code": "pending_approval",
                "message": "参加申請は送信済みです。代表税理士の承認をお待ちください。",
            },
        )
    return None


def _login_with_email(
    *,
    request: Request,
    email: str,
    requested_stakeholder_id: str,
    audit_action: str,
) -> TokenResponse:
    from services.super_admin import ensure_super_admin_member, is_super_admin_email

    if is_super_admin_email(email):
        member = ensure_super_admin_member(email)
        return _issue_session_token(
            request=request,
            email=email.strip().lower(),
            resolved_stakeholder_id=member.stakeholder_id,
            role="platform_admin",
            audit_action=audit_action,
            firm_id=member.firm_id,
            member_id=member.id,
        )
    member = resolve_member_for_login(
        email,
        requested_stakeholder_id,
        pick_allowed=login_stakeholder_pick_allowed(),
    )
    if not member:
        pending_err = _login_auth_error_for_email(email)
        if pending_err:
            raise pending_err
        raise HTTPException(
            status_code=403,
            detail={
                "code": "not_registered",
                "message": "この Google アカウントは DocuGrid に登録されていません。代表からの招待または参加申請が必要です。",
            },
        )
    role = _get_stakeholder_role_map().get(member.stakeholder_id) or member.firm_role
    if not role:
        raise HTTPException(status_code=400, detail="Unknown stakeholder")
    return _issue_session_token(
        request=request,
        email=email,
        resolved_stakeholder_id=member.stakeholder_id,
        role=role,
        audit_action=audit_action,
        firm_id=member.firm_id,
        member_id=member.id,
    )

__all__ = [
    "_auth_token_response",
    "_client_ip",
    "_issue_session_token",
    "_login_auth_error_for_email",
    "_login_with_email",
]
