"""特定個人情報（SPI）保管 — 暗号化・分離パス・保存期限・廃棄.

番号法ガイドライン（事業者編）の技術的安全管理を実装側で支える。
平文の個人番号をログに出さないこと。
"""

from __future__ import annotations

import base64
import hashlib
import os
import re
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from services.tenancy import DEFAULT_FIRM_ID

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
SPI_DB_PATH = STORAGE_DIR / "spi_documents.db"
SECRET_ENCRYPTION_KEY_ENV = "DOCUGRID_SECRET_ENCRYPTION_KEY"
SPI_PURPOSE = b"docugrid-spi-v1"
DEFAULT_RETENTION_YEARS = 7
_MASK_RE = re.compile(r"(?<!\d)(\d{4})(\d{4})(\d{4})(?!\d)")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _utc_iso(dt: Optional[datetime] = None) -> str:
    return (dt or _utc_now()).isoformat()


def _master_secret() -> str:
    explicit = os.environ.get(SECRET_ENCRYPTION_KEY_ENV, "").strip()
    if explicit:
        return explicit
    jwt = os.environ.get("DOCUGRID_JWT_SECRET", "").strip()
    if jwt:
        return jwt
    return "docugrid-dev-local-spi-secret-key"


def _fernet() -> Fernet:
    digest = hashlib.sha256(_master_secret().encode("utf-8") + SPI_PURPOSE).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_bytes(plain: bytes) -> bytes:
    return _fernet().encrypt(plain)


def decrypt_bytes(token: bytes) -> bytes:
    try:
        return _fernet().decrypt(token)
    except (InvalidToken, ValueError) as exc:
        raise ValueError("spi_decrypt_failed") from exc


def is_spi_storage_key(storage_key: str | None) -> bool:
    key = (storage_key or "").replace("\\", "/")
    return "/spi/" in key and key.endswith(".enc")


def spi_storage_key(firm_id: str, object_id: str) -> str:
    fid = (firm_id or "").strip() or DEFAULT_FIRM_ID
    return f"{fid}/spi/{object_id}.enc"


def mask_individual_number_text(text: str) -> str:
    """Mask 12-digit runs that look like individual numbers (display / logs)."""
    if not text:
        return text
    return _MASK_RE.sub(r"****-****-\3", text)


@dataclass
class SpiDocument:
    id: str
    firm_id: str
    client_id: str
    original_name: str
    storage_key: str
    content_sha256: str
    byte_size: int
    page_count: Optional[int]
    retention_until: str
    created_at: str
    created_by: Optional[str]
    deleted_at: Optional[str] = None
    source_slot_doc_id: Optional[str] = None


def init_spi_db() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(SPI_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS spi_documents (
                id TEXT PRIMARY KEY,
                firm_id TEXT NOT NULL,
                client_id TEXT NOT NULL,
                original_name TEXT NOT NULL,
                storage_key TEXT NOT NULL,
                content_sha256 TEXT NOT NULL,
                byte_size INTEGER NOT NULL,
                page_count INTEGER,
                retention_until TEXT NOT NULL,
                created_at TEXT NOT NULL,
                created_by TEXT,
                deleted_at TEXT,
                source_slot_doc_id TEXT
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_spi_firm_client ON spi_documents (firm_id, client_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_spi_retention ON spi_documents (firm_id, retention_until)"
        )


def default_retention_until(*, years: int = DEFAULT_RETENTION_YEARS) -> str:
    return _utc_iso(_utc_now() + timedelta(days=365 * max(1, years)))


def store_encrypted_pdf(
    *,
    firm_id: str,
    client_id: str,
    content: bytes,
    original_name: str,
    content_sha256: str,
    page_count: Optional[int] = None,
    created_by: Optional[str] = None,
    retention_until: Optional[str] = None,
    source_slot_doc_id: Optional[str] = None,
    object_id: Optional[str] = None,
) -> SpiDocument:
    """Encrypt PDF bytes and write under firms/{firm_id}/spi/ (never Drive / never AI)."""
    init_spi_db()
    fid = (firm_id or "").strip() or DEFAULT_FIRM_ID
    cid = (client_id or "").strip()
    if not cid:
        raise ValueError("client_id_required")
    if not content:
        raise ValueError("empty_content")
    oid = (object_id or uuid.uuid4().hex).strip()
    key = spi_storage_key(fid, oid)
    dest = STORAGE_DIR / key
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(encrypt_bytes(content))
    now = _utc_iso()
    until = (retention_until or "").strip() or default_retention_until()
    with sqlite3.connect(SPI_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO spi_documents (
                id, firm_id, client_id, original_name, storage_key, content_sha256,
                byte_size, page_count, retention_until, created_at, created_by,
                deleted_at, source_slot_doc_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
            """,
            (
                oid,
                fid,
                cid,
                original_name or "document.pdf",
                key,
                content_sha256,
                len(content),
                page_count,
                until,
                now,
                created_by,
                source_slot_doc_id,
            ),
        )
    return SpiDocument(
        id=oid,
        firm_id=fid,
        client_id=cid,
        original_name=original_name or "document.pdf",
        storage_key=key,
        content_sha256=content_sha256,
        byte_size=len(content),
        page_count=page_count,
        retention_until=until,
        created_at=now,
        created_by=created_by,
        source_slot_doc_id=source_slot_doc_id,
    )


def read_decrypted(firm_id: str, spi_id: str) -> tuple[SpiDocument, bytes]:
    doc = get_spi_document(firm_id, spi_id)
    if not doc or doc.deleted_at:
        raise KeyError("spi_not_found")
    path = STORAGE_DIR / doc.storage_key
    if not path.is_file():
        raise FileNotFoundError("spi_file_missing")
    return doc, decrypt_bytes(path.read_bytes())


def read_decrypted_by_storage_key(storage_key: str) -> bytes:
    if not is_spi_storage_key(storage_key):
        raise ValueError("not_spi_storage_key")
    path = STORAGE_DIR / storage_key.replace("\\", "/")
    if not path.is_file():
        raise FileNotFoundError("spi_file_missing")
    return decrypt_bytes(path.read_bytes())


def get_spi_document(firm_id: str, spi_id: str) -> Optional[SpiDocument]:
    init_spi_db()
    with sqlite3.connect(SPI_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM spi_documents WHERE id=? AND firm_id=?",
            (spi_id, firm_id),
        ).fetchone()
    return _row(row) if row else None


def list_spi_documents(
    firm_id: str,
    *,
    client_id: Optional[str] = None,
    include_deleted: bool = False,
    limit: int = 200,
) -> list[SpiDocument]:
    init_spi_db()
    sql = "SELECT * FROM spi_documents WHERE firm_id=?"
    params: list = [firm_id]
    if client_id:
        sql += " AND client_id=?"
        params.append(client_id)
    if not include_deleted:
        sql += " AND deleted_at IS NULL"
    sql += " ORDER BY created_at DESC LIMIT ?"
    params.append(max(1, min(int(limit), 500)))
    with sqlite3.connect(SPI_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(sql, params).fetchall()
    return [_row(r) for r in rows]


def soft_delete_spi(firm_id: str, spi_id: str) -> bool:
    init_spi_db()
    now = _utc_iso()
    with sqlite3.connect(SPI_DB_PATH) as conn:
        cur = conn.execute(
            """
            UPDATE spi_documents SET deleted_at=?
            WHERE id=? AND firm_id=? AND deleted_at IS NULL
            """,
            (now, spi_id, firm_id),
        )
        return cur.rowcount > 0


def purge_spi(firm_id: str, spi_id: str) -> dict:
    """Irreversible delete of ciphertext + registry row. Records deletion via return value."""
    init_spi_db()
    doc = get_spi_document(firm_id, spi_id)
    if not doc:
        return {"purged": False, "reason": "not_found"}
    path = STORAGE_DIR / doc.storage_key
    if path.is_file():
        path.unlink()
    with sqlite3.connect(SPI_DB_PATH) as conn:
        conn.execute(
            "DELETE FROM spi_documents WHERE id=? AND firm_id=?",
            (spi_id, firm_id),
        )
    return {
        "purged": True,
        "id": spi_id,
        "firm_id": firm_id,
        "client_id": doc.client_id,
        "purged_at": _utc_iso(),
    }


def purge_expired(firm_id: str, *, as_of: Optional[str] = None) -> dict:
    """Purge documents past retention_until (推奨: 保存期間経過後の廃棄ジョブ)."""
    init_spi_db()
    cutoff = (as_of or _utc_iso()).strip()
    with sqlite3.connect(SPI_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT id FROM spi_documents
            WHERE firm_id=? AND retention_until <= ? AND deleted_at IS NULL
            """,
            (firm_id, cutoff),
        ).fetchall()
    purged: list[str] = []
    for row in rows:
        result = purge_spi(firm_id, row["id"])
        if result.get("purged"):
            purged.append(row["id"])
    return {"purged_count": len(purged), "ids": purged, "as_of": cutoff}


def policy_payload() -> dict:
    """Public / settings summary of how SPI is handled (no secrets)."""
    return {
        "storageMode": "encrypted_at_rest_separated",
        "pathPattern": "{firm_id}/spi/{id}.enc",
        "encryption": "Fernet (AES-128-CBC + HMAC) with dedicated SPI key derivation",
        "driveMirror": False,
        "aiClassify": False,
        "defaultRetentionYears": DEFAULT_RETENTION_YEARS,
        "permissions": ["my_number.view", "my_number.manage"],
        "masking": "12-digit display masking in API metadata helpers",
        "purge": "retention_until + purge_expired / explicit purge",
    }


def _row(row: sqlite3.Row) -> SpiDocument:
    return SpiDocument(
        id=row["id"],
        firm_id=row["firm_id"],
        client_id=row["client_id"],
        original_name=row["original_name"],
        storage_key=row["storage_key"],
        content_sha256=row["content_sha256"],
        byte_size=int(row["byte_size"] or 0),
        page_count=row["page_count"],
        retention_until=row["retention_until"],
        created_at=row["created_at"],
        created_by=row["created_by"],
        deleted_at=row["deleted_at"],
        source_slot_doc_id=row["source_slot_doc_id"],
    )


__all__ = [
    "DEFAULT_RETENTION_YEARS",
    "SpiDocument",
    "decrypt_bytes",
    "default_retention_until",
    "encrypt_bytes",
    "get_spi_document",
    "init_spi_db",
    "is_spi_storage_key",
    "list_spi_documents",
    "mask_individual_number_text",
    "policy_payload",
    "purge_expired",
    "purge_spi",
    "read_decrypted",
    "read_decrypted_by_storage_key",
    "soft_delete_spi",
    "spi_storage_key",
    "store_encrypted_pdf",
]
