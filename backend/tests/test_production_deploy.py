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
    assert "admin@taxx.jp" not in mapping
    assert resolve_stakeholder_for_login("admin@taxx.jp", "actor-admin") is None
    assert resolve_stakeholder_for_login("real@firm.co.jp", "") == "actor-s1"


def test_development_member_directory_includes_dev_defaults(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    monkeypatch.setenv("DOCUGRID_ENV", "development")
    path = tmp_path / "member_directory.json"
    monkeypatch.setattr("services.member_directory.MEMBER_DIRECTORY_PATH", path)

    mapping = _load_email_map()
    assert mapping["admin@taxx.jp"] == DEFAULT_EMAIL_TO_STAKEHOLDER["admin@taxx.jp"]


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
    monkeypatch.setenv("DOCUGRID_LOGIN_PASSWORD", "staging")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "REPLACE_ME.apps.googleusercontent.com")
    warnings = validate_auth_config(strict=True)
    assert any("STAGING_LOCAL" in w for w in warnings)


def test_validate_auth_config_rejects_legacy_files_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    from docugrid_auth import validate_auth_config

    monkeypatch.setenv("DOCUGRID_ENV", "production")
    monkeypatch.setenv("DOCUGRID_JWT_SECRET", "x" * 40)
    monkeypatch.setenv("DOCUGRID_ALLOW_HEADER_AUTH", "false")
    monkeypatch.setenv("DOCUGRID_ALLOW_PASSWORD_LOGIN", "false")
    monkeypatch.setenv("DOCUGRID_ALLOW_LOGIN_STAKEHOLDER_PICK", "false")
    monkeypatch.setenv("DOCUGRID_CORS_ORIGINS", "https://app.example.com")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "real-client.apps.googleusercontent.com")
    monkeypatch.setenv("DOCUGRID_ALLOW_LEGACY_FILES", "true")
    with pytest.raises(RuntimeError, match="DOCUGRID_ALLOW_LEGACY_FILES"):
        validate_auth_config()


def test_validate_auth_config_rejects_jwt_placeholder(monkeypatch: pytest.MonkeyPatch) -> None:
    from docugrid_auth import validate_auth_config

    monkeypatch.setenv("DOCUGRID_ENV", "production")
    monkeypatch.setenv("DOCUGRID_JWT_SECRET", "REPLACE_WITH_32_PLUS_CHAR_RANDOM_STRING")
    monkeypatch.setenv("DOCUGRID_ALLOW_HEADER_AUTH", "false")
    monkeypatch.setenv("DOCUGRID_ALLOW_PASSWORD_LOGIN", "false")
    monkeypatch.setenv("DOCUGRID_ALLOW_LOGIN_STAKEHOLDER_PICK", "false")
    monkeypatch.setenv("DOCUGRID_CORS_ORIGINS", "https://app.example.com")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "real-client.apps.googleusercontent.com")
    with pytest.raises(RuntimeError, match="DOCUGRID_JWT_SECRET"):
        validate_auth_config()


def test_validate_auth_config_rejects_default_staging_password(monkeypatch: pytest.MonkeyPatch) -> None:
    from docugrid_auth import validate_auth_config

    monkeypatch.setenv("DOCUGRID_ENV", "production")
    monkeypatch.setenv("DOCUGRID_JWT_SECRET", "x" * 40)
    monkeypatch.setenv("DOCUGRID_ALLOW_HEADER_AUTH", "false")
    monkeypatch.setenv("DOCUGRID_ALLOW_PASSWORD_LOGIN", "true")
    monkeypatch.setenv("DOCUGRID_ALLOW_LOGIN_STAKEHOLDER_PICK", "false")
    monkeypatch.setenv("DOCUGRID_CORS_ORIGINS", "http://localhost:3000")
    monkeypatch.setenv("DOCUGRID_STAGING_LOCAL", "true")
    monkeypatch.delenv("DOCUGRID_LOGIN_PASSWORD", raising=False)
    with pytest.raises(RuntimeError, match="DOCUGRID_LOGIN_PASSWORD"):
        validate_auth_config()


def test_bootstrap_seed_skips_dev_emails_for_real_production(tmp_path, monkeypatch) -> None:
    import importlib.util
    from pathlib import Path

    script = Path(__file__).resolve().parent.parent / "scripts" / "bootstrap_production.py"
    spec = importlib.util.spec_from_file_location("bootstrap_production", script)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    member_path = tmp_path / "member_directory.json"
    monkeypatch.setattr(mod, "STORAGE_DIR", tmp_path)
    monkeypatch.setattr(mod, "MEMBER_PATH", member_path)

    added = mod._seed_member_directory(include_dev_defaults=False, strip_dev_emails=False)
    assert added == 0
    data = json.loads(member_path.read_text(encoding="utf-8"))
    assert data["emailToStakeholderId"] == {}
    assert "admin@taxx.jp" not in data["emailToStakeholderId"]


def test_bootstrap_strip_dev_emails(tmp_path, monkeypatch) -> None:
    import importlib.util
    from pathlib import Path

    script = Path(__file__).resolve().parent.parent / "scripts" / "bootstrap_production.py"
    spec = importlib.util.spec_from_file_location("bootstrap_production", script)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    member_path = tmp_path / "member_directory.json"
    member_path.write_text(
        json.dumps(
            {
                "emailToStakeholderId": {
                    "admin@taxx.jp": "actor-admin",
                    "real@firm.example": "actor-s1",
                }
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(mod, "STORAGE_DIR", tmp_path)
    monkeypatch.setattr(mod, "MEMBER_PATH", member_path)

    mod._seed_member_directory(include_dev_defaults=False, strip_dev_emails=True)
    data = json.loads(member_path.read_text(encoding="utf-8"))
    assert data["emailToStakeholderId"] == {"real@firm.example": "actor-s1"}


def test_super_admin_disabled_by_default_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    from services.super_admin import get_super_admin_email, is_super_admin_email

    monkeypatch.setenv("DOCUGRID_ENV", "production")
    monkeypatch.delenv("DOCUGRID_STAGING_LOCAL", raising=False)
    monkeypatch.delenv("DOCUGRID_SUPER_ADMIN_EMAIL", raising=False)
    assert get_super_admin_email() == ""
    assert not is_super_admin_email("admin@taxx.jp")


def test_validate_production_env_passes_with_fixture(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    import importlib.util
    from pathlib import Path

    script = Path(__file__).resolve().parent.parent / "scripts" / "validate_production_env.py"
    spec = importlib.util.spec_from_file_location("validate_production_env", script)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    member_path = tmp_path / "member_directory.json"
    member_path.write_text(
        json.dumps({"emailToStakeholderId": {"ops@firm.example": "actor-s1"}}),
        encoding="utf-8",
    )
    storage = tmp_path / "storage"
    storage.mkdir()

    monkeypatch.setenv("DOCUGRID_ENV", "production")
    monkeypatch.setenv("DOCUGRID_JWT_SECRET", "x" * 40)
    monkeypatch.setenv("DOCUGRID_SECRET_ENCRYPTION_KEY", "y" * 40)
    monkeypatch.setenv("DOCUGRID_ALLOW_HEADER_AUTH", "false")
    monkeypatch.setenv("DOCUGRID_ALLOW_PASSWORD_LOGIN", "false")
    monkeypatch.setenv("DOCUGRID_ALLOW_LOGIN_STAKEHOLDER_PICK", "false")
    monkeypatch.setenv("DOCUGRID_CORS_ORIGINS", "https://app.example.com")
    monkeypatch.setenv("DOCUGRID_FRONTEND_URL", "https://app.example.com")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "real-client.apps.googleusercontent.com")
    monkeypatch.setenv("DOCUGRID_CSRF", "true")
    monkeypatch.setenv("DOCUGRID_SESSION_COOKIE_SECURE", "true")
    monkeypatch.delenv("DOCUGRID_STAGING_LOCAL", raising=False)
    monkeypatch.delenv("DOCUGRID_SUPER_ADMIN_EMAIL", raising=False)
    monkeypatch.setattr(mod, "BACKEND_ROOT", tmp_path)
    monkeypatch.setattr("services.member_directory.MEMBER_DIRECTORY_PATH", member_path)

    assert mod.validate(check_stripe=False) == 0
