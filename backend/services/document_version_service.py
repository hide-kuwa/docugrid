"""論理資料と immutable な document_versions（P2 版管理）。

新版 PDF は storage/{firm_id}/versions/{version_id}.pdf に保存する。
旧版（storage/versions/...）は読み取り時にフォールバックする。
"""

from __future__ import annotations

import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Literal, Optional

import fitz  # PyMuPDF

from services.storage_paths import resolve_storage_path
from services.tenancy import DEFAULT_FIRM_ID, get_client_firm_id

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
VERSIONS_DB_PATH = STORAGE_DIR / "document_versions.db"
VERSION_FILES_DIR = STORAGE_DIR / "versions"
VERSION_FILES_DIR.mkdir(parents=True, exist_ok=True)

VersionBump = Literal["upload", "minor", "major", "audit_start"]


@dataclass
class LogicalDocument:
    id: str
    client_id: str
    period_key: str
    slot_id: str
    title: str
    status: str
    current_version_id: Optional[str]
    approved_version_id: Optional[str]
    created_at: str
    updated_at: str
    firm_id: str = DEFAULT_FIRM_ID


@dataclass
class DocumentVersion:
    id: str
    logical_document_id: str
    version_major: int
    version_minor: int
    version_patch: int
    version_label: str
    storage_key: str
    content_sha256: str
    byte_size: int
    page_count: Optional[int]
    original_name: str
    source: str
    parent_version_id: Optional[str]
    created_by_stakeholder_id: Optional[str]
    created_by_email: Optional[str]
    created_at: str
    metadata_json: Optional[str] = None


def init_document_versions_db() -> None:
    with sqlite3.connect(VERSIONS_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS logical_documents (
                id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                period_key TEXT NOT NULL,
                slot_id TEXT NOT NULL,
                title TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'uploaded',
                current_version_id TEXT,
                approved_version_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE (client_id, period_key, slot_id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS document_versions (
                id TEXT PRIMARY KEY,
                logical_document_id TEXT NOT NULL,
                version_major INTEGER NOT NULL DEFAULT 1,
                version_minor INTEGER NOT NULL DEFAULT 0,
                version_patch INTEGER NOT NULL DEFAULT 0,
                version_label TEXT NOT NULL,
                storage_key TEXT NOT NULL,
                content_sha256 TEXT NOT NULL,
                byte_size INTEGER NOT NULL,
                original_name TEXT NOT NULL,
                page_count INTEGER,
                source TEXT NOT NULL,
                parent_version_id TEXT,
                created_by_stakeholder_id TEXT,
                created_by_email TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_document_versions_logical
                ON document_versions (logical_document_id, created_at DESC)
            """
        )
        try:
            conn.execute("ALTER TABLE logical_documents ADD COLUMN firm_id TEXT")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("ALTER TABLE document_versions ADD COLUMN metadata_json TEXT")
        except sqlite3.OperationalError:
            pass


def migrate_logical_firm_id_backfill() -> None:
    init_document_versions_db()
    with sqlite3.connect(VERSIONS_DB_PATH) as conn:
        rows = conn.execute(
            "SELECT id, client_id FROM logical_documents WHERE firm_id IS NULL OR firm_id = ''"
        ).fetchall()
        for logical_id, client_id in rows:
            conn.execute(
                "UPDATE logical_documents SET firm_id=? WHERE id=?",
                (get_client_firm_id(str(client_id)), logical_id),
            )


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _row_logical(row: sqlite3.Row) -> LogicalDocument:
    keys = row.keys()
    firm_id = row["firm_id"] if "firm_id" in keys and row["firm_id"] else None
    if not firm_id:
        firm_id = get_client_firm_id(row["client_id"])
    return LogicalDocument(
        id=row["id"],
        client_id=row["client_id"],
        period_key=row["period_key"],
        slot_id=row["slot_id"],
        title=row["title"],
        status=row["status"],
        current_version_id=row["current_version_id"],
        approved_version_id=row["approved_version_id"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        firm_id=str(firm_id),
    )


def _row_version(row: sqlite3.Row) -> DocumentVersion:
    return DocumentVersion(
        id=row["id"],
        logical_document_id=row["logical_document_id"],
        version_major=row["version_major"],
        version_minor=row["version_minor"],
        version_patch=row["version_patch"],
        version_label=row["version_label"],
        storage_key=row["storage_key"],
        content_sha256=row["content_sha256"],
        byte_size=row["byte_size"],
        page_count=row["page_count"],
        original_name=row["original_name"],
        source=row["source"],
        parent_version_id=row["parent_version_id"],
        created_by_stakeholder_id=row["created_by_stakeholder_id"],
        created_by_email=row["created_by_email"],
        created_at=row["created_at"],
        metadata_json=row["metadata_json"] if "metadata_json" in row.keys() else None,
    )


def ensure_logical_document(
    *,
    client_id: str,
    period_key: str,
    slot_id: str,
    title: str,
) -> LogicalDocument:
    init_document_versions_db()
    now = _now_iso()
    with sqlite3.connect(VERSIONS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            """
            SELECT * FROM logical_documents
            WHERE client_id=? AND period_key=? AND slot_id=?
            """,
            (client_id, period_key, slot_id),
        ).fetchone()
        if row:
            if title and row["title"] != title:
                conn.execute(
                    "UPDATE logical_documents SET title=?, updated_at=? WHERE id=?",
                    (title, now, row["id"]),
                )
                row = conn.execute(
                    "SELECT * FROM logical_documents WHERE id=?", (row["id"],)
                ).fetchone()
            return _row_logical(row)
        doc_id = uuid.uuid4().hex
        firm_id = get_client_firm_id(client_id)
        conn.execute(
            """
            INSERT INTO logical_documents
                (id, client_id, period_key, slot_id, title, status,
                 current_version_id, approved_version_id, created_at, updated_at, firm_id)
            VALUES (?, ?, ?, ?, ?, 'empty', NULL, NULL, ?, ?, ?)
            """,
            (doc_id, client_id, period_key, slot_id, title, now, now, firm_id),
        )
        row = conn.execute(
            "SELECT * FROM logical_documents WHERE id=?", (doc_id,)
        ).fetchone()
    return _row_logical(row)


def _latest_version_row(conn: sqlite3.Connection, logical_id: str) -> Optional[sqlite3.Row]:
    return conn.execute(
        """
        SELECT * FROM document_versions
        WHERE logical_document_id=?
        ORDER BY version_major DESC, version_minor DESC, version_patch DESC, created_at DESC
        LIMIT 1
        """,
        (logical_id,),
    ).fetchone()


def compute_next_version(
    logical_id: str,
    bump: VersionBump,
) -> tuple[int, int, int, str]:
    init_document_versions_db()
    with sqlite3.connect(VERSIONS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        prev = _latest_version_row(conn, logical_id)
    if not prev:
        major, minor, patch = 1, 0, 0
    elif bump == "upload":
        # クライアント再提出: 同一 major 上で minor を進める（提出版 v1.0 → v1.1）
        major, minor, patch = prev["version_major"], prev["version_minor"] + 1, 0
    else:
        major, minor, patch = prev["version_major"], prev["version_minor"], prev["version_patch"]
        if bump == "audit_start":
            major, minor, patch = 2, 0, 0
        elif bump == "major":
            major, minor, patch = major + 1, 0, 0
        elif bump == "minor":
            minor, patch = minor + 1, 0
    return major, minor, patch, f"v{major}.{minor}.{patch}"


def create_document_version(
    *,
    logical_id: str,
    content: bytes,
    original_name: str,
    content_sha256: str,
    source: str,
    bump: VersionBump,
    parent_version_id: Optional[str] = None,
    created_by_stakeholder_id: Optional[str] = None,
    created_by_email: Optional[str] = None,
    page_count: Optional[int] = None,
    metadata_json: Optional[str] = None,
) -> DocumentVersion:
    init_document_versions_db()
    if page_count is None:
        try:
            page_count = len(fitz.open("pdf", content))
        except Exception:
            page_count = None

    major, minor, patch, label = compute_next_version(logical_id, bump)
    version_id = uuid.uuid4().hex
    logical = get_logical_by_id(logical_id)
    firm_id = logical.firm_id if logical else DEFAULT_FIRM_ID
    storage_key = f"{firm_id}/versions/{version_id}.pdf"
    dest = STORAGE_DIR / storage_key
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(content)
    now = _now_iso()

    with sqlite3.connect(VERSIONS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        conn.execute(
            """
            INSERT INTO document_versions
                (id, logical_document_id, version_major, version_minor, version_patch,
                 version_label, storage_key, content_sha256, byte_size, original_name,
                 page_count, source, parent_version_id,
                 created_by_stakeholder_id, created_by_email, created_at, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                version_id,
                logical_id,
                major,
                minor,
                patch,
                label,
                storage_key,
                content_sha256,
                len(content),
                original_name or "document.pdf",
                page_count,
                source,
                parent_version_id,
                created_by_stakeholder_id,
                created_by_email,
                now,
                metadata_json,
            ),
        )
        conn.execute(
            """
            UPDATE logical_documents
            SET current_version_id=?, status='uploaded', updated_at=?
            WHERE id=?
            """,
            (version_id, now, logical_id),
        )
        row = conn.execute(
            "SELECT * FROM document_versions WHERE id=?", (version_id,)
        ).fetchone()
    return _row_version(row)


def mark_approved(logical_id: str, version_id: str) -> None:
    init_document_versions_db()
    now = _now_iso()
    with sqlite3.connect(VERSIONS_DB_PATH) as conn:
        conn.execute(
            """
            UPDATE logical_documents
            SET approved_version_id=?, status='approved', updated_at=?
            WHERE id=?
            """,
            (version_id, now, logical_id),
        )


def mark_remanded(logical_id: str) -> None:
    init_document_versions_db()
    now = _now_iso()
    with sqlite3.connect(VERSIONS_DB_PATH) as conn:
        conn.execute(
            "UPDATE logical_documents SET status='remanded', updated_at=? WHERE id=?",
            (now, logical_id),
        )


def set_logical_status(logical_id: str, status: str) -> None:
    init_document_versions_db()
    now = _now_iso()
    with sqlite3.connect(VERSIONS_DB_PATH) as conn:
        conn.execute(
            "UPDATE logical_documents SET status=?, updated_at=? WHERE id=?",
            (status, now, logical_id),
        )


def get_logical_by_id(logical_id: str) -> Optional[LogicalDocument]:
    init_document_versions_db()
    with sqlite3.connect(VERSIONS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM logical_documents WHERE id=?",
            (logical_id,),
        ).fetchone()
    return _row_logical(row) if row else None


def get_logical_by_slot(
    client_id: str,
    period_key: str,
    slot_id: str,
) -> Optional[LogicalDocument]:
    init_document_versions_db()
    with sqlite3.connect(VERSIONS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            """
            SELECT * FROM logical_documents
            WHERE client_id=? AND period_key=? AND slot_id=?
            """,
            (client_id, period_key, slot_id),
        ).fetchone()
    return _row_logical(row) if row else None


def get_version(version_id: str) -> Optional[DocumentVersion]:
    init_document_versions_db()
    with sqlite3.connect(VERSIONS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM document_versions WHERE id=?", (version_id,)
        ).fetchone()
    return _row_version(row) if row else None


def list_versions(logical_id: str) -> list[DocumentVersion]:
    init_document_versions_db()
    with sqlite3.connect(VERSIONS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT * FROM document_versions
            WHERE logical_document_id=?
            ORDER BY created_at DESC, version_major DESC, version_minor DESC
            """,
            (logical_id,),
        ).fetchall()
    return [_row_version(r) for r in rows]


def count_versions(logical_id: str) -> int:
    init_document_versions_db()
    with sqlite3.connect(VERSIONS_DB_PATH) as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS n FROM document_versions WHERE logical_document_id=?",
            (logical_id,),
        ).fetchone()
    return int(row[0]) if row else 0


def version_file_path(version: DocumentVersion) -> Path:
    return resolve_storage_path(version.storage_key)


def slot_status_map(client_id: str, period_key: Optional[str] = None) -> dict[str, dict[str, str]]:
    """期 × スロットの logical_documents.status を返す。"""
    init_document_versions_db()
    clauses = ["client_id = ?"]
    params: list[str] = [client_id]
    if period_key:
        clauses.append("period_key = ?")
        params.append(period_key)
    where = " AND ".join(clauses)
    result: dict[str, dict[str, str]] = {}
    with sqlite3.connect(VERSIONS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            f"SELECT period_key, slot_id, status FROM logical_documents WHERE {where}",
            params,
        ).fetchall()
    for row in rows:
        pk = row["period_key"]
        result.setdefault(pk, {})[str(row["slot_id"])] = row["status"]
    return result
