"""Stripe Connect — 販売パートナー（営業会社）の onboarding と 20% 報酬."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from services.billing_catalog import (
    PARTNER_COMMISSION_PERCENT_DEFAULT,
    PARTNER_CONTRACT_YEARS_MAX,
    PARTNER_CONTRACT_YEARS_MIN,
)
from services.stripe_client import frontend_base_url, is_stripe_configured, stripe_client
from services.stripe_billing_service import save_billing_record

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
PARTNERS_PATH = STORAGE_DIR / "sales_partners.json"


def _utc_now() -> str:
    return datetime.utcnow().isoformat()


def _load_partners_raw() -> dict[str, Any]:
    if not PARTNERS_PATH.exists():
        return {"partners": [], "updated_at": None}
    try:
        return json.loads(PARTNERS_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {"partners": [], "updated_at": None}


def _save_partners_raw(payload: dict[str, Any]) -> dict[str, Any]:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    payload["updated_at"] = _utc_now()
    PARTNERS_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


def list_partners() -> list[dict[str, Any]]:
    return list(_load_partners_raw().get("partners") or [])


def get_partner(partner_id: str) -> dict[str, Any] | None:
    for p in list_partners():
        if p.get("id") == partner_id:
            return p
    return None


def create_partner(
    *,
    name: str,
    email: str,
    commission_percent: float | None = None,
) -> dict[str, Any]:
    partner = {
        "id": f"partner-{uuid.uuid4().hex[:10]}",
        "name": name.strip(),
        "email": email.strip().lower(),
        "commissionPercent": commission_percent
        if commission_percent is not None
        else PARTNER_COMMISSION_PERCENT_DEFAULT,
        "stripeAccountId": None,
        "onboardingComplete": False,
        "createdAt": _utc_now(),
    }
    raw = _load_partners_raw()
    partners = list(raw.get("partners") or [])
    partners.append(partner)
    _save_partners_raw({**raw, "partners": partners})
    return partner


def create_connect_account(partner_id: str) -> dict[str, Any]:
    if not is_stripe_configured():
        raise RuntimeError("stripe_not_configured")
    partner = get_partner(partner_id)
    if not partner:
        raise KeyError("partner_not_found")
    if partner.get("stripeAccountId"):
        return partner

    stripe = stripe_client()
    account = stripe.Account.create(
        type="express",
        country="JP",
        email=partner["email"],
        capabilities={"transfers": {"requested": True}},
        metadata={"partner_id": partner_id},
    )
    partners = list_partners()
    updated = None
    for i, p in enumerate(partners):
        if p["id"] == partner_id:
            p = {**p, "stripeAccountId": account.id}
            partners[i] = p
            updated = p
            break
    _save_partners_raw({**_load_partners_raw(), "partners": partners})
    if not updated:
        raise KeyError("partner_not_found")
    return updated


def create_onboarding_link(partner_id: str) -> str:
    partner = get_partner(partner_id)
    if not partner:
        raise KeyError("partner_not_found")
    if not partner.get("stripeAccountId"):
        partner = create_connect_account(partner_id)
    stripe = stripe_client()
    base = frontend_base_url()
    link = stripe.AccountLink.create(
        account=str(partner["stripeAccountId"]),
        refresh_url=f"{base}/settings?tab=billing&partner=refresh",
        return_url=f"{base}/settings?tab=billing&partner=done",
        type="account_onboarding",
    )
    return str(link.url)


def attach_partner_to_firm(
    firm_id: str,
    partner_id: str,
    *,
    contract_years: int,
) -> dict[str, Any]:
    if contract_years < PARTNER_CONTRACT_YEARS_MIN or contract_years > PARTNER_CONTRACT_YEARS_MAX:
        raise ValueError("invalid_contract_years")
    partner = get_partner(partner_id)
    if not partner:
        raise KeyError("partner_not_found")
    return save_billing_record(
        firm_id,
        {
            "referralPartnerId": partner_id,
            "partnerContractYears": contract_years,
            "partnerCommissionPercent": float(partner.get("commissionPercent") or PARTNER_COMMISSION_PERCENT_DEFAULT),
        },
    )


def start_partner_commission_period(firm_id: str) -> dict[str, Any] | None:
    """Call when firm subscription becomes active."""
    from services.stripe_billing_service import load_billing_record

    record = load_billing_record(firm_id)
    partner_id = record.get("referralPartnerId")
    years = int(record.get("partnerContractYears") or 0)
    if not partner_id or years < PARTNER_CONTRACT_YEARS_MIN:
        return None
    ends = (datetime.utcnow() + timedelta(days=365 * years)).isoformat()
    return save_billing_record(
        firm_id,
        {
            "partnerCommissionStartedAt": _utc_now(),
            "partnerCommissionEndsAt": ends,
        },
    )


def partner_commission_active(firm_id: str) -> dict[str, Any] | None:
    from services.stripe_billing_service import load_billing_record

    record = load_billing_record(firm_id)
    partner_id = record.get("referralPartnerId")
    if not partner_id:
        return None
    ends_raw = record.get("partnerCommissionEndsAt")
    if ends_raw:
        try:
            if datetime.fromisoformat(str(ends_raw)) < datetime.utcnow():
                return None
        except ValueError:
            pass
    partner = get_partner(str(partner_id))
    if not partner or not partner.get("stripeAccountId"):
        return None
    return {
        "partnerId": partner_id,
        "partnerName": partner.get("name"),
        "stripeAccountId": partner.get("stripeAccountId"),
        "commissionPercent": float(
            record.get("partnerCommissionPercent") or partner.get("commissionPercent") or PARTNER_COMMISSION_PERCENT_DEFAULT
        ),
        "contractYears": record.get("partnerContractYears"),
        "commissionEndsAt": record.get("partnerCommissionEndsAt"),
    }


def connect_checkout_extras(firm_id: str) -> dict[str, Any]:
    active = partner_commission_active(firm_id)
    if not active:
        return {}
    pct = active["commissionPercent"]
    dest = active["stripeAccountId"]
    pid = active["partnerId"]
    return {
        "subscription_data": {
            "application_fee_percent": pct,
            "transfer_data": {"destination": dest},
            "metadata": {"firm_id": firm_id, "partner_id": pid},
        },
        "metadata": {"firm_id": firm_id, "partner_id": pid, "plan_id": "firm"},
    }


def mark_partner_onboarded(stripe_account_id: str) -> str | None:
    partners = list_partners()
    partner_id = None
    for i, p in enumerate(partners):
        if p.get("stripeAccountId") == stripe_account_id:
            p = {**p, "onboardingComplete": True}
            partners[i] = p
            partner_id = p["id"]
            break
    if partner_id:
        _save_partners_raw({**_load_partners_raw(), "partners": partners})
    return partner_id
