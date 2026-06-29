"""Platform executive analytics."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app
from services.platform_analytics_service import (
    build_executive_dashboard,
    build_firm_row,
    discover_firm_ids,
    init_platform_metrics_db,
)
from services.stripe_billing_service import save_billing_record
from tests.test_smoke import _platform_admin_headers

client = TestClient(app)


@pytest.fixture(autouse=True)
def enable_header_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DOCUGRID_ALLOW_HEADER_AUTH", "true")


@pytest.fixture
def platform_storage(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("services.platform_analytics_service.STORAGE_DIR", tmp_path)
    monkeypatch.setattr("services.stripe_billing_service.STORAGE_DIR", tmp_path)
    monkeypatch.setattr("services.platform_analytics_service.SNAPSHOTS_DB_PATH", tmp_path / "platform_metrics.db")
    (tmp_path / "firms" / "firm_default").mkdir(parents=True)
    init_platform_metrics_db()
    yield tmp_path


def test_discover_firm_ids_includes_labels(platform_storage) -> None:
    ids = discover_firm_ids()
    assert "firm_default" in ids


def test_firm_mrr_from_billing_and_clients(platform_storage, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "services.platform_analytics_service.load_client_master_raw",
        lambda: {
            "clients": [
                {"id": "c1", "name": "A社", "firmId": "firm_default", "category": "法人"},
                {"id": "c2", "name": "B社", "firmId": "firm_default", "category": "法人"},
            ],
            "groups": [],
        },
    )
    save_billing_record("firm_default", {"status": "active", "planId": "firm"})
    row = build_firm_row("firm_default", {"firm_default": [{"id": "c1"}, {"id": "c2"}]})
    assert row["clientCount"] == 2
    assert row["mrrYen"] == 10000 + 200


def test_executive_dashboard_kpis(platform_storage, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "services.platform_analytics_service.load_client_master_raw",
        lambda: {"clients": [], "groups": []},
    )
    save_billing_record("firm_default", {"status": "active", "planId": "firm"})
    save_billing_record("firm_beta", {"status": "canceled", "planId": "firm"})
    dash = build_executive_dashboard(record_snapshot=False)
    assert dash["kpis"]["payingFirms"] == 1
    assert dash["kpis"]["churnedFirms"] == 1
    assert dash["kpis"]["mrrYen"] == 10000
    assert dash["kpis"]["arrYen"] == 120000
    assert "firms" in dash
    assert "clients" in dash


def test_executive_dashboard_api_requires_platform(platform_storage, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "services.platform_analytics_service.load_client_master_raw",
        lambda: {"clients": [], "groups": []},
    )
    r = client.get("/api/platform/executive/dashboard", headers=_platform_admin_headers())
    assert r.status_code == 200, r.text
    body = r.json()
    assert "kpis" in body
    assert "charts" in body
