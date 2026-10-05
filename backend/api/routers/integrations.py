"""DocuGrid API — integrations routes."""

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

def _require_authenticated(request: Request) -> None:
    identity = resolve_identity(request)
    if not identity.email and not identity.role:
        raise HTTPException(status_code=401, detail="Authentication required")


@router.get("/api/drive/status", response_model=DriveStatusPayload)
async def get_drive_status(request: Request):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    cfg = _load_system_config(ctx.firm_id)
    from services.drive_context import get_drive_connected_email, resolve_drive_auth_method
    from services.drive_oauth import drive_oauth_configured
    from services.drive_share import describe_root_location

    connected_email = get_drive_connected_email(ctx.firm_id)
    location = describe_root_location(ctx.firm_id, cfg.drive_root_folder_id)
    from services.drive_share import build_office_visibility_hints

    hints = build_office_visibility_hints(
        ctx.firm_id,
        connected_email=connected_email,
        root_location=str(location.get("location") or "none"),
    )
    return DriveStatusPayload(
        google_drive_connected=cfg.google_drive_connected,
        drive_root_folder_id=cfg.drive_root_folder_id,
        drive_credentials_configured=cfg.drive_credentials_configured,
        drive_mode=resolve_drive_mode(ctx.firm_id),
        service_account_email=get_drive_service_account_email(ctx.firm_id),
        auth_method=resolve_drive_auth_method(ctx.firm_id),
        connected_email=connected_email,
        oauth_available=drive_oauth_configured(),
        root_location=str(location.get("location") or "none"),
        shared_drive_id=location.get("shared_drive_id"),
        shared_drive_name=location.get("shared_drive_name"),
        office_visible=bool(location.get("office_visible")),
        needs_office_share=bool(location.get("needs_office_share")),
        shared_member_emails=list(location.get("shared_member_emails") or []),
        eligible_member_emails=list(hints.get("eligible_member_emails") or []),
        eligible_member_count=int(hints.get("eligible_member_count") or 0),
        office_hints=list(hints.get("office_hints") or []),
    )


@router.get("/api/drive/oauth/start", response_model=DriveOAuthStartPayload)
async def drive_oauth_start(request: Request):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    from services.drive_oauth import (
        build_authorize_url,
        drive_oauth_redirect_uri,
    )
    from services.drive import DriveConfigurationError

    try:
        url = build_authorize_url(firm_id=ctx.firm_id, actor_email=ctx.email)
    except DriveConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    _log_audit_event(request, "drive.oauth.start", "success")
    return DriveOAuthStartPayload(authorize_url=url, redirect_uri=drive_oauth_redirect_uri())


@router.get("/api/drive/oauth/callback")
async def drive_oauth_callback(
    request: Request,
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
):
    """Google redirects here (unauthenticated). State JWT carries firm_id."""
    from fastapi.responses import RedirectResponse
    from services.drive_oauth import (
        complete_oauth_callback,
        drive_oauth_frontend_return_url,
    )
    from services.drive import DriveConfigurationError
    from services.drive_context import invalidate_drive_service_cache

    if error:
        return RedirectResponse(drive_oauth_frontend_return_url(ok=False, error=str(error)))
    if not code or not state:
        return RedirectResponse(drive_oauth_frontend_return_url(ok=False, error="missing_code_or_state"))
    try:
        result = complete_oauth_callback(code, state)
    except (DriveConfigurationError, KeyError, ValueError) as exc:
        return RedirectResponse(drive_oauth_frontend_return_url(ok=False, error=str(exc)[:80]))

    firm_id = result["firm_id"]
    invalidate_drive_service_cache(firm_id)
    existing = _load_system_config(firm_id)
    body = SystemConfigUpdateBody(
        google_drive_connected=True,
        notification_email_enabled=existing.notification_email_enabled,
        ocr_auto_extract_enabled=existing.ocr_auto_extract_enabled,
        alert_consumption_tax_months_before_due=existing.alert_consumption_tax_months_before_due,
        alert_corporate_tax_months_before_due=existing.alert_corporate_tax_months_before_due,
        ai_openai_enabled=existing.ai_openai_enabled,
        ai_openai_model=existing.ai_openai_model,
        ai_gemini_enabled=existing.ai_gemini_enabled,
        ai_gemini_model=existing.ai_gemini_model,
        drive_root_folder_id=result["root_folder_id"],
        matrix_year_display_count=existing.matrix_year_display_count,
    )
    _save_system_config(firm_id, body)
    _log_audit_event(request, "drive.oauth.callback", "success", f"firm={firm_id}")
    return RedirectResponse(drive_oauth_frontend_return_url(ok=True))


@router.delete("/api/drive/oauth")
async def drive_oauth_disconnect(request: Request):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    from services.drive_oauth import clear_drive_oauth
    from services.drive_context import invalidate_drive_service_cache

    clear_drive_oauth(ctx.firm_id)
    invalidate_drive_service_cache(ctx.firm_id)
    existing = _load_system_config(ctx.firm_id)
    # Keep SA credentials if present; only turn mirror off when neither auth remains.
    still = drive_credentials_configured(ctx.firm_id)
    body = SystemConfigUpdateBody(
        google_drive_connected=existing.google_drive_connected and still,
        notification_email_enabled=existing.notification_email_enabled,
        ocr_auto_extract_enabled=existing.ocr_auto_extract_enabled,
        alert_consumption_tax_months_before_due=existing.alert_consumption_tax_months_before_due,
        alert_corporate_tax_months_before_due=existing.alert_corporate_tax_months_before_due,
        ai_openai_enabled=existing.ai_openai_enabled,
        ai_openai_model=existing.ai_openai_model,
        ai_gemini_enabled=existing.ai_gemini_enabled,
        ai_gemini_model=existing.ai_gemini_model,
        drive_root_folder_id=existing.drive_root_folder_id if still else None,
        matrix_year_display_count=existing.matrix_year_display_count,
    )
    _save_system_config(ctx.firm_id, body)
    _log_audit_event(request, "drive.oauth.disconnect", "success")
    return {"ok": True}


@router.get("/api/drive/shared-drives", response_model=DriveSharedDrivesPayload)
async def get_drive_shared_drives(request: Request):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    if not drive_credentials_configured(ctx.firm_id):
        raise HTTPException(status_code=400, detail="Google Drive が未接続です")
    from services.drive_share import list_accessible_shared_drives
    from services.drive import DriveConfigurationError

    try:
        drives = list_accessible_shared_drives(ctx.firm_id)
    except DriveConfigurationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"共有ドライブ一覧を取得できませんでした: {exc}",
        ) from exc
    from services.drive_context import get_drive_connected_email

    connected = get_drive_connected_email(ctx.firm_id)
    empty_hint = None
    if not drives:
        empty_hint = (
            f"一覧が空です。Google Drive で共有ドライブを開き、"
            f"{connected or '接続アカウント'} をメンバーに追加してから「一覧を更新」してください。"
            "（個人のマイドライブだけのアカウントでは共有ドライブは出ません）"
        )
    return DriveSharedDrivesPayload(
        drives=[DriveSharedDriveItem(id=d["id"], name=d.get("name") or "") for d in drives],
        empty_hint=empty_hint,
        connected_email=connected,
    )


@router.post("/api/drive/use-shared-drive")
async def post_drive_use_shared_drive(request: Request, body: DriveUseSharedDriveBody):
    """Point firm root at DocuGrid folder inside a shared drive (office-visible)."""
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    if not drive_credentials_configured(ctx.firm_id):
        raise HTTPException(status_code=400, detail="Google Drive が未接続です")
    from services.drive_share import use_shared_drive_root
    from services.drive import DriveConfigurationError

    try:
        result = use_shared_drive_root(ctx.firm_id, body.shared_drive_id)
    except DriveConfigurationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"共有ドライブの設定に失敗: {exc}") from exc

    existing = _load_system_config(ctx.firm_id)
    update = SystemConfigUpdateBody(
        google_drive_connected=True,
        notification_email_enabled=existing.notification_email_enabled,
        ocr_auto_extract_enabled=existing.ocr_auto_extract_enabled,
        alert_consumption_tax_months_before_due=existing.alert_consumption_tax_months_before_due,
        alert_corporate_tax_months_before_due=existing.alert_corporate_tax_months_before_due,
        ai_openai_enabled=existing.ai_openai_enabled,
        ai_openai_model=existing.ai_openai_model,
        ai_gemini_enabled=existing.ai_gemini_enabled,
        ai_gemini_model=existing.ai_gemini_model,
        drive_root_folder_id=result["root_folder_id"],
        matrix_year_display_count=existing.matrix_year_display_count,
    )
    _save_system_config(ctx.firm_id, update)
    _log_audit_event(
        request,
        "drive.use_shared_drive",
        "success",
        f"drive={body.shared_drive_id}",
    )
    return result


@router.post("/api/drive/share-with-firm", response_model=DriveShareFirmPayload)
async def post_drive_share_with_firm(request: Request):
    """Share My Drive DocuGrid root with active firm member emails."""
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    if not drive_credentials_configured(ctx.firm_id):
        raise HTTPException(status_code=400, detail="Google Drive が未接続です")
    from services.drive_share import share_root_with_firm_members
    from services.drive import DriveConfigurationError
    from services.drive_context import get_drive_connected_email

    try:
        result = share_root_with_firm_members(
            ctx.firm_id,
            connected_email=get_drive_connected_email(ctx.firm_id),
        )
    except DriveConfigurationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"メンバー共有に失敗: {exc}") from exc
    _log_audit_event(request, "drive.share_with_firm", "success")
    cfg = _load_system_config(ctx.firm_id)
    from services.drive_share import eligible_member_emails_for_share

    eligible = eligible_member_emails_for_share(
        ctx.firm_id,
        connected_email=get_drive_connected_email(ctx.firm_id),
    )
    tip = None
    failed = list(result.get("failed") or [])
    if failed:
        tip = (
            "失敗したメールは Google アカウントとして存在しないか、共有権限が拒否されています。"
            "メンバー招待メールを実在の Google（Workspace）アカウントに合わせてください。"
        )
    elif not eligible and result.get("mode") == "member_emails":
        tip = "共有対象のメンバーがいません。Google ログインと同じメールでメンバーを招待してください。"
    return DriveShareFirmPayload(
        ok=bool(result.get("ok", True)),
        mode=str(result.get("mode") or "member_emails"),
        shared=list(result.get("shared") or []),
        already=list(result.get("already") or []),
        failed=failed,
        domain=result.get("domain"),
        message=str(result.get("message") or ""),
        root_folder_id=cfg.drive_root_folder_id,
        eligible_member_emails=eligible,
        tip=tip,
    )


@router.post("/api/drive/test")
async def test_drive_connection(request: Request):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    cfg = _load_system_config(ctx.firm_id)
    if not drive_credentials_configured(ctx.firm_id):
        raise HTTPException(
            status_code=400,
            detail="Google Drive が未接続です。設定 → Google Drive から接続してください。",
        )
    if not cfg.drive_root_folder_id:
        raise HTTPException(
            status_code=400,
            detail="drive_root_folder_id を設定してください（共有ドライブ内フォルダの ID）",
        )
    try:
        svc = get_drive_service(ctx.firm_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Drive 接続に失敗しました: {exc}") from exc
    ping = svc.ping_root_folder(cfg.drive_root_folder_id)
    if not ping.get("ok"):
        raise HTTPException(status_code=400, detail=ping.get("error", "Drive ping failed"))
    probe = svc.ensure_folder_path(["TAXX", "_healthcheck"], cfg.drive_root_folder_id)
    _log_audit_event(request, "drive.test", "success", f"folder={probe}")
    return {
        "ok": True,
        "mode": "live",
        "auth_method": getattr(svc, "auth_method", "unknown"),
        "root_folder_id": cfg.drive_root_folder_id,
        "root_folder_name": ping.get("folder_name"),
        "healthcheck_folder_id": probe,
    }


@router.post("/api/drive/credentials")
async def upload_drive_credentials(request: Request, file: UploadFile = File(...)):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty credentials file")
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise HTTPException(status_code=400, detail="Credentials must be valid JSON")
    if data.get("type") != "service_account":
        raise HTTPException(status_code=400, detail="Service account JSON required")
    if not (data.get("client_email") or "").strip():
        raise HTTPException(status_code=400, detail="client_email missing in credentials")
    save_drive_credentials(ctx.firm_id, data)
    invalidate_drive_service_cache(ctx.firm_id)
    _log_audit_event(request, "drive.credentials.put", "success")
    return {"ok": True, "service_account_email": data.get("client_email")}


@router.delete("/api/drive/credentials")
async def delete_drive_credentials(request: Request):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    clear_drive_credentials(ctx.firm_id)
    invalidate_drive_service_cache(ctx.firm_id)
    _log_audit_event(request, "drive.credentials.delete", "success")
    return {"ok": True}


@router.get("/api/integrations/moneytree/firm-status", response_model=MoneytreeFirmStatusPayload)
async def get_moneytree_firm_status(request: Request):
    """事務所側: 顧問先ごとの連携状況（閲覧のみ。接続操作は顧問先ワークスペース）。"""
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    scope_map = _get_stakeholder_client_scope_map()
    client_ids = sorted(visible_client_ids(ctx, scope_map))
    rows = firm_clients_status(ctx.firm_id, client_ids)
    _log_audit_event(request, "moneytree.firm_status", "success", f"count={len(rows)}")
    return MoneytreeFirmStatusPayload(
        clients=[MoneytreeFirmClientStatusItem(**row) for row in rows],
    )


@router.get("/api/integrations/moneytree/status", response_model=MoneytreeStatusPayload)
async def get_moneytree_status(
    request: Request,
    client_id: str = Query(..., min_length=1),
):
    ctx = _require_moneytree_client(request, client_id)
    try:
        payload = moneytree_status_payload(ctx.firm_id, client_id)
    except ValueError as exc:
        if str(exc) == "client_id_required":
            raise HTTPException(status_code=400, detail="client_id_required") from exc
        raise
    _log_audit_event(request, "moneytree.status", "success", client_id)
    return MoneytreeStatusPayload(**payload)


@router.get("/api/integrations/moneytree/connect", response_model=MoneytreeConnectPayload)
async def get_moneytree_connect(
    request: Request,
    client_id: str = Query(..., min_length=1),
    return_path: Optional[str] = Query(None),
):
    ctx = _require_moneytree_client(request, client_id, write=True)
    if not is_moneytree_configured():
        raise HTTPException(status_code=503, detail="moneytree_not_configured")
    try:
        result = build_authorize_url(
            ctx.firm_id,
            client_id,
            return_path=(return_path or "").strip(),
        )
    except ValueError as exc:
        if str(exc) == "client_id_required":
            raise HTTPException(status_code=400, detail="client_id_required") from exc
        raise
    except RuntimeError as exc:
        if str(exc) == "moneytree_not_configured":
            raise HTTPException(status_code=503, detail="moneytree_not_configured") from exc
        raise
    _log_audit_event(request, "moneytree.connect", "success", client_id)
    return MoneytreeConnectPayload(**result)


@router.get("/api/integrations/moneytree/callback")
async def moneytree_oauth_callback(
    request: Request,
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
):
    return_path: str | None = None
    if error:
        return RedirectResponse(callback_redirect_url(False, error, return_path=return_path))
    if not code or not state:
        return RedirectResponse(callback_redirect_url(False, "missing_code_or_state"))
    try:
        _, _, return_path = handle_oauth_callback(code, state)
    except KeyError:
        return RedirectResponse(callback_redirect_url(False, "invalid_state"))
    except RuntimeError as exc:
        return RedirectResponse(callback_redirect_url(False, str(exc), return_path=return_path))
    _log_audit_event(request, "moneytree.callback", "success")
    return RedirectResponse(callback_redirect_url(True, return_path=return_path))


@router.post("/api/integrations/moneytree/mock-connect")
async def moneytree_mock_connect(
    request: Request,
    client_id: str = Query(..., min_length=1),
):
    ctx = _require_moneytree_client(request, client_id, write=True)
    if not is_mock_mode():
        raise HTTPException(status_code=403, detail="mock_mode_disabled")
    try:
        mock_connect(ctx.firm_id, client_id)
    except ValueError as exc:
        if str(exc) == "client_id_required":
            raise HTTPException(status_code=400, detail="client_id_required") from exc
        raise
    _log_audit_event(request, "moneytree.mock_connect", "success", client_id)
    return {"ok": True}


@router.post("/api/integrations/moneytree/sync", response_model=MoneytreeSyncPayload)
async def moneytree_sync(
    request: Request,
    client_id: str = Query(..., min_length=1),
):
    ctx = _require_moneytree_client(request, client_id, write=True)
    try:
        result = sync_moneytree_accounts(ctx.firm_id, client_id)
    except KeyError:
        raise HTTPException(status_code=400, detail="not_connected") from None
    _log_audit_event(
        request,
        "moneytree.sync",
        "success",
        f"client={client_id} accounts={result['accounts_synced']} txns={result['transactions_synced']}",
    )
    return MoneytreeSyncPayload(**result)


@router.get("/api/integrations/moneytree/accounts")
async def moneytree_accounts(
    request: Request,
    client_id: str = Query(..., min_length=1),
):
    ctx = _require_moneytree_client(request, client_id)
    rows = list_moneytree_accounts(ctx.firm_id, client_id)
    _log_audit_event(request, "moneytree.accounts", "success", f"client={client_id} count={len(rows)}")
    return {"accounts": rows}


@router.get("/api/integrations/moneytree/transactions")
async def moneytree_transactions(
    request: Request,
    client_id: str = Query(..., min_length=1),
    account_external_id: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    ctx = _require_moneytree_client(request, client_id)
    rows = list_moneytree_transactions(
        ctx.firm_id,
        client_id,
        account_external_id=account_external_id,
        limit=limit,
    )
    _log_audit_event(request, "moneytree.transactions", "success", f"client={client_id} count={len(rows)}")
    return {"transactions": rows}


@router.get("/api/integrations/moneytree/vault-url")
async def moneytree_vault_url(
    request: Request,
    client_id: str = Query(..., min_length=1),
):
    _require_moneytree_client(request, client_id, write=True)
    url = build_vault_url()
    if not url:
        raise HTTPException(status_code=503, detail="vault_url_unavailable")
    return {"vault_url": url}


@router.delete("/api/integrations/moneytree/disconnect")
async def moneytree_disconnect(
    request: Request,
    client_id: str = Query(..., min_length=1),
):
    ctx = _require_moneytree_client(request, client_id, write=True)
    disconnect_moneytree(ctx.firm_id, client_id)
    _log_audit_event(request, "moneytree.disconnect", "success", client_id)
    return {"ok": True}


@router.get("/api/client-master", response_model=ClientMasterPayload)
async def get_client_master(request: Request):
    # 全ロール（viewer 含む）が顧客名・関係グループを参照できる必要があるため client.view で許可。
    # 編集（PUT）は settings.manage のまま。
    role = _require_permission(request, "client.view")
    payload = _load_client_master()
    ctx = _auth_context(request)
    allowed = visible_client_ids(ctx, _get_stakeholder_client_scope_map())
    filtered_clients = filter_client_master_clients(payload.clients, ctx, _get_stakeholder_client_scope_map())
    filtered_groups = [
        g
        for g in payload.groups
        if any(cid in allowed for cid in g.clientIds)
    ]
    filtered_relations = [
        r
        for r in payload.relations
        if r.fromClientId in allowed and r.toClientId in allowed
    ]
    filtered_layouts = {
        k: v
        for k, v in payload.relationLayouts.items()
        if k.split("__", 1)[0] in allowed
    }
    payload = ClientMasterPayload(
        clients=filtered_clients,
        groups=filtered_groups,
        relations=filtered_relations,
        relationLayouts=filtered_layouts,
        updated_at=payload.updated_at,
    )
    _log_audit_event(request, "client_master.get", "success", f"clients={len(payload.clients)}")
    return payload


@router.put("/api/client-master", response_model=ClientMasterPayload)
async def update_client_master(request: Request, payload: ClientMasterPayload):
    role = _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    scope_map = _get_stakeholder_client_scope_map()
    existing_map = get_client_firm_map()
    for client in payload.clients:
        mapped = existing_map.get(client.id)
        if mapped is not None and mapped != ctx.firm_id:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot modify client {client.id!r} belonging to another firm",
            )
        if mapped is not None:
            authorize_client_access(ctx, client.id, scope_map)
    _validate_client_master(payload)
    merged = _merge_client_master_for_firm(ctx, payload)
    saved = _save_client_master(merged)
    client_count, _ = _firm_usage_counts(ctx.firm_id)
    try:
        sync_firm_billing_usage(ctx.firm_id, client_count)
    except Exception:
        pass
    allowed = visible_client_ids(ctx, scope_map)
    saved = ClientMasterPayload(
        clients=filter_client_master_clients(saved.clients, ctx, scope_map),
        groups=[g for g in saved.groups if any(cid in allowed for cid in g.clientIds)],
        relations=[
            r
            for r in saved.relations
            if r.fromClientId in allowed and r.toClientId in allowed
        ],
        relationLayouts={
            k: v
            for k, v in saved.relationLayouts.items()
            if k.split("__", 1)[0] in allowed
        },
        updated_at=saved.updated_at,
    )
    _log_audit_event(request, "client_master.put", "success", f"clients={len(saved.clients)} groups={len(saved.groups)}")
    return saved


@router.get("/api/stakeholder-master", response_model=StakeholderMasterPayload)
async def get_stakeholder_master(request: Request):
    role = _require_permission(request, "settings.manage")
    _require_client_scope(request, role)
    roles = _get_stakeholder_role_map()
    scopes_raw = _get_stakeholder_client_scope_map()
    scopes_out = {k: sorted(v) for k, v in scopes_raw.items()}
    updated_at: str | None = None
    if STAKEHOLDER_MASTER_PATH.exists():
        try:
            raw = json.loads(STAKEHOLDER_MASTER_PATH.read_text(encoding="utf-8"))
            updated_at = raw.get("updated_at")
        except Exception:
            pass
    payload = StakeholderMasterPayload(
        roleByStakeholderId=roles,
        clientScopesByStakeholderId=scopes_out,
        updated_at=updated_at,
    )
    _log_audit_event(request, "stakeholder_master.get", "success", f"stakeholders={len(roles)}")
    return payload


@router.put("/api/stakeholder-master", response_model=StakeholderMasterPayload)
async def update_stakeholder_master(request: Request, payload: StakeholderMasterPayload):
    role = _require_permission(request, "settings.manage")
    _require_client_scope(request, role)
    saved = _save_stakeholder_master(payload)
    _log_audit_event(
        request,
        "stakeholder_master.put",
        "success",
        f"stakeholders={len(saved.roleByStakeholderId)}",
    )
    return saved




