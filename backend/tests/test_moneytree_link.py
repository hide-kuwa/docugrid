"""Moneytree LINK 連携 API."""

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def _admin_headers() -> dict[str, str]:
    return {
        "X-Docugrid-Role": "admin",
        "X-Docugrid-User": "smoke-test@example.com",
        "X-Docugrid-Stakeholder": "actor-admin",
        "X-Docugrid-Client": "c1",
    }


def _client_uploader_headers() -> dict[str, str]:
    return {
        "X-Docugrid-Role": "client_uploader",
        "X-Docugrid-User": "client@example.com",
        "X-Docugrid-Stakeholder": "actor-c1",
        "X-Docugrid-Client": "c1",
    }


def test_moneytree_status_requires_client_id(monkeypatch) -> None:
    monkeypatch.setenv("MONEYTREE_LINK_MOCK", "true")
    r = client.get("/api/integrations/moneytree/status", headers=_admin_headers())
    assert r.status_code == 422


def test_moneytree_status_mock_mode_by_default(monkeypatch) -> None:
    monkeypatch.delenv("MONEYTREE_LINK_CLIENT_ID", raising=False)
    monkeypatch.delenv("MONEYTREE_LINK_CLIENT_SECRET", raising=False)
    monkeypatch.setenv("DOCUGRID_ENV", "development")
    monkeypatch.setenv("MONEYTREE_LINK_MOCK", "true")

    from services import moneytree_link_service as svc

    svc.disconnect("firm_default", "c1")

    r = client.get(
        "/api/integrations/moneytree/status",
        params={"client_id": "c1"},
        headers=_client_uploader_headers(),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["configured"] is True
    assert body["mock_mode"] is True
    assert body["connected"] is False


def test_moneytree_client_mock_connect_and_sync(monkeypatch) -> None:
    monkeypatch.setenv("MONEYTREE_LINK_MOCK", "true")
    monkeypatch.setenv("DOCUGRID_ENV", "development")

    from services import moneytree_link_service as svc

    svc.disconnect("firm_default", "c1")
    headers = _client_uploader_headers()

    r = client.post(
        "/api/integrations/moneytree/mock-connect",
        params={"client_id": "c1"},
        headers=headers,
    )
    assert r.status_code == 200, r.text

    status = client.get(
        "/api/integrations/moneytree/status",
        params={"client_id": "c1"},
        headers=headers,
    )
    assert status.json()["connected"] is True
    assert status.json()["accounts_count"] >= 2

    accounts = client.get(
        "/api/integrations/moneytree/accounts",
        params={"client_id": "c1"},
        headers=headers,
    )
    assert accounts.status_code == 200
    assert len(accounts.json()["accounts"]) >= 2

    disconnect = client.delete(
        "/api/integrations/moneytree/disconnect",
        params={"client_id": "c1"},
        headers=headers,
    )
    assert disconnect.status_code == 200


def test_moneytree_firm_status_for_admin(monkeypatch) -> None:
    monkeypatch.setenv("MONEYTREE_LINK_MOCK", "true")
    from services import moneytree_link_service as svc

    svc.mock_connect("firm_default", "c1")
    r = client.get("/api/integrations/moneytree/firm-status", headers=_admin_headers())
    assert r.status_code == 200, r.text
    clients = r.json()["clients"]
    c1 = next((c for c in clients if c["client_id"] == "c1"), None)
    assert c1 is not None
    assert c1["connected"] is True
    svc.disconnect("firm_default", "c1")


def test_moneytree_client_cannot_access_firm_status() -> None:
    r = client.get("/api/integrations/moneytree/firm-status", headers=_client_uploader_headers())
    assert r.status_code == 403
