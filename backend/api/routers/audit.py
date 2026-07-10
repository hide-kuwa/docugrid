"""DocuGrid API — audit routes."""

from __future__ import annotations

from fastapi import APIRouter

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

def _require_legacy_files_api() -> None:
    if not legacy_files_enabled():
        raise HTTPException(
            status_code=410,
            detail="Legacy /files API is disabled. Upload PDFs via slot documents instead.",
        )


@router.get("/files", response_model=List[FileInfo])
async def list_files(request: Request):
    _require_legacy_files_api()
    role = _require_permission(request, "document.view")
    _require_client_scope(request, role)
    ctx = _auth_context(request)
    firm_dir = (STORAGE_DIR / ctx.firm_id).resolve()
    files: List[FileInfo] = []
    for file_path in sorted(firm_dir.glob("*.pdf")) if firm_dir.is_dir() else []:
        stat = file_path.stat()
        updated_at = datetime.fromtimestamp(stat.st_mtime).isoformat()
        encoded_name = urllib.parse.quote(file_path.name)
        files.append(
            FileInfo(
                id=file_path.stem,
                name=file_path.name,
                updated_at=updated_at,
                url=f"{str(request.base_url).rstrip('/')}/files/{encoded_name}",
            )
        )
    _log_audit_event(request, "files.list", "success", f"count={len(files)}")
    return files


@router.get("/files/{filename}")
async def get_file(filename: str, request: Request):
    _require_legacy_files_api()
    role = _require_permission(request, "document.view")
    _require_client_scope(request, role)
    ctx = _auth_context(request)
    firm_dir = (STORAGE_DIR / ctx.firm_id).resolve()
    decoded_name = urllib.parse.unquote(filename)
    file_path = (firm_dir / decoded_name).resolve()
    if not file_path.exists() or file_path.suffix.lower() != ".pdf":
        raise HTTPException(status_code=404, detail="File not found")
    if firm_dir not in file_path.parents:
        raise HTTPException(status_code=400, detail="Invalid file path")
    return FileResponse(file_path, media_type="application/pdf", filename=file_path.name)


@router.get("/api/audit-links/{version_id}", response_model=List[AuditLink])
async def list_audit_links(version_id: str, request: Request):
    # audit links are part of document review workflow
    # allow anyone who can view documents
    # role is required to avoid bypass from anonymous calls
    # this keeps backend and frontend permissions aligned
    role = _require_permission(request, "document.view")
    version_client_id = resolve_version_client_id(version_id)
    if not version_client_id:
        raise HTTPException(status_code=404, detail="Version not found")
    _require_client_access(request, role, version_client_id, required_permission="document.view")
    with _get_db_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                link_id, created_at,
                left_side, left_page, left_x, left_y, left_file_name,
                left_file_hash,
                right_side, right_page, right_x, right_y, right_file_name,
                right_file_hash,
                created_by, comment
            FROM audit_links
            WHERE version_id = ?
            ORDER BY created_at ASC, link_id ASC
            """,
            (version_id,),
        ).fetchall()

    result = [
        AuditLink(
            id=row["link_id"],
            createdAt=row["created_at"],
            left=AuditPoint(
                side=row["left_side"],
                page=row["left_page"],
                x=row["left_x"],
                y=row["left_y"],
                fileName=row["left_file_name"],
                fileHash=row["left_file_hash"],
            ),
            right=AuditPoint(
                side=row["right_side"],
                page=row["right_page"],
                x=row["right_x"],
                y=row["right_y"],
                fileName=row["right_file_name"],
                fileHash=row["right_file_hash"],
            ),
            createdBy=row["created_by"],
            comment=row["comment"],
        )
        for row in rows
    ]
    _log_audit_event(request, "audit_links.list", "success", f"version={version_id} count={len(result)}")
    return result


@router.post("/api/audit-links/{version_id}", response_model=List[AuditLink])
async def save_audit_links(version_id: str, links: List[AuditLink], request: Request):
    role = _require_permission(request, "audit.link")
    version_client_id = resolve_version_client_id(version_id)
    if not version_client_id:
        raise HTTPException(status_code=404, detail="Version not found")
    _require_client_access(request, role, version_client_id, required_permission="audit.link")
    with _get_db_connection() as conn:
        conn.execute("DELETE FROM audit_links WHERE version_id = ?", (version_id,))
        conn.executemany(
            """
            INSERT INTO audit_links (
                version_id, link_id, created_at,
                left_side, left_page, left_x, left_y, left_file_name, left_file_hash,
                right_side, right_page, right_x, right_y, right_file_name, right_file_hash,
                created_by, comment
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    version_id,
                    link.id,
                    link.createdAt,
                    link.left.side,
                    link.left.page,
                    link.left.x,
                    link.left.y,
                    link.left.fileName,
                    link.left.fileHash,
                    link.right.side,
                    link.right.page,
                    link.right.x,
                    link.right.y,
                    link.right.fileName,
                    link.right.fileHash,
                    link.createdBy,
                    link.comment,
                )
                for link in links
            ],
        )
    _log_audit_event(request, "audit_links.save", "success", f"version={version_id} count={len(links)}")
    return links


@router.post("/api/audit/auto-link")
async def audit_auto_link(
    body: AutoLinkRequest,
    request: Request,
    background_tasks: BackgroundTasks,
):
    """証憑 PDF 内の数値を自動検索し、監査メタデータ付きスタンプを刻み込む。"""
    role = _require_permission(request, "audit.link")
    _require_client_scope(request, role)
    identity = resolve_identity(request)

    logical = None
    if body.version_id:
        version_client_id = resolve_version_client_id(body.version_id)
        if not version_client_id:
            raise HTTPException(status_code=404, detail="Version not found")
        _require_client_access(request, role, version_client_id, required_permission="audit.link")
        version_row = get_version(body.version_id)
        if version_row:
            logical = get_logical_by_id(version_row.logical_document_id)

    ocr_job_id: str | None = None
    if body.trigger_ocr and body.version_id and logical:
        ctx = _auth_context(request)
        job = create_ocr_job(
            firm_id=ctx.firm_id,
            client_id=logical.client_id,
            document_version_id=body.version_id,
            period_key=logical.period_key,
            slot_id=logical.slot_id,
            slot_label=logical.title,
        )
        ocr_job_id = job["id"]
        background_tasks.add_task(run_ocr_job, ocr_job_id)

    result = run_auto_vouch(
        pdf_file_path=body.pdf_file_path,
        version_id=body.version_id,
        target_value=body.target_value,
        user_id=body.user_id,
        field_id=body.field_id,
        match_strategy=body.match_strategy,
        context_hint=body.context_hint,
        dry_run=body.dry_run,
        create_version=body.create_version,
        queue_on_ocr=body.queue_on_ocr or body.trigger_ocr,
        stakeholder_id=identity.stakeholder_id,
        email=identity.email,
        ocr_job_id=ocr_job_id,
    )

    if result.status == "success" and result.new_version_id and logical:
        new_ver = get_version(result.new_version_id)
        if new_ver:
            _update_slot_current_version(
                client_id=logical.client_id,
                period_key=logical.period_key,
                slot_id=logical.slot_id,
                version=new_ver,
                slot_label=logical.title,
                uploaded_by=identity.stakeholder_id or identity.email or body.user_id,
            )

    action = "audit.auto_link.preview" if body.dry_run else "audit.auto_link"
    if result.status == "success":
        _log_audit_event(
            request,
            action,
            "success",
            f"field={body.field_id} matches={len(result.matched_coordinates)} stamp={result.stamp_id}",
        )
    else:
        _log_audit_event(
            request,
            action,
            "error",
            f"field={body.field_id} msg={result.message[:200]}",
        )

    response_body = result.to_response()
    if ocr_job_id and not response_body.get("ocr_job_id"):
        response_body["ocr_job_id"] = ocr_job_id
    return JSONResponse(status_code=result.http_status(), content=response_body)


@router.get("/api/audit/auto-link/fields")
async def list_auto_vouch_field_defs(request: Request):
    role = _require_permission(request, "audit.link")
    _require_client_scope(request, role)
    fields = list_auto_vouch_fields()
    _log_audit_event(request, "audit.auto_link.fields", "success", f"count={len(fields)}")
    return {"fields": fields}


@router.get("/api/audit/auto-link/stamps", response_model=List[AutoVouchStampItem])
async def list_auto_vouch_stamps(
    request: Request,
    source_pdf_path: str | None = Query(None),
    version_id: str | None = Query(None),
    field_id: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    role = _require_permission(request, "audit.link")
    _require_client_scope(request, role)
    if version_id:
        version_client_id = resolve_version_client_id(version_id)
        if not version_client_id:
            raise HTTPException(status_code=404, detail="Version not found")
        _require_client_access(request, role, version_client_id, required_permission="audit.link")
    rows = list_vouch_stamps(
        source_pdf_path=source_pdf_path,
        version_id=version_id,
        field_id=field_id,
        limit=limit,
    )
    _log_audit_event(request, "audit.auto_link.list", "success", f"rows={len(rows)}")
    return rows


@router.get("/api/audit/auto-link/stamps/{stamp_id}", response_model=AutoVouchStampItem)
async def get_auto_vouch_stamp(stamp_id: str, request: Request):
    role = _require_permission(request, "audit.link")
    _require_client_scope(request, role)
    row = get_vouch_stamp(stamp_id)
    if not row:
        raise HTTPException(status_code=404, detail="Stamp not found")
    _log_audit_event(request, "audit.auto_link.get", "success", f"stamp={stamp_id}")
    return row


@router.get("/api/audit/auto-link/stamps/{stamp_id}/file")
async def get_auto_vouch_stamp_file(stamp_id: str, request: Request):
    """スタンプ済み PDF を返す（プレビュー・ダウンロード用）。"""
    role = _require_permission(request, "audit.link")
    _require_client_scope(request, role)
    row = get_vouch_stamp(stamp_id)
    if not row:
        raise HTTPException(status_code=404, detail="Stamp not found")
    try:
        file_path = resolve_stamp_output_path(stamp_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "audit.auto_link.file", "success", f"stamp={stamp_id}")
    return FileResponse(
        file_path,
        media_type="application/pdf",
        filename=file_path.name,
    )


@router.get("/api/audit/auto-link/suggest")
async def suggest_auto_vouch_from_metric(
    request: Request,
    metric_key: str = Query(..., min_length=1),
    value_yen: int | None = Query(None),
    value_num: float | None = Query(None),
):
    """client_metrics の metric_key から Auto-Vouch パラメータを提案する。"""
    role = _require_permission(request, "audit.link")
    _require_client_scope(request, role)
    suggestion = suggest_from_metric(
        metric_key=metric_key,
        value_yen=value_yen,
        value_num=value_num,
    )
    if not suggestion:
        raise HTTPException(status_code=404, detail="No mapping for metric_key or missing value")
    _log_audit_event(
        request,
        "audit.auto_link.suggest",
        "success",
        f"metric={metric_key} field={suggestion.get('field_id')}",
    )
    return suggestion


