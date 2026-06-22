"""CSRF protection for cookie session auth."""

import pytest
from fastapi.testclient import TestClient

from docugrid_auth import CSRF_COOKIE_NAME, CSRF_HEADER_NAME, SESSION_COOKIE_NAME
from main import app

client = TestClient(app)


def test_login_sets_csrf_cookie() -> None:
    r = client.post(
        "/api/auth/login",
        json={"email": "admin@tax.co.jp", "password": "password", "stakeholder_id": ""},
    )
    assert r.status_code == 200, r.text
    assert SESSION_COOKIE_NAME in r.cookies
    assert CSRF_COOKIE_NAME in r.cookies


def test_auth_config_exposes_csrf_flag() -> None:
    r = client.get("/api/auth/config")
    assert r.status_code == 200
    assert r.json()["csrf"] is True


def test_cookie_post_without_csrf_header_rejected() -> None:
    login = client.post(
        "/api/auth/login",
        json={"email": "tanaka@tax.co.jp", "password": "password", "stakeholder_id": ""},
    )
    assert login.status_code == 200
    cookies = dict(login.cookies)
    r = client.post(
        "/api/review-events",
        cookies=cookies,
        json={
            "client_id": "c1",
            "period_key": "year:1",
            "slot_id": "0",
            "event_type": "page_view",
        },
    )
    assert r.status_code == 403
    assert "CSRF" in r.json()["detail"]


def test_cookie_post_with_csrf_header_allowed() -> None:
    login = client.post(
        "/api/auth/login",
        json={"email": "tanaka@tax.co.jp", "password": "password", "stakeholder_id": ""},
    )
    assert login.status_code == 200
    csrf = login.cookies.get(CSRF_COOKIE_NAME)
    assert csrf
    headers = {CSRF_HEADER_NAME: csrf}
    r = client.post(
        "/api/review-events",
        cookies=login.cookies,
        headers=headers,
        json={
            "client_id": "c1",
            "period_key": "year:1",
            "slot_id": "0",
            "event_type": "page_view",
        },
    )
    assert r.status_code == 200, r.text


def test_header_auth_skips_csrf(monkeypatch) -> None:
    monkeypatch.setenv("DOCUGRID_ALLOW_HEADER_AUTH", "true")
    headers = {
        "X-Docugrid-Role": "operator",
        "X-Docugrid-Stakeholder": "actor-s1",
        "X-Docugrid-User": "tanaka@tax.co.jp",
    }
    r = client.post(
        "/api/review-events",
        headers=headers,
        json={
            "client_id": "c1",
            "period_key": "year:1",
            "slot_id": "0",
            "event_type": "page_view",
        },
    )
    assert r.status_code == 200, r.text
