"""DocuGrid API — firm routes."""

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

router = APIRouter()

def _screen_design_context(request: Request) -> tuple[str, str, str]:
    identity = resolve_identity(request)
    member = get_member_by_id(identity.member_id) or get_member_by_stakeholder_id(
        identity.stakeholder_id
    )
    pid = resolve_persona_id(
        stakeholder_id=identity.stakeholder_id,
        stored_persona_id=member.persona_id if member else None,
    )
    return pid, identity.firm_id or DEFAULT_FIRM_ID, identity.member_id or identity.stakeholder_id


@router.get("/api/screen-design/resolved")
async def get_screen_design_resolved(
    request: Request,
    persona_id: Optional[str] = Query(None),
):
    """Merged screen design (platform → firm → member) for the current user."""
    _require_permission(request, "client.view")
    pid, firm_id, member_id = _screen_design_context(request)
    target = (persona_id or pid).strip()
    return resolve_screen_design(persona_id=target, firm_id=firm_id, member_id=member_id)


@router.get("/api/screen-design/editor")
async def get_screen_design_editor(request: Request, persona_id: Optional[str] = Query(None)):
    """Editor payload: all layers + merge preview. Firm/platform need settings.manage."""
    _require_permission(request, "client.view")
    pid, firm_id, member_id = _screen_design_context(request)
    target = (persona_id or pid).strip()
    resolved = resolve_screen_design(persona_id=target, firm_id=firm_id, member_id=member_id)
    identity = resolve_identity(request)
    perms = _get_role_permissions().get(identity.role, set())
    return {
        "persona_id": target,
        "firm_id": firm_id,
        "member_id": member_id,
        "resolved": resolved,
        "platform": load_platform_design(),
        "firm": load_firm_design(firm_id),
        "member": load_member_design(firm_id, member_id),
        "can_edit_platform": "settings.platform" in perms,
        "can_edit_firm": "settings.manage" in perms,
        "can_edit_member": True,
    }


@router.put("/api/screen-design/platform")
async def put_screen_design_platform(request: Request, body: ScreenDesignSaveBody):
    _require_platform_settings(request)
    existing = load_platform_design()
    personas = dict(existing.get("personas") or {})
    personas.update(body.personas)
    saved = save_platform_design({"version": body.version, "personas": personas})
    _log_audit_event(request, "screen_design.platform.put", "success", f"personas={len(personas)}")
    return saved


@router.put("/api/screen-design/firm")
async def put_screen_design_firm(request: Request, body: ScreenDesignSaveBody):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    existing = load_firm_design(ctx.firm_id)
    personas = dict(existing.get("personas") or {})
    personas.update(body.personas)
    saved = save_firm_design(ctx.firm_id, {"version": body.version, "personas": personas})
    _log_audit_event(request, "screen_design.firm.put", "success", f"personas={len(personas)}")
    return saved


@router.put("/api/screen-design/member")
async def put_screen_design_member(request: Request, body: ScreenDesignSaveBody):
    ctx = _auth_context(request)
    existing = load_member_design(ctx.firm_id, ctx.member_id)
    personas = dict(existing.get("personas") or {})
    personas.update(body.personas)
    saved = save_member_design(
        ctx.firm_id,
        ctx.member_id,
        {"version": body.version, "personas": personas},
    )
    _log_audit_event(request, "screen_design.member.put", "success", f"personas={len(personas)}")
    return saved


@router.get("/api/auth/me", response_model=MeResponse)
async def auth_me(request: Request):
    identity = resolve_identity(request)
    from services.super_admin import all_app_permissions, is_super_admin_email

    if is_super_admin_email(identity.email):
        perms = sorted(all_app_permissions(KNOWN_APP_PERMISSIONS))
    else:
        perms = sorted(_get_role_permissions().get(identity.role, set()))
    ctx = build_auth_context(
        role=identity.role,
        email=identity.email,
        stakeholder_id=identity.stakeholder_id,
        firm_id=identity.firm_id,
        member_id=identity.member_id,
    )
    scope_map = _get_stakeholder_client_scope_map()
    fid = identity.firm_id or ""
    member = get_member_by_id(identity.member_id) or get_member_by_stakeholder_id(
        identity.stakeholder_id
    )
    pid = resolve_persona_id(
        stakeholder_id=identity.stakeholder_id,
        stored_persona_id=member.persona_id if member else None,
    )
    me = MeResponse(
        email=identity.email,
        role=identity.role,
        stakeholder_id=identity.stakeholder_id,
        firm_id=fid,
        firm_label=firm_label(fid),
        persona_id=pid,
        persona_label=persona_label(pid),
        permissions=perms,
        visible_client_ids=sorted(visible_client_ids(ctx, scope_map)),
    )
    resp = JSONResponse(content=me.model_dump())
    ensure_csrf_cookie_on_response(request, resp)
    return resp


@router.post("/api/auth/mcp-token", response_model=McpTokenResponse)
async def issue_mcp_token(request: Request):
    """Issue a short-lived JWT for DocuGrid MCP (Cursor / Claude Desktop). Same permissions as the current user."""
    identity = resolve_identity(request)
    actor_key = f"{identity.member_id}:{identity.email}"
    if mcp_token_rate_limit_exceeded(actor_key):
        _log_audit_event(request, "auth.mcp_token.issue", "denied", "rate_limit")
        raise HTTPException(status_code=429, detail="MCP token issuance rate limit exceeded")
    exp_seconds = get_mcp_jwt_exp_seconds()
    token = create_mcp_access_token(
        sub=identity.email,
        role=identity.role,
        stid=identity.stakeholder_id,
        firm_id=identity.firm_id,
        member_id=identity.member_id,
    )
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=exp_seconds)).isoformat()
    _log_audit_event(request, "auth.mcp_token.issue", "success", f"expires_in={exp_seconds}")
    return McpTokenResponse(
        access_token=token,
        expires_in=exp_seconds,
        expires_at=expires_at,
    )


@router.get("/api/audit-events", response_model=List[AuditEventItem])
async def list_audit_events(
    request: Request,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    from_ts: Optional[str] = None,
    to_ts: Optional[str] = None,
    client_id: Optional[str] = None,
    stakeholder_id: Optional[str] = None,
    action: Optional[str] = None,
    result: Optional[str] = Query(
        None,
        description="success, denied, or omit for all",
    ),
    path_contains: Optional[str] = None,
    http_status: Optional[int] = Query(None, ge=100, le=599),
):
    role = _require_permission(request, "settings.manage")
    _require_client_scope(request, role)
    ctx = _auth_context(request)
    _init_audit_events_db()
    clauses: list[str] = ["firm_id = ?"]
    params: list[object] = [ctx.firm_id]
    if http_status is not None:
        clauses.append("http_status = ?")
        params.append(http_status)
    if from_ts:
        clauses.append("created_at >= ?")
        params.append(from_ts)
    if to_ts:
        clauses.append("created_at <= ?")
        params.append(to_ts)
    if client_id:
        clauses.append("client_id = ?")
        params.append(client_id)
    if stakeholder_id:
        clauses.append("stakeholder_id = ?")
        params.append(stakeholder_id)
    if action:
        clauses.append("action LIKE ?")
        params.append(f"%{action}%")
    if result in ("success", "denied"):
        clauses.append("result = ?")
        params.append(result)
    if path_contains:
        clauses.append("path LIKE ?")
        params.append(f"%{path_contains}%")

    where_sql = " AND ".join(clauses)
    sql = f"""
        SELECT id, created_at, stakeholder_id, user_email, role, client_id, path, action, result, detail, http_status
        FROM audit_events
        WHERE {where_sql}
        ORDER BY id DESC
        LIMIT ? OFFSET ?
    """
    params.extend([limit, offset])
    with sqlite3.connect(AUDIT_EVENTS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(sql, params).fetchall()
    items = [
        AuditEventItem(
            id=int(row["id"]),
            created_at=str(row["created_at"]),
            stakeholder_id=row["stakeholder_id"],
            user_email=row["user_email"],
            role=row["role"],
            client_id=row["client_id"],
            path=str(row["path"]),
            action=str(row["action"]),
            result=str(row["result"]),
            detail=row["detail"],
            http_status=row["http_status"],
        )
        for row in rows
    ]
    _log_audit_event(request, "audit_events.list", "success", f"rows={len(items)}")
    return items

