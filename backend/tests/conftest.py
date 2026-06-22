"""Shared pytest fixtures for backend API tests."""

import pytest

from main import _init_audit_events_db, _init_review_events_db, _init_slot_documents_db, _migrate_firm_id_backfill
from services.client_assignments import init_client_assignments_db
from services.document_version_service import init_document_versions_db, migrate_logical_firm_id_backfill
from services.firm_members import bootstrap_firm_members, init_firm_members_db
from services.firm_settings import migrate_legacy_settings_if_needed
from services.screen_design import bootstrap_screen_design_examples


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
