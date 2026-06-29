"""Production deployment helpers — member directory, env validation."""

from __future__ import annotations

import json

import pytest

from services.member_directory import (
    MEMBER_DIRECTORY_PATH,
    DEFAULT_EMAIL_TO_STAKEHOLDER,
    _load_email_map,
    resolve_stakeholder_for_login,
)


def test_production_member_directory_ignores_dev_defaults(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    monkeypatch.setenv("DOCUGRID_ENV", "production")
    path = tmp_path / "member_directory.json"
    path.write_text(
        json.dumps({"emailToStakeholderId": {"real@firm.co.jp": "actor-s1"}}),
        encoding="utf-8",
    )
    monkeypatch.setattr("services.member_directory.MEMBER_DIRECTORY_PATH", path)

    mapping = _load_email_map()
    assert mapping == {"real@firm.co.jp": "actor-s1"}
    assert "admin@tax.co.jp" not in mapping
    assert resolve_stakeholder_for_login("admin@tax.co.jp", "actor-admin") is None
    assert resolve_stakeholder_for_login("real@firm.co.jp", "") == "actor-s1"


def test_development_member_directory_includes_dev_defaults(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    monkeypatch.setenv("DOCUGRID_ENV", "development")
    path = tmp_path / "member_directory.json"
    monkeypatch.setattr("services.member_directory.MEMBER_DIRECTORY_PATH", path)

    mapping = _load_email_map()
    assert mapping["admin@tax.co.jp"] == DEFAULT_EMAIL_TO_STAKEHOLDER["admin@tax.co.jp"]


def test_validate_production_env_script_importable() -> None:
    import importlib.util
    from pathlib import Path

    script = Path(__file__).resolve().parent.parent / "scripts" / "validate_production_env.py"
    spec = importlib.util.spec_from_file_location("validate_production_env", script)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert callable(mod.validate)


def test_staging_local_skips_google_oauth_requirement(monkeypatch: pytest.MonkeyPatch) -> None:
    from docugrid_auth import validate_auth_config

    monkeypatch.setenv("DOCUGRID_ENV", "production")
    monkeypatch.setenv("DOCUGRID_JWT_SECRET", "x" * 40)
    monkeypatch.setenv("DOCUGRID_ALLOW_HEADER_AUTH", "false")
    monkeypatch.setenv("DOCUGRID_ALLOW_PASSWORD_LOGIN", "true")
    monkeypatch.setenv("DOCUGRID_ALLOW_LOGIN_STAKEHOLDER_PICK", "false")
    monkeypatch.setenv("DOCUGRID_CORS_ORIGINS", "http://localhost:3000")
    monkeypatch.setenv("DOCUGRID_STAGING_LOCAL", "true")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "REPLACE_ME.apps.googleusercontent.com")
    warnings = validate_auth_config(strict=True)
    assert any("STAGING_LOCAL" in w for w in warnings)
