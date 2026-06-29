"""MA goals planning API."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app
from services.ma_goals_service import (
    build_ma_goals,
    firms_needed_for_arr,
    resolve_avg_clients_per_firm,
    save_ma_assumptions,
)
from services.platform_analytics_service import compute_avg_clients_per_firm_stats
from tests.test_smoke import _platform_admin_headers

client = TestClient(app)


@pytest.fixture(autouse=True)
def enable_header_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DOCUGRID_ALLOW_HEADER_AUTH", "true")


@pytest.fixture
def ma_storage(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("services.platform_analytics_service.STORAGE_DIR", tmp_path)
    monkeypatch.setattr("services.stripe_billing_service.STORAGE_DIR", tmp_path)
    monkeypatch.setattr(
        "services.platform_analytics_service.load_client_master_raw",
        lambda: {"clients": [], "groups": []},
    )
    yield tmp_path


def test_firms_needed_for_1b_arr_at_50_clients() -> None:
    # 10000 + 50*100 = 15000/mo -> 180000/yr per firm
    # 1B / 180000 = 5555.55 -> 5556
    assert firms_needed_for_arr(1_000_000_000, 50) == 5556


def test_compute_avg_clients_from_firms() -> None:
    firms = [
        {"clientCount": 10, "isPaying": True},
        {"clientCount": 30, "isPaying": True},
        {"clientCount": 0, "isPaying": False},
    ]
    stats = compute_avg_clients_per_firm_stats(firms)
    assert stats["avgClientsPerFirm"] == 20  # (10+30)/2 firms with clients
    assert stats["source"] == "firms_with_clients"
    assert stats["avgFirmsWithClients"] == 20.0
    assert stats["medianClientsPerFirm"] == 20.0


def test_build_ma_goals_uses_planning_when_actual_sparse(ma_storage, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "services.platform_analytics_service.load_client_master_raw",
        lambda: {
            "clients": [
                {"id": "c1", "name": "A", "firmId": "firm_default"},
                {"id": "c2", "name": "B", "firmId": "firm_default"},
                {"id": "c3", "name": "C", "firmId": "firm_beta"},
            ],
            "groups": [],
        },
    )
    goals = build_ma_goals(target_arr_yen=1_000_000_000, horizon_months=60, avg_clients_mode="auto")
    assert goals["avgClientsActual"]["avgClientsPerFirm"] == 2
    assert goals["target"]["avgClientsPerFirm"] == 80
    assert goals["target"]["avgClientsSource"] == "planning_assumption"
    assert goals["target"]["actualReady"] is False


def test_build_ma_goals_actual_mode(ma_storage, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "services.platform_analytics_service.load_client_master_raw",
        lambda: {
            "clients": [
                {"id": "c1", "name": "A", "firmId": "firm_default"},
                {"id": "c2", "name": "B", "firmId": "firm_default"},
            ],
            "groups": [],
        },
    )
    goals = build_ma_goals(avg_clients_mode="actual")
    assert goals["target"]["avgClientsPerFirm"] == 2
    assert goals["target"]["avgClientsSource"] == "actual"


def test_resolve_avg_clients_explicit_override() -> None:
    actual = {"avgClientsPerFirm": 10, "firmsWithClients": 3, "sourceLabel": "実績"}
    r = resolve_avg_clients_per_firm(
        actual_stats=actual,
        avg_clients_per_firm=120,
        avg_clients_mode="planning",
        planning_avg_clients_per_firm=80,
    )
    assert r["value"] == 120
    assert r["isOverride"] is True


def test_save_ma_assumptions_persists(ma_storage) -> None:
    saved = save_ma_assumptions(planning_avg_clients_per_firm=95, avg_clients_mode="planning")
    assert saved["planningAvgClientsPerFirm"] == 95
    assert saved["avgClientsMode"] == "planning"
    goals = build_ma_goals(avg_clients_mode="planning")
    assert goals["target"]["avgClientsPerFirm"] == 95


def test_ma_assumptions_api(ma_storage) -> None:
    r = client.put(
        "/api/platform/executive/ma-assumptions",
        headers=_platform_admin_headers(),
        json={"planning_avg_clients_per_firm": 110, "avg_clients_mode": "planning"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["planningAvgClientsPerFirm"] == 110


def test_build_ma_goals_default_target(ma_storage) -> None:
    goals = build_ma_goals(target_arr_yen=1_000_000_000, horizon_months=60, avg_clients_per_firm=50)
    assert goals["target"]["arrYen"] == 1_000_000_000
    assert goals["recommendations"]["targetPayingFirms"] == 5556
    assert goals["recommendations"]["monthlyGrossAcquisitions"] > 0
    assert len(goals["milestones"]) == 5


def test_ma_goals_route_not_shadowed_by_firm_path(ma_storage) -> None:
    """ma-goals must not match firms/{firm_id} with firm_id=ma-goals."""
    r = client.get(
        "/api/platform/executive/ma-goals",
        headers=_platform_admin_headers(),
    )
    assert r.status_code == 200, r.text
    assert "avgClientsActual" in r.json()
    assert "recommendations" in r.json()


def test_ma_goals_api(ma_storage) -> None:
    r = client.get(
        "/api/platform/executive/ma-goals",
        headers=_platform_admin_headers(),
        params={"target_arr_yen": 500_000_000, "horizon_months": 36, "avg_clients_per_firm": 40},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["target"]["arrYen"] == 500_000_000
    assert "recommendations" in body
