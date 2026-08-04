"""DocuGrid API — billing routes."""

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
from services import stripe_billing_service as _stripe

router = APIRouter()


@router.get("/api/billing/status")
async def get_billing_status_endpoint(request: Request):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    client_count, seat_count = _firm_usage_counts(ctx.firm_id)
    from services.stripe_connect_service import get_partner, partner_commission_active

    ai_summary = get_firm_ai_summary(ctx.firm_id)
    partner_info = partner_commission_active(ctx.firm_id)
    referral_partner = None
    from services.stripe_billing_service import load_billing_record

    billing_rec = load_billing_record(ctx.firm_id)
    if billing_rec.get("referralPartnerId"):
        p = get_partner(str(billing_rec["referralPartnerId"]))
        if p:
            referral_partner = {"id": p["id"], "name": p.get("name"), "onboardingComplete": p.get("onboardingComplete")}
    payload = get_billing_status(
        ctx.firm_id,
        client_count=client_count,
        seat_count=seat_count,
        ai_summary=ai_summary,
        partner=partner_info or referral_partner,
    )
    payload["canManageBilling"] = _can_manage_firm_billing(ctx)
    _log_audit_event(request, "billing.status", "success")
    return payload


@router.get("/api/billing/me")
async def get_billing_me_endpoint(request: Request):
    # Light-weight billing gate for product screens.
    # Use dashboard.view so "viewer/operator/.../" roles can still render the billing overlay.
    _require_permission(request, "dashboard.view")
    ctx = _auth_context(request)
    from services.billing_catalog import PRIMARY_PLAN_ID, pricing_model_payload
    from services.stripe_billing_service import load_billing_record

    record = load_billing_record(ctx.firm_id)
    status = str(record.get("status") or "none")
    from services.stripe_billing_service import is_billing_enforced

    configured = _stripe.is_stripe_configured()
    billing_enforced = is_billing_enforced()
    from services.stripe_billing_service import is_billing_exempt_email
    from services.super_admin import is_super_admin_email

    billing_exempt = is_super_admin_email(ctx.email) or is_billing_exempt_email(ctx.email)
    active = billing_exempt or (not billing_enforced) or status in BILLING_ACTIVE_STATUSES

    return {
        "configured": configured,
        "checkoutReady": billing_enforced,
        "firmId": ctx.firm_id,
        "status": status,
        "planId": record.get("planId"),
        "currentPeriodEnd": record.get("currentPeriodEnd"),
        "cancelAtPeriodEnd": bool(record.get("cancelAtPeriodEnd")),
        "pricing": pricing_model_payload(),
        "primaryPlanId": PRIMARY_PLAN_ID,
        "active": active,
        "requiresAttention": (not billing_exempt) and billing_enforced and status not in BILLING_ACTIVE_STATUSES,
        "redirectPath": "/settings?tab=billing",
        "canManageBilling": _can_manage_firm_billing(ctx),
    }


@router.post("/api/billing/sync-usage")
async def post_billing_sync_usage_endpoint(request: Request):
    ctx = _require_firm_billing_owner(request)
    client_count, _ = _firm_usage_counts(ctx.firm_id)
    result = sync_firm_billing_usage(ctx.firm_id, client_count)
    _log_audit_event(request, "billing.sync_usage", "success")
    return result


@router.get("/api/billing/ai-usage")
async def get_billing_ai_usage_endpoint(request: Request, client_id: str | None = None):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    if client_id:
        from services.ai_usage_service import get_client_usage

        return get_client_usage(ctx.firm_id, client_id)
    master = _load_client_master()
    client_ids = [c.id for c in master.clients if get_client_firm_id(c.id) == ctx.firm_id]
    return {"summary": get_firm_ai_summary(ctx.firm_id), "clients": list_client_usages(ctx.firm_id, client_ids)}


@router.post("/api/billing/ai/paygo")
async def post_billing_ai_paygo_endpoint(request: Request):
    ctx = _require_firm_billing_owner(request)
    result = enable_paygo(ctx.firm_id)
    _log_audit_event(request, "billing.ai.paygo", "success")
    return result


@router.post("/api/billing/ai/topup")
async def post_billing_ai_topup_endpoint(request: Request, body: BillingAiTopupBody):
    ctx = _require_firm_billing_owner(request)
    if not _stripe.is_stripe_configured():
        raise HTTPException(status_code=503, detail="stripe_not_configured")
    packs = max(1, min(body.packs, 100))
    base = frontend_base_url()
    try:
        url = create_ai_topup_checkout(
            ctx.firm_id,
            packs=packs,
            email=ctx.email,
            success_url=f"{base}/settings?tab=billing&topup=success",
            cancel_url=f"{base}/settings?tab=billing&topup=cancel",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "billing.ai.topup", "success", f"packs={packs}")
    return {"url": url}


@router.get("/api/billing/partners")
async def get_billing_partners_endpoint(request: Request):
    _require_platform(request)
    return {"partners": list_partners()}


@router.post("/api/billing/partners")
async def post_billing_partners_endpoint(request: Request, body: BillingPartnerCreateBody):
    _require_platform(request)
    partner = create_partner(
        name=body.name,
        email=body.email,
        commission_percent=body.commission_percent,
    )
    _log_audit_event(request, "billing.partner.create", "success", partner["id"])
    return partner


@router.post("/api/billing/partners/{partner_id}/onboard")
async def post_billing_partner_onboard_endpoint(request: Request, partner_id: str):
    _require_platform(request)
    if not _stripe.is_stripe_configured():
        raise HTTPException(status_code=503, detail="stripe_not_configured")
    try:
        url = create_onboarding_link(partner_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="partner_not_found") from exc
    _log_audit_event(request, "billing.partner.onboard", "success", partner_id)
    return {"url": url}


@router.post("/api/billing/partners/attach")
async def post_billing_partner_attach_endpoint(request: Request, body: BillingPartnerAttachBody):
    ctx = _require_firm_billing_owner(request)
    try:
        record = attach_partner_to_firm(ctx.firm_id, body.partner_id, contract_years=body.contract_years)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="partner_not_found") from exc
    except ValueError as exc:
        if str(exc) == "invalid_contract_years":
            raise HTTPException(status_code=400, detail="invalid_contract_years") from exc
        raise
    _log_audit_event(request, "billing.partner.attach", "success", body.partner_id)
    return record


@router.post("/api/billing/checkout")
async def post_billing_checkout_endpoint(request: Request, body: BillingCheckoutBody):
    ctx = _require_firm_billing_owner(request)
    if not _stripe.is_stripe_configured():
        raise HTTPException(status_code=503, detail="stripe_not_configured")
    plan_id = body.plan_id.strip().lower()
    base = frontend_base_url()
    try:
        url = _stripe.create_checkout_session(
            ctx.firm_id,
            plan_id,
            email=ctx.email,
            firm_label=ctx.firm_id,
            success_url=f"{base}/settings?tab=billing&checkout=success",
            cancel_url=f"{base}/settings?tab=billing&checkout=cancel",
        )
    except ValueError as exc:
        if str(exc) == "plan_price_not_configured":
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "plan_price_not_configured",
                    "message": "Stripe の料金プラン（Price ID）が未設定です。管理者に setup_stripe_catalog.py の実行を依頼してください。",
                },
            ) from exc
        raise
    except RuntimeError as exc:
        if str(exc) == "stripe_not_configured":
            raise HTTPException(status_code=503, detail="stripe_not_configured") from exc
        raise
    _log_audit_event(request, "billing.checkout", "success", plan_id)
    return {"url": url}


@router.post("/api/billing/portal")
async def post_billing_portal_endpoint(request: Request, body: BillingPortalBody):
    ctx = _require_firm_billing_owner(request)
    if not _stripe.is_stripe_configured():
        raise HTTPException(status_code=503, detail="stripe_not_configured")
    return_path = body.return_path if body.return_path.startswith("/") else "/settings?tab=billing"
    base = frontend_base_url()
    try:
        url = create_portal_session(ctx.firm_id, return_url=f"{base}{return_path}")
    except ValueError as exc:
        if str(exc) == "no_stripe_customer":
            raise HTTPException(status_code=400, detail="no_stripe_customer") from exc
        raise
    _log_audit_event(request, "billing.portal", "success")
    return {"url": url}


@router.post("/api/billing/webhook")
async def post_billing_webhook_endpoint(request: Request):
    payload = await request.body()
    signature = request.headers.get("Stripe-Signature")
    try:
        result = _stripe.handle_webhook(payload, signature)
    except RuntimeError as exc:
        code = str(exc)
        if code in ("stripe_not_configured", "webhook_secret_missing"):
            raise HTTPException(status_code=503, detail=code) from exc
        raise
    except ValueError as exc:
        if str(exc) == "invalid_webhook_signature":
            raise HTTPException(status_code=400, detail="invalid_webhook_signature") from exc
        raise
    _log_audit_event(request, "billing.webhook", "success", str(result.get("type", "")))
    return result

