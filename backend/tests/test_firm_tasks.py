"""Firm-wide task aggregation API."""

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def _director_headers() -> dict[str, str]:
    return {
        "X-Docugrid-Role": "approver",
        "X-Docugrid-Stakeholder": "actor-s3",
        "X-Docugrid-User": "yamamoto@tax.co.jp",
    }


def test_firm_tasks_lists_visible_clients_only() -> None:
    r = client.get("/api/firm-tasks", headers=_director_headers())
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["firm_id"]
    assert body["client_count"] >= 1
    assert "missing_total" in body
    assert "pending_approval_total" in body
    assert isinstance(body["items"], list)


def test_operator_sees_subset_clients() -> None:
    director = client.get("/api/firm-tasks", headers=_director_headers()).json()
    operator = client.get(
        "/api/firm-tasks",
        headers={
            "X-Docugrid-Role": "operator",
            "X-Docugrid-Stakeholder": "actor-s1",
            "X-Docugrid-User": "tanaka@tax.co.jp",
        },
    ).json()
    assert operator["client_count"] <= director["client_count"]
