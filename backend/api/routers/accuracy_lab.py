"""Accuracy lab API — journal, presets, markdown export."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from api.deps import (
    _auth_context,
    _log_audit_event,
    _require_client_permission,
    _require_permission,
)
from services.accuracy_lab_service import (
    ALLOWED_KINDS,
    ALLOWED_OUTCOMES,
    ALLOWED_SOURCES,
    create_entry,
    delete_entry,
    list_entries,
    load_presets,
    publish_docs_findings,
    render_markdown,
    save_presets_override,
    write_snapshot,
)
from services.tenancy import DEFAULT_FIRM_ID

router = APIRouter()


class AccuracyLabEntryBody(BaseModel):
    source: str = "manual"
    kind: str = "note"
    title: str
    outcome: str = "unknown"
    body: str = ""
    client_id: Optional[str] = None
    context: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)


class AccuracyLabPresetsBody(BaseModel):
    trial_keywords: Optional[list[str]] = None
    check_prompts: Optional[list[Any]] = None


@router.get("/api/accuracy-lab/presets")
async def get_accuracy_lab_presets(request: Request):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    return load_presets(ctx.firm_id or DEFAULT_FIRM_ID)


@router.put("/api/accuracy-lab/presets")
async def put_accuracy_lab_presets(request: Request, body: AccuracyLabPresetsBody):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    firm_id = ctx.firm_id or DEFAULT_FIRM_ID
    payload = body.model_dump(exclude_none=True)
    saved = save_presets_override(firm_id, payload)
    _log_audit_event(request, "accuracy_lab.presets.put", "success", f"keys={list(payload)}")
    return saved


@router.get("/api/accuracy-lab/entries")
async def get_accuracy_lab_entries(
    request: Request,
    client_id: Optional[str] = Query(None),
    outcome: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    if client_id:
        _require_client_permission(request, "document.view", client_id)
    items = list_entries(
        ctx.firm_id or DEFAULT_FIRM_ID,
        client_id=client_id,
        outcome=outcome,
        source=source,
        limit=limit,
    )
    return {"items": items, "count": len(items)}


@router.post("/api/accuracy-lab/entries")
async def post_accuracy_lab_entry(request: Request, body: AccuracyLabEntryBody):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    if body.client_id:
        _require_client_permission(request, "document.view", body.client_id)
    if body.source not in ALLOWED_SOURCES:
        raise HTTPException(status_code=400, detail="Invalid source")
    if body.kind not in ALLOWED_KINDS:
        raise HTTPException(status_code=400, detail="Invalid kind")
    if body.outcome not in ALLOWED_OUTCOMES:
        raise HTTPException(status_code=400, detail="Invalid outcome")
    entry = create_entry(
        firm_id=ctx.firm_id or DEFAULT_FIRM_ID,
        source=body.source,
        kind=body.kind,
        title=body.title,
        outcome=body.outcome,
        body=body.body,
        client_id=body.client_id,
        context=body.context,
        tags=body.tags,
        created_by=ctx.email,
    )
    _log_audit_event(request, "accuracy_lab.entry.create", "success", f"id={entry['id']}")
    return entry


@router.delete("/api/accuracy-lab/entries/{entry_id}")
async def delete_accuracy_lab_entry(request: Request, entry_id: str):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    ok = delete_entry(ctx.firm_id or DEFAULT_FIRM_ID, entry_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Entry not found")
    _log_audit_event(request, "accuracy_lab.entry.delete", "success", f"id={entry_id}")
    return {"ok": True}


@router.get("/api/accuracy-lab/export.md")
async def export_accuracy_lab_markdown(request: Request):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    md = render_markdown(ctx.firm_id or DEFAULT_FIRM_ID)
    return PlainTextResponse(md, media_type="text/markdown; charset=utf-8")


@router.post("/api/accuracy-lab/snapshot")
async def snapshot_accuracy_lab(request: Request):
    """Write firm storage LATEST.md (and return markdown)."""
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    snap = write_snapshot(ctx.firm_id or DEFAULT_FIRM_ID)
    _log_audit_event(request, "accuracy_lab.snapshot", "success", f"bytes={snap['bytes']}")
    return snap


@router.post("/api/accuracy-lab/publish-docs")
async def publish_accuracy_lab_docs(request: Request):
    """Regenerate docs/accuracy-lab-findings.md for coding reference."""
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    result = publish_docs_findings(ctx.firm_id or DEFAULT_FIRM_ID)
    _log_audit_event(
        request,
        "accuracy_lab.publish_docs",
        "success",
        f"path={result.get('docs_path')}",
    )
    return result
