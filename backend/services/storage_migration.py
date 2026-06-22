"""
Migrate legacy flat storage (storage/versions/, storage/slots/) to firm-scoped paths.

Safe defaults: dry-run by default, copy (not move) source files.
"""

from __future__ import annotations

import shutil
import sqlite3
from dataclasses import dataclass
from pathlib import Path

from services.document_version_service import VERSIONS_DB_PATH, init_document_versions_db
from services.storage_paths import STORAGE_DIR, resolve_storage_path
from services.tenancy import DEFAULT_FIRM_ID, SLOT_DOCS_DB_PATH, get_client_firm_id

LEGACY_PREFIXES = ("versions/", "slots/")


@dataclass
class MigrationResult:
    version_id: str
    old_key: str
    new_key: str
    status: str
    detail: str = ""


def is_firm_scoped_storage_key(storage_key: str) -> bool:
    parts = storage_key.split("/")
    return (
        len(parts) == 3
        and parts[0].startswith("firm_")
        and parts[1] == "versions"
        and parts[2].endswith(".pdf")
    )


def target_version_storage_key(firm_id: str, version_id: str) -> str:
    return f"{firm_id}/versions/{version_id}.pdf"


def _resolve_firm_id_for_version(
    conn: sqlite3.Connection, logical_document_id: str, client_id: str | None = None
) -> str:
    row = conn.execute(
        "SELECT firm_id, client_id FROM logical_documents WHERE id=?",
        (logical_document_id,),
    ).fetchone()
    if row:
        firm_id = row["firm_id"] if row["firm_id"] else None
        cid = row["client_id"]
        if firm_id:
            return str(firm_id)
        return get_client_firm_id(str(cid))
    if client_id:
        return get_client_firm_id(client_id)
    return DEFAULT_FIRM_ID


def _sync_slot_storage_keys(
    conn: sqlite3.Connection, *, old_key: str, new_key: str, version_id: str
) -> int:
    cur = conn.execute(
        "UPDATE slot_documents SET storage_key=? WHERE storage_key=? OR current_version_id=?",
        (new_key, old_key, version_id),
    )
    return cur.rowcount


def migrate_legacy_version_files(*, dry_run: bool = True) -> list[MigrationResult]:
    """
    For each document_versions row whose file lives under legacy paths,
    copy to storage/{firm_id}/versions/{version_id}.pdf and update DB keys.
    """
    init_document_versions_db()
    results: list[MigrationResult] = []

    with sqlite3.connect(VERSIONS_DB_PATH) as versions_conn:
        versions_conn.row_factory = sqlite3.Row
        rows = versions_conn.execute(
            "SELECT id, logical_document_id, storage_key FROM document_versions ORDER BY created_at"
        ).fetchall()

        slot_conn: sqlite3.Connection | None = None
        if SLOT_DOCS_DB_PATH.exists():
            slot_conn = sqlite3.connect(SLOT_DOCS_DB_PATH)
            slot_conn.row_factory = sqlite3.Row

        try:
            for row in rows:
                version_id = str(row["id"])
                old_key = str(row["storage_key"])
                firm_id = _resolve_firm_id_for_version(
                    versions_conn, str(row["logical_document_id"])
                )
                new_key = target_version_storage_key(firm_id, version_id)

                if old_key == new_key:
                    primary = STORAGE_DIR / new_key
                    if primary.is_file():
                        results.append(
                            MigrationResult(version_id, old_key, new_key, "skipped", "already migrated")
                        )
                        continue

                source = resolve_storage_path(old_key)
                if not source.is_file():
                    results.append(
                        MigrationResult(
                            version_id, old_key, new_key, "missing_source", str(source)
                        )
                    )
                    continue

                dest = STORAGE_DIR / new_key
                if dest.is_file() and old_key != new_key:
                    results.append(
                        MigrationResult(
                            version_id, old_key, new_key, "skipped", "destination exists"
                        )
                    )
                    if not dry_run and old_key != new_key:
                        versions_conn.execute(
                            "UPDATE document_versions SET storage_key=? WHERE id=?",
                            (new_key, version_id),
                        )
                        if slot_conn:
                            _sync_slot_storage_keys(
                                slot_conn, old_key=old_key, new_key=new_key, version_id=version_id
                            )
                    continue

                if dry_run:
                    results.append(
                        MigrationResult(
                            version_id,
                            old_key,
                            new_key,
                            "would_migrate",
                            f"{source} -> {dest}",
                        )
                    )
                    continue

                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, dest)
                versions_conn.execute(
                    "UPDATE document_versions SET storage_key=? WHERE id=?",
                    (new_key, version_id),
                )
                slot_updates = 0
                if slot_conn:
                    slot_updates = _sync_slot_storage_keys(
                        slot_conn, old_key=old_key, new_key=new_key, version_id=version_id
                    )
                results.append(
                    MigrationResult(
                        version_id,
                        old_key,
                        new_key,
                        "migrated",
                        f"slot_rows={slot_updates}",
                    )
                )

            if not dry_run:
                versions_conn.commit()
                if slot_conn:
                    slot_conn.commit()
        finally:
            if slot_conn:
                slot_conn.close()

    return results


def list_orphan_legacy_files() -> list[str]:
    """PDFs under storage/versions/ or storage/slots/ with no matching DB storage_key."""
    init_document_versions_db()
    known_leaves: set[str] = set()
    with sqlite3.connect(VERSIONS_DB_PATH) as conn:
        for (key,) in conn.execute("SELECT storage_key FROM document_versions"):
            known_leaves.add(Path(str(key)).name)

    orphans: list[str] = []
    for legacy_dir in ("versions", "slots"):
        root = STORAGE_DIR / legacy_dir
        if not root.is_dir():
            continue
        for pdf in root.glob("*.pdf"):
            if pdf.name not in known_leaves:
                orphans.append(pdf.relative_to(STORAGE_DIR).as_posix())
    return sorted(orphans)
