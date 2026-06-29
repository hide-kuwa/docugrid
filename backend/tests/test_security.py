"""Security hardening tests (see docs/security-checklist.md)."""

import json
import uuid

import fitz
import jwt
import pytest
from fastapi.testclient import TestClient

import main as main_module
from docugrid_auth import DEV_JWT_SECRET, JWT_ALG, _jwt_secret
from main import app
from services.tenancy import DEFAULT_FIRM_ID, FIRM_BETA_ID, invalidate_client_firm_cache

client = TestClient(app)


def _minimal_pdf_bytes() -> bytes:
    doc = fitz.open()
    doc.new_page()
    return doc.write()


def _admin_headers(client_id: str = "c1") -> dict[str, str]:
    return {
        "X-Docugrid-Role": "admin",
        "X-Docugrid-User": "smoke-test@example.com",
        "X-Docugrid-Stakeholder": "actor-admin",
        "X-Docugrid-Client": client_id,
        "X-Docugrid-Firm": DEFAULT_FIRM_ID,
    }


def _beta_admin_headers() -> dict[str, str]:
    return {
        "X-Docugrid-Role": "admin",
        "X-Docugrid-User": "beta-admin@example.com",
        "X-Docugrid-Stakeholder": "actor-beta-admin",
        "X-Docugrid-Client": "c_beta_1",
        "X-Docugrid-Firm": FIRM_BETA_ID,
    }


def test_login_ignores_stakeholder_escalation_when_pick_disabled(monkeypatch) -> None:
    monkeypatch.setenv("DOCUGRID_ALLOW_LOGIN_STAKEHOLDER_PICK", "false")
    r = client.post(
        "/api/auth/login",
        json={
            "email": "c1@client.example",
            "password": "password",
            "stakeholder_id": "actor-admin",
        },
    )
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    payload = jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALG])
    assert payload["stid"] == "actor-c1"
    assert payload["role"] == "client_uploader"


def test_login_unknown_email_rejected_when_pick_disabled(monkeypatch) -> None:
    monkeypatch.setenv("DOCUGRID_ALLOW_LOGIN_STAKEHOLDER_PICK", "false")
    r = client.post(
        "/api/auth/login",
        json={
            "email": "unknown-person@example.com",
            "password": "password",
            "stakeholder_id": "actor-s1",
        },
    )
    assert r.status_code == 403


def test_auth_me_includes_visible_client_ids() -> None:
    r = client.get("/api/auth/me", headers=_admin_headers())
    assert r.status_code == 200
    ids = r.json().get("visible_client_ids")
    assert isinstance(ids, list)
    assert "c1" in ids


def test_auth_me_includes_persona_id() -> None:
    r = client.get("/api/auth/me", headers=_admin_headers())
    assert r.status_code == 200
    data = r.json()
    assert data.get("persona_id") == "platform_admin"
    assert "プラットフォーム" in (data.get("persona_label") or "")


def test_client_persona_login_redirects_metadata() -> None:
    r = client.post(
        "/api/auth/login",
        json={
            "email": "ceo@client.example",
            "password": "password",
            "stakeholder_id": "actor-c-ceo",
        },
    )
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    me = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me.status_code == 200
    assert me.json().get("persona_id") == "client_executive"


@pytest.fixture()
def beta_client_master(tmp_path, monkeypatch):
    master_path = tmp_path / "client_master.json"
    payload = {
        "clients": [
            {
                "id": "c1",
                "name": "Firm A Client",
                "fiscalMonth": 3,
                "category": "corporate",
                "tags": [],
                "firmId": DEFAULT_FIRM_ID,
            },
            {
                "id": "c_beta_1",
                "name": "Firm Beta Client",
                "fiscalMonth": 3,
                "category": "corporate",
                "tags": [],
                "firmId": FIRM_BETA_ID,
            },
        ],
        "groups": [],
        "updated_at": None,
    }
    master_path.write_text(json.dumps(payload), encoding="utf-8")
    monkeypatch.setattr(main_module, "CLIENT_MASTER_PATH", master_path)
    monkeypatch.setattr("services.tenancy.CLIENT_MASTER_PATH", master_path)
    invalidate_client_firm_cache()
    yield
    invalidate_client_firm_cache()


def test_audit_events_scoped_to_firm(beta_client_master, monkeypatch) -> None:
    monkeypatch.setenv("DOCUGRID_ALLOW_HEADER_AUTH", "true")
    main_module._init_audit_events_db()
    with __import__("sqlite3").connect(main_module.AUDIT_EVENTS_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO audit_events
                (created_at, stakeholder_id, user_email, role, client_id, path, action, result, detail, http_status, firm_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "2026-01-01T00:00:00",
                "actor-beta-admin",
                "beta@example.com",
                "admin",
                "c_beta_1",
                "/api/test",
                "test.beta",
                "success",
                "beta-only",
                None,
                FIRM_BETA_ID,
            ),
        )

    r_default = client.get("/api/audit-events", headers=_admin_headers())
    assert r_default.status_code == 200
    details = [row.get("detail") for row in r_default.json()]
    assert "beta-only" not in details

    r_beta = client.get("/api/audit-events", headers=_beta_admin_headers())
    assert r_beta.status_code == 200
    beta_details = [row.get("detail") for row in r_beta.json()]
    assert "beta-only" in beta_details


def test_google_login_issues_jwt(monkeypatch) -> None:
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "test-client.apps.googleusercontent.com")

    def _fake_verify(token: str, *, client_id: str | None = None):
        assert token == "fake-google-id-token"
        return {
            "email": "admin@tax.co.jp",
            "email_verified": True,
            "iss": "accounts.google.com",
        }

    monkeypatch.setattr("main.verify_google_id_token", _fake_verify)
    r = client.post(
        "/api/auth/google",
        json={"credential": "fake-google-id-token"},
    )
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    payload = jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALG])
    assert payload["sub"] == "admin@tax.co.jp"
    assert payload["stid"] == "actor-admin"
    assert payload["role"] == "platform_admin"


def test_google_login_rejects_unregistered_email(monkeypatch) -> None:
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "test-client.apps.googleusercontent.com")
    monkeypatch.setenv("DOCUGRID_ALLOW_LOGIN_STAKEHOLDER_PICK", "false")

    def _fake_verify(token: str, *, client_id: str | None = None):
        return {
            "email": "stranger@gmail.com",
            "email_verified": True,
            "iss": "accounts.google.com",
        }

    monkeypatch.setattr("main.verify_google_id_token", _fake_verify)
    r = client.post("/api/auth/google", json={"credential": "x"})
    assert r.status_code == 403


def test_firm_admin_cannot_get_role_permissions() -> None:
    r = client.get(
        "/api/role-permissions",
        headers={
            "X-Docugrid-Role": "firm_admin",
            "X-Docugrid-User": "beta-admin@example.com",
            "X-Docugrid-Stakeholder": "actor-beta-admin",
            "X-Docugrid-Client": "c1",
            "X-Docugrid-Firm": DEFAULT_FIRM_ID,
        },
    )
    assert r.status_code == 403


def test_firm_admin_cannot_update_role_permissions() -> None:
    r = client.put(
        "/api/role-permissions",
        headers={
            "X-Docugrid-Role": "firm_admin",
            "X-Docugrid-User": "beta-admin@example.com",
            "X-Docugrid-Stakeholder": "actor-beta-admin",
            "X-Docugrid-Client": "c1",
            "X-Docugrid-Firm": DEFAULT_FIRM_ID,
        },
        json={"permissionsByRole": {"viewer": ["client.view"]}},
    )
    assert r.status_code == 403


def test_docugrid_save_requires_slot_context() -> None:
    r = client.post(
        "/api/docugrid/save",
        headers=_admin_headers(),
        json={
            "documentId": None,
            "filesById": {},
            "pagesById": {},
            "highlightsById": {},
            "pageOrder": [],
            "fileOrder": [],
            "highlightIdsByPageId": {},
        },
    )
    assert r.status_code == 400


def test_login_jwt_includes_member_id_from_registry() -> None:
    r = client.post(
        "/api/auth/login",
        json={
            "email": "admin@tax.co.jp",
            "password": "password",
            "stakeholder_id": "actor-admin",
        },
    )
    assert r.status_code == 200, r.text
    payload = jwt.decode(r.json()["access_token"], _jwt_secret(), algorithms=[JWT_ALG])
    assert payload["mid"] == "actor-admin"
    assert payload["firm_id"] == DEFAULT_FIRM_ID


def test_inactive_member_cannot_login() -> None:
    from services.firm_members import set_member_status

    set_member_status("actor-c1", "inactive")
    try:
        r = client.post(
            "/api/auth/login",
            json={
                "email": "c1@client.example",
                "password": "password",
                "stakeholder_id": "actor-c1",
            },
        )
        assert r.status_code == 403
    finally:
        set_member_status("actor-c1", "active")


def test_firm_scoped_system_config_isolated() -> None:
    base_payload = {
        "google_drive_connected": False,
        "notification_email_enabled": True,
        "ocr_auto_extract_enabled": True,
        "alert_consumption_tax_months_before_due": 2,
        "alert_corporate_tax_months_before_due": 2,
        "ai_openai_enabled": False,
        "ai_openai_model": "gpt-4o-mini",
        "ai_gemini_enabled": False,
        "ai_gemini_model": "gemini-2.0-flash",
    }
    client.put(
        "/api/system-config",
        headers=_admin_headers(),
        json={**base_payload, "notification_email_enabled": True},
    )
    beta_payload = {**base_payload, "notification_email_enabled": False}
    put_beta = client.put(
        "/api/system-config",
        headers=_beta_admin_headers(),
        json=beta_payload,
    )
    assert put_beta.status_code == 200, put_beta.text
    get_default = client.get("/api/system-config", headers=_admin_headers())
    get_beta = client.get("/api/system-config", headers=_beta_admin_headers())
    assert get_default.status_code == 200
    assert get_beta.status_code == 200
    assert get_beta.json()["notification_email_enabled"] is False
    assert get_default.json()["notification_email_enabled"] is True


def test_client_master_put_cannot_modify_other_firm_client(beta_client_master) -> None:
    payload = {
        "clients": [
            {
                "id": "c_beta_1",
                "name": "Hijacked Name",
                "fiscalMonth": 3,
                "category": "corporate",
                "tags": [],
                "firmId": FIRM_BETA_ID,
            }
        ],
        "groups": [],
    }
    r = client.put("/api/client-master", headers=_admin_headers(), json=payload)
    assert r.status_code == 400


def test_mcp_token_requires_auth() -> None:
    r = client.post("/api/auth/mcp-token")
    assert r.status_code == 401


def test_mcp_token_issued_for_authenticated_user(monkeypatch) -> None:
    from docugrid_auth import MCP_JWT_AUDIENCE, get_mcp_jwt_exp_seconds

    monkeypatch.setenv("DOCUGRID_MCP_JWT_EXP_HOURS", "1")
    monkeypatch.setenv("DOCUGRID_ALLOW_PASSWORD_LOGIN", "true")
    monkeypatch.setenv("DOCUGRID_ALLOW_LOGIN_STAKEHOLDER_PICK", "false")
    login = client.post(
        "/api/auth/login",
        json={
            "email": "admin@tax.co.jp",
            "password": "password",
            "stakeholder_id": "actor-admin",
        },
    )
    assert login.status_code == 200, login.text
    session_token = login.json()["access_token"]

    r = client.post(
        "/api/auth/mcp-token",
        headers={"Authorization": f"Bearer {session_token}"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["audience"] == MCP_JWT_AUDIENCE
    assert body["expires_in"] == get_mcp_jwt_exp_seconds()

    payload = jwt.decode(
        body["access_token"],
        _jwt_secret(),
        algorithms=[JWT_ALG],
        audience=MCP_JWT_AUDIENCE,
    )
    assert payload["aud"] == MCP_JWT_AUDIENCE
    assert payload["sub"] == "admin@tax.co.jp"
    assert payload["role"] == "platform_admin"

    me = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {body['access_token']}"},
    )
    assert me.status_code == 200
    assert me.json()["email"] == "admin@tax.co.jp"
