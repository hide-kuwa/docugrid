"""Advisor client handoff — transfer code create / public view / claim."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

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


def _transfer_error(code: str) -> HTTPException:
    messages = {
        "client_not_found": "顧問先が見つかりません。",
        "client_wrong_firm": "他事務所の顧問先は移管できません。",
        "transfer_not_found": "移管コードが見つかりません。",
        "transfer_forbidden": "この移管を操作する権限がありません。",
        "transfer_not_pending": "この移管は操作できません（受付済み／失効など）。",
        "transfer_expired": "移管コードの有効期限が切れています。",
        "transfer_revoked": "移管コードは取り消されました。",
        "transfer_already_claimed": "この移管コードは既に使用済みです。",
        "transfer_unavailable": "移管コードを利用できません。",
        "same_firm": "同じ事務所内への移管はできません。",
        "pack_missing": "移管パックが見つかりません。再発行してください。",
    }
    return HTTPException(
        status_code=400,
        detail={"code": code, "message": messages.get(code, code)},
    )


@router.post("/api/client-transfers")
async def create_client_transfer(request: Request, body: ClientTransferCreateBody):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    identity = resolve_identity(request)
    scope_map = _get_stakeholder_client_scope_map()
    authorize_client_access(ctx, body.clientId.strip(), scope_map)

    from services.client_transfer_service import create_transfer
    from services.stripe_client import frontend_base_url

    try:
        rec = create_transfer(
            firm_id=ctx.firm_id,
            client_id=body.clientId.strip(),
            created_by_member_id=ctx.member_id,
        )
    except ValueError as exc:
        raise _transfer_error(str(exc)) from exc

    base = frontend_base_url().rstrip("/")
    share_url = f"{base}/handoff/{rec.code}"
    _log_audit_event(
        request,
        "client_transfer.create",
        "success",
        f"client={rec.source_client_id} code={rec.code}",
    )
    return {
        "id": rec.id,
        "code": rec.code,
        "shareUrl": share_url,
        "expiresAt": rec.expires_at,
        "clientId": rec.source_client_id,
        "clientDisplayName": rec.client_display_name,
        "documentCount": rec.document_count,
        "status": rec.status,
        "createdBy": identity.email or ctx.member_id,
    }


@router.get("/api/client-transfers/public/{code}")
async def public_client_transfer(request: Request, code: str):
    from services.login_rate_limit import transfer_public_rate_limit_exceeded
    from services.client_transfer_service import public_transfer_view

    if transfer_public_rate_limit_exceeded(_client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many requests")
    view = public_transfer_view(code)
    if view is None:
        raise HTTPException(status_code=404, detail="transfer_not_found")
    _log_audit_event(request, "client_transfer.view_public", "success", f"code={view.get('code')}")
    return view


@router.get("/api/client-transfers")
async def list_client_transfers(request: Request):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    from services.client_transfer_service import list_transfers_for_firm
    from services.stripe_client import frontend_base_url

    base = frontend_base_url().rstrip("/")
    items = []
    for rec in list_transfers_for_firm(ctx.firm_id):
        items.append(
            {
                "id": rec.id,
                "code": rec.code,
                "shareUrl": f"{base}/handoff/{rec.code}",
                "clientId": rec.source_client_id,
                "clientDisplayName": rec.client_display_name,
                "status": rec.status,
                "expiresAt": rec.expires_at,
                "documentCount": rec.document_count,
                "createdAt": rec.created_at,
                "claimedClientId": rec.claimed_client_id,
            }
        )
    return {"transfers": items}


@router.post("/api/client-transfers/claim")
async def claim_client_transfer(request: Request, body: ClientTransferClaimBody):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    identity = resolve_identity(request)
    from services.client_transfer_service import claim_transfer, preview_claim

    code = body.code.strip()
    try:
        if not body.confirm:
            preview = preview_claim(code)
            _log_audit_event(request, "client_transfer.preview", "success", f"code={code}")
            return {"mode": "preview", **preview}
        result = claim_transfer(
            code=code,
            to_firm_id=ctx.firm_id,
            claimed_by_member_id=ctx.member_id,
            claimed_by_email=identity.email or "",
        )
    except ValueError as exc:
        raise _transfer_error(str(exc)) from exc

    _log_audit_event(
        request,
        "client_transfer.claim",
        "success",
        f"code={code} new_client={result.get('newClientId')}",
    )
    return {"mode": "claimed", **result}


@router.post("/api/client-transfers/{transfer_id}/revoke")
async def revoke_client_transfer(request: Request, transfer_id: str):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    from services.client_transfer_service import revoke_transfer

    try:
        rec = revoke_transfer(transfer_id=transfer_id.strip(), firm_id=ctx.firm_id)
    except ValueError as exc:
        raise _transfer_error(str(exc)) from exc
    _log_audit_event(request, "client_transfer.revoke", "success", f"id={rec.id}")
    return {
        "id": rec.id,
        "code": rec.code,
        "status": rec.status,
        "revokedAt": rec.revoked_at,
    }
