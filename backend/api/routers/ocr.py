"""OCR / RAG search API (I0–I3)."""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request

from api.deps import _auth_context, _log_audit_event, _require_client_permission
from api.schemas import OcrJobCreateBody
from services.document_version_service import get_logical_by_id, get_version
from services.ocr_job_service import (
    create_ocr_job,
    get_document_ocr_payload,
    get_ocr_job,
    list_index_states,
    run_ocr_job,
)
from services.rag_index_service import search_documents_for_api, sync_karte_for_client

router = APIRouter()


@router.post("/api/ocr/jobs")
async def post_ocr_job(
    request: Request,
    body: OcrJobCreateBody,
    background_tasks: BackgroundTasks,
):
    """資料版に対する非同期 OCR / 分類ジョブを起動する。"""
    _require_client_permission(request, "document.upload", body.client_id)
    ctx = _auth_context(request)
    version = get_version(body.document_version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Document version not found")
    force = bool(getattr(body, "force", False))
    job = create_ocr_job(
        firm_id=ctx.firm_id,
        client_id=body.client_id,
        document_version_id=body.document_version_id,
        period_key=body.period_key,
        slot_id=body.slot_id,
        slot_label=body.slot_label,
        force=force,
    )
    if not job.get("reused"):
        background_tasks.add_task(run_ocr_job, job["id"])
    _log_audit_event(
        request,
        "ocr.job",
        "reused" if job.get("reused") else "queued",
        f"job={job['id']} ver={body.document_version_id}",
    )
    return job


@router.get("/api/ocr/jobs/{job_id}")
async def get_ocr_job_status(request: Request, job_id: str, client_id: str = Query(...)):
    _require_client_permission(request, "document.view", client_id)
    job = get_ocr_job(job_id)
    if not job or job["client_id"] != client_id:
        raise HTTPException(status_code=404, detail="OCR job not found")
    return job


@router.get("/api/ocr/status")
async def list_ocr_index_status(
    request: Request,
    client_id: str = Query(...),
    ocr_status: str | None = Query(None, description="pending|processing|ready|failed"),
    limit: int = Query(100, ge=1, le=500),
):
    """OCR / インデックス状態一覧（未完了・失敗の確認用）。"""
    _require_client_permission(request, "document.view", client_id)
    ctx = _auth_context(request)
    items = list_index_states(
        ctx.firm_id,
        client_id=client_id,
        ocr_status=ocr_status,
        limit=limit,
    )
    return {"items": items, "count": len(items)}


@router.get("/api/ocr/documents/{document_version_id}")
async def get_ocr_document(
    request: Request,
    document_version_id: str,
    client_id: str = Query(...),
):
    """資料版の OCR メタ・テキスト抜粋（MCP get_document 用）。"""
    _require_client_permission(request, "document.view", client_id)
    ctx = _auth_context(request)

    payload = get_document_ocr_payload(document_version_id)
    if not payload:
        raise HTTPException(status_code=404, detail="Document version not found")
    version = get_version(document_version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Document version not found")
    logical = get_logical_by_id(version.logical_document_id)
    if not logical or logical.client_id != client_id:
        raise HTTPException(status_code=404, detail="Document version not found")
    if getattr(logical, "firm_id", None) and logical.firm_id != ctx.firm_id:
        raise HTTPException(status_code=404, detail="Document version not found")
    if payload.get("firm_id") and payload["firm_id"] != ctx.firm_id:
        raise HTTPException(status_code=404, detail="Document version not found")
    if payload.get("client_id") and payload["client_id"] != client_id:
        raise HTTPException(status_code=404, detail="Document version not found")
    return payload


@router.get("/api/ocr/search")
async def search_ocr_excerpts(
    request: Request,
    q: str = Query(..., min_length=1),
    client_id: str = Query(...),
    limit: int = Query(50, ge=1, le=100),
    mode: str = Query(
        "hybrid",
        description="keyword|semantic|hybrid（I2: firm/client 先絞り → 類似度）",
    ),
):
    """社内文書検索。I1 キーワード + I2 ベクトル。firm/client で先に絞る。"""
    _require_client_permission(request, "document.view", client_id)
    ctx = _auth_context(request)
    return search_documents_for_api(
        ctx.firm_id,
        query=q,
        client_id=client_id,
        limit=limit,
        mode=mode,
    )


@router.post("/api/clients/{client_id}/karte/rag-sync")
async def sync_client_karte_rag(request: Request, client_id: str):
    """既存カルテを RAG インデックスへ backfill（検索経路では自動同期しない）。"""
    _require_client_permission(request, "settings.manage", client_id)
    ctx = _auth_context(request)
    result = sync_karte_for_client(ctx.firm_id, client_id)
    _log_audit_event(
        request,
        "karte.rag_sync",
        "success",
        f"entries={result.get('entries')} ingested={result.get('ingested')}",
    )
    return result
