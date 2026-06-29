"""Stripe subscription billing per firm (DocuGrid SaaS)."""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

from services.billing_catalog import (
    AI_YEN_PER_PACK,
    PLAN_CATALOG,
    PRIMARY_PLAN_ID,
    estimate_firm_monthly_yen,
    pricing_model_payload,
)
from services.billing_meter_service import (
    metered_line_item_for_checkout,
    resolve_meter_subscription_item_id,
    sync_client_meter_usage,
    usage_summary,
)
from services.stripe_client import frontend_base_url, is_stripe_configured, stripe_client, stripe_webhook_secret

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"


def _billing_path(firm_id: str) -> Path:
    return STORAGE_DIR / "firms" / firm_id / "billing.json"


def _utc_now() -> str:
    return datetime.utcnow().isoformat()


def ai_topup_price_id() -> str | None:
    return os.environ.get("STRIPE_PRICE_AI_TOPUP_100", "").strip() or None


def price_id_for_plan(plan_id: str) -> str | None:
    meta = PLAN_CATALOG.get(plan_id)
    if not meta:
        return None
    return os.environ.get(meta["base_price_env"], "").strip() or None


def list_plans() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for plan_id, meta in PLAN_CATALOG.items():
        base_id = os.environ.get(meta["base_price_env"], "").strip()
        meter_id = os.environ.get(meta.get("meter_price_env", ""), "").strip()
        out.append(
            {
                "id": plan_id,
                "label": meta["label"],
                "description": meta["description"],
                "available": bool(base_id),
                "priceConfigured": bool(base_id),
                "meterConfigured": bool(meter_id),
            }
        )
    return out


def load_billing_record(firm_id: str) -> dict[str, Any]:
    path = _billing_path(firm_id)
    if not path.exists():
        return {"firmId": firm_id, "status": "none"}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    return {"firmId": firm_id, "status": "none"}


def save_billing_record(firm_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    path = _billing_path(firm_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    current = load_billing_record(firm_id)
    current.update({k: v for k, v in patch.items() if v is not None})
    current["firmId"] = firm_id
    current["updatedAt"] = _utc_now()
    path.write_text(json.dumps(current, ensure_ascii=False, indent=2), encoding="utf-8")
    return current


def ensure_stripe_customer(
    firm_id: str,
    *,
    email: str | None = None,
    firm_label: str | None = None,
) -> str:
    record = load_billing_record(firm_id)
    customer_id = record.get("stripeCustomerId")
    if customer_id:
        return str(customer_id)

    stripe = stripe_client()
    customer = stripe.Customer.create(
        email=email or None,
        name=firm_label or firm_id,
        metadata={"firm_id": firm_id},
    )
    save_billing_record(
        firm_id,
        {"stripeCustomerId": customer.id, "status": record.get("status") or "none"},
    )
    return str(customer.id)


def get_billing_status(
    firm_id: str,
    *,
    client_count: int = 0,
    seat_count: int = 0,
    ai_summary: dict[str, Any] | None = None,
    partner: dict[str, Any] | None = None,
) -> dict[str, Any]:
    record = load_billing_record(firm_id)
    plan_id = record.get("planId") or PRIMARY_PLAN_ID
    return {
        "configured": is_stripe_configured(),
        "firmId": firm_id,
        "status": record.get("status") or "none",
        "planId": record.get("planId"),
        "stripeCustomerId": record.get("stripeCustomerId"),
        "subscriptionId": record.get("subscriptionId"),
        "currentPeriodEnd": record.get("currentPeriodEnd"),
        "cancelAtPeriodEnd": bool(record.get("cancelAtPeriodEnd")),
        "clientCount": client_count,
        "seatCount": seat_count,
        "plans": list_plans(),
        "publishableKey": os.environ.get("STRIPE_PUBLISHABLE_KEY", "").strip() or None,
        "pricing": pricing_model_payload(),
        "estimatedMonthlyYen": estimate_firm_monthly_yen(client_count),
        "clientUsage": usage_summary(plan_id, client_count),
        "referralPartnerId": record.get("referralPartnerId"),
        "partner": partner,
        "ai": ai_summary,
    }


def create_checkout_session(
    firm_id: str,
    plan_id: str,
    *,
    email: str | None,
    firm_label: str | None,
    success_url: str,
    cancel_url: str,
) -> str:
    if plan_id not in PLAN_CATALOG:
        plan_id = PRIMARY_PLAN_ID
    price_id = price_id_for_plan(plan_id)
    if not price_id:
        raise ValueError("plan_price_not_configured")

    customer_id = ensure_stripe_customer(firm_id, email=email, firm_label=firm_label)
    line_items: list[dict[str, Any]] = [{"price": price_id, "quantity": 1}]
    meter_item = metered_line_item_for_checkout(plan_id)
    if meter_item:
        line_items.append(meter_item)

    from services.stripe_connect_service import connect_checkout_extras

    extras = connect_checkout_extras(firm_id)
    sub_data = extras.pop("subscription_data", None) or {}
    sub_data.setdefault("metadata", {})
    sub_data["metadata"].update({"firm_id": firm_id, "plan_id": plan_id})

    stripe = stripe_client()
    session = stripe.checkout.Session.create(
        mode="subscription",
        customer=customer_id,
        line_items=line_items,
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={**(extras.get("metadata") or {}), "firm_id": firm_id, "plan_id": plan_id},
        subscription_data=sub_data,
        allow_promotion_codes=True,
    )
    if not session.url:
        raise RuntimeError("checkout_url_missing")
    return str(session.url)


def create_ai_topup_checkout(
    firm_id: str,
    *,
    packs: int,
    email: str | None,
    success_url: str,
    cancel_url: str,
) -> str:
    if packs < 1:
        raise ValueError("invalid_pack_count")
    price_id = ai_topup_price_id()
    customer_id = ensure_stripe_customer(firm_id, email=email)
    stripe = stripe_client()
    kwargs: dict[str, Any] = {
        "mode": "payment",
        "customer": customer_id,
        "success_url": success_url,
        "cancel_url": cancel_url,
        "metadata": {
            "firm_id": firm_id,
            "purpose": "ai_topup",
            "packs": str(packs),
            "yen": str(packs * AI_YEN_PER_PACK),
        },
    }
    if price_id:
        kwargs["line_items"] = [{"price": price_id, "quantity": packs}]
    else:
        kwargs["line_items"] = [
            {
                "price_data": {
                    "currency": "jpy",
                    "unit_amount": AI_YEN_PER_PACK,
                    "product_data": {"name": "DocuGrid AI トークン（100円パック）"},
                },
                "quantity": packs,
            }
        ]
    session = stripe.checkout.Session.create(**kwargs)
    if not session.url:
        raise RuntimeError("checkout_url_missing")
    return str(session.url)


def create_portal_session(firm_id: str, *, return_url: str) -> str:
    record = load_billing_record(firm_id)
    customer_id = record.get("stripeCustomerId")
    if not customer_id:
        raise ValueError("no_stripe_customer")

    stripe = stripe_client()
    session = stripe.billing_portal.Session.create(
        customer=str(customer_id),
        return_url=return_url,
    )
    return str(session.url)


def _plan_from_subscription(subscription: dict[str, Any]) -> str | None:
    meta = subscription.get("metadata") or {}
    if meta.get("plan_id"):
        return str(meta["plan_id"])
    items = subscription.get("items", {}).get("data") or []
    if not items:
        return None
    price_id = (items[0].get("price") or {}).get("id")
    if not price_id:
        return None
    for pid, plan_meta in PLAN_CATALOG.items():
        if os.environ.get(plan_meta["base_price_env"], "").strip() == price_id:
            return pid
    return PRIMARY_PLAN_ID


def _apply_subscription(firm_id: str, subscription: dict[str, Any]) -> dict[str, Any]:
    status = str(subscription.get("status") or "none")
    plan_id = _plan_from_subscription(subscription)
    period_end = subscription.get("current_period_end")
    period_end_iso = None
    if period_end:
        period_end_iso = datetime.utcfromtimestamp(int(period_end)).isoformat()
    meter_item_id = resolve_meter_subscription_item_id(subscription)
    saved = save_billing_record(
        firm_id,
        {
            "stripeCustomerId": subscription.get("customer"),
            "subscriptionId": subscription.get("id"),
            "status": status,
            "planId": plan_id,
            "currentPeriodEnd": period_end_iso,
            "cancelAtPeriodEnd": bool(subscription.get("cancel_at_period_end")),
            "stripeClientMeterItemId": meter_item_id,
        },
    )
    if status in ("active", "trialing"):
        from services.stripe_connect_service import start_partner_commission_period

        start_partner_commission_period(firm_id)
    return saved


def handle_webhook(payload: bytes, signature: str | None) -> dict[str, Any]:
    if not is_stripe_configured():
        raise RuntimeError("stripe_not_configured")
    secret = stripe_webhook_secret()
    if not secret:
        raise RuntimeError("webhook_secret_missing")

    stripe = stripe_client()
    try:
        event = stripe.Webhook.construct_event(payload, signature, secret)
    except Exception as exc:
        raise ValueError("invalid_webhook_signature") from exc

    event_type = event["type"]
    data_object = event["data"]["object"]
    firm_id: str | None = None

    if event_type == "checkout.session.completed":
        meta = data_object.get("metadata") or {}
        firm_id = meta.get("firm_id")
        purpose = meta.get("purpose")
        if firm_id and purpose == "ai_topup":
            from services.ai_usage_service import grant_tokens_from_yen

            packs = int(meta.get("packs") or 1)
            grant_tokens_from_yen(str(firm_id), packs * AI_YEN_PER_PACK)
        else:
            subscription_id = data_object.get("subscription")
            if firm_id and subscription_id:
                sub = stripe.Subscription.retrieve(str(subscription_id))
                _apply_subscription(str(firm_id), sub)
    elif event_type in ("customer.subscription.updated", "customer.subscription.deleted"):
        firm_id = (data_object.get("metadata") or {}).get("firm_id")
        if firm_id:
            if event_type == "customer.subscription.deleted":
                save_billing_record(
                    str(firm_id),
                    {"status": "canceled", "subscriptionId": None, "cancelAtPeriodEnd": False},
                )
            else:
                _apply_subscription(str(firm_id), data_object)
    elif event_type == "invoice.payment_failed":
        customer_id = data_object.get("customer")
        if customer_id:
            for path in (STORAGE_DIR / "firms").glob("*/billing.json"):
                try:
                    rec = json.loads(path.read_text(encoding="utf-8"))
                except Exception:
                    continue
                if rec.get("stripeCustomerId") == customer_id:
                    save_billing_record(path.parent.name, {"status": "past_due"})
                    firm_id = path.parent.name
                    break
    elif event_type == "account.updated":
        from services.stripe_connect_service import mark_partner_onboarded

        account_id = data_object.get("id")
        if account_id and data_object.get("charges_enabled"):
            mark_partner_onboarded(str(account_id))

    return {"ok": True, "type": event_type, "firmId": firm_id}


def sync_firm_billing_usage(firm_id: str, client_count: int) -> dict[str, Any]:
    return sync_client_meter_usage(firm_id, client_count)
