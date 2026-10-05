"""Advisor client handoff — one-client transfer pack + redeemable code."""

from __future__ import annotations

import json
import secrets
import shutil
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from api.constants import SLOT_DOCS_DB_PATH, STORAGE_DIR
from api.master_store import _load_client_master, _save_client_master, _validate_client_master
from api.persistence import _init_slot_documents_db
from api.schemas import ClientMasterClient, ClientMasterPayload
from services.storage_paths import resolve_storage_path
from services.tenancy import invalidate_client_firm_cache

TRANSFERS_DB_PATH = STORAGE_DIR / "client_transfers.db"
TRANSFERS_DIR = STORAGE_DIR / "transfers"
TRANSFER_TTL_DAYS = 14
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I
CODE_LENGTH = 8

STATUS_PENDING = "pending"
STATUS_CLAIMED = "claimed"
STATUS_EXPIRED = "expired"
STATUS_REVOKED = "revoked"


@dataclass(frozen=True)
class TransferRecord:
    id: str
    code: str
    from_firm_id: str
    source_client_id: str
    client_display_name: str
    status: str
    expires_at: str
    created_by_member_id: str
    created_at: str
    pack_path: str
    document_count: int
    claimed_firm_id: str | None = None
    claimed_client_id: str | None = None
    claimed_at: str | None = None
    revoked_at: str | None = None


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _utc_now_iso() -> str:
    return _utc_now().isoformat()


def init_client_transfers_db() -> None:
    TRANSFERS_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(TRANSFERS_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS client_transfers (
                id TEXT PRIMARY KEY,
                code TEXT NOT NULL UNIQUE,
                from_firm_id TEXT NOT NULL,
                source_client_id TEXT NOT NULL,
                client_display_name TEXT NOT NULL,
                status TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                created_by_member_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                pack_path TEXT NOT NULL,
                document_count INTEGER NOT NULL DEFAULT 0,
                claimed_firm_id TEXT,
                claimed_client_id TEXT,
                claimed_at TEXT,
                revoked_at TEXT
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_client_transfers_code ON client_transfers(code)"
        )


def _generate_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def _normalize_code(code: str) -> str:
    return "".join(ch for ch in (code or "").upper() if ch.isalnum())


def _row_to_record(row: sqlite3.Row) -> TransferRecord:
    return TransferRecord(
        id=str(row["id"]),
        code=str(row["code"]),
        from_firm_id=str(row["from_firm_id"]),
        source_client_id=str(row["source_client_id"]),
        client_display_name=str(row["client_display_name"]),
        status=str(row["status"]),
        expires_at=str(row["expires_at"]),
        created_by_member_id=str(row["created_by_member_id"]),
        created_at=str(row["created_at"]),
        pack_path=str(row["pack_path"]),
        document_count=int(row["document_count"] or 0),
        claimed_firm_id=str(row["claimed_firm_id"]) if row["claimed_firm_id"] else None,
        claimed_client_id=str(row["claimed_client_id"]) if row["claimed_client_id"] else None,
        claimed_at=str(row["claimed_at"]) if row["claimed_at"] else None,
        revoked_at=str(row["revoked_at"]) if row["revoked_at"] else None,
    )


def _get_by_code(code: str) -> TransferRecord | None:
    init_client_transfers_db()
    normalized = _normalize_code(code)
    if not normalized:
        return None
    with sqlite3.connect(TRANSFERS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM client_transfers WHERE code=?",
            (normalized,),
        ).fetchone()
    if not row:
        return None
    return _refresh_expiry(_row_to_record(row))


def _get_by_id(transfer_id: str) -> TransferRecord | None:
    init_client_transfers_db()
    with sqlite3.connect(TRANSFERS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM client_transfers WHERE id=?",
            (transfer_id,),
        ).fetchone()
    if not row:
        return None
    return _refresh_expiry(_row_to_record(row))


def _refresh_expiry(rec: TransferRecord) -> TransferRecord:
    if rec.status != STATUS_PENDING:
        return rec
    try:
        expires = datetime.fromisoformat(rec.expires_at)
    except ValueError:
        return rec
    if expires < _utc_now():
        with sqlite3.connect(TRANSFERS_DB_PATH) as conn:
            conn.execute(
                "UPDATE client_transfers SET status=? WHERE id=? AND status=?",
                (STATUS_EXPIRED, rec.id, STATUS_PENDING),
            )
        return TransferRecord(
            id=rec.id,
            code=rec.code,
            from_firm_id=rec.from_firm_id,
            source_client_id=rec.source_client_id,
            client_display_name=rec.client_display_name,
            status=STATUS_EXPIRED,
            expires_at=rec.expires_at,
            created_by_member_id=rec.created_by_member_id,
            created_at=rec.created_at,
            pack_path=rec.pack_path,
            document_count=rec.document_count,
            claimed_firm_id=rec.claimed_firm_id,
            claimed_client_id=rec.claimed_client_id,
            claimed_at=rec.claimed_at,
            revoked_at=rec.revoked_at,
        )
    return rec


def _list_slot_rows(client_id: str, firm_id: str) -> list[dict[str, Any]]:
    _init_slot_documents_db()
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT id, client_id, period_key, slot_id, slot_label, original_name,
                   storage_key, page_count, content_sha256, byte_size, firm_id
            FROM slot_documents
            WHERE client_id=?
              AND (deleted_at IS NULL OR deleted_at = '')
              AND (firm_id=? OR firm_id IS NULL OR firm_id = '')
            ORDER BY period_key, slot_id
            """,
            (client_id, firm_id),
        ).fetchall()
    return [dict(r) for r in rows]


def _build_pack(
    *,
    transfer_id: str,
    client: ClientMasterClient,
    firm_id: str,
) -> tuple[Path, int]:
    pack_dir = TRANSFERS_DIR / transfer_id
    if pack_dir.exists():
        shutil.rmtree(pack_dir)
    docs_dir = pack_dir / "documents"
    docs_dir.mkdir(parents=True, exist_ok=True)

    client_payload = {
        "id": client.id,
        "name": client.name,
        "fiscalMonth": client.fiscalMonth,
        "category": client.category,
        "tags": list(client.tags or []),
        "firmId": client.firmId,
        "profile": dict(client.profile or {}),
        "profileMeta": dict(client.profileMeta or {}),
        # history is large / office-specific — skip for handoff pack
    }
    (pack_dir / "client.json").write_text(
        json.dumps(client_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    slot_rows = _list_slot_rows(client.id, firm_id)
    manifest: list[dict[str, Any]] = []
    for idx, row in enumerate(slot_rows):
        storage_key = str(row.get("storage_key") or "")
        src = resolve_storage_path(storage_key)
        if not src.exists() or not src.is_file():
            continue
        dest_name = f"{idx:04d}_{Path(storage_key).name or 'document.pdf'}"
        if not dest_name.lower().endswith(".pdf"):
            dest_name += ".pdf"
        dest = docs_dir / dest_name
        shutil.copy2(src, dest)
        manifest.append(
            {
                "period_key": row.get("period_key"),
                "slot_id": str(row.get("slot_id") or ""),
                "slot_label": row.get("slot_label") or "",
                "original_name": row.get("original_name") or dest_name,
                "page_count": row.get("page_count"),
                "file": dest_name,
            }
        )
    (pack_dir / "documents.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return pack_dir, len(manifest)


def create_transfer(
    *,
    firm_id: str,
    client_id: str,
    created_by_member_id: str,
) -> TransferRecord:
    init_client_transfers_db()
    master = _load_client_master()
    client = next((c for c in master.clients if c.id == client_id), None)
    if client is None:
        raise ValueError("client_not_found")
    client_firm = (client.firmId or "").strip() or firm_id
    if client_firm != firm_id:
        raise ValueError("client_wrong_firm")

    transfer_id = f"xfer-{uuid.uuid4().hex[:16]}"
    pack_dir, doc_count = _build_pack(transfer_id=transfer_id, client=client, firm_id=firm_id)

    code = _generate_code()
    for _ in range(8):
        existing = _get_by_code(code)
        if existing is None:
            break
        code = _generate_code()
    else:
        raise RuntimeError("code_collision")

    now = _utc_now()
    expires = now + timedelta(days=TRANSFER_TTL_DAYS)
    rec = TransferRecord(
        id=transfer_id,
        code=code,
        from_firm_id=firm_id,
        source_client_id=client_id,
        client_display_name=client.name,
        status=STATUS_PENDING,
        expires_at=expires.isoformat(),
        created_by_member_id=created_by_member_id,
        created_at=now.isoformat(),
        pack_path=str(pack_dir.relative_to(STORAGE_DIR)).replace("\\", "/"),
        document_count=doc_count,
    )
    with sqlite3.connect(TRANSFERS_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO client_transfers (
                id, code, from_firm_id, source_client_id, client_display_name,
                status, expires_at, created_by_member_id, created_at, pack_path,
                document_count
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                rec.id,
                rec.code,
                rec.from_firm_id,
                rec.source_client_id,
                rec.client_display_name,
                rec.status,
                rec.expires_at,
                rec.created_by_member_id,
                rec.created_at,
                rec.pack_path,
                rec.document_count,
            ),
        )
    return rec


def public_transfer_view(code: str) -> dict[str, Any] | None:
    rec = _get_by_code(code)
    if rec is None:
        return None
    return {
        "code": rec.code,
        "clientDisplayName": rec.client_display_name,
        "status": rec.status,
        "expiresAt": rec.expires_at,
        "documentCount": rec.document_count,
    }


def revoke_transfer(*, transfer_id: str, firm_id: str) -> TransferRecord:
    rec = _get_by_id(transfer_id)
    if rec is None:
        raise ValueError("transfer_not_found")
    if rec.from_firm_id != firm_id:
        raise ValueError("transfer_forbidden")
    if rec.status != STATUS_PENDING:
        raise ValueError("transfer_not_pending")
    now = _utc_now_iso()
    with sqlite3.connect(TRANSFERS_DB_PATH) as conn:
        conn.execute(
            "UPDATE client_transfers SET status=?, revoked_at=? WHERE id=?",
            (STATUS_REVOKED, now, transfer_id),
        )
    updated = _get_by_id(transfer_id)
    assert updated is not None
    return updated


def preview_claim(code: str) -> dict[str, Any]:
    rec = _get_by_code(code)
    if rec is None:
        raise ValueError("transfer_not_found")
    if rec.status == STATUS_EXPIRED:
        raise ValueError("transfer_expired")
    if rec.status == STATUS_REVOKED:
        raise ValueError("transfer_revoked")
    if rec.status == STATUS_CLAIMED:
        raise ValueError("transfer_already_claimed")
    if rec.status != STATUS_PENDING:
        raise ValueError("transfer_unavailable")
    return {
        "transferId": rec.id,
        "code": rec.code,
        "clientDisplayName": rec.client_display_name,
        "documentCount": rec.document_count,
        "expiresAt": rec.expires_at,
        "fromFirmId": rec.from_firm_id,
    }


def _load_pack(rec: TransferRecord) -> tuple[dict[str, Any], list[dict[str, Any]], Path]:
    pack_dir = STORAGE_DIR / rec.pack_path
    client_path = pack_dir / "client.json"
    docs_meta_path = pack_dir / "documents.json"
    if not client_path.exists():
        raise ValueError("pack_missing")
    client_data = json.loads(client_path.read_text(encoding="utf-8"))
    docs_meta: list[dict[str, Any]] = []
    if docs_meta_path.exists():
        docs_meta = json.loads(docs_meta_path.read_text(encoding="utf-8"))
    return client_data, docs_meta, pack_dir


def claim_transfer(
    *,
    code: str,
    to_firm_id: str,
    claimed_by_member_id: str,
    claimed_by_email: str = "",
) -> dict[str, Any]:
    """Import pack into receiving firm. Returns new client id + counts."""
    rec = _get_by_code(code)
    if rec is None:
        raise ValueError("transfer_not_found")
    if rec.status == STATUS_EXPIRED:
        raise ValueError("transfer_expired")
    if rec.status == STATUS_REVOKED:
        raise ValueError("transfer_revoked")
    if rec.status == STATUS_CLAIMED:
        raise ValueError("transfer_already_claimed")
    if rec.status != STATUS_PENDING:
        raise ValueError("transfer_unavailable")
    if rec.from_firm_id == to_firm_id:
        raise ValueError("same_firm")

    client_data, docs_meta, pack_dir = _load_pack(rec)
    new_client_id = f"xfer-{uuid.uuid4().hex[:12]}"
    name = str(client_data.get("name") or rec.client_display_name).strip() or "移管顧問先"
    fiscal = int(client_data.get("fiscalMonth") or 3)
    if not 1 <= fiscal <= 12:
        fiscal = 3
    category = str(client_data.get("category") or "corporate")
    if category not in ("corporate", "individual"):
        category = "corporate"
    tags = client_data.get("tags") if isinstance(client_data.get("tags"), list) else []
    profile = client_data.get("profile") if isinstance(client_data.get("profile"), dict) else {}
    profile_meta = (
        client_data.get("profileMeta") if isinstance(client_data.get("profileMeta"), dict) else {}
    )

    new_client = ClientMasterClient(
        id=new_client_id,
        name=name,
        fiscalMonth=fiscal,
        category=category,
        tags=[str(t) for t in tags],
        firmId=to_firm_id,
        profile={str(k): str(v) for k, v in profile.items()},
        profileMeta={str(k): dict(v) if isinstance(v, dict) else {} for k, v in profile_meta.items()},
    )

    master = _load_client_master()
    merged = ClientMasterPayload(
        clients=[*master.clients, new_client],
        groups=list(master.groups),
        relations=list(master.relations),
        relationLayouts=dict(master.relationLayouts or {}),
        updated_at=_utc_now_iso(),
    )
    _validate_client_master(merged)
    _save_client_master(merged)
    invalidate_client_firm_cache()

    from services.migration_persist import persist_pdf_to_slot

    imported = 0
    docs_dir = pack_dir / "documents"
    actor = claimed_by_email or claimed_by_member_id or "transfer_claim"
    for item in docs_meta:
        file_name = str(item.get("file") or "")
        if not file_name:
            continue
        src = docs_dir / file_name
        if not src.exists():
            continue
        content = src.read_bytes()
        if not content:
            continue
        period_key = str(item.get("period_key") or "year:1")
        slot_id = str(item.get("slot_id") or "0")
        slot_label = str(item.get("slot_label") or item.get("original_name") or "資料")
        original_name = str(item.get("original_name") or file_name)
        try:
            persist_pdf_to_slot(
                client_id=new_client_id,
                period_key=period_key,
                slot_id=slot_id,
                slot_label=slot_label,
                content=content,
                filename=original_name,
                uploaded_by=actor,
            )
            imported += 1
        except Exception:
            continue

    now = _utc_now_iso()
    with sqlite3.connect(TRANSFERS_DB_PATH) as conn:
        cur = conn.execute(
            """
            UPDATE client_transfers
            SET status=?, claimed_firm_id=?, claimed_client_id=?, claimed_at=?
            WHERE id=? AND status=?
            """,
            (STATUS_CLAIMED, to_firm_id, new_client_id, now, rec.id, STATUS_PENDING),
        )
        if cur.rowcount != 1:
            raise ValueError("transfer_already_claimed")

    return {
        "transferId": rec.id,
        "code": rec.code,
        "newClientId": new_client_id,
        "clientName": name,
        "documentsImported": imported,
        "documentCount": rec.document_count,
    }


def list_transfers_for_firm(firm_id: str, *, limit: int = 20) -> list[TransferRecord]:
    init_client_transfers_db()
    with sqlite3.connect(TRANSFERS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT * FROM client_transfers
            WHERE from_firm_id=?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (firm_id, limit),
        ).fetchall()
    return [_refresh_expiry(_row_to_record(r)) for r in rows]
