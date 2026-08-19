"""Firm representative billing + staff onboarding (invites, join requests)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app
from services.firm_members import list_members_by_email, list_members_for_firm
from services.firm_onboarding import (
    MEMBER_STATUS_PENDING,
    create_member_invite,
    get_firm_join_code,
    init_firm_onboarding_db,
)
from tests.test_smoke import _firm_admin_headers, _operator_headers

client = TestClient(app)


@pytest.fixture
def api_client(fresh_client: TestClient) -> TestClient:
    return fresh_client


@pytest.fixture(autouse=True)
def enable_header_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DOCUGRID_ALLOW_HEADER_AUTH", "true")


@pytest.fixture
def firm_billing_path(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("services.stripe_billing_service.STORAGE_DIR", tmp_path)
    monkeypatch.setattr("services.stripe_connect_service.STORAGE_DIR", tmp_path)
    yield tmp_path


@pytest.fixture
def isolated_firm_storage(tmp_path, monkeypatch: pytest.MonkeyPatch):
    members_db = tmp_path / "firm_members.db"
    onboarding_db = tmp_path / "firm_onboarding.db"
    monkeypatch.setattr("services.firm_members.STORAGE_DIR", tmp_path)
    monkeypatch.setattr("services.firm_members.MEMBERS_DB_PATH", members_db)
    monkeypatch.setattr("services.firm_onboarding.STORAGE_DIR", tmp_path)
    monkeypatch.setattr("services.firm_onboarding.ONBOARDING_DB_PATH", onboarding_db)
    init_firm_onboarding_db()
    yield tmp_path


def _fake_google(monkeypatch: pytest.MonkeyPatch, email: str, name: str = "Test User") -> None:
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "test-client.apps.googleusercontent.com")

    def _verify(token: str, *, client_id: str | None = None):
        assert token == "fake-google-id-token"
        return {
            "email": email,
            "email_verified": True,
            "name": name,
            "iss": "accounts.google.com",
        }

    monkeypatch.setattr("services.google_oauth.verify_google_id_token", _verify)


def test_register_firm_creates_representative(
    isolated_firm_storage, monkeypatch: pytest.MonkeyPatch, api_client: TestClient
) -> None:
    _fake_google(monkeypatch, "rep@newfirm.example", "Rep")
    r = api_client.post(
        "/api/auth/register-firm",
        json={"credential": "fake-google-id-token", "firm_label": "New Firm"},
    )
    assert r.status_code == 200, r.text
    assert r.json().get("access_token")

    rows = list_members_by_email("rep@newfirm.example")
    assert len(rows) == 1
    rep = rows[0]
    assert rep.firm_role == "firm_admin"
    assert rep.status == "active"
    assert get_firm_join_code(rep.firm_id)
    members = list_members_for_firm(rep.firm_id)
    assert any(m.email == "rep@newfirm.example" for m in members)


def test_register_prolext_domain_uses_firm_prolext(
    isolated_firm_storage, monkeypatch: pytest.MonkeyPatch, api_client: TestClient
) -> None:
    from services.tenancy import PROLEXT_FIRM_ID

    _fake_google(monkeypatch, "owner@lext-tax.jp", "PROLEXT Owner")
    r = api_client.post(
        "/api/auth/register-firm",
        json={"credential": "fake-google-id-token", "firm_label": "PROLEXT税理士法人"},
    )
    assert r.status_code == 200, r.text
    rep = list_members_by_email("owner@lext-tax.jp")[0]
    assert rep.firm_id == PROLEXT_FIRM_ID
    assert rep.firm_role == "firm_admin"

    _fake_google(monkeypatch, "second@lext-tax.jp", "Second")
    r2 = TestClient(app).post(
        "/api/auth/register-firm",
        json={"credential": "fake-google-id-token", "firm_label": "PROLEXT税理士法人"},
    )
    assert r2.status_code == 409, r2.text
    detail = r2.json()["detail"]
    assert detail.get("code") == "prolext_firm_exists"


def test_join_request_then_approve(
    isolated_firm_storage, monkeypatch: pytest.MonkeyPatch, api_client: TestClient
) -> None:
    _fake_google(monkeypatch, "rep@firm.example")
    reg = api_client.post(
        "/api/auth/register-firm",
        json={"credential": "fake-google-id-token", "firm_label": "Approve Test Firm"},
    )
    assert reg.status_code == 200, reg.text
    rep_token = reg.json()["access_token"]
    firm_id = list_members_by_email("rep@firm.example")[0].firm_id
    join_code = get_firm_join_code(firm_id)

    _fake_google(monkeypatch, "staff@firm.example")
    join_client = TestClient(app)
    join = join_client.post(
        "/api/auth/join-request",
        json={"credential": "fake-google-id-token", "join_code": join_code},
    )
    assert join.status_code == 403, join.text
    detail = join.json()["detail"]
    assert isinstance(detail, dict) and detail.get("code") == "pending_approval"

    pending = [m for m in list_members_for_firm(firm_id) if m.status == MEMBER_STATUS_PENDING]
    assert len(pending) == 1
    assert pending[0].email == "staff@firm.example"

    approve_client = TestClient(app)
    approved = approve_client.patch(
        f"/api/firm-members/{pending[0].id}",
        headers={"Authorization": f"Bearer {rep_token}"},
        json={"status": "active"},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "active"


def test_invite_accept_flow(
    isolated_firm_storage, monkeypatch: pytest.MonkeyPatch, api_client: TestClient
) -> None:
    _fake_google(monkeypatch, "rep2@firm.example")
    reg = api_client.post(
        "/api/auth/register-firm",
        json={"credential": "fake-google-id-token", "firm_label": "Invite Test Firm"},
    )
    assert reg.status_code == 200, reg.text
    firm_id = list_members_by_email("rep2@firm.example")[0].firm_id
    rep = next(m for m in list_members_for_firm(firm_id) if m.email == "rep2@firm.example")
    invite = create_member_invite(
        firm_id=firm_id,
        email="invited@firm.example",
        invited_by_member_id=rep.id,
    )
    preview = api_client.get(f"/api/auth/invite-preview?token={invite.token}")
    assert preview.status_code == 200, preview.text
    assert preview.json()["firmLabel"] == "Invite Test Firm"

    _fake_google(monkeypatch, "invited@firm.example")
    login = api_client.post(
        "/api/auth/google",
        json={"credential": "fake-google-id-token", "invite_token": invite.token},
    )
    assert login.status_code == 200, login.text
    member = list_members_by_email("invited@firm.example")[0]
    assert member.status == "active"
    assert member.firm_id == firm_id


def test_billing_me_can_manage_for_firm_admin(firm_billing_path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("api.application.is_stripe_configured", lambda: False)
    r = client.get("/api/billing/me", headers=_firm_admin_headers())
    assert r.status_code == 200, r.text
    assert r.json()["canManageBilling"] is True


def test_billing_checkout_blocked_for_operator(firm_billing_path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("api.application.is_stripe_configured", lambda: True)
    r = client.post(
        "/api/billing/checkout",
        headers=_operator_headers(),
        json={"plan_id": "firm"},
    )
    assert r.status_code == 403, r.text
    assert r.json()["detail"]["code"] == "billing_owner_only"


def test_billing_checkout_allowed_for_firm_admin(firm_billing_path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("services.stripe_billing_service.is_stripe_configured", lambda: True)
    monkeypatch.setattr("services.stripe_billing_service.create_checkout_session", lambda *a, **k: "https://checkout.stripe.test/session")
    r = client.post(
        "/api/billing/checkout",
        headers=_firm_admin_headers(),
        json={"plan_id": "firm"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["url"].startswith("https://")
