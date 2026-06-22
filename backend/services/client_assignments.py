"""Client assignments (member × client) per firm — replaces flat scopedClientIds over time."""

from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path

from services.firm_members import member_firm_id
from services.tenancy import get_client_firm_id

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
ASSIGNMENTS_DB_PATH = STORAGE_DIR / "client_assignments.db"


def init_client_assignments_db() -> None:
    with sqlite3.connect(ASSIGNMENTS_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS client_assignments (
                firm_id TEXT NOT NULL,
                client_id TEXT NOT NULL,
                member_id TEXT NOT NULL,
                assignment_role TEXT NOT NULL DEFAULT 'main',
                updated_at TEXT NOT NULL,
                PRIMARY KEY (firm_id, client_id, member_id)
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_client_assignments_member
                ON client_assignments (firm_id, member_id)
            """
        )


def load_assignment_scope_map() -> dict[str, set[str]]:
    """member_id (stakeholder_id) -> assigned client ids."""
    if not ASSIGNMENTS_DB_PATH.exists():
        return {}
    init_client_assignments_db()
    out: dict[str, set[str]] = {}
    with sqlite3.connect(ASSIGNMENTS_DB_PATH) as conn:
        rows = conn.execute(
            "SELECT member_id, client_id FROM client_assignments"
        ).fetchall()
    for member_id, client_id in rows:
        if member_id and client_id:
            out.setdefault(str(member_id), set()).add(str(client_id))
    return out


def assignment_count() -> int:
    init_client_assignments_db()
    with sqlite3.connect(ASSIGNMENTS_DB_PATH) as conn:
        row = conn.execute("SELECT COUNT(*) FROM client_assignments").fetchone()
    return int(row[0]) if row else 0


def replace_member_assignments(
    *,
    firm_id: str,
    member_id: str,
    client_ids: list[str],
    assignment_role: str = "main",
) -> None:
    init_client_assignments_db()
    now = datetime.utcnow().isoformat()
    with sqlite3.connect(ASSIGNMENTS_DB_PATH) as conn:
        conn.execute(
            "DELETE FROM client_assignments WHERE firm_id=? AND member_id=?",
            (firm_id, member_id),
        )
        for client_id in sorted(set(client_ids)):
            conn.execute(
                """
                INSERT INTO client_assignments
                    (firm_id, client_id, member_id, assignment_role, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (firm_id, client_id, member_id, assignment_role, now),
            )


def sync_assignments_from_scope_map(scope_by_member: dict[str, list[str]]) -> None:
    """Persist stakeholder-master scopes into client_assignments."""
    for member_id, client_ids in scope_by_member.items():
        if not member_id:
            continue
        firm_id = member_firm_id(member_id)
        replace_member_assignments(
            firm_id=firm_id,
            member_id=member_id,
            client_ids=[str(c) for c in client_ids],
        )


def backfill_assignments_from_legacy(
    legacy_scopes: dict[str, set[str]],
) -> None:
    """One-time import from DEFAULT + stakeholder_master merged scopes."""
    if assignment_count() > 0:
        return
    for member_id, client_ids in legacy_scopes.items():
        if not client_ids:
            continue
        replace_member_assignments(
            firm_id=member_firm_id(member_id),
            member_id=member_id,
            client_ids=sorted(client_ids),
        )


def validate_assignments_for_clients(
    scope_by_member: dict[str, list[str]],
    valid_client_ids: set[str],
) -> None:
    from fastapi import HTTPException

    for member_id, client_ids in scope_by_member.items():
        for client_id in client_ids:
            if client_id not in valid_client_ids:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unknown client id {client_id!r} in scope for {member_id!r}",
                )
            expected_firm = member_firm_id(member_id)
            if get_client_firm_id(client_id) != expected_firm:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Client {client_id!r} belongs to another firm; "
                        f"cannot assign to member {member_id!r}"
                    ),
                )
