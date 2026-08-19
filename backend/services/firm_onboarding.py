"""Firm representative onboarding — invites, join requests, join codes."""

from __future__ import annotations

import secrets
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from services.firm_members import (
    MEMBER_STATUS_ACTIVE,
    MEMBER_STATUS_INACTIVE,
    FirmMember,
    create_member,
    get_member_by_id,
    init_firm_members_db,
    list_members_for_firm,
    set_member_status,
    upsert_member,
)
from services.personas import PERSONA_FIRM_DIRECTOR, PERSONA_FIRM_STAFF_MAIN, resolve_persona_id

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
ONBOARDING_DB_PATH = STORAGE_DIR / "firm_onboarding.db"

MEMBER_STATUS_PENDING = "pending"
INVITE_STATUS_PENDING = "pending"
INVITE_STATUS_ACCEPTED = "accepted"
INVITE_STATUS_REVOKED = "revoked"

FIRM_BILLING_OWNER_ROLES = frozenset({"firm_admin", "platform_admin"})
INVITE_TTL_DAYS = 14


@dataclass(frozen=True)
class FirmInvite:
    id: str
    firm_id: str
    email: str
    firm_role: str
    persona_id: str | None
    token: str
    status: str
    invited_by_member_id: str | None
    created_at: str
    expires_at: str


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


def _join_code() -> str:
    return secrets.token_hex(4).upper()


def init_firm_onboarding_db() -> None:
    init_firm_members_db()
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(ONBOARDING_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS firm_invites (
                id TEXT PRIMARY KEY,
                firm_id TEXT NOT NULL,
                email TEXT NOT NULL,
                firm_role TEXT NOT NULL,
                persona_id TEXT,
                token TEXT NOT NULL UNIQUE,
                status TEXT NOT NULL DEFAULT 'pending',
                invited_by_member_id TEXT,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_firm_invites_email
                ON firm_invites (lower(email))
            """
        )
    with sqlite3.connect(STORAGE_DIR / "firm_members.db") as conn:
        try:
            conn.execute("ALTER TABLE firms ADD COLUMN join_code TEXT")
        except sqlite3.OperationalError:
            pass


def _ensure_firm_join_code(firm_id: str) -> str:
    init_firm_onboarding_db()
    db_path = STORAGE_DIR / "firm_members.db"
    with sqlite3.connect(db_path) as conn:
        row = conn.execute("SELECT join_code FROM firms WHERE id=?", (firm_id,)).fetchone()
        if row and row[0]:
            return str(row[0])
        code = _join_code()
        conn.execute(
            "UPDATE firms SET join_code=?, updated_at=? WHERE id=?",
            (code, _utc_now(), firm_id),
        )
        if conn.total_changes == 0:
            conn.execute(
                """
                INSERT INTO firms (id, label, status, updated_at, join_code)
                VALUES (?, ?, 'active', ?, ?)
                """,
                (firm_id, firm_id, _utc_now(), code),
            )
    return code


def get_firm_join_code(firm_id: str) -> str:
    return _ensure_firm_join_code(firm_id)


def get_firm_id_by_join_code(join_code: str) -> str | None:
    code = (join_code or "").strip().upper()
    if not code:
        return None
    init_firm_onboarding_db()
    db_path = STORAGE_DIR / "firm_members.db"
    with sqlite3.connect(db_path) as conn:
        row = conn.execute(
            "SELECT id FROM firms WHERE upper(join_code)=?",
            (code,),
        ).fetchone()
    return str(row[0]) if row else None


def get_firm_label(firm_id: str) -> str:
    init_firm_members_db()
    with sqlite3.connect(STORAGE_DIR / "firm_members.db") as conn:
        row = conn.execute("SELECT label FROM firms WHERE id=?", (firm_id,)).fetchone()
    return str(row[0]) if row else firm_id


def create_firm_with_representative(
    *,
    firm_label: str,
    rep_email: str,
    rep_display_name: str | None = None,
) -> tuple[str, str, FirmMember]:
    """Register a new firm; representative becomes firm_admin (billing owner).

    PROLEXT（課金免除ドメイン）は常に firm_prolext に載せ、Stripe なしでも利用可。
    既に事務所がある場合は参加申請（join）を案内する。
    """
    init_firm_onboarding_db()
    from services.stripe_billing_service import is_billing_exempt_email
    from services.tenancy import FIRM_LABELS, PROLEXT_FIRM_ID

    email_norm = rep_email.strip().lower()
    use_prolext = is_billing_exempt_email(email_norm)
    if use_prolext:
        firm_id = PROLEXT_FIRM_ID
        label = FIRM_LABELS.get(PROLEXT_FIRM_ID, "PROLEXT税理士法人")
        if firm_label.strip():
            # 画面入力は参考に残すが、canonical ラベルを優先
            label = FIRM_LABELS.get(PROLEXT_FIRM_ID, firm_label.strip())
    else:
        firm_id = f"firm_{uuid.uuid4().hex[:12]}"
        label = firm_label.strip() or firm_id

    join_code = _join_code()
    now = _utc_now()
    with sqlite3.connect(STORAGE_DIR / "firm_members.db") as conn:
        existing = conn.execute("SELECT id, join_code FROM firms WHERE id=?", (firm_id,)).fetchone()
        if existing:
            if use_prolext:
                # 2人目以降は「事務所を新規作成」ではなく join へ
                raise ValueError("prolext_firm_exists")
            raise ValueError("firm_id_collision")
        conn.execute(
            """
            INSERT INTO firms (id, label, status, updated_at, join_code)
            VALUES (?, ?, 'active', ?, ?)
            """,
            (firm_id, label, now, join_code),
        )
    member = create_member(
        firm_id=firm_id,
        email=email_norm,
        firm_role="firm_admin",
        display_name=rep_display_name,
        stakeholder_id=f"rep-{uuid.uuid4().hex[:10]}",
    )
    upsert_member(
        member_id=member.id,
        firm_id=firm_id,
        email=member.email,
        stakeholder_id=member.stakeholder_id,
        firm_role="firm_admin",
        status=MEMBER_STATUS_ACTIVE,
        display_name=rep_display_name,
        persona_id=PERSONA_FIRM_DIRECTOR,
    )
    return firm_id, join_code, member


def _row_to_invite(row: tuple) -> FirmInvite:
    return FirmInvite(
        id=str(row[0]),
        firm_id=str(row[1]),
        email=str(row[2]),
        firm_role=str(row[3]),
        persona_id=str(row[4]) if row[4] else None,
        token=str(row[5]),
        status=str(row[6]),
        invited_by_member_id=str(row[7]) if row[7] else None,
        created_at=str(row[8]),
        expires_at=str(row[9]),
    )


def create_member_invite(
    *,
    firm_id: str,
    email: str,
    invited_by_member_id: str,
    firm_role: str = "operator",
    persona_id: str | None = PERSONA_FIRM_STAFF_MAIN,
) -> FirmInvite:
    init_firm_onboarding_db()
    normalized = email.strip().lower()
    if not normalized:
        raise ValueError("email_required")
    token = secrets.token_urlsafe(24)
    invite_id = f"inv-{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    expires = (now + timedelta(days=INVITE_TTL_DAYS)).isoformat()
    with sqlite3.connect(ONBOARDING_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO firm_invites (
                id, firm_id, email, firm_role, persona_id, token, status,
                invited_by_member_id, created_at, expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                invite_id,
                firm_id,
                normalized,
                firm_role,
                persona_id,
                token,
                INVITE_STATUS_PENDING,
                invited_by_member_id,
                now.isoformat(),
                expires,
            ),
        )
    return get_invite_by_token(token)  # type: ignore[return-value]


def get_invite_by_token(token: str) -> FirmInvite | None:
    t = (token or "").strip()
    if not t:
        return None
    init_firm_onboarding_db()
    with sqlite3.connect(ONBOARDING_DB_PATH) as conn:
        row = conn.execute(
            """
            SELECT id, firm_id, email, firm_role, persona_id, token, status,
                   invited_by_member_id, created_at, expires_at
            FROM firm_invites WHERE token=?
            """,
            (t,),
        ).fetchone()
    return _row_to_invite(row) if row else None


def preview_invite(token: str) -> dict[str, str] | None:
    invite = get_invite_by_token(token)
    if not invite or invite.status != INVITE_STATUS_PENDING:
        return None
    if datetime.fromisoformat(invite.expires_at) < datetime.now(timezone.utc).replace(tzinfo=None):
        return None
    masked = invite.email
    if "@" in masked:
        local, domain = masked.split("@", 1)
        masked = f"{local[:2]}***@{domain}"
    return {
        "firmId": invite.firm_id,
        "firmLabel": get_firm_label(invite.firm_id),
        "emailHint": masked,
        "expiresAt": invite.expires_at,
    }


def accept_invite(*, token: str, email: str, display_name: str | None = None) -> FirmMember:
    invite = get_invite_by_token(token)
    if not invite or invite.status != INVITE_STATUS_PENDING:
        raise ValueError("invite_invalid")
    if datetime.fromisoformat(invite.expires_at) < datetime.now(timezone.utc).replace(tzinfo=None):
        raise ValueError("invite_expired")
    normalized = email.strip().lower()
    if normalized != invite.email.strip().lower():
        raise ValueError("invite_email_mismatch")
    member = create_member(
        firm_id=invite.firm_id,
        email=normalized,
        firm_role=invite.firm_role,
        display_name=display_name,
    )
    upsert_member(
        member_id=member.id,
        firm_id=invite.firm_id,
        email=normalized,
        stakeholder_id=member.stakeholder_id,
        firm_role=invite.firm_role,
        status=MEMBER_STATUS_ACTIVE,
        display_name=display_name,
        persona_id=invite.persona_id or PERSONA_FIRM_STAFF_MAIN,
    )
    with sqlite3.connect(ONBOARDING_DB_PATH) as conn:
        conn.execute(
            "UPDATE firm_invites SET status=? WHERE id=?",
            (INVITE_STATUS_ACCEPTED, invite.id),
        )
    refreshed = get_member_by_id(member.id)
    result = refreshed or member
    try:
        from services.drive_share import maybe_share_root_with_email

        maybe_share_root_with_email(result.firm_id, result.email)
    except Exception:
        pass
    return result


def create_join_request(
    *,
    join_code: str,
    email: str,
    display_name: str | None = None,
    firm_role: str = "operator",
) -> FirmMember:
    firm_id = get_firm_id_by_join_code(join_code)
    if not firm_id:
        raise ValueError("join_code_invalid")
    normalized = email.strip().lower()
    existing = [m for m in list_members_for_firm(firm_id) if m.email.lower() == normalized]
    if existing:
        status = existing[0].status
        if status == MEMBER_STATUS_ACTIVE:
            raise ValueError("already_member")
        if status == MEMBER_STATUS_PENDING:
            raise ValueError("already_pending")
    member = create_member(
        firm_id=firm_id,
        email=normalized,
        firm_role=firm_role,
        display_name=display_name,
    )
    return upsert_member(
        member_id=member.id,
        firm_id=firm_id,
        email=normalized,
        stakeholder_id=member.stakeholder_id,
        firm_role=firm_role,
        status=MEMBER_STATUS_PENDING,
        display_name=display_name,
        persona_id=PERSONA_FIRM_STAFF_MAIN,
    )


def approve_pending_member(member_id: str, *, firm_id: str) -> FirmMember | None:
    member = get_member_by_id(member_id)
    if not member or member.firm_id != firm_id:
        return None
    if member.status != MEMBER_STATUS_PENDING:
        return member
    return set_member_status(member_id, MEMBER_STATUS_ACTIVE)


def reject_pending_member(member_id: str, *, firm_id: str) -> FirmMember | None:
    member = get_member_by_id(member_id)
    if not member or member.firm_id != firm_id:
        return None
    if member.status != MEMBER_STATUS_PENDING:
        return member
    return set_member_status(member_id, MEMBER_STATUS_INACTIVE)


def is_billing_owner_role(role: str) -> bool:
    return role in FIRM_BILLING_OWNER_ROLES


def pending_members_for_firm(firm_id: str) -> list[FirmMember]:
    return [m for m in list_members_for_firm(firm_id) if m.status == MEMBER_STATUS_PENDING]
