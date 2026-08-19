"""SQLite schema bootstrap."""

from __future__ import annotations

import sqlite3
from typing import Optional

from api.constants import (
    AUDIT_EVENTS_DB_PATH,
    AUDIT_LINKS_DB_PATH,
    REVIEW_EVENTS_DB_PATH,
    SLOT_DOCS_DB_PATH,
)
from services.tenancy import DEFAULT_FIRM_ID, get_client_firm_id

def _get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(AUDIT_LINKS_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _init_audit_links_db() -> None:
    with _get_db_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS audit_links (
                version_id TEXT NOT NULL,
                link_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                left_side TEXT NOT NULL,
                left_page INTEGER NOT NULL,
                left_x REAL NOT NULL,
                left_y REAL NOT NULL,
                left_file_name TEXT,
                left_file_hash TEXT,
                right_side TEXT NOT NULL,
                right_page INTEGER NOT NULL,
                right_x REAL NOT NULL,
                right_y REAL NOT NULL,
                right_file_name TEXT,
                right_file_hash TEXT,
                created_by TEXT,
                PRIMARY KEY (version_id, link_id)
            )
            """
        )
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(audit_links)").fetchall()}
        if "left_file_hash" not in columns:
            conn.execute("ALTER TABLE audit_links ADD COLUMN left_file_hash TEXT")
        if "right_file_hash" not in columns:
            conn.execute("ALTER TABLE audit_links ADD COLUMN right_file_hash TEXT")
        if "created_by" not in columns:
            conn.execute("ALTER TABLE audit_links ADD COLUMN created_by TEXT")
        if "comment" not in columns:
            conn.execute("ALTER TABLE audit_links ADD COLUMN comment TEXT")


def _init_audit_events_db() -> None:
    with sqlite3.connect(AUDIT_EVENTS_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS audit_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                stakeholder_id TEXT,
                user_email TEXT,
                role TEXT,
                client_id TEXT,
                path TEXT NOT NULL,
                action TEXT NOT NULL,
                result TEXT NOT NULL,
                detail TEXT,
                http_status INTEGER
            )
            """
        )
        columns = {row[1] for row in conn.execute("PRAGMA table_info(audit_events)").fetchall()}
        if "http_status" not in columns:
            conn.execute("ALTER TABLE audit_events ADD COLUMN http_status INTEGER")
        if "firm_id" not in columns:
            conn.execute("ALTER TABLE audit_events ADD COLUMN firm_id TEXT")


def _init_review_events_db() -> None:
    with sqlite3.connect(REVIEW_EVENTS_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS review_events (
                id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                period_key TEXT NOT NULL,
                slot_id TEXT NOT NULL,
                content_sha256 TEXT,
                version_label TEXT,
                event_type TEXT NOT NULL,
                status TEXT,
                action_title TEXT,
                reason TEXT,
                actor_stakeholder_id TEXT,
                actor_email TEXT,
                actor_role TEXT,
                is_major INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
            """
        )
        for col in ("logical_document_id", "document_version_id", "detail", "firm_id"):
            try:
                conn.execute(f"ALTER TABLE review_events ADD COLUMN {col} TEXT")
            except sqlite3.OperationalError:
                pass
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_review_events_slot
                ON review_events (client_id, period_key, slot_id, created_at DESC)
            """
        )


def _init_slot_documents_db() -> None:
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS slot_documents (
                id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                period_key TEXT NOT NULL,
                slot_id TEXT NOT NULL,
                slot_label TEXT,
                original_name TEXT NOT NULL,
                storage_key TEXT NOT NULL,
                page_count INTEGER,
                content_sha256 TEXT NOT NULL,
                byte_size INTEGER NOT NULL,
                uploaded_by TEXT,
                uploaded_at TEXT NOT NULL,
                logical_document_id TEXT,
                current_version_id TEXT,
                UNIQUE (client_id, period_key, slot_id)
            )
            """
        )
        for col in (
            "logical_document_id",
            "current_version_id",
            "docugrid_document_id",
            "firm_id",
            "google_drive_file_id",
            "deleted_at",
            "deleted_from_slot_id",
            "deleted_from_slot_label",
            "client_shared_at",
            "client_shared_by",
            "contains_individual_number",
            "spi_retention_until",
        ):
            try:
                conn.execute(f"ALTER TABLE slot_documents ADD COLUMN {col} TEXT")
            except sqlite3.OperationalError:
                pass


def _migrate_audit_firm_id_backfill() -> None:
    _init_audit_events_db()
    with sqlite3.connect(AUDIT_EVENTS_DB_PATH) as conn:
        rows = conn.execute(
            """
            SELECT id, client_id FROM audit_events
            WHERE firm_id IS NULL OR firm_id = ''
            """
        ).fetchall()
        for event_id, client_id in rows:
            fid = get_client_firm_id(str(client_id)) if client_id else DEFAULT_FIRM_ID
            conn.execute(
                "UPDATE audit_events SET firm_id=? WHERE id=?",
                (fid, event_id),
            )


def _migrate_firm_id_backfill() -> None:
    _migrate_audit_firm_id_backfill()
    _init_slot_documents_db()
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        rows = conn.execute(
            "SELECT id, client_id FROM slot_documents WHERE firm_id IS NULL OR firm_id = ''"
        ).fetchall()
        for doc_id, client_id in rows:
            conn.execute(
                "UPDATE slot_documents SET firm_id=? WHERE id=?",
                (get_client_firm_id(str(client_id)), doc_id),
            )
    _init_review_events_db()
    with sqlite3.connect(REVIEW_EVENTS_DB_PATH) as conn:
        rows = conn.execute(
            "SELECT id, client_id FROM review_events WHERE firm_id IS NULL OR firm_id = ''"
        ).fetchall()
        for event_id, client_id in rows:
            conn.execute(
                "UPDATE review_events SET firm_id=? WHERE id=?",
                (get_client_firm_id(str(client_id)), event_id),
            )


def _link_docugrid_to_slot(client_id: str, period_key: str, slot_id: str, document_id: str) -> None:
    _init_slot_documents_db()
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.execute(
            """
            UPDATE slot_documents
            SET docugrid_document_id=?
            WHERE client_id=? AND period_key=? AND slot_id=?
            """,
            (document_id, client_id, period_key, slot_id),
        )

__all__ = [
    "_get_db_connection",
    "_init_audit_events_db",
    "_init_audit_links_db",
    "_init_review_events_db",
    "_init_slot_documents_db",
    "_link_docugrid_to_slot",
    "_migrate_audit_firm_id_backfill",
    "_migrate_firm_id_backfill",
]
