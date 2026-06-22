"""連携ポートカタログ — registry と API."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app
from services import integration_registry as reg
from services.integration_registry import (
    create_port,
    delete_port,
    export_yaml_text,
    get_port,
    import_yaml_text,
    list_ports,
    load_integration_ports_config,
    reload_integration_ports_config,
    update_port,
    validate_yaml_text,
)

client = TestClient(app)

SAMPLE_YAML = """\
version: 1
ports:
  - port_id: test.port.alpha
    label_ja: Alpha
    ssot_owner: docugrid
    status: planned
  - port_id: test.port.beta
    label_ja: Beta
    ssot_owner: tax-accounting
    manual_policy: ssot_only
    direction: ingress
    status: active
"""


def _platform_headers() -> dict[str, str]:
    return {
        "X-Docugrid-Role": "platform_admin",
        "X-Docugrid-User": "platform@tax.co.jp",
        "X-Docugrid-Stakeholder-Id": "actor-admin",
    }


def _operator_headers() -> dict[str, str]:
    return {
        "X-Docugrid-Role": "operator",
        "X-Docugrid-User": "op@tax.co.jp",
        "X-Docugrid-Stakeholder-Id": "actor-op",
    }


@pytest.fixture
def ports_config_file(tmp_path, monkeypatch):
    path = tmp_path / "integration_ports.yaml"
    path.write_text(SAMPLE_YAML, encoding="utf-8")
    monkeypatch.setattr(reg, "_CONFIG_PATH", path)
    reload_integration_ports_config()
    return path


def test_load_integration_ports_config(ports_config_file) -> None:
    cfg = load_integration_ports_config()
    assert cfg["version"] == 1
    assert len(cfg["ports"]) == 2
    ids = [p["port_id"] for p in cfg["ports"]]
    assert len(ids) == len(set(ids))


def test_get_port_known(ports_config_file) -> None:
    port = get_port("test.port.beta")
    assert port is not None
    assert port["ssot_owner"] == "tax-accounting"


def test_get_port_missing(ports_config_file) -> None:
    assert get_port("nonexistent.port") is None


def test_list_ports_filter_status(ports_config_file) -> None:
    active = list_ports(status="active")
    assert len(active) == 1
    assert active[0]["port_id"] == "test.port.beta"


def test_validate_yaml_ok(ports_config_file) -> None:
    errors, parsed = validate_yaml_text(SAMPLE_YAML)
    assert errors == []
    assert parsed is not None
    assert len(parsed["ports"]) == 2


def test_validate_yaml_duplicate_id(ports_config_file) -> None:
    bad = SAMPLE_YAML + "\n  - port_id: test.port.alpha\n    label_ja: dup\n"
    errors, parsed = validate_yaml_text(bad)
    assert parsed is None
    assert any("duplicate" in e for e in errors)


def test_validate_yaml_invalid_port_id(ports_config_file) -> None:
    bad = """version: 1
ports:
  - port_id: INVALID
    label_ja: bad
"""
    errors, _ = validate_yaml_text(bad)
    assert any("invalid format" in e for e in errors)


def test_create_port(ports_config_file) -> None:
    port = create_port(
        {
            "port_id": "test.port.new",
            "label_ja": "New port",
            "ssot_owner": "docugrid",
            "status": "planned",
        }
    )
    assert port["port_id"] == "test.port.new"
    assert get_port("test.port.new") is not None


def test_create_port_duplicate(ports_config_file) -> None:
    with pytest.raises(ValueError, match="already exists"):
        create_port({"port_id": "test.port.alpha", "label_ja": "dup"})


def test_update_port(ports_config_file) -> None:
    updated = update_port(
        "test.port.alpha",
        {
            "port_id": "test.port.alpha",
            "label_ja": "Alpha updated",
            "ssot_owner": "docugrid",
            "status": "active",
        },
    )
    assert updated["label_ja"] == "Alpha updated"
    assert get_port("test.port.alpha")["status"] == "active"


def test_delete_port(ports_config_file) -> None:
    delete_port("test.port.alpha")
    assert get_port("test.port.alpha") is None
    assert len(list_ports()) == 1


def test_export_yaml(ports_config_file) -> None:
    text = export_yaml_text()
    assert "test.port.alpha" in text
    assert text.startswith("# 連携ポートカタログ")


def test_import_yaml_merge(ports_config_file) -> None:
    incoming = """version: 2
ports:
  - port_id: test.port.gamma
    label_ja: Gamma
    status: planned
"""
    cfg = import_yaml_text(incoming, mode="merge")
    assert cfg["version"] == 2
    ids = {p["port_id"] for p in cfg["ports"]}
    assert ids == {"test.port.alpha", "test.port.beta", "test.port.gamma"}


def test_import_yaml_replace(ports_config_file) -> None:
    incoming = """version: 3
ports:
  - port_id: test.port.only
    label_ja: Only
    status: planned
"""
    cfg = import_yaml_text(incoming, mode="replace")
    assert len(cfg["ports"]) == 1
    assert cfg["ports"][0]["port_id"] == "test.port.only"


def test_api_integration_ports_list_platform(ports_config_file) -> None:
    r = client.get("/api/dev/integration-ports", headers=_platform_headers())
    assert r.status_code == 200
    body = r.json()
    assert body["port_count"] == 2


def test_api_integration_ports_list_forbidden_for_operator(ports_config_file) -> None:
    r = client.get("/api/dev/integration-ports", headers=_operator_headers())
    assert r.status_code == 403


def test_api_integration_ports_get_one(ports_config_file) -> None:
    r = client.get(
        "/api/dev/integration-ports/test.port.beta",
        headers=_platform_headers(),
    )
    assert r.status_code == 200
    assert r.json()["port_id"] == "test.port.beta"


def test_api_integration_ports_get_404(ports_config_file) -> None:
    r = client.get(
        "/api/dev/integration-ports/missing.port",
        headers=_platform_headers(),
    )
    assert r.status_code == 404


def test_api_create_port(ports_config_file) -> None:
    r = client.post(
        "/api/dev/integration-ports",
        headers=_platform_headers(),
        json={
            "port_id": "test.port.api",
            "label_ja": "API created",
            "ssot_owner": "docugrid",
            "status": "planned",
        },
    )
    assert r.status_code == 201
    assert r.json()["port_id"] == "test.port.api"


def test_api_update_port(ports_config_file) -> None:
    r = client.put(
        "/api/dev/integration-ports/test.port.alpha",
        headers=_platform_headers(),
        json={
            "port_id": "test.port.alpha",
            "label_ja": "Via API",
            "status": "deprecated",
        },
    )
    assert r.status_code == 200
    assert r.json()["label_ja"] == "Via API"


def test_api_delete_port(ports_config_file) -> None:
    r = client.delete(
        "/api/dev/integration-ports/test.port.alpha",
        headers=_platform_headers(),
    )
    assert r.status_code == 200
    assert r.json()["status"] == "deleted"


def test_api_validate_yaml(ports_config_file) -> None:
    r = client.post(
        "/api/dev/integration-ports/validate",
        headers=_platform_headers(),
        json={"yaml_text": SAMPLE_YAML},
    )
    assert r.status_code == 200
    assert r.json()["valid"] is True


def test_api_validate_yaml_invalid(ports_config_file) -> None:
    r = client.post(
        "/api/dev/integration-ports/validate",
        headers=_platform_headers(),
        json={"yaml_text": "version: 1\nports:\n  - port_id: BAD\n    label_ja: x\n"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is False
    assert body["errors"]


def test_api_export_yaml(ports_config_file) -> None:
    r = client.get("/api/dev/integration-ports/export", headers=_platform_headers())
    assert r.status_code == 200
    body = r.json()
    assert "yaml_text" in body
    assert "test.port.alpha" in body["yaml_text"]


def test_api_import_yaml_merge(ports_config_file) -> None:
    r = client.post(
        "/api/dev/integration-ports/import",
        headers=_platform_headers(),
        json={
            "yaml_text": "version: 1\nports:\n  - port_id: test.port.delta\n    label_ja: Delta\n",
            "mode": "merge",
        },
    )
    assert r.status_code == 200
    assert r.json()["port_count"] == 3


def test_api_port_sample(ports_config_file) -> None:
    r = client.get(
        "/api/dev/integration-ports/test.port.beta/sample",
        headers=_platform_headers(),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["port_id"] == "test.port.beta"
    assert body["payload"]


def test_api_port_test_dry_run(ports_config_file) -> None:
    r = client.post(
        "/api/dev/integration-ports/test.port.beta/test",
        headers=_platform_headers(),
        json={"dry_run": True, "client_id": "c1", "period_key": "2025-01"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["dry_run"] is True
    assert body["status"] in {"simulated", "validated", "error"}
