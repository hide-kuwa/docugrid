"""Firm membership registry — email → member, firm_role, status (replaces JSON-only login)."""

from __future__ import annotations

import json
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional

from docugrid_auth import STAKEHOLDER_ROLE_BY_ID
from services.member_directory import DEFAULT_EMAIL_TO_STAKEHOLDER, MEMBER_DIRECTORY_PATH
from services.personas import STAKEHOLDER_PERSONA_BY_ID, resolve_persona_id
from services.tenancy import DEFAULT_FIRM_ID, FIRM_LABELS, STAKEHOLDER_FIRM_BY_ID

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
MEMBERS_DB_PATH = STORAGE_DIR / "firm_members.db"

MEMBER_STATUS_ACTIVE = "active"
MEMBER_STATUS_INACTIVE = "inactive"


@dataclass(frozen=True)
class FirmMember:
    id: str
    firm_id: str
    email: str
    stakeholder_id: str
    firm_role: str
    status: str
    display_name: str | None = None
    persona_id: str | None = None


def init_firm_members_db() -> None:
    with sqlite3.connect(MEMBERS_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS firms (
                id TEXT PRIMARY KEY,
                label TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS firm_members (
                id TEXT PRIMARY KEY,
                firm_id TEXT NOT NULL,
                email TEXT NOT NULL,
                stakeholder_id TEXT NOT NULL,
                firm_role TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                display_name TEXT,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (firm_id) REFERENCES firms(id)
            )
            """
        )
        conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_firm_members_email_firm
                ON firm_members (firm_id, email)
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_firm_members_email
                ON firm_members (email)
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_firm_members_stakeholder
                ON firm_members (stakeholder_id)
            """
        )
        try:
            conn.execute("ALTER TABLE firm_members ADD COLUMN persona_id TEXT")
        except sqlite3.OperationalError:
            pass


def member_count() -> int:
    init_firm_members_db()
    with sqlite3.connect(MEMBERS_DB_PATH) as conn:
        row = conn.execute("SELECT COUNT(*) FROM firm_members").fetchone()
    return int(row[0]) if row else 0


def _row_to_member(row: tuple) -> FirmMember:
    persona = str(row[7]) if len(row) > 7 and row[7] else None
    return FirmMember(
        id=str(row[0]),
        firm_id=str(row[1]),
        email=str(row[2]),
        stakeholder_id=str(row[3]),
        firm_role=str(row[4]),
        status=str(row[5]),
        display_name=str(row[6]) if row[6] else None,
        persona_id=persona,
    )


def get_member_by_id(member_id: str) -> FirmMember | None:
    if not member_id:
        return None
    init_firm_members_db()
    with sqlite3.connect(MEMBERS_DB_PATH) as conn:
        row = conn.execute(
            """
            SELECT id, firm_id, email, stakeholder_id, firm_role, status, display_name, persona_id
            FROM firm_members WHERE id=?
            """,
            (member_id,),
        ).fetchone()
    return _row_to_member(row) if row else None


def get_member_by_stakeholder_id(stakeholder_id: str) -> FirmMember | None:
    if not stakeholder_id:
        return None
    init_firm_members_db()
    with sqlite3.connect(MEMBERS_DB_PATH) as conn:
        row = conn.execute(
            """
            SELECT id, firm_id, email, stakeholder_id, firm_role, status, display_name, persona_id
            FROM firm_members WHERE stakeholder_id=?
            """,
            (stakeholder_id,),
        ).fetchone()
    return _row_to_member(row) if row else None


def list_members_for_firm(firm_id: str) -> list[FirmMember]:
    fid = (firm_id or "").strip() or DEFAULT_FIRM_ID
    init_firm_members_db()
    with sqlite3.connect(MEMBERS_DB_PATH) as conn:
        rows = conn.execute(
            """
            SELECT id, firm_id, email, stakeholder_id, firm_role, status, display_name, persona_id
            FROM firm_members WHERE firm_id=?
            ORDER BY email
            """,
            (fid,),
        ).fetchall()
    return [_row_to_member(r) for r in rows]


def list_members_by_email(email: str) -> list[FirmMember]:
    normalized = (email or "").strip().lower()
    if not normalized:
        return []
    init_firm_members_db()
    with sqlite3.connect(MEMBERS_DB_PATH) as conn:
        rows = conn.execute(
            """
            SELECT id, firm_id, email, stakeholder_id, firm_role, status, display_name, persona_id
            FROM firm_members WHERE lower(email)=?
            ORDER BY firm_id
            """,
            (normalized,),
        ).fetchall()
    return [_row_to_member(r) for r in rows]


def member_firm_id(member_id: str) -> str:
    member = get_member_by_id(member_id)
    if member:
        return member.firm_id
    return STAKEHOLDER_FIRM_BY_ID.get(member_id, DEFAULT_FIRM_ID)


def upsert_member(
    *,
    member_id: str,
    firm_id: str,
    email: str,
    stakeholder_id: str,
    firm_role: str,
    status: str = MEMBER_STATUS_ACTIVE,
    display_name: str | None = None,
    persona_id: str | None = None,
) -> FirmMember:
    init_firm_members_db()
    now = datetime.utcnow().isoformat()
    normalized_email = email.strip().lower()
    resolved_persona = resolve_persona_id(
        stakeholder_id=stakeholder_id,
        stored_persona_id=persona_id or STAKEHOLDER_PERSONA_BY_ID.get(stakeholder_id),
    )
    with sqlite3.connect(MEMBERS_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO firm_members
                (id, firm_id, email, stakeholder_id, firm_role, status, display_name, updated_at, persona_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                firm_id=excluded.firm_id,
                email=excluded.email,
                stakeholder_id=excluded.stakeholder_id,
                firm_role=excluded.firm_role,
                status=excluded.status,
                display_name=excluded.display_name,
                updated_at=excluded.updated_at,
                persona_id=excluded.persona_id
            """,
            (
                member_id,
                firm_id,
                normalized_email,
                stakeholder_id,
                firm_role,
                status,
                display_name,
                now,
                resolved_persona,
            ),
        )
    return FirmMember(
        id=member_id,
        firm_id=firm_id,
        email=normalized_email,
        stakeholder_id=stakeholder_id,
        firm_role=firm_role,
        status=status,
        display_name=display_name,
        persona_id=resolved_persona,
    )


def set_member_status(member_id: str, status: str) -> FirmMember | None:
    member = get_member_by_id(member_id)
    if not member:
        return None
    return upsert_member(
        member_id=member.id,
        firm_id=member.firm_id,
        email=member.email,
        stakeholder_id=member.stakeholder_id,
        firm_role=member.firm_role,
        status=status,
        display_name=member.display_name,
        persona_id=member.persona_id,
    )


def _load_email_to_stakeholder() -> dict[str, str]:
    merged: dict[str, str] = {}
    if MEMBER_DIRECTORY_PATH.exists():
        try:
            raw = json.loads(MEMBER_DIRECTORY_PATH.read_text(encoding="utf-8"))
            for email, sid in (raw.get("emailToStakeholderId") or {}).items():
                if isinstance(email, str) and isinstance(sid, str) and email.strip():
                    merged[email.strip().lower()] = sid.strip()
        except Exception:
            pass
    for email, sid in DEFAULT_EMAIL_TO_STAKEHOLDER.items():
        merged[email.lower()] = sid
    return merged


def _default_role_for_stakeholder(stakeholder_id: str) -> str:
    return STAKEHOLDER_ROLE_BY_ID.get(stakeholder_id, "viewer")


def bootstrap_firm_members() -> None:
    """Seed firms + dev personas from member_directory defaults (idempotent)."""
    init_firm_members_db()
    now = datetime.utcnow().isoformat()
    with sqlite3.connect(MEMBERS_DB_PATH) as conn:
        for firm_id, label in FIRM_LABELS.items():
            conn.execute(
                """
                INSERT INTO firms (id, label, status, updated_at)
                VALUES (?, ?, 'active', ?)
                ON CONFLICT(id) DO UPDATE SET label=excluded.label, updated_at=excluded.updated_at
                """,
                (firm_id, label, now),
            )

    email_map = _load_email_to_stakeholder()
    for email, stakeholder_id in email_map.items():
        firm_id = STAKEHOLDER_FIRM_BY_ID.get(stakeholder_id, DEFAULT_FIRM_ID)
        upsert_member(
            member_id=stakeholder_id,
            firm_id=firm_id,
            email=email,
            stakeholder_id=stakeholder_id,
            firm_role=_default_role_for_stakeholder(stakeholder_id),
            status=MEMBER_STATUS_ACTIVE,
        )
    # Re-apply dev default emails for built-in personas (example file may have stale mapping).
    for email, stakeholder_id in DEFAULT_EMAIL_TO_STAKEHOLDER.items():
        firm_id = STAKEHOLDER_FIRM_BY_ID.get(stakeholder_id, DEFAULT_FIRM_ID)
        upsert_member(
            member_id=stakeholder_id,
            firm_id=firm_id,
            email=email,
            stakeholder_id=stakeholder_id,
            firm_role=_default_role_for_stakeholder(stakeholder_id),
            status=MEMBER_STATUS_ACTIVE,
        )


def resolve_member_for_login(
    email: str,
    requested_stakeholder_id: str,
    *,
    pick_allowed: bool,
) -> FirmMember | None:
    """
    Resolve active membership for login.
    Email directory wins; requested_stakeholder_id disambiguates multi-firm emails in dev.
    """
    normalized = (email or "").strip().lower()
    if not normalized:
        return None

    if member_count() == 0:
        bootstrap_firm_members()

    all_for_email = list_members_by_email(normalized)
    if all_for_email and not any(m.status == MEMBER_STATUS_ACTIVE for m in all_for_email):
        return None

    members = [m for m in all_for_email if m.status == MEMBER_STATUS_ACTIVE]
    if members:
        if len(members) == 1:
            return members[0]
        req = (requested_stakeholder_id or "").strip()
        if req:
            for m in members:
                if m.stakeholder_id == req or m.id == req:
                    return m
        return members[0]

    req = (requested_stakeholder_id or "").strip()
    if pick_allowed and req:
        member = get_member_by_stakeholder_id(req)
        if member:
            if member.status != MEMBER_STATUS_ACTIVE:
                return None
            return member
        role = _default_role_for_stakeholder(req)
        firm_id = STAKEHOLDER_FIRM_BY_ID.get(req, DEFAULT_FIRM_ID)
        return upsert_member(
            member_id=req,
            firm_id=firm_id,
            email=normalized,
            stakeholder_id=req,
            firm_role=role,
            status=MEMBER_STATUS_ACTIVE,
        )

    return None


def create_member(
    *,
    firm_id: str,
    email: str,
    firm_role: str,
    stakeholder_id: str | None = None,
    display_name: str | None = None,
) -> FirmMember:
    sid = (stakeholder_id or "").strip() or f"member-{uuid.uuid4().hex[:12]}"
    member_id = sid
    return upsert_member(
        member_id=member_id,
        firm_id=firm_id,
        email=email,
        stakeholder_id=sid,
        firm_role=firm_role,
        status=MEMBER_STATUS_ACTIVE,
        display_name=display_name,
    )
