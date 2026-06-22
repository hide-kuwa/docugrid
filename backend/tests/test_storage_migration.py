"""Legacy storage migration (firm-scoped paths)."""

from __future__ import annotations

import sqlite3

import services.storage_migration as sm
import services.storage_paths as sp
from services.document_version_service import VERSIONS_DB_PATH, init_document_versions_db
from services.tenancy import DEFAULT_FIRM_ID, SLOT_DOCS_DB_PATH


def _minimal_pdf_bytes() -> bytes:
    return b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"


def test_migrate_legacy_version_dry_run_and_apply(tmp_path, monkeypatch) -> None:
    storage = tmp_path / "storage"
    legacy_pdf = storage / "versions" / "ver-legacy-01.pdf"
    legacy_pdf.parent.mkdir(parents=True)
    legacy_pdf.write_bytes(_minimal_pdf_bytes())

    versions_db = storage / "document_versions.db"
    monkeypatch.setattr(sp, "STORAGE_DIR", storage)
    monkeypatch.setattr(sm, "STORAGE_DIR", storage)
    monkeypatch.setattr("services.document_version_service.STORAGE_DIR", storage)
    monkeypatch.setattr("services.document_version_service.VERSIONS_DB_PATH", versions_db)
    monkeypatch.setattr(sm, "VERSIONS_DB_PATH", versions_db)

    init_document_versions_db()  # uses document_version_service.VERSIONS_DB_PATH
    with sqlite3.connect(versions_db) as conn:
        conn.execute(
            """
            INSERT INTO logical_documents
                (id, client_id, period_key, slot_id, title, status, created_at, updated_at, firm_id)
            VALUES ('ld1', 'c1', 'year:2025', '1', 't', 'uploaded', 't', 't', ?)
            """,
            (DEFAULT_FIRM_ID,),
        )
        conn.execute(
            """
            INSERT INTO document_versions
                (id, logical_document_id, version_major, version_minor, version_patch,
                 version_label, storage_key, content_sha256, byte_size, original_name,
                 page_count, source, parent_version_id, created_by_stakeholder_id,
                 created_by_email, created_at)
            VALUES ('ver-legacy-01', 'ld1', 1, 0, 0, 'v1.0.0', 'versions/ver-legacy-01.pdf',
                    'sha', 10, 'a.pdf', 1, 'test', NULL, NULL, NULL, 't')
            """
        )

    dry = sm.migrate_legacy_version_files(dry_run=True)
    assert len(dry) == 1
    assert dry[0].status == "would_migrate"
    assert not (storage / DEFAULT_FIRM_ID / "versions" / "ver-legacy-01.pdf").exists()

    applied = sm.migrate_legacy_version_files(dry_run=False)
    assert applied[0].status == "migrated"
    dest = storage / DEFAULT_FIRM_ID / "versions" / "ver-legacy-01.pdf"
    assert dest.is_file()
    assert legacy_pdf.is_file()

    with sqlite3.connect(versions_db) as conn:
        key = conn.execute(
            "SELECT storage_key FROM document_versions WHERE id='ver-legacy-01'"
        ).fetchone()[0]
    assert key == f"{DEFAULT_FIRM_ID}/versions/ver-legacy-01.pdf"


def test_migrate_updates_slot_documents_storage_key(tmp_path, monkeypatch) -> None:
    storage = tmp_path / "storage"
    legacy_pdf = storage / "versions" / "ver-slot-01.pdf"
    legacy_pdf.parent.mkdir(parents=True)
    legacy_pdf.write_bytes(_minimal_pdf_bytes())

    versions_db = storage / "document_versions.db"
    slot_db = storage / "slot_documents.db"
    monkeypatch.setattr(sp, "STORAGE_DIR", storage)
    monkeypatch.setattr(sm, "STORAGE_DIR", storage)
    monkeypatch.setattr(sm, "VERSIONS_DB_PATH", versions_db)
    monkeypatch.setattr(sm, "SLOT_DOCS_DB_PATH", slot_db)
    monkeypatch.setattr("services.document_version_service.VERSIONS_DB_PATH", versions_db)
    monkeypatch.setattr("services.tenancy.SLOT_DOCS_DB_PATH", slot_db)

    init_document_versions_db()
    with sqlite3.connect(versions_db) as conn:
        conn.execute(
            """
            INSERT INTO logical_documents
                (id, client_id, period_key, slot_id, title, status, created_at, updated_at, firm_id)
            VALUES ('ld2', 'c1', 'year:2025', '2', 't', 'uploaded', 't', 't', ?)
            """,
            (DEFAULT_FIRM_ID,),
        )
        conn.execute(
            """
            INSERT INTO document_versions
                (id, logical_document_id, version_major, version_minor, version_patch,
                 version_label, storage_key, content_sha256, byte_size, original_name,
                 page_count, source, parent_version_id, created_by_stakeholder_id,
                 created_by_email, created_at)
            VALUES ('ver-slot-01', 'ld2', 1, 0, 0, 'v1.0.0', 'versions/ver-slot-01.pdf',
                    'sha', 10, 'a.pdf', 1, 'test', NULL, NULL, NULL, 't')
            """
        )

    with sqlite3.connect(slot_db) as conn:
        conn.execute(
            """
            CREATE TABLE slot_documents (
                id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                period_key TEXT NOT NULL,
                slot_id TEXT NOT NULL,
                slot_label TEXT,
                original_name TEXT NOT NULL,
                storage_key TEXT NOT NULL,
                page_count INTEGER,
                content_sha256 TEXT,
                byte_size INTEGER,
                uploaded_by TEXT,
                uploaded_at TEXT,
                logical_document_id TEXT,
                current_version_id TEXT,
                firm_id TEXT
            )
            """
        )
        conn.execute(
            """
            INSERT INTO slot_documents
                (id, client_id, period_key, slot_id, original_name, storage_key,
                 logical_document_id, current_version_id, firm_id)
            VALUES ('sd1', 'c1', 'year:2025', '2', 'a.pdf', 'versions/ver-slot-01.pdf',
                    'ld2', 'ver-slot-01', ?)
            """,
            (DEFAULT_FIRM_ID,),
        )

    sm.migrate_legacy_version_files(dry_run=False)

    with sqlite3.connect(slot_db) as conn:
        key = conn.execute("SELECT storage_key FROM slot_documents WHERE id='sd1'").fetchone()[0]
    assert key == f"{DEFAULT_FIRM_ID}/versions/ver-slot-01.pdf"


def test_list_orphan_legacy_files(tmp_path, monkeypatch) -> None:
    storage = tmp_path / "storage"
    (storage / "versions").mkdir(parents=True)
    (storage / "versions" / "orphan.pdf").write_bytes(_minimal_pdf_bytes())
    versions_db = storage / "document_versions.db"

    monkeypatch.setattr(sp, "STORAGE_DIR", storage)
    monkeypatch.setattr(sm, "STORAGE_DIR", storage)
    monkeypatch.setattr(sm, "VERSIONS_DB_PATH", versions_db)
    monkeypatch.setattr("services.document_version_service.VERSIONS_DB_PATH", versions_db)

    init_document_versions_db()
    orphans = sm.list_orphan_legacy_files()
    assert orphans == ["versions/orphan.pdf"]
