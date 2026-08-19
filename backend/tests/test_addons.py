"""Addon catalog — firm install vs platform-only + promote-to-official."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app
from services.addon_catalog import (
    create_custom_addon,
    is_addon_active,
    list_for_firm,
    merged_catalog,
    set_installed,
)
from services.tenancy import DEFAULT_FIRM_ID, FIRM_BETA_ID
from tests.test_smoke import _platform_admin_headers

client = TestClient(app)


@pytest.fixture(autouse=True)
def enable_header_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DOCUGRID_ALLOW_HEADER_AUTH", "true")


@pytest.fixture
def addon_paths(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("services.addon_catalog.STORAGE_DIR", tmp_path)
    monkeypatch.setattr(
        "services.addon_catalog.CUSTOM_CATALOG_PATH",
        tmp_path / "platform" / "addons_custom.json",
    )
    monkeypatch.setattr(
        "services.addon_catalog.BUILTIN_PILOTS_PATH",
        tmp_path / "platform" / "addon_pilots.json",
    )
    yield tmp_path


def _firm_admin_headers(*, firm_id: str = DEFAULT_FIRM_ID, user: str = "firm-admin@example.com") -> dict[str, str]:
    stakeholder = "actor-beta-admin" if firm_id == FIRM_BETA_ID else "actor-admin"
    client_id = "c_beta_1" if firm_id == FIRM_BETA_ID else "c1"
    return {
        "X-Docugrid-Role": "firm_admin",
        "X-Docugrid-User": user,
        "X-Docugrid-Stakeholder": stakeholder,
        "X-Docugrid-Client": client_id,
        "X-Docugrid-Firm": firm_id,
    }


def _beta_headers() -> dict[str, str]:
    return _firm_admin_headers(firm_id=FIRM_BETA_ID, user="beta-admin@example.com")


def test_builtin_catalog_has_official_and_internal(addon_paths) -> None:
    ids = {item["id"]: item for item in merged_catalog()}
    assert ids["consumption-tax-judge"]["status"] == "official"
    assert ids["consumption-tax-judge"]["installable_by"] == "firm"
    assert ids["spi-vault"]["status"] == "internal"
    assert ids["spi-vault"]["installable_by"] == "platform"


def test_firm_list_hides_internal_until_assigned(addon_paths) -> None:
    rows = {item["id"]: item for item in list_for_firm(DEFAULT_FIRM_ID)}
    assert "consumption-tax-judge" in rows
    assert "spi-vault" not in rows
    set_installed(
        DEFAULT_FIRM_ID,
        "spi-vault",
        on=True,
        actor="ops",
        allow_platform=True,
    )
    rows = {item["id"]: item for item in list_for_firm(DEFAULT_FIRM_ID)}
    assert rows["spi-vault"]["installed"] is True
    assert rows["spi-vault"]["can_uninstall"] is False


def test_firm_install_official(addon_paths) -> None:
    r = client.post(
        "/api/addons/consumption-tax-judge/install",
        headers=_firm_admin_headers(),
    )
    assert r.status_code == 200, r.text
    listed = client.get("/api/addons", headers=_firm_admin_headers())
    assert listed.status_code == 200, listed.text
    by_id = {item["id"]: item for item in listed.json()["addons"]}
    assert by_id["consumption-tax-judge"]["installed"] is True
    assert is_addon_active(DEFAULT_FIRM_ID, "consumption-tax-judge") is True


def test_firm_cannot_install_internal(addon_paths) -> None:
    r = client.post("/api/addons/spi-vault/install", headers=_firm_admin_headers())
    assert r.status_code == 403


def test_draft_not_visible_to_other_firm(addon_paths) -> None:
    create_custom_addon(
        addon_id="medical-filings",
        title="医療届出パック",
        installable_by="firm",
        pilot_firm_ids=[DEFAULT_FIRM_ID],
        actor="ops",
    )
    default_list = {item["id"] for item in list_for_firm(DEFAULT_FIRM_ID)}
    beta_list = {item["id"] for item in list_for_firm(FIRM_BETA_ID)}
    assert "medical-filings" in default_list
    assert "medical-filings" not in beta_list

    r = client.get("/api/addons", headers=_beta_headers())
    assert r.status_code == 200, r.text
    assert "medical-filings" not in {item["id"] for item in r.json()["addons"]}


def test_beta_cannot_promote(addon_paths) -> None:
    create_custom_addon(
        addon_id="medical-filings",
        title="医療届出パック",
        installable_by="firm",
        actor="ops",
    )
    r = client.post(
        "/api/addons/medical-filings/promote",
        headers=_beta_headers(),
        json={"installableBy": "firm"},
    )
    assert r.status_code in (401, 403)


def test_platform_create_assign_promote(addon_paths) -> None:
    created = client.post(
        "/api/addons",
        headers=_platform_admin_headers(),
        json={
            "id": "clinic-pack",
            "title": "診療所パック",
            "summary": "パイロット用",
            "installableBy": "firm",
            "pilotFirmIds": [DEFAULT_FIRM_ID],
        },
    )
    assert created.status_code == 200, created.text
    assert created.json()["status"] == "draft"

    assigned = client.post(
        "/api/addons/clinic-pack/assign",
        headers=_platform_admin_headers(),
        json={"firmId": DEFAULT_FIRM_ID, "installed": True},
    )
    assert assigned.status_code == 200, assigned.text
    assert is_addon_active(DEFAULT_FIRM_ID, "clinic-pack") is True

    promoted = client.post(
        "/api/addons/clinic-pack/promote",
        headers=_platform_admin_headers(),
        json={"installableBy": "firm"},
    )
    assert promoted.status_code == 200, promoted.text
    assert promoted.json()["status"] == "official"

    beta_install = client.post(
        "/api/addons/clinic-pack/install",
        headers=_beta_headers(),
    )
    assert beta_install.status_code == 200, beta_install.text
    assert is_addon_active(FIRM_BETA_ID, "clinic-pack") is True


def test_admin_catalog_requires_platform(addon_paths) -> None:
    r = client.get("/api/addons/admin", headers=_firm_admin_headers())
    assert r.status_code == 403
    plat = client.get("/api/addons/admin", headers=_platform_admin_headers())
    assert plat.status_code == 200, plat.text
    ids = {item["id"] for item in plat.json()["addons"]}
    assert "spi-vault" in ids
