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
    sa_email = get_drive_service_account_email(ctx.firm_id)
    return DriveStatusPayload(
        google_drive_connected=cfg.google_drive_connected,
        drive_root_folder_id=cfg.drive_root_folder_id,
        drive_credentials_configured=cfg.drive_credentials_configured,
        drive_mode=resolve_drive_mode(ctx.firm_id),
        service_account_email=sa_email,
    )


@router.post("/api/drive/test")
async def test_drive_connection(request: Request):
    _require_platform_settings(request)
    ctx = _auth_context(request)
    cfg = _load_system_config(ctx.firm_id)
    if not drive_credentials_configured(ctx.firm_id):
        raise HTTPException(
            status_code=400,
            detail="サービスアカウント JSON をアップロードしてください（Settings → 外部連携）",
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
        "root_folder_id": cfg.drive_root_folder_id,
        "root_folder_name": ping.get("folder_name"),
        "healthcheck_folder_id": probe,
    }


@router.post("/api/drive/credentials")
async def upload_drive_credentials(request: Request, file: UploadFile = File(...)):
    _require_platform_settings(request)
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
    _require_platform_settings(request)
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
    payload = ClientMasterPayload(
        clients=filtered_clients,
        groups=filtered_groups,
        updated_at=payload.updated_at,
    )
    _log_audit_event(request, "client_master.get", "success", f"clients={len(payload.clients)}")
    return payload


@router.put("/api/client-master", response_model=ClientMasterPayload)
async def update_client_master(request: Request, payload: ClientMasterPayload):
    role = _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    scope_map = _get_stakeholder_client_scope_map()
    for client in payload.clients:
        if get_client_firm_id(client.id) != ctx.firm_id:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot modify client {client.id!r} belonging to another firm",
            )
        authorize_client_access(ctx, client.id, scope_map)
    _validate_client_master(payload)
    merged = _merge_client_master_for_firm(ctx, payload)
    saved = _save_client_master(merged)
    client_count, _ = _firm_usage_counts(ctx.firm_id)
    try:
        sync_firm_billing_usage(ctx.firm_id, client_count)
    except Exception:
        pass
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




