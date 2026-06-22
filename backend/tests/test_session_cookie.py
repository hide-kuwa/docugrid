"""httpOnly session cookie auth tests."""

import jwt
from fastapi.testclient import TestClient

from docugrid_auth import SESSION_COOKIE_NAME, JWT_ALG, _jwt_secret
from main import app
from services.tenancy import DEFAULT_FIRM_ID

client = TestClient(app)


def test_login_sets_session_cookie() -> None:
    r = client.post(
        "/api/auth/login",
        json={"email": "admin@tax.co.jp", "password": "password", "stakeholder_id": ""},
    )
    assert r.status_code == 200, r.text
    assert SESSION_COOKIE_NAME in r.cookies
    token = r.cookies[SESSION_COOKIE_NAME]
    payload = jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALG])
    assert payload["sub"] == "admin@tax.co.jp"


def test_auth_me_via_cookie_without_bearer() -> None:
    login = client.post(
        "/api/auth/login",
        json={"email": "tanaka@tax.co.jp", "password": "password", "stakeholder_id": ""},
    )
    assert login.status_code == 200
    r = client.get("/api/auth/me", cookies=login.cookies)
    assert r.status_code == 200
    assert r.json()["email"] == "tanaka@tax.co.jp"


def test_firm_members_list_for_admin() -> None:
    headers = {
        "X-Docugrid-Role": "platform_admin",
        "X-Docugrid-User": "admin@tax.co.jp",
        "X-Docugrid-Stakeholder": "actor-admin",
        "X-Docugrid-Firm": DEFAULT_FIRM_ID,
    }
    r = client.get("/api/firm-members", headers=headers)
    assert r.status_code == 200, r.text
    rows = r.json()
    assert len(rows) >= 1
    assert any(row["email"] == "admin@tax.co.jp" for row in rows)
