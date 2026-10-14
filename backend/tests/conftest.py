"""Shared pytest fixtures for backend API tests."""

import os

os.environ.setdefault("DOCUGRID_ENV", "development")

import pytest
from fastapi.testclient import TestClient

from main import _init_audit_events_db, _init_review_events_db, _init_slot_documents_db, _migrate_firm_id_backfill, app
from services.client_assignments import init_client_assignments_db
from services.document_version_service import init_document_versions_db, migrate_logical_firm_id_backfill
from services.firm_members import bootstrap_firm_members, init_firm_members_db
from services.firm_settings import migrate_legacy_settings_if_needed
from services.screen_design import bootstrap_screen_design_examples


@pytest.fixture(scope="session", autouse=True)
def _enable_password_login_for_tests() -> None:
    import os

    os.environ.setdefault("DOCUGRID_ALLOW_PASSWORD_LOGIN", "true")


@pytest.fixture(scope="session", autouse=True)
def _ensure_db_schema() -> None:
    _init_audit_events_db()
    _init_slot_documents_db()
    _init_review_events_db()
    init_document_versions_db()
    init_client_assignments_db()
    init_firm_members_db()
    bootstrap_firm_members()
    migrate_legacy_settings_if_needed()
    bootstrap_screen_design_examples()
    _migrate_firm_id_backfill()
    migrate_logical_firm_id_backfill()


@pytest.fixture(autouse=True)
def _disable_stripe_billing_gate_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    """Most API tests assume unpaid Stripe does not block product routes."""
    monkeypatch.setattr("api.application.is_stripe_configured", lambda: False)
    monkeypatch.setattr("services.stripe_billing_service.is_stripe_configured", lambda: False)
    monkeypatch.setattr("services.stripe_billing_service.is_billing_enforced", lambda: False)


@pytest.fixture
def fresh_client() -> TestClient:
    """
    TestClient without cookies from prior login tests.

    Use for unauthenticated POST/PUT/etc. when CSRF middleware is enabled:
    a shared client that logged in earlier may get 403 instead of 401.
    See docs/security-checklist.md §A-3.
    """
    return TestClient(app)
