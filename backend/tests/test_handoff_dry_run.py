"""handoff dry-run / test send."""

from __future__ import annotations

import pytest

from services import handoff_dry_run as hdr
from services.handoff_dry_run import (
    HandoffTestContext,
    build_sample_payload,
    render_idempotency_key,
    run_port_test,
    validate_payload,
)


@pytest.fixture
def ports_config_file(tmp_path, monkeypatch):
    yaml_content = """version: 1
ports:
  - port_id: docugrid.metrics.monthly_revenue.projection
    label_ja: Metrics projection
    ssot_owner: docugrid
    api_method: POST
    api_path: /api/handoff/metrics
    idempotency_key_template: "tax-accounting:{client_id}:{period_key}:revenue"
    status: planned
  - port_id: tax-accounting.journals.ingress
    label_ja: Journals
    ssot_owner: tax-accounting
    api_method: POST
    api_path: /api/v1/handoff/journals
    idempotency_key_template: "docugrid:{client_id}:{period_key}:batch-{batch_id}"
    status: planned
  - port_id: docugrid.audit.auto_vouch
    label_ja: Auto vouch
    ssot_owner: docugrid
    api_method: POST
    api_path: /api/audit/auto-link
    status: active
"""
    from services import integration_registry as reg
    from services.integration_registry import reload_integration_ports_config

    path = tmp_path / "integration_ports.yaml"
    path.write_text(yaml_content, encoding="utf-8")
    monkeypatch.setattr(reg, "_CONFIG_PATH", path)
    reload_integration_ports_config()

    health_path = tmp_path / "health.json"
    monkeypatch.setattr(hdr, "_HEALTH_PATH", health_path)
    monkeypatch.setattr(hdr, "_STORAGE_DIR", tmp_path)
    return path


def test_render_idempotency_key() -> None:
    ctx = HandoffTestContext(client_id="c1", period_key="2025-01", batch_id="b9")
    key = render_idempotency_key("docugrid:{client_id}:{period_key}:batch-{batch_id}", ctx)
    assert key == "docugrid:c1:2025-01:batch-b9"


def test_build_sample_metrics_projection(ports_config_file) -> None:
    from services.integration_registry import get_port

    port = get_port("docugrid.metrics.monthly_revenue.projection")
    assert port
    sample = build_sample_payload("docugrid.metrics.monthly_revenue.projection", port, HandoffTestContext())
    assert sample["metrics"][0]["metric_key"] == "monthly.revenue"
    assert "idempotency_key" in sample


def test_validate_metrics_projection_ok(ports_config_file) -> None:
    from services.integration_registry import get_port

    port = get_port("docugrid.metrics.monthly_revenue.projection")
    assert port
    sample = build_sample_payload("docugrid.metrics.monthly_revenue.projection", port, HandoffTestContext())
    assert validate_payload("docugrid.metrics.monthly_revenue.projection", port, sample) == []


def test_validate_auto_vouch_missing_version(ports_config_file) -> None:
    from services.integration_registry import get_port

    port = get_port("docugrid.audit.auto_vouch")
    assert port
    errors = validate_payload(
        "docugrid.audit.auto_vouch",
        port,
        {"target_value": 1, "field_id": "revenue"},
    )
    assert any("version_id" in e for e in errors)


def test_run_port_test_dry_run(ports_config_file) -> None:
    result = run_port_test("docugrid.metrics.monthly_revenue.projection", dry_run=True)
    assert result.status in {"simulated", "validated"}
    assert result.request_body.get("metrics")
    stored = hdr.get_last_test_result("docugrid.metrics.monthly_revenue.projection")
    assert stored is not None
    assert stored["status"] == result.status


def test_run_port_test_invalid_payload(ports_config_file) -> None:
    result = run_port_test(
        "tax-accounting.journals.ingress",
        payload={"client_id": "x"},
        dry_run=True,
    )
    assert result.status == "error"
    assert result.validation_errors
