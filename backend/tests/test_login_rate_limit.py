"""Login rate limiting."""

from fastapi.testclient import TestClient

from main import app
from services.login_rate_limit import reset_login_rate_limits

client = TestClient(app)


def test_login_rate_limit_returns_429(monkeypatch) -> None:
    reset_login_rate_limits()
    monkeypatch.setenv("DOCUGRID_LOGIN_RATE_LIMIT", "3")
    monkeypatch.setenv("DOCUGRID_LOGIN_RATE_WINDOW_SEC", "60")
    payload = {"email": "nobody@example.com", "password": "wrong", "stakeholder_id": ""}
    for _ in range(3):
        client.post("/api/auth/login", json=payload)
    r = client.post("/api/auth/login", json=payload)
    assert r.status_code == 429
