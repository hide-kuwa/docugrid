"""特定個人情報（マイナンバー関連書類）API — SPI vault."""

from __future__ import annotations

import hashlib
from typing import Optional

import fitz
from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from api.deps import (
    _auth_context,
    _attachment_content_disposition,
    _log_audit_event,
    _read_upload_content,
    _require_client_permission,
    _require_permission,
)
from services.spi_vault import (
    get_spi_document,
    init_spi_db,
    list_spi_documents,
    mask_individual_number_text,
    policy_payload,
    purge_expired,
    purge_spi,
    read_decrypted,
    soft_delete_spi,
    store_encrypted_pdf,
)

router = APIRouter()


class SpiDocItem(BaseModel):
    id: str
    firm_id: str
    client_id: str
    original_name: str
    content_sha256: str
    byte_size: int
    page_count: Optional[int] = None
    retention_until: str
    created_at: str
    created_by: Optional[str] = None
    deleted_at: Optional[str] = None
    # Never expose storage_key path details beyond firm-scoped id for HP/API consumers
    encrypted: bool = True
    drive_mirrored: bool = False
    ai_eligible: bool = False


def _to_item(doc) -> SpiDocItem:
    return SpiDocItem(
        id=doc.id,
        firm_id=doc.firm_id,
        client_id=doc.client_id,
        original_name=mask_individual_number_text(doc.original_name),
        content_sha256=doc.content_sha256,
        byte_size=doc.byte_size,
        page_count=doc.page_count,
        retention_until=doc.retention_until,
        created_at=doc.created_at,
        created_by=doc.created_by,
        deleted_at=doc.deleted_at,
    )


@router.get("/api/spi/policy")
async def get_spi_policy(request: Request):
    """How DocuGrid stores specific personal information (safe for settings / trust pages)."""
    _require_permission(request, "dashboard.view")
    return policy_payload()


@router.get("/api/spi/documents")
async def list_spi(
    request: Request,
    client_id: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    _require_permission(request, "my_number.view")
    ctx = _auth_context(request)
    if client_id:
        _require_client_permission(request, "my_number.view", client_id)
    items = list_spi_documents(ctx.firm_id, client_id=client_id, limit=limit)
    _log_audit_event(request, "spi.list", "ok", f"count={len(items)}")
    return {"documents": [_to_item(d) for d in items], "firm_id": ctx.firm_id}


@router.post("/api/spi/documents", response_model=SpiDocItem)
async def upload_spi(
    request: Request,
    client_id: str = Form(...),
    retention_years: int = Form(7),
    file: UploadFile = File(...),
):
    _require_client_permission(request, "my_number.manage", client_id)
    ctx = _auth_context(request)
    content = await _read_upload_content(file)
    try:
        page_count = len(fitz.open("pdf", content))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid PDF") from exc
    sha = hashlib.sha256(content).hexdigest()
    years = max(1, min(int(retention_years or 7), 30))
    from services.spi_vault import default_retention_until

    doc = store_encrypted_pdf(
        firm_id=ctx.firm_id,
        client_id=client_id.strip(),
        content=content,
        original_name=file.filename or "document.pdf",
        content_sha256=sha,
        page_count=page_count,
        created_by=ctx.email or ctx.stakeholder_id,
        retention_until=default_retention_until(years=years),
    )
    _log_audit_event(
        request,
        "spi.upload",
        "ok",
        f"id={doc.id} client={client_id} bytes={doc.byte_size}",
    )
    return _to_item(doc)


@router.get("/api/spi/documents/{spi_id}/file")
async def download_spi(request: Request, spi_id: str):
    _require_permission(request, "my_number.view")
    ctx = _auth_context(request)
    try:
        doc, plain = read_decrypted(ctx.firm_id, spi_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Not found") from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="File missing") from exc
    except ValueError as exc:
        raise HTTPException(status_code=500, detail="Decrypt failed") from exc
    _require_client_permission(request, "my_number.view", doc.client_id)
    _log_audit_event(
        request,
        "spi.download",
        "ok",
        f"id={spi_id} client={doc.client_id}",
    )
    return Response(
        content=plain,
        media_type="application/pdf",
        headers={"Content-Disposition": _attachment_content_disposition(doc.original_name)},
    )


@router.delete("/api/spi/documents/{spi_id}")
async def delete_spi_doc(
    request: Request,
    spi_id: str,
    mode: str = Query("soft", description="soft | purge"),
):
    _require_permission(request, "my_number.manage")
    ctx = _auth_context(request)
    doc = get_spi_document(ctx.firm_id, spi_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    _require_client_permission(request, "my_number.manage", doc.client_id)
    if mode == "purge":
        result = purge_spi(ctx.firm_id, spi_id)
        _log_audit_event(request, "spi.purge", "ok", f"id={spi_id}")
        return result
    if not soft_delete_spi(ctx.firm_id, spi_id):
        raise HTTPException(status_code=404, detail="Not found")
    _log_audit_event(request, "spi.soft_delete", "ok", f"id={spi_id}")
    return {"deleted": True, "mode": "soft", "id": spi_id}


class SpiPurgeExpiredBody(BaseModel):
    as_of: Optional[str] = Field(default=None, description="ISO timestamp; default now")


@router.post("/api/spi/purge-expired")
async def spi_purge_expired(request: Request, body: SpiPurgeExpiredBody | None = None):
    _require_permission(request, "my_number.manage")
    ctx = _auth_context(request)
    result = purge_expired(ctx.firm_id, as_of=(body.as_of if body else None))
    _log_audit_event(
        request,
        "spi.purge_expired",
        "ok",
        f"count={result.get('purged_count')}",
    )
    return result

