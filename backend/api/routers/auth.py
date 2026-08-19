"""DocuGrid API — auth routes."""

from __future__ import annotations

from fastapi import APIRouter

from api.router_imports import *  # noqa: F403
from api.constants import *  # noqa: F403
from api.deps import *  # noqa: F403
from api.persistence import *  # noqa: F403
from api.master_store import *  # noqa: F403
from api.session import *  # noqa: F403
from api.billing_access import *  # noqa: F403
from api.schemas import *  # noqa: F403
from api.route_helpers import *  # noqa: F403
from services import google_oauth as _google_oauth
from services import stripe_billing_service as _stripe

router = APIRouter()

@router.get("/api/auth/config", response_model=AuthConfigResponse)
async def auth_config() -> AuthConfigResponse:
    """Public auth UI config (client id is not secret)."""
    return AuthConfigResponse(
        google_client_id=get_google_oauth_client_id(),
        password_login_enabled=password_login_allowed(),
        session_cookie=session_cookie_enabled(),
        legacy_files=legacy_files_enabled(),
        csrf=csrf_protection_enabled(),
    )


@router.post("/api/auth/logout")
async def auth_logout() -> JSONResponse:
    resp = JSONResponse(content={"ok": True})
    resp.delete_cookie(SESSION_COOKIE_NAME, path="/")
    clear_csrf_cookie(resp)
    return resp


@router.post("/api/auth/google")
async def auth_google(body: GoogleLoginRequest, request: Request):
    if login_rate_limit_exceeded(_client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many login attempts")
    claims = _google_oauth.verify_google_id_token(body.credential)
    if not claims.get("email_verified"):
        raise HTTPException(status_code=403, detail="Google email is not verified")
    email = str(claims.get("email") or "").strip()
    if not email:
        raise HTTPException(status_code=400, detail="Google account has no email")
    display_name = str(claims.get("name") or "").strip() or None
    invite_token = (body.invite_token or "").strip()
    if invite_token:
        from services.firm_onboarding import accept_invite

        try:
            member = accept_invite(token=invite_token, email=email, display_name=display_name)
        except ValueError as exc:
            code = str(exc)
            if code == "invite_email_mismatch":
                raise HTTPException(
                    status_code=403,
                    detail={
                        "code": code,
                        "message": "招待されたメールアドレスと Google アカウントが一致しません。",
                    },
                ) from exc
            if code in ("invite_invalid", "invite_expired"):
                raise HTTPException(
                    status_code=400,
                    detail={"code": code, "message": "招待リンクが無効または期限切れです。"},
                ) from exc
            raise
        role = _get_stakeholder_role_map().get(member.stakeholder_id) or member.firm_role
        token_resp = _issue_session_token(
            request=request,
            email=email,
            resolved_stakeholder_id=member.stakeholder_id,
            role=role,
            audit_action="auth.google.invite",
            firm_id=member.firm_id,
            member_id=member.id,
        )
        return _auth_token_response(token_resp.access_token, token_resp.expires_in)
    token_resp = _login_with_email(
        request=request,
        email=email,
        requested_stakeholder_id="",
        audit_action="auth.google",
    )
    return _auth_token_response(token_resp.access_token, token_resp.expires_in)


@router.get("/api/auth/invite-preview")
async def auth_invite_preview(token: str = Query(..., min_length=8)):
    from services.firm_onboarding import preview_invite

    preview = preview_invite(token.strip())
    if not preview:
        raise HTTPException(status_code=404, detail="invite_not_found")
    return preview


@router.post("/api/auth/register-firm")
async def auth_register_firm(body: FirmRegisterBody, request: Request):
    if login_rate_limit_exceeded(_client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many login attempts")
    claims = _google_oauth.verify_google_id_token(body.credential)
    if not claims.get("email_verified"):
        raise HTTPException(status_code=403, detail="Google email is not verified")
    email = str(claims.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Google account has no email")
    from services.firm_members import list_members_by_email
    from services.firm_onboarding import create_firm_with_representative
    from services.super_admin import ensure_super_admin_member, is_super_admin_email

    if is_super_admin_email(email):
        member = ensure_super_admin_member(email)
        role = _get_stakeholder_role_map().get(member.stakeholder_id) or member.firm_role
        token_resp = _issue_session_token(
            request=request,
            email=email,
            resolved_stakeholder_id=member.stakeholder_id,
            role=role,
            audit_action="auth.register_firm",
            firm_id=member.firm_id,
            member_id=member.id,
        )
        _log_audit_event(request, "auth.register_firm", "success", f"super_admin={email}")
        return _auth_token_response(token_resp.access_token, token_resp.expires_in)

    if list_members_by_email(email):
        raise HTTPException(
            status_code=409,
            detail={"code": "already_member", "message": "このメールは既に事務所に登録されています。"},
        )
    try:
        _, join_code, member = create_firm_with_representative(
            firm_label=body.firm_label.strip(),
            rep_email=email,
            rep_display_name=(body.display_name or "").strip()
            or str(claims.get("name") or "").strip()
            or None,
        )
    except ValueError as exc:
        if str(exc) == "prolext_firm_exists":
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "prolext_firm_exists",
                    "message": "PROLEXT税理士法人は既に登録済みです。事務所コードで参加申請してください。",
                },
            ) from exc
        raise
    role = _get_stakeholder_role_map().get(member.stakeholder_id) or member.firm_role
    token_resp = _issue_session_token(
        request=request,
        email=email,
        resolved_stakeholder_id=member.stakeholder_id,
        role=role,
        audit_action="auth.register_firm",
        firm_id=member.firm_id,
        member_id=member.id,
    )
    _log_audit_event(request, "auth.register_firm", "success", f"firm={member.firm_id} join={join_code}")
    return _auth_token_response(token_resp.access_token, token_resp.expires_in)


@router.post("/api/auth/join-request")
async def auth_join_request(body: FirmJoinRequestBody, request: Request):
    if login_rate_limit_exceeded(_client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many login attempts")
    claims = _google_oauth.verify_google_id_token(body.credential)
    if not claims.get("email_verified"):
        raise HTTPException(status_code=403, detail="Google email is not verified")
    email = str(claims.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Google account has no email")
    from services.firm_onboarding import create_join_request

    try:
        member = create_join_request(
            join_code=body.join_code.strip(),
            email=email,
            display_name=str(claims.get("name") or "").strip() or None,
        )
    except ValueError as exc:
        code = str(exc)
        messages = {
            "join_code_invalid": "事務所コードが正しくありません。",
            "already_member": "このアカウントは既に登録済みです。ログインしてください。",
            "already_pending": "参加申請は送信済みです。代表税理士の承認をお待ちください。",
        }
        raise HTTPException(
            status_code=400,
            detail={"code": code, "message": messages.get(code, code)},
        ) from exc
    _log_audit_event(
        request,
        "auth.join_request",
        "success",
        f"firm={member.firm_id} email={email}",
    )
    raise HTTPException(
        status_code=403,
        detail={
            "code": "pending_approval",
            "message": "参加申請を送信しました。代表税理士の承認後にログインできます。",
            "firmId": member.firm_id,
        },
    )


@router.post("/api/auth/login")
async def auth_login(body: LoginRequest, request: Request):
    if login_rate_limit_exceeded(_client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many login attempts")
    if not password_login_allowed():
        raise HTTPException(status_code=403, detail="Password login is disabled")
    expected = os.environ.get("DOCUGRID_LOGIN_PASSWORD", "password")
    if body.password != expected:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token_resp = _login_with_email(
        request=request,
        email=body.email,
        requested_stakeholder_id=body.stakeholder_id,
        audit_action="auth.login",
    )
    return _auth_token_response(token_resp.access_token, token_resp.expires_in)


@router.get("/api/firm-members", response_model=List[FirmMemberItem])
async def get_firm_members(request: Request):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    members = list_members_for_firm(ctx.firm_id)
    return [
        FirmMemberItem(
            id=m.id,
            email=m.email,
            stakeholder_id=m.stakeholder_id,
            firm_role=m.firm_role,
            persona_id=m.persona_id or resolve_persona_id(
                stakeholder_id=m.stakeholder_id,
                stored_persona_id=m.persona_id,
            ),
            status=m.status,
            display_name=m.display_name,
        )
        for m in members
    ]


@router.get("/api/firm/onboarding")
async def get_firm_onboarding(request: Request):
    _require_firm_billing_owner(request)
    ctx = _auth_context(request)
    from services.firm_onboarding import get_firm_join_code, get_firm_label, pending_members_for_firm

    join_code = get_firm_join_code(ctx.firm_id)
    pending = pending_members_for_firm(ctx.firm_id)
    return {
        "firmId": ctx.firm_id,
        "firmLabel": get_firm_label(ctx.firm_id),
        "joinCode": join_code,
        "pendingCount": len(pending),
        "isBillingOwner": True,
    }


@router.post("/api/firm-members/invite")
async def post_firm_member_invite(request: Request, body: FirmMemberInviteBody):
    ctx = _require_firm_billing_owner(request)
    from services.firm_onboarding import create_member_invite
    from services.stripe_client import frontend_base_url

    from services.firm_members import ASSIGNABLE_FIRM_ROLES

    role = (body.firm_role or "operator").strip()
    if role not in ASSIGNABLE_FIRM_ROLES:
        raise HTTPException(status_code=400, detail="Invalid firm_role")
    try:
        invite = create_member_invite(
            firm_id=ctx.firm_id,
            email=body.email,
            invited_by_member_id=ctx.member_id,
            firm_role=role,
            persona_id=body.persona_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    base = frontend_base_url().rstrip("/")
    invite_url = f"{base}/login?invite={invite.token}"
    _log_audit_event(request, "firm_members.invite", "success", body.email)
    return {
        "id": invite.id,
        "email": invite.email,
        "token": invite.token,
        "inviteUrl": invite_url,
        "expiresAt": invite.expires_at,
    }


@router.patch("/api/firm-members/{member_id}", response_model=FirmMemberItem)
async def patch_firm_member(request: Request, member_id: str, body: FirmMemberPatchBody):
    ctx = _require_firm_billing_owner(request)
    from services.firm_members import ASSIGNABLE_FIRM_ROLES, update_member_fields
    from services.firm_onboarding import MEMBER_STATUS_PENDING, approve_pending_member, reject_pending_member

    def _item(m) -> FirmMemberItem:
        return FirmMemberItem(
            id=m.id,
            email=m.email,
            stakeholder_id=m.stakeholder_id,
            firm_role=m.firm_role,
            persona_id=m.persona_id or resolve_persona_id(
                stakeholder_id=m.stakeholder_id,
                stored_persona_id=m.persona_id,
            ),
            status=m.status,
            display_name=m.display_name,
        )

    member = get_member_by_id(member_id)
    if not member or member.firm_id != ctx.firm_id:
        raise HTTPException(status_code=404, detail="Member not found")
    if body.firm_role is not None and body.firm_role not in ASSIGNABLE_FIRM_ROLES:
        raise HTTPException(status_code=400, detail="Invalid firm_role")

    if member.status == MEMBER_STATUS_PENDING:
        if body.status == MEMBER_STATUS_ACTIVE:
            member = approve_pending_member(member_id, firm_id=ctx.firm_id)
        elif body.status == MEMBER_STATUS_INACTIVE:
            member = reject_pending_member(member_id, firm_id=ctx.firm_id)
            if not member:
                raise HTTPException(status_code=404, detail="Member not found")
            _log_audit_event(request, "firm_members.patch", "success", f"member={member_id} rejected")
            return _item(member)
        elif body.status is not None:
            raise HTTPException(status_code=400, detail="Invalid status for pending member")
        if not member:
            raise HTTPException(status_code=404, detail="Member not found")

    profile_status = None
    if body.status in (MEMBER_STATUS_ACTIVE, MEMBER_STATUS_INACTIVE) and member.status != MEMBER_STATUS_PENDING:
        # Pending→active already handled; only toggle active members here.
        if member.status != body.status or body.status == MEMBER_STATUS_INACTIVE:
            profile_status = body.status

    if profile_status is not None or body.firm_role is not None or body.persona_id is not None or body.display_name is not None:
        try:
            updated = update_member_fields(
                member_id,
                firm_id=ctx.firm_id,
                status=profile_status,
                firm_role=body.firm_role,
                persona_id=body.persona_id,
                display_name=body.display_name,
            )
        except ValueError as exc:
            if str(exc) == "last_firm_admin":
                raise HTTPException(
                    status_code=400,
                    detail={"code": "last_firm_admin", "message": "最後の firm_admin は変更できません"},
                ) from exc
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if updated:
            member = updated

    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    _log_audit_event(
        request,
        "firm_members.patch",
        "success",
        f"member={member_id} status={member.status} role={member.firm_role}",
    )
    return _item(member)


@router.get("/api/role-permissions", response_model=RolePermissionsPayload)
async def get_role_permissions(request: Request):
    _require_platform_settings(request)
    payload = _role_permissions_payload_from_store()
    _log_audit_event(request, "role_permissions.get", "success")
    return payload


@router.put("/api/role-permissions", response_model=RolePermissionsPayload)
async def update_role_permissions(request: Request, payload: RolePermissionsPayload):
    _require_platform_settings(request)
    saved = _save_role_permissions(payload)
    _log_audit_event(request, "role_permissions.put", "success")
    return saved


