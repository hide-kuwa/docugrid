"""client_master relations のサニタイズ・永続化."""

from __future__ import annotations

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


def test_client_master_get_includes_relations() -> None:
    r = client.get("/api/client-master", headers=_admin_headers())
    assert r.status_code == 200
    body = r.json()
    assert "relations" in body
    assert isinstance(body["relations"], list)
    if body["relations"]:
        edge = body["relations"][0]
        assert "id" in edge and "kind" in edge
        assert "fromClientId" in edge and "toClientId" in edge


def test_client_master_put_persists_relations() -> None:
    get_r = client.get("/api/client-master", headers=_admin_headers())
    assert get_r.status_code == 200
    payload = get_r.json()
    clients = payload["clients"]
    assert len(clients) >= 2
    a, b = clients[0]["id"], clients[1]["id"]
    payload["relations"] = [
        {
            "id": "test-rel-1",
            "kind": "referral",
            "fromClientId": a,
            "toClientId": b,
            "note": "pytest referral",
        }
    ]
    put_r = client.put("/api/client-master", headers=_admin_headers(), json=payload)
    assert put_r.status_code == 200, put_r.text
    saved = client.get("/api/client-master", headers=_admin_headers()).json()
    ids = {r["id"] for r in saved["relations"]}
    assert "test-rel-1" in ids
    edge = next(r for r in saved["relations"] if r["id"] == "test-rel-1")
    assert edge["kind"] == "referral"
    assert edge["note"] == "pytest referral"


def test_client_master_put_persists_officer_relation() -> None:
    """社長・役員（個人 → 法人）を役職メモ付きで保存できる."""
    get_r = client.get("/api/client-master", headers=_admin_headers())
    payload = get_r.json()
    a, b = payload["clients"][0]["id"], payload["clients"][1]["id"]
    payload["relations"] = [
        {
            "id": "test-officer-1",
            "kind": "officer",
            "fromClientId": a,
            "toClientId": b,
            "note": "代表取締役",
        }
    ]
    put_r = client.put("/api/client-master", headers=_admin_headers(), json=payload)
    assert put_r.status_code == 200, put_r.text
    saved = client.get("/api/client-master", headers=_admin_headers()).json()
    edge = next(r for r in saved["relations"] if r["id"] == "test-officer-1")
    assert edge["kind"] == "officer"
    assert edge["note"] == "代表取締役"
    assert edge["percent"] is None


def test_client_master_put_rejects_unknown_relation_client() -> None:
    get_r = client.get("/api/client-master", headers=_admin_headers())
    payload = get_r.json()
    a = payload["clients"][0]["id"]
    payload["relations"] = [
        {
            "id": "bad-rel",
            "kind": "group_company",
            "fromClientId": a,
            "toClientId": "no-such-client",
        }
    ]
    put_r = client.put("/api/client-master", headers=_admin_headers(), json=payload)
    assert put_r.status_code == 400
    detail = str(put_r.json().get("detail", "")).lower()
    assert "unknown client" in detail or "no-such-client" in detail


def test_client_master_put_rejects_invalid_relation_kind() -> None:
    get_r = client.get("/api/client-master", headers=_admin_headers())
    payload = get_r.json()
    a, b = payload["clients"][0]["id"], payload["clients"][1]["id"]
    payload["relations"] = [
        {
            "id": "bad-kind",
            "kind": "friendship",
            "fromClientId": a,
            "toClientId": b,
        }
    ]
    put_r = client.put("/api/client-master", headers=_admin_headers(), json=payload)
    assert put_r.status_code == 400


def test_client_master_put_rejects_self_loop_relation() -> None:
    get_r = client.get("/api/client-master", headers=_admin_headers())
    payload = get_r.json()
    a = payload["clients"][0]["id"]
    payload["relations"] = [
        {
            "id": "loop",
            "kind": "relative",
            "fromClientId": a,
            "toClientId": a,
        }
    ]
    put_r = client.put("/api/client-master", headers=_admin_headers(), json=payload)
    assert put_r.status_code == 400


def test_client_master_put_rejects_bad_shareholding_percent() -> None:
    get_r = client.get("/api/client-master", headers=_admin_headers())
    payload = get_r.json()
    a, b = payload["clients"][0]["id"], payload["clients"][1]["id"]
    payload["relations"] = [
        {
            "id": "bad-pct",
            "kind": "shareholding",
            "fromClientId": a,
            "toClientId": b,
            "percent": 150,
        }
    ]
    put_r = client.put("/api/client-master", headers=_admin_headers(), json=payload)
    assert put_r.status_code == 400

def test_client_master_put_persists_relation_layouts() -> None:
    get_r = client.get("/api/client-master", headers=_admin_headers())
    assert get_r.status_code == 200
    payload = get_r.json()
    focus = payload["clients"][0]["id"]
    key = f"{focus}__all"
    payload["relationLayouts"] = {
        key: {
            "nodes": {focus: {"x": 480.5, "y": 350.25}},
            "labels": {"r1": {"x": 12, "y": -8}},
            "bends": {"r1": {"x": 20, "y": 30}},
        }
    }
    put_r = client.put("/api/client-master", headers=_admin_headers(), json=payload)
    assert put_r.status_code == 200, put_r.text
    saved = client.get("/api/client-master", headers=_admin_headers()).json()
    assert key in saved.get("relationLayouts", {})
    entry = saved["relationLayouts"][key]
    assert entry["nodes"][focus]["x"] == 480.5
    assert entry["labels"]["r1"]["y"] == -8
    assert entry["bends"]["r1"]["x"] == 20
