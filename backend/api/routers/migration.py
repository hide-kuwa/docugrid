"""DocuGrid API — 初回データ整理（migration ingest）。"""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, File, Form, UploadFile
from fastapi.responses import FileResponse

from api.router_imports import *  # noqa: F403
from api.constants import *  # noqa: F403
from api.deps import *  # noqa: F403
from api.persistence import *  # noqa: F403
from api.master_store import *  # noqa: F403
from api.session import *  # noqa: F403
from api.billing_access import *  # noqa: F403
from api.schemas import *  # noqa: F403
from api.route_helpers import *  # noqa: F403

router = APIRouter()


@router.get("/api/migration/status")
async def migration_status(request: Request):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    from services.migration_ingest_service import get_status_payload

    return get_status_payload(ctx.firm_id)


@router.get("/api/migration/privacy")
async def migration_privacy(request: Request):
    _require_permission(request, "settings.manage")
    from services.migration_ingest_service import privacy_payload

    return privacy_payload()


@router.post("/api/migration/estimate")
async def migration_estimate(request: Request, file: UploadFile = File(...)):
    """ZIP を読み取り、整理用トークン・円の見積を返す（取り込みはしない）。"""
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="ZIP file required")
    content = await _read_upload_content(file)
    enforce_upload_size(len(content), label="migration zip")
    from services.migration_ingest_service import estimate_zip_ingest

    return estimate_zip_ingest(ctx.firm_id, content)


@router.get("/api/migration/jobs")
async def migration_jobs_list(request: Request, limit: int = Query(10, ge=1, le=50)):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    from services.migration_ingest_service import list_recent_jobs

    return {"jobs": list_recent_jobs(ctx.firm_id, limit=limit)}


@router.post("/api/migration/ingest")
async def migration_ingest(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    vision_mode: Optional[str] = Form("auto"),
):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="ZIP file required")
    content = await _read_upload_content(file)
    enforce_upload_size(len(content), label="migration zip")

    identity = resolve_identity(request)
    actor = identity.email or identity.stakeholder_id or ""
    from services.migration_ingest_service import (
        create_migration_job,
        estimate_zip_ingest,
        run_migration_job,
    )

    estimate = estimate_zip_ingest(ctx.firm_id, content)
    job_id = create_migration_job(ctx.firm_id, file.filename or "upload.zip", actor)

    mode = (vision_mode or "auto").strip().lower()
    if mode not in ("off", "auto", "on"):
        mode = "auto"

    def _run() -> None:
        run_migration_job(ctx.firm_id, job_id, content, actor, vision_mode=mode)

    background_tasks.add_task(_run)
    _log_audit_event(
        request,
        "migration.ingest_start",
        "success",
        f"job={job_id} zip={file.filename} bytes={len(content)}",
    )
    return {
        "accepted": True,
        "jobId": job_id,
        "estimate": {
            "pdfCount": estimate.get("pdfCount"),
            "estimatedTokens": estimate.get("estimatedTokens"),
            "estimatedTokensLow": estimate.get("estimatedTokensLow"),
            "estimatedTokensHigh": estimate.get("estimatedTokensHigh"),
            "estimatedYen": estimate.get("estimatedYen"),
            "estimatedYenLow": estimate.get("estimatedYenLow"),
            "estimatedYenHigh": estimate.get("estimatedYenHigh"),
        },
        "message": "取り込みを開始しました。完了後に要確認キューを確認してください。",
        "visionMode": mode,
    }


@router.post("/api/migration/pending/reclassify")
async def migration_pending_reclassify(
    request: Request,
    body: MigrationPendingReclassifyBody,
):
    """要確認の一部だけ Vision 等で再分類（提案更新のみ）。"""
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    mode = (body.vision_mode or "on").strip().lower()
    if mode not in ("off", "auto", "on"):
        mode = "on"
    from services.migration_ingest_service import reclassify_pending_items

    out = reclassify_pending_items(
        ctx.firm_id,
        body.item_ids,
        vision_mode=mode,
        source_path_prefix=body.source_path_prefix,
    )
    if not out.get("ok"):
        raise HTTPException(status_code=400, detail=out.get("reason"))
    _log_audit_event(
        request,
        "migration.pending_reclassify",
        "success",
        f"updated={out.get('updated')} tokens={out.get('tokensUsed')}",
    )
    return out


@router.get("/api/migration/jobs/{job_id}")
async def migration_job_detail(request: Request, job_id: str):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    from services.migration_ingest_service import get_job

    job = get_job(ctx.firm_id, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    return job


@router.get("/api/migration/pending")
async def migration_pending_list(
    request: Request,
    job_id: Optional[str] = Query(None),
):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    from services.migration_ingest_service import list_pending_items

    return {"items": list_pending_items(ctx.firm_id, job_id=job_id)}


@router.get("/api/migration/pending/{item_id}/file")
async def migration_pending_file(request: Request, item_id: str):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    from services.migration_ingest_service import get_pending_file_path

    path = get_pending_file_path(ctx.firm_id, item_id)
    if not path:
        raise HTTPException(status_code=404, detail="file not found")
    return FileResponse(path, media_type="application/pdf")


@router.post("/api/migration/pending/{item_id}/confirm")
async def migration_pending_confirm(
    request: Request,
    item_id: str,
    body: MigrationPendingConfirmBody,
):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    role = _require_permission(request, "document.upload")
    _require_client_access(
        request,
        role,
        body.client_id,
        required_permission="document.upload",
    )
    identity = resolve_identity(request)
    from services.migration_ingest_service import confirm_pending_item

    out = confirm_pending_item(
        ctx.firm_id,
        item_id,
        client_id=body.client_id,
        period_key=body.period_key,
        slot_id=body.slot_id,
        slot_label=body.slot_label,
        actor=identity.email or identity.stakeholder_id,
    )
    if not out.get("ok"):
        raise HTTPException(status_code=404, detail=out.get("reason"))
    _log_audit_event(
        request,
        "migration.pending_confirm",
        "success",
        f"item={item_id} client={body.client_id} slot={body.slot_id}",
    )
    return out


@router.post("/api/migration/pending/batch-confirm")
async def migration_pending_batch_confirm(
    request: Request,
    body: MigrationPendingBatchConfirmBody,
):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    role = _require_permission(request, "document.upload")
    _require_client_access(
        request,
        role,
        body.client_id,
        required_permission="document.upload",
    )
    identity = resolve_identity(request)
    from services.migration_ingest_service import batch_confirm_pending

    out = batch_confirm_pending(
        ctx.firm_id,
        body.item_ids,
        client_id=body.client_id,
        period_key=body.period_key,
        slot_id=body.slot_id,
        slot_label=body.slot_label,
        actor=identity.email or identity.stakeholder_id,
    )
    _log_audit_event(
        request,
        "migration.pending_batch_confirm",
        "success",
        f"count={out.get('confirmed')} client={body.client_id}",
    )
    return out


@router.delete("/api/migration/pending/{item_id}")
async def migration_pending_delete(request: Request, item_id: str):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    from services.migration_ingest_service import delete_pending_item

    if not delete_pending_item(ctx.firm_id, item_id):
        raise HTTPException(status_code=404, detail="not found")
    return {"deleted": True}


@router.post("/api/migration/wallet/grant")
async def migration_wallet_grant(request: Request, body: MigrationWalletGrantBody):
    role = _require_permission(request, "settings.manage")
    if role != "super_admin":
        raise HTTPException(status_code=403, detail="super_admin required")
    ctx = _auth_context(request)
    from services.migration_wallet import grant_migration_tokens

    wallet = grant_migration_tokens(ctx.firm_id, body.tokens)
    return wallet
