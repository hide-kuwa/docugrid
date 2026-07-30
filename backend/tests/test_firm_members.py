"""Firm member list/patch authorization and role updates."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app
from services.firm_members import list_members_by_email, upsert_member
from services.firm_onboarding import get_firm_join_code, init_firm_onboarding_db
from tests.test_smoke import _firm_admin_headers, _operator_headers

client = TestClient(app)


@pytest.fixture(autouse=True)
def enable_header_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DOCUGRID_ALLOW_HEADER_AUTH", "true")


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
        return {
            "email": email,
            "email_verified": True,
            "name": name,
            "iss": "accounts.google.com",
        }

    monkeypatch.setattr("services.google_oauth.verify_google_id_token", _verify)


def test_operator_cannot_list_firm_members() -> None:
    r = client.get("/api/firm-members", headers=_operator_headers())
    assert r.status_code == 403


def test_firm_admin_can_list_firm_members() -> None:
    r = client.get("/api/firm-members", headers=_firm_admin_headers())
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


def test_patch_member_role_and_cross_firm_idor(
    isolated_firm_storage, monkeypatch: pytest.MonkeyPatch
) -> None:
    api = TestClient(app)
    _fake_google(monkeypatch, "rep-a@firm.example")
    reg_a = api.post(
        "/api/auth/register-firm",
        json={"credential": "fake-google-id-token", "firm_label": "Firm A"},
    )
    assert reg_a.status_code == 200, reg_a.text
    token_a = reg_a.json()["access_token"]
    firm_a = list_members_by_email("rep-a@firm.example")[0].firm_id

    staff = upsert_member(
        member_id="staff-a-1",
        firm_id=firm_a,
        email="staff-a@firm.example",
        stakeholder_id="staff-a-1",
        firm_role="operator",
        status="active",
        persona_id="firm_staff_main",
    )

    patched = api.patch(
        f"/api/firm-members/{staff.id}",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"firm_role": "viewer", "persona_id": "firm_director"},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["firm_role"] == "viewer"
    assert patched.json()["persona_id"] == "firm_director"

    _fake_google(monkeypatch, "rep-b@firm.example")
    reg_b = TestClient(app).post(
        "/api/auth/register-firm",
        json={"credential": "fake-google-id-token", "firm_label": "Firm B"},
    )
    assert reg_b.status_code == 200, reg_b.text
    token_b = reg_b.json()["access_token"]

    forbidden = TestClient(app).patch(
        f"/api/firm-members/{staff.id}",
        headers={"Authorization": f"Bearer {token_b}"},
        json={"firm_role": "firm_admin"},
    )
    assert forbidden.status_code == 404


def test_cannot_demote_last_firm_admin(
    isolated_firm_storage, monkeypatch: pytest.MonkeyPatch
) -> None:
    api = TestClient(app)
    _fake_google(monkeypatch, "solo-admin@firm.example")
    reg = api.post(
        "/api/auth/register-firm",
        json={"credential": "fake-google-id-token", "firm_label": "Solo Firm"},
    )
    assert reg.status_code == 200, reg.text
    token = reg.json()["access_token"]
    admin = list_members_by_email("solo-admin@firm.example")[0]
    assert get_firm_join_code(admin.firm_id)

    r = api.patch(
        f"/api/firm-members/{admin.id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"firm_role": "operator"},
    )
    assert r.status_code == 400, r.text
    assert r.json()["detail"]["code"] == "last_firm_admin"
