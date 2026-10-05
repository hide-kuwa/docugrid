"""Feature surface modes (工事中 / 見本 / 本番) — no-code overrides."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app
from services.feature_surfaces import (
    get_surface_mode,
    resolve_feature_surfaces,
    save_firm_overrides,
    save_platform_overrides,
    writes_allowed,
)
from tests.test_smoke import _admin_headers

client = TestClient(app)


@pytest.fixture(autouse=True)
def enable_header_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DOCUGRID_ALLOW_HEADER_AUTH", "true")


@pytest.fixture
def feature_surface_paths(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("services.feature_surfaces.STORAGE_DIR", tmp_path)
    monkeypatch.setattr(
        "services.feature_surfaces.PLATFORM_OVERRIDE_PATH",
        tmp_path / "platform" / "feature_surfaces.json",
    )
    yield tmp_path


def test_catalog_loads_and_defaults(feature_surface_paths) -> None:
    resolved = resolve_feature_surfaces("firm_default")
    assert resolved["surfaces"]
    by_id = resolved["modes_by_id"]
    assert by_id.get("persona.home") == "planned"
    assert by_id.get("capture.invoice_verify") == "preview"
    assert by_id.get("rag.mcp_search") == "live"
    assert writes_allowed("persona.home", "firm_default") is False
    assert writes_allowed("capture.invoice_verify", "firm_default") is False
    assert writes_allowed("rag.mcp_search", "firm_default") is True


def test_firm_override_beats_platform(feature_surface_paths) -> None:
    save_platform_overrides({"persona.home": "preview"})
    save_firm_overrides("firm_default", {"persona.home": "live"})
    assert get_surface_mode("persona.home", "firm_default") == "live"
    assert writes_allowed("persona.home", "firm_default") is True


def test_feature_surfaces_api_resolved(feature_surface_paths) -> None:
    r = client.get("/api/feature-surfaces", headers=_admin_headers())
    assert r.status_code == 200, r.text
    body = r.json()
    assert "surfaces" in body
    assert "modesById" in body
    assert "persona.home" in body["modesById"]


def test_feature_surfaces_firm_put(feature_surface_paths) -> None:
    r = client.put(
        "/api/feature-surfaces/firm",
        headers=_admin_headers(),
        json={"modes": {"persona.home": "live", "rag.mcp_search": "preview"}},
    )
    assert r.status_code == 200, r.text
    resolved = client.get("/api/feature-surfaces", headers=_admin_headers())
    assert resolved.json()["modesById"]["persona.home"] == "live"


def test_require_feature_writes_blocks(
    feature_surface_paths, monkeypatch: pytest.MonkeyPatch
) -> None:
    from fastapi import HTTPException, Request
    from api import deps as deps_mod
    from api.deps import _require_feature_writes
    from unittest.mock import MagicMock

    save_firm_overrides("firm_default", {"rag.mcp_search": "planned"})

    class Ctx:
        firm_id = "firm_default"
        email = "smoke-test@example.com"

    monkeypatch.setattr(deps_mod, "_auth_context", lambda _req: Ctx())
    req = MagicMock(spec=Request)
    with pytest.raises(HTTPException) as ei:
        _require_feature_writes(req, "rag.mcp_search")
    assert ei.value.status_code == 403
    assert ei.value.detail["code"] == "feature_surface_restricted"


def test_require_feature_writes_allows_live(
    feature_surface_paths, monkeypatch: pytest.MonkeyPatch
) -> None:
    from fastapi import Request
    from api import deps as deps_mod
    from api.deps import _require_feature_writes
    from unittest.mock import MagicMock

    save_firm_overrides("firm_default", {"rag.mcp_search": "live"})

    class Ctx:
        firm_id = "firm_default"
        email = "smoke-test@example.com"

    monkeypatch.setattr(deps_mod, "_auth_context", lambda _req: Ctx())
    _require_feature_writes(MagicMock(spec=Request), "rag.mcp_search")
