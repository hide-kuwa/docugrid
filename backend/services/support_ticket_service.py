"""Support CS tickets (S3): firm-scoped SQLite + optional email to inbox."""

from __future__ import annotations

import json
import logging
import os
import smtplib
import sqlite3
import ssl
import uuid
from email.message import EmailMessage
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from services.tenancy import DEFAULT_FIRM_ID

logger = logging.getLogger("docugrid.support.tickets")

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
SUPPORT_TICKETS_DB_PATH = STORAGE_DIR / "support_tickets.db"

ALLOWED_KINDS = frozenset({"bug", "howto_unresolved", "other"})
ALLOWED_CHANNELS = frozenset({"email", "phone_request"})
ALLOWED_STATUSES = frozenset({"open", "resolved", "phone_requested", "closed"})


def _now() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


def init_support_tickets_db() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(SUPPORT_TICKETS_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS support_tickets (
                id TEXT PRIMARY KEY,
                firm_id TEXT NOT NULL,
                created_by_email TEXT NOT NULL DEFAULT '',
                created_by_role TEXT NOT NULL DEFAULT '',
                kind TEXT NOT NULL,
                subject TEXT NOT NULL,
                body TEXT NOT NULL,
                surface_id TEXT NOT NULL DEFAULT '',
                error_message TEXT NOT NULL DEFAULT '',
                preferred_channel TEXT NOT NULL DEFAULT 'email',
                status TEXT NOT NULL DEFAULT 'open',
                email_status TEXT NOT NULL DEFAULT 'pending',
                email_detail TEXT NOT NULL DEFAULT '',
                meta_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_support_tickets_firm_created
                ON support_tickets (firm_id, created_at DESC)
            """
        )


def _row(conn: sqlite3.Connection, ticket_id: str) -> dict[str, Any] | None:
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT * FROM support_tickets WHERE id = ?",
        (ticket_id,),
    ).fetchone()
    if not row:
        return None
    meta: Any = {}
    try:
        meta = json.loads(row["meta_json"] or "{}")
    except Exception:
        meta = {}
    return {
        "id": row["id"],
        "firm_id": row["firm_id"],
        "created_by_email": row["created_by_email"],
        "created_by_role": row["created_by_role"],
        "kind": row["kind"],
        "subject": row["subject"],
        "body": row["body"],
        "surface_id": row["surface_id"],
        "error_message": row["error_message"],
        "preferred_channel": row["preferred_channel"],
        "status": row["status"],
        "email_status": row["email_status"],
        "email_detail": row["email_detail"],
        "meta": meta if isinstance(meta, dict) else {},
        "created_at": row["created_at"],
    }


def support_inbox_email() -> str:
    return (os.environ.get("DOCUGRID_SUPPORT_INBOX_EMAIL") or "").strip()


def _try_send_cs_email(
    *,
    ticket_id: str,
    firm_id: str,
    subject: str,
    body: str,
    reply_to: str,
) -> dict[str, Any]:
    """Send ticket to CS inbox when configured; otherwise store-only."""
    inbox = support_inbox_email()
    if not inbox or "@" not in inbox:
        return {
            "ok": False,
            "status": "stored_only",
            "detail": "DOCUGRID_SUPPORT_INBOX_EMAIL unset — ticket saved locally",
        }

    host = (os.environ.get("DOCUGRID_SUPPORT_SMTP_HOST") or "").strip()
    user = (os.environ.get("DOCUGRID_SUPPORT_SMTP_USER") or "").strip()
    password = (os.environ.get("DOCUGRID_SUPPORT_SMTP_PASSWORD") or "").strip()
    port = int(os.environ.get("DOCUGRID_SUPPORT_SMTP_PORT") or "587")
    use_tls = (os.environ.get("DOCUGRID_SUPPORT_SMTP_TLS") or "1").strip() not in {
        "0",
        "false",
        "False",
    }
    from_email = (
        (os.environ.get("DOCUGRID_SUPPORT_SMTP_FROM") or "").strip()
        or user
        or "noreply@docugrid.local"
    )

    text = (
        f"[DocuGrid Support Ticket]\n"
        f"ticket_id: {ticket_id}\n"
        f"firm_id: {firm_id}\n"
        f"reply_to: {reply_to or '(none)'}\n\n"
        f"{body}\n"
    )
    msg = EmailMessage()
    msg["From"] = from_email
    msg["To"] = inbox
    msg["Subject"] = f"[DocuGrid CS] {subject}"[:180]
    if reply_to and "@" in reply_to:
        msg["Reply-To"] = reply_to
    msg.set_content(text)

    if not host:
        # Dev-friendly: no SMTP — still mark as queued for inbox address awareness
        logger.info("support ticket %s stored; SMTP host unset (inbox=%s)", ticket_id, inbox)
        return {
            "ok": False,
            "status": "queued_no_smtp",
            "detail": f"inbox={inbox}; set DOCUGRID_SUPPORT_SMTP_HOST to send",
        }

    if not user or not password:
        return {
            "ok": False,
            "status": "smtp_incomplete",
            "detail": "SMTP user/password incomplete",
        }

    try:
        if use_tls:
            context = ssl.create_default_context()
            with smtplib.SMTP(host, port, timeout=20) as smtp:
                smtp.starttls(context=context)
                smtp.login(user, password)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=20) as smtp:
                smtp.login(user, password)
                smtp.send_message(msg)
        return {"ok": True, "status": "sent", "detail": f"to={inbox}"}
    except Exception as exc:
        logger.warning("support ticket email failed: %s", exc)
        return {"ok": False, "status": "send_failed", "detail": str(exc)[:300]}


def create_ticket(
    *,
    firm_id: str,
    created_by_email: str,
    created_by_role: str,
    kind: str,
    subject: str,
    body: str,
    surface_id: str = "",
    error_message: str = "",
    preferred_channel: str = "email",
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    init_support_tickets_db()
    firm = (firm_id or DEFAULT_FIRM_ID).strip() or DEFAULT_FIRM_ID
    k = (kind or "other").strip()
    if k not in ALLOWED_KINDS:
        raise ValueError("invalid kind")
    ch = (preferred_channel or "email").strip()
    if ch not in ALLOWED_CHANNELS:
        raise ValueError("invalid preferred_channel")
    subj = (subject or "").strip()
    bod = (body or "").strip()
    if not subj or not bod:
        raise ValueError("subject and body required")
    if len(subj) > 200:
        subj = subj[:200]
    if len(bod) > 8000:
        bod = bod[:8000]

    ticket_id = f"stk_{uuid.uuid4().hex[:16]}"
    created_at = _now()
    email_result = _try_send_cs_email(
        ticket_id=ticket_id,
        firm_id=firm,
        subject=subj,
        body=bod,
        reply_to=(created_by_email or "").strip(),
    )
    email_status = str(email_result.get("status") or "pending")
    email_detail = str(email_result.get("detail") or "")

    with sqlite3.connect(SUPPORT_TICKETS_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO support_tickets (
                id, firm_id, created_by_email, created_by_role, kind, subject, body,
                surface_id, error_message, preferred_channel, status,
                email_status, email_detail, meta_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)
            """,
            (
                ticket_id,
                firm,
                (created_by_email or "").strip()[:200],
                (created_by_role or "").strip()[:80],
                k,
                subj,
                bod,
                (surface_id or "").strip()[:80],
                (error_message or "").strip()[:1000],
                ch,
                email_status,
                email_detail[:500],
                json.dumps(meta or {}, ensure_ascii=False),
                created_at,
            ),
        )
        conn.commit()
        row = _row(conn, ticket_id)
    assert row is not None
    row["mailto"] = _mailto_fallback(subj, bod, created_by_email)
    return row


def _mailto_fallback(subject: str, body: str, reply_to: str) -> str | None:
    inbox = support_inbox_email()
    if not inbox:
        return None
    from urllib.parse import quote

    text = body
    if reply_to:
        text = f"From: {reply_to}\n\n{body}"
    return f"mailto:{quote(inbox)}?subject={quote(subject[:120])}&body={quote(text[:1500])}"


def list_tickets_for_firm(firm_id: str, *, limit: int = 50) -> list[dict[str, Any]]:
    init_support_tickets_db()
    firm = (firm_id or DEFAULT_FIRM_ID).strip() or DEFAULT_FIRM_ID
    lim = max(1, min(int(limit), 100))
    with sqlite3.connect(SUPPORT_TICKETS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT id FROM support_tickets
            WHERE firm_id = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (firm, lim),
        ).fetchall()
        return [r for tid in rows if (r := _row(conn, tid["id"])) is not None]


def get_ticket(firm_id: str, ticket_id: str) -> dict[str, Any] | None:
    init_support_tickets_db()
    firm = (firm_id or DEFAULT_FIRM_ID).strip() or DEFAULT_FIRM_ID
    with sqlite3.connect(SUPPORT_TICKETS_DB_PATH) as conn:
        row = _row(conn, ticket_id)
    if not row or row["firm_id"] != firm:
        return None
    return row


def update_ticket_status(
    firm_id: str,
    ticket_id: str,
    *,
    status: str,
    note: str = "",
) -> dict[str, Any]:
    init_support_tickets_db()
    firm = (firm_id or DEFAULT_FIRM_ID).strip() or DEFAULT_FIRM_ID
    st = (status or "").strip()
    if st not in ALLOWED_STATUSES:
        raise ValueError("invalid status")
    with sqlite3.connect(SUPPORT_TICKETS_DB_PATH) as conn:
        row = _row(conn, ticket_id)
        if not row or row["firm_id"] != firm:
            raise KeyError("ticket not found")
        meta = dict(row.get("meta") or {})
        if note.strip():
            history = list(meta.get("status_notes") or [])
            history.append({"at": _now(), "status": st, "note": note.strip()[:500]})
            meta["status_notes"] = history[-20:]
        if st == "phone_requested":
            meta["phone_requested_at"] = _now()
        conn.execute(
            """
            UPDATE support_tickets
            SET status = ?, meta_json = ?
            WHERE id = ? AND firm_id = ?
            """,
            (st, json.dumps(meta, ensure_ascii=False), ticket_id, firm),
        )
        conn.commit()
        updated = _row(conn, ticket_id)
    assert updated is not None
    return updated


def firm_support_metrics(firm_id: str) -> dict[str, Any]:
    """Simple ops metrics for S4 (firm-scoped only)."""
    init_support_tickets_db()
    firm = (firm_id or DEFAULT_FIRM_ID).strip() or DEFAULT_FIRM_ID
    with sqlite3.connect(SUPPORT_TICKETS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT kind, status, preferred_channel, email_status
            FROM support_tickets
            WHERE firm_id = ?
            """,
            (firm,),
        ).fetchall()

    total = len(rows)
    by_kind: dict[str, int] = {}
    by_status: dict[str, int] = {}
    by_channel: dict[str, int] = {}
    by_email: dict[str, int] = {}
    for r in rows:
        by_kind[r["kind"]] = by_kind.get(r["kind"], 0) + 1
        by_status[r["status"]] = by_status.get(r["status"], 0) + 1
        by_channel[r["preferred_channel"]] = by_channel.get(r["preferred_channel"], 0) + 1
        by_email[r["email_status"]] = by_email.get(r["email_status"], 0) + 1

    open_n = by_status.get("open", 0)
    resolved_n = by_status.get("resolved", 0) + by_status.get("closed", 0)
    phone_n = by_status.get("phone_requested", 0) + by_channel.get("phone_request", 0)
    denom = max(total, 1)
    return {
        "firm_id": firm,
        "total_tickets": total,
        "open": open_n,
        "resolved_or_closed": resolved_n,
        "phone_related": phone_n,
        "resolution_rate": round(resolved_n / denom, 4) if total else 0.0,
        "phone_rate": round(phone_n / denom, 4) if total else 0.0,
        "by_kind": by_kind,
        "by_status": by_status,
        "by_preferred_channel": by_channel,
        "by_email_status": by_email,
    }
