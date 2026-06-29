"""Stripe metered billing — 顧問先 100 円/社/月 (Billing Meters API)."""

from __future__ import annotations

import os
from typing import Any

from services.billing_catalog import (
    CLIENT_METER_EVENT_NAME,
    FIRM_PER_CLIENT_YEN_MONTHLY,
    PRIMARY_PLAN_ID,
)
from services.stripe_client import is_stripe_configured, stripe_client


def client_meter_price_id() -> str | None:
    return os.environ.get("STRIPE_PRICE_CLIENT_METERED", "").strip() or None


def client_meter_event_name() -> str:
    return os.environ.get("STRIPE_METER_CLIENT_EVENT", "").strip() or CLIENT_METER_EVENT_NAME


def billable_client_count(plan_id: str | None, client_count: int) -> int:
    """事務所プラン: 全顧問先を従量対象（基本料と別枠）."""
    if (plan_id or PRIMARY_PLAN_ID) == PRIMARY_PLAN_ID:
        return max(0, client_count)
    return max(0, client_count)


def metered_line_item_for_checkout(plan_id: str) -> dict[str, Any] | None:
    price_id = client_meter_price_id()
    if not price_id:
        return None
    return {"price": price_id}


def resolve_meter_subscription_item_id(subscription: dict[str, Any]) -> str | None:
    """Legacy item id — kept for billing record compatibility."""
    meter_price = client_meter_price_id()
    if not meter_price:
        return None
    for item in subscription.get("items", {}).get("data") or []:
        price = item.get("price") or {}
        if price.get("id") == meter_price:
            return str(item.get("id"))
    return None


def sync_client_meter_usage(firm_id: str, client_count: int) -> dict[str, Any]:
    from services.stripe_billing_service import load_billing_record, save_billing_record

    if not is_stripe_configured():
        return {"synced": False, "reason": "stripe_not_configured"}
    record = load_billing_record(firm_id)
    customer_id = record.get("stripeCustomerId")
    plan_id = record.get("planId") or PRIMARY_PLAN_ID
    quantity = billable_client_count(plan_id, client_count)
    if not customer_id:
        return {"synced": False, "reason": "no_stripe_customer", "billableClients": quantity}
    if not client_meter_price_id():
        return {"synced": False, "reason": "meter_price_not_configured", "billableClients": quantity}

    stripe = stripe_client()
    stripe.billing.MeterEvent.create(
        event_name=client_meter_event_name(),
        payload={
            "stripe_customer_id": str(customer_id),
            "value": str(quantity),
        },
    )
    save_billing_record(
        firm_id,
        {"lastReportedClientCount": client_count, "lastBillableClientCount": quantity},
    )
    return {
        "synced": True,
        "billableClients": quantity,
        "clientCount": client_count,
        "perClientYen": FIRM_PER_CLIENT_YEN_MONTHLY,
        "meterEvent": client_meter_event_name(),
    }


def usage_summary(plan_id: str | None, client_count: int) -> dict[str, Any]:
    billable = billable_client_count(plan_id, client_count)
    return {
        "clientCount": client_count,
        "billableClients": billable,
        "perClientYen": FIRM_PER_CLIENT_YEN_MONTHLY,
        "meterConfigured": bool(client_meter_price_id()),
        "meterEvent": client_meter_event_name() if client_meter_price_id() else None,
        "unitLabel": "顧問先/月",
    }
