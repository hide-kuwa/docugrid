"""Stripe billing service and API (header auth, no live Stripe)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app
from services.ai_usage_service import (
    check_ai_allowed,
    enable_paygo,
    grant_tokens_from_yen,
    init_ai_usage_db,
    record_ai_usage,
)
from services.billing_catalog import estimate_firm_monthly_yen
from services.billing_meter_service import billable_client_count, usage_summary
from services.stripe_billing_service import (
    get_billing_status,
    load_billing_record,
    save_billing_record,
)
from services.stripe_connect_service import attach_partner_to_firm, create_partner
from tests.test_smoke import _admin_headers

client = TestClient(app)


@pytest.fixture(autouse=True)
def enable_header_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DOCUGRID_ALLOW_HEADER_AUTH", "true")


@pytest.fixture
def firm_billing_path(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("services.stripe_billing_service.STORAGE_DIR", tmp_path)
    monkeypatch.setattr("services.stripe_connect_service.STORAGE_DIR", tmp_path)
    yield tmp_path


@pytest.fixture
def ai_usage_db(tmp_path, monkeypatch: pytest.MonkeyPatch):
    db_path = tmp_path / "ai_usage.db"
    monkeypatch.setattr("services.ai_usage_service.AI_USAGE_DB_PATH", db_path)
    monkeypatch.setattr("services.ai_usage_service.STORAGE_DIR", tmp_path)
    init_ai_usage_db()
    yield db_path


def test_billing_status_without_stripe(firm_billing_path) -> None:
    r = client.get("/api/billing/status", headers=_admin_headers())
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["configured"] is False
    assert body["status"] == "none"
    assert len(body["plans"]) == 1
    assert body["plans"][0]["id"] == "firm"
    assert body["pricing"]["firmBaseYen"] == 10000
    assert body["estimatedMonthlyYen"] == estimate_firm_monthly_yen(body["clientCount"])


def test_billing_checkout_requires_stripe(firm_billing_path) -> None:
    r = client.post(
        "/api/billing/checkout",
        headers=_admin_headers(),
        json={"plan_id": "firm"},
    )
    assert r.status_code == 503, r.text


def test_billing_record_roundtrip(firm_billing_path) -> None:
    save_billing_record(
        "firm-demo",
        {
            "stripeCustomerId": "cus_test",
            "status": "active",
            "planId": "firm",
        },
    )
    rec = load_billing_record("firm-demo")
    assert rec["stripeCustomerId"] == "cus_test"
    status = get_billing_status("firm-demo", client_count=12, seat_count=4)
    assert status["clientCount"] == 12
    assert status["planId"] == "firm"
    assert status["estimatedMonthlyYen"] == 10000 + 100 * 12


def test_billing_webhook_invalid_signature(firm_billing_path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_fake")
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_test")
    r = client.post(
        "/api/billing/webhook",
        content=b"{}",
        headers={"Stripe-Signature": "bad"},
    )
    assert r.status_code == 400


def test_meter_billable_all_clients() -> None:
    assert billable_client_count("firm", 15) == 15
    summary = usage_summary("firm", 8)
    assert summary["billableClients"] == 8
    assert summary["perClientYen"] == 100
    assert summary["meterEvent"] is None or isinstance(summary["meterEvent"], str)


def test_meter_sync_uses_meter_events(firm_billing_path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_fake")
    monkeypatch.setenv("STRIPE_PRICE_CLIENT_METERED", "price_meter_test")
    monkeypatch.setenv("STRIPE_METER_CLIENT_EVENT", "docugrid_billable_clients")

    calls: list[dict] = []

    class _Billing:
        class MeterEvent:
            @staticmethod
            def create(**kwargs):
                calls.append(kwargs)
                return {"ok": True}

    class _Stripe:
        billing = _Billing()

    monkeypatch.setattr("services.billing_meter_service.stripe_client", lambda: _Stripe())
    save_billing_record(
        "firm-demo",
        {"stripeCustomerId": "cus_test", "planId": "firm", "status": "active"},
    )
    from services.billing_meter_service import sync_client_meter_usage

    result = sync_client_meter_usage("firm-demo", 7)
    assert result["synced"] is True
    assert result["billableClients"] == 7
    assert len(calls) == 1
    assert calls[0]["event_name"] == "docugrid_billable_clients"
    assert calls[0]["payload"]["value"] == "7"


def test_ai_usage_announce_stop_flow(ai_usage_db, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_INCLUDED_TOKENS_PER_CLIENT_MONTH", "1000")
    firm_id = "firm-demo"
    client_id = "client-a"

    gate = check_ai_allowed(firm_id, client_id)
    assert gate["allowed"] is True

    record_ai_usage(firm_id, client_id, 1200)
    gate2 = check_ai_allowed(firm_id, client_id)
    assert gate2["code"] == "announced"
    assert gate2["announce"] is True

    gate3 = check_ai_allowed(firm_id, client_id)
    assert gate3["allowed"] is False
    assert gate3["code"] == "stopped"


def test_ai_paygo_and_topup(ai_usage_db) -> None:
    firm_id = "firm-demo"
    client_id = "client-b"
    enable_paygo(firm_id)
    grant_tokens_from_yen(firm_id, 200)
    summary = grant_tokens_from_yen(firm_id, 100)
    assert summary["paygoEnabled"] is True
    assert summary["tokenBalance"] > 0

    check_ai_allowed(firm_id, client_id)
    record_ai_usage(firm_id, client_id, 50000)
    gate = check_ai_allowed(firm_id, client_id)
    assert gate["allowed"] is True or gate["code"] in ("ok", "paygo")


def test_partner_attach(firm_billing_path) -> None:
    partner = create_partner(name="営業A", email="sales@example.com")
    record = attach_partner_to_firm("firm-demo", partner["id"], contract_years=2)
    assert record["referralPartnerId"] == partner["id"]
    assert record["partnerContractYears"] == 2
