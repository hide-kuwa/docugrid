"""Security hardening tests (see docs/security-checklist.md §A-2, §A-3)."""

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
            "email": "admin@taxx.jp",
            "email_verified": True,
            "iss": "accounts.google.com",
        }

    monkeypatch.setattr("services.google_oauth.verify_google_id_token", _fake_verify)
    r = client.post(
        "/api/auth/google",
        json={"credential": "fake-google-id-token"},
    )
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    payload = jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALG])
    assert payload["sub"] == "admin@taxx.jp"
    assert payload["stid"] == "super-admin"
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

    monkeypatch.setattr("services.google_oauth.verify_google_id_token", _fake_verify)
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
            "email": "tanaka@tax.co.jp",
            "password": "password",
            "stakeholder_id": "actor-s1",
        },
    )
    assert r.status_code == 200, r.text
    payload = jwt.decode(r.json()["access_token"], _jwt_secret(), algorithms=[JWT_ALG])
    assert payload["mid"] == "actor-s1"
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


def test_mcp_token_requires_auth(fresh_client: TestClient) -> None:
    r = fresh_client.post("/api/auth/mcp-token")
    assert r.status_code == 401


def _staff_headers(client_id: str = "c1") -> dict[str, str]:
    return {
        "X-Docugrid-Role": "operator",
        "X-Docugrid-User": "tanaka@tax.co.jp",
        "X-Docugrid-Stakeholder": "actor-s1",
        "X-Docugrid-Client": client_id,
        "X-Docugrid-Firm": DEFAULT_FIRM_ID,
    }


def _staff_headers_s2() -> dict[str, str]:
    return {
        "X-Docugrid-Role": "operator",
        "X-Docugrid-User": "staff2@tax.co.jp",
        "X-Docugrid-Stakeholder": "actor-s2",
        "X-Docugrid-Client": "c4",
        "X-Docugrid-Firm": DEFAULT_FIRM_ID,
    }


def test_readonly_assignment_denies_upload() -> None:
    from services.client_assignments import replace_member_assignments

    replace_member_assignments(
        firm_id=DEFAULT_FIRM_ID,
        member_id="actor-s1",
        client_ids=["c1"],
        assignment_role="readonly",
    )
    main_module._invalidate_stakeholder_maps_cache()
    try:
        pdf = _minimal_pdf_bytes()
        r = client.post(
            "/api/slots",
            headers=_staff_headers("c1"),
            data={
                "client_id": "c1",
                "period_key": "year:1",
                "slot_id": "corporate_registry",
            },
            files={"file": ("t.pdf", pdf, "application/pdf")},
        )
        assert r.status_code == 403, r.text
        assert "Assignment permission denied" in r.text or "Permission denied: document.upload" in r.text
    finally:
        replace_member_assignments(
            firm_id=DEFAULT_FIRM_ID,
            member_id="actor-s1",
            client_ids=["c1", "c2", "c3"],
            assignment_role="main",
        )
        main_module._invalidate_stakeholder_maps_cache()


def test_sub_assignment_denies_upload() -> None:
    from services.client_assignments import replace_member_assignments

    replace_member_assignments(
        firm_id=DEFAULT_FIRM_ID,
        member_id="actor-s1",
        client_ids=["c1"],
        assignment_role="sub",
    )
    main_module._invalidate_stakeholder_maps_cache()
    try:
        pdf = _minimal_pdf_bytes()
        r = client.post(
            "/api/slots",
            headers=_staff_headers("c1"),
            data={
                "client_id": "c1",
                "period_key": "year:1",
                "slot_id": "corporate_registry",
            },
            files={"file": ("t.pdf", pdf, "application/pdf")},
        )
        assert r.status_code == 403, r.text
    finally:
        replace_member_assignments(
            firm_id=DEFAULT_FIRM_ID,
            member_id="actor-s1",
            client_ids=["c1", "c2", "c3"],
            assignment_role="main",
        )
        main_module._invalidate_stakeholder_maps_cache()


def test_classify_pending_file_requires_client_access(monkeypatch) -> None:
    monkeypatch.setenv("DOCUGRID_ALLOW_HEADER_AUTH", "true")
    pdf = _minimal_pdf_bytes()
    created = client.post(
        "/api/classify/pending",
        headers=_admin_headers("c1"),
        data={"client_id": "c1", "period_key": "year:1"},
        files={"file": ("t.pdf", pdf, "application/pdf")},
    )
    assert created.status_code == 200, created.text
    item_id = created.json()["id"]

    denied = client.get(
        f"/api/classify/pending/{item_id}/file",
        headers=_staff_headers_s2(),
    )
    assert denied.status_code == 403, denied.text

    allowed = client.get(
        f"/api/classify/pending/{item_id}/file",
        headers=_admin_headers("c1"),
    )
    assert allowed.status_code == 200, allowed.text


def test_classify_pending_rejects_invalid_pdf() -> None:
    r = client.post(
        "/api/classify/pending",
        headers=_admin_headers("c1"),
        data={"client_id": "c1", "period_key": "year:1"},
        files={"file": ("bad.pdf", b"not-a-pdf", "application/pdf")},
    )
    assert r.status_code == 400


def test_upload_size_limit_rejected(monkeypatch) -> None:
    monkeypatch.setenv("DOCUGRID_MAX_UPLOAD_BYTES", "128")
    pdf = _minimal_pdf_bytes()
    r = client.post(
        "/api/classify/pending",
        headers=_admin_headers("c1"),
        data={"client_id": "c1", "period_key": "year:1"},
        files={"file": ("t.pdf", pdf, "application/pdf")},
    )
    assert r.status_code == 413, r.text


def test_mcp_token_issued_for_authenticated_user(monkeypatch) -> None:
    from docugrid_auth import MCP_JWT_AUDIENCE, get_mcp_jwt_exp_seconds

    monkeypatch.setenv("DOCUGRID_MCP_JWT_EXP_HOURS", "1")
    monkeypatch.setenv("DOCUGRID_ALLOW_PASSWORD_LOGIN", "true")
    monkeypatch.setenv("DOCUGRID_ALLOW_LOGIN_STAKEHOLDER_PICK", "false")
    login = client.post(
        "/api/auth/login",
        json={
            "email": "admin@taxx.jp",
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
    assert payload["sub"] == "admin@taxx.jp"
    assert payload["role"] == "platform_admin"

    me = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {body['access_token']}"},
    )
    assert me.status_code == 200
    assert me.json()["email"] == "admin@taxx.jp"


def test_super_admin_auth_me_returns_permissions(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DOCUGRID_ALLOW_PASSWORD_LOGIN", "true")
    login = client.post(
        "/api/auth/login",
        json={
            "email": "admin@taxx.jp",
            "password": "password",
            "stakeholder_id": "",
        },
    )
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200, me.text
    body = me.json()
    assert body["email"] == "admin@taxx.jp"
    assert body["role"] == "platform_admin"
    assert "settings.platform" in body["permissions"]
    assert "document.upload" in body["permissions"]


def test_authoring_render_rejects_cross_firm_party(beta_client_master, monkeypatch) -> None:
    monkeypatch.setenv("DOCUGRID_ALLOW_HEADER_AUTH", "true")
    r = client.post(
        "/api/authoring-templates/render-body",
        headers=_admin_headers("c1"),
        json={
            "client_id": "c1",
            "body": "【法人名２】",
            "parties": [{"slot": 2, "client_id": "c_beta_1"}],
        },
    )
    assert r.status_code in (403, 404), r.text


@pytest.fixture
def messaging_storage(tmp_path, monkeypatch):
    storage = tmp_path / "storage"
    monkeypatch.setattr("services.messaging_channels_service.STORAGE_DIR", storage)
    monkeypatch.setattr("services.firm_settings.STORAGE_DIR", storage)
    monkeypatch.setattr("services.dm_inbox_service.STORAGE_DIR", storage)
    monkeypatch.setattr("services.dm_inbox_service.DM_INBOX_DB_PATH", storage / "dm_inbox.db")
    return tmp_path


@pytest.mark.parametrize("firm_id", ["..%5C..%5Cescaped", "..", "firm%2E%2E"])
def test_public_messaging_rejects_path_traversal_firm_id(messaging_storage, firm_id) -> None:
    r = TestClient(app).post(f"/api/public/messaging/{firm_id}/slack", json={"text": "x"})
    assert r.status_code in (401, 404), r.text
    assert not any(messaging_storage.rglob("messaging_channels.json"))


def test_public_messaging_does_not_create_token_for_unknown_firm(messaging_storage) -> None:
    r = TestClient(app).post("/api/public/messaging/firm_nobody/slack?token=guess", json={"text": "x"})
    assert r.status_code == 401
    assert not any(messaging_storage.rglob("messaging_channels.json"))


def test_safe_firm_id_rejects_separators() -> None:
    from services.tenancy import safe_firm_id

    assert safe_firm_id("firm_default") == "firm_default"
    for bad in ("..", "../x", "..\\x", "a/b", "a.b"):
        with pytest.raises(ValueError):
            safe_firm_id(bad)


def _slack_signed_headers(secret: str, body: bytes, ts: int) -> dict[str, str]:
    import hashlib
    import hmac

    base = b"v0:" + str(ts).encode() + b":" + body
    sig = "v0=" + hmac.new(secret.encode(), base, hashlib.sha256).hexdigest()
    return {
        "X-Slack-Signature": sig,
        "X-Slack-Request-Timestamp": str(ts),
        "Content-Type": "application/json",
    }


def test_slack_webhook_requires_signature_when_signing_secret_set(messaging_storage) -> None:
    import time

    from services.messaging_channels_service import ensure_inbound_token, update_channels

    token = ensure_inbound_token(DEFAULT_FIRM_ID)
    update_channels(DEFAULT_FIRM_ID, {"slack": {"signing_secret": "shh-test-secret"}})
    url = f"/api/public/messaging/{DEFAULT_FIRM_ID}/slack?token={token}"
    body = json.dumps({"text": "hello"}).encode()
    c = TestClient(app)

    unsigned = c.post(url, content=body, headers={"Content-Type": "application/json"})
    assert unsigned.status_code == 401

    stale = c.post(url, content=body, headers=_slack_signed_headers("shh-test-secret", body, int(time.time()) - 3600))
    assert stale.status_code == 401

    forged = c.post(url, content=body, headers=_slack_signed_headers("wrong", body, int(time.time())))
    assert forged.status_code == 401

    ok = c.post(url, content=body, headers=_slack_signed_headers("shh-test-secret", body, int(time.time())))
    assert ok.status_code == 200, ok.text


def test_line_webhook_requires_signature_when_channel_secret_set(messaging_storage) -> None:
    from services.messaging_channels_service import ensure_inbound_token, update_channels

    token = ensure_inbound_token(DEFAULT_FIRM_ID)
    update_channels(DEFAULT_FIRM_ID, {"line": {"channel_secret": "line-secret"}})
    r = TestClient(app).post(
        f"/api/public/messaging/{DEFAULT_FIRM_ID}/line?token={token}",
        json={"events": []},
    )
    assert r.status_code == 401


def test_login_rate_limit_ignores_spoofed_forwarded_for(monkeypatch) -> None:
    from services.login_rate_limit import reset_login_rate_limits

    reset_login_rate_limits()
    monkeypatch.delenv("DOCUGRID_TRUSTED_PROXY_HOPS", raising=False)
    monkeypatch.setenv("DOCUGRID_LOGIN_RATE_LIMIT", "3")
    payload = {"email": "nobody@example.com", "password": "wrong", "stakeholder_id": ""}
    c = TestClient(app)
    statuses = [
        c.post("/api/auth/login", json=payload, headers={"X-Forwarded-For": f"203.0.113.{i}"}).status_code
        for i in range(5)
    ]
    reset_login_rate_limits()
    assert statuses[-1] == 429, statuses


def test_client_ip_trusts_only_proxy_appended_hop(monkeypatch) -> None:
    from types import SimpleNamespace

    from api.session import _client_ip

    req = SimpleNamespace(
        headers={"X-Forwarded-For": "6.6.6.6, 198.51.100.7"},
        client=SimpleNamespace(host="10.0.0.1"),
    )
    monkeypatch.delenv("DOCUGRID_TRUSTED_PROXY_HOPS", raising=False)
    assert _client_ip(req) == "10.0.0.1"
    monkeypatch.setenv("DOCUGRID_TRUSTED_PROXY_HOPS", "1")
    assert _client_ip(req) == "198.51.100.7"


def test_public_pdf_render_caps_oversized_page() -> None:
    from services.login_rate_limit import reset_public_pdf_rate_limits

    reset_public_pdf_rate_limits()
    doc = fitz.open()
    doc.new_page(width=14400, height=14400)
    r = TestClient(app).post(
        "/api/public/pdf/render",
        files={"file": ("big.pdf", doc.write(), "application/pdf")},
        data={"page": "0"},
    )
    assert r.status_code == 200, r.text
    pix = fitz.Pixmap(r.content)
    assert pix.width * pix.height <= 25_000_000


def test_public_pdf_errors_do_not_leak_exception_text() -> None:
    from services.login_rate_limit import reset_public_pdf_rate_limits

    reset_public_pdf_rate_limits()
    r = TestClient(app).post(
        "/api/public/pdf/info",
        files={"file": ("bad.pdf", b"not a pdf at all", "application/pdf")},
    )
    assert r.status_code == 500
    assert r.json() == {"message": "PDF processing failed"}


def test_public_pdf_rate_limited(monkeypatch) -> None:
    from services.login_rate_limit import reset_public_pdf_rate_limits

    reset_public_pdf_rate_limits()
    monkeypatch.setenv("DOCUGRID_PUBLIC_PDF_RATE_LIMIT", "2")
    c = TestClient(app)
    files = {"file": ("a.pdf", _minimal_pdf_bytes(), "application/pdf")}
    codes = [c.post("/api/public/pdf/info", files=files).status_code for _ in range(3)]
    reset_public_pdf_rate_limits()
    assert codes == [200, 200, 429], codes


def test_api_responses_carry_security_headers() -> None:
    r = TestClient(app).get("/health")
    assert r.headers["X-Frame-Options"] == "DENY"
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert "frame-ancestors 'none'" in r.headers["Content-Security-Policy"]


def test_unset_app_env_is_treated_as_production(monkeypatch) -> None:
    from docugrid_auth import header_auth_allowed, is_production

    monkeypatch.delenv("DOCUGRID_ENV", raising=False)
    monkeypatch.delenv("DOCUGRID_ALLOW_HEADER_AUTH", raising=False)
    assert is_production()
    assert not header_auth_allowed()


def test_api_docs_hidden_in_production() -> None:
    import os
    import subprocess
    import sys
    from pathlib import Path

    env = {k: v for k, v in os.environ.items() if not k.startswith("DOCUGRID_")}
    env["DOCUGRID_ENV"] = "production"
    out = subprocess.run(
        [
            sys.executable,
            "-c",
            "from api.application import app; print(app.openapi_url, app.docs_url, app.redoc_url)",
        ],
        cwd=Path(__file__).resolve().parent.parent,
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )
    assert out.stdout.strip().splitlines()[-1] == "None None None"
