"""DocuGrid API — slots routes."""

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

@router.post("/api/slots", response_model=SlotDocumentItem)
async def upsert_slot_document(
    request: Request,
    background_tasks: BackgroundTasks,
    client_id: str = Form(...),
    period_key: str = Form(...),
    slot_id: str = Form(...),
    slot_label: Optional[str] = Form(None),
    classify_metadata: Optional[str] = Form(None),
    async_classify: Optional[str] = Form(None),
    contains_individual_number: Optional[str] = Form(None),
    file: UploadFile = File(...),
):
    is_spi = str(contains_individual_number or "").strip().lower() in ("1", "true", "yes")
    if is_spi:
        role = _require_client_permission(request, "my_number.manage", client_id)
    else:
        role = _require_client_permission(request, "document.upload", client_id)
    content = await _read_upload_content(file)
    from services.upload_file_kinds import UploadKindError, is_pdf_name, validate_upload_bytes

    original_name = file.filename or "document.pdf"
    if is_spi and not is_pdf_name(original_name):
        raise HTTPException(status_code=400, detail="特定個人情報は PDF のみアップロードできます")
    try:
        page_count, _ext = validate_upload_bytes(content, original_name)
    except UploadKindError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    is_pdf_upload = is_pdf_name(original_name)
    sha = hashlib.sha256(content).hexdigest()
    identity = resolve_identity(request)
    uploaded_by = identity.stakeholder_id or identity.email or ""
    now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
    # 特定個人情報は顧問先ポータル共有しない
    auto_share_with_client = (not is_spi) and _is_client_portal_role(identity.role)
    client_shared_at = now if auto_share_with_client else None
    client_shared_by = uploaded_by if auto_share_with_client else None
    title = slot_label or f"slot-{slot_id}"
    spi_retention_until = None
    if is_spi:
        from services.spi_vault import default_retention_until

        spi_retention_until = default_retention_until()

    metadata_json: Optional[str] = None
    if classify_metadata and is_pdf_upload:
        try:
            meta_obj = json.loads(classify_metadata)
            meta_obj = enrich_classify_metadata(
                meta_obj,
                client_id=client_id,
                period_key=period_key,
                slot_id=slot_id,
            )
            metadata_json = json.dumps(meta_obj, ensure_ascii=False)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="classify_metadata must be valid JSON")

    logical = ensure_logical_document(
        client_id=client_id,
        period_key=period_key,
        slot_id=slot_id,
        title=title,
    )
    if logical.current_version_id:
        set_logical_status(logical.id, "processing")
    parent_id = logical.current_version_id
    version = create_document_version(
        logical_id=logical.id,
        content=content,
        original_name=original_name,
        content_sha256=sha,
        source="client_upload",
        bump="upload",
        parent_version_id=parent_id,
        created_by_stakeholder_id=identity.stakeholder_id,
        created_by_email=identity.email,
        page_count=page_count,
        metadata_json=metadata_json,
        contains_individual_number=is_spi,
    )

    client_firm = get_client_firm_id(client_id)
    _init_slot_documents_db()
    existing_drive_file_id: Optional[str] = None
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        prev_row = conn.execute(
            "SELECT id, google_drive_file_id FROM slot_documents WHERE client_id=? AND period_key=? AND slot_id=?",
            (client_id, period_key, slot_id),
        ).fetchone()
        if prev_row:
            existing_drive_file_id = prev_row["google_drive_file_id"]

    drive_cfg = _load_system_config(client_firm)
    # 特定個人情報は Drive ミラーしない（ガイドライン: 持ち出し・目的外提供の抑制）
    drive_file_id = None
    if not is_spi:
        drive_file_id = maybe_upload_slot_to_drive(
            firm_id=client_firm,
            drive_connected=drive_cfg.google_drive_connected,
            drive_root_folder_id=drive_cfg.drive_root_folder_id,
            client_id=client_id,
            period_key=period_key,
            slot_label=slot_label or title,
            content=content,
            filename=original_name,
            existing_file_id=existing_drive_file_id,
        )
    spi_flag = "1" if is_spi else "0"
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        prev = conn.execute(
            "SELECT id FROM slot_documents WHERE client_id=? AND period_key=? AND slot_id=?",
            (client_id, period_key, slot_id),
        ).fetchone()
        if prev:
            doc_id = prev["id"]
            conn.execute(
                """
                UPDATE slot_documents SET
                    slot_label=?, original_name=?, storage_key=?,
                    page_count=?, content_sha256=?, byte_size=?, uploaded_by=?, uploaded_at=?,
                    logical_document_id=?, current_version_id=?, firm_id=?, google_drive_file_id=?,
                    client_shared_at=?, client_shared_by=?,
                    contains_individual_number=?, spi_retention_until=?
                WHERE id=?
                """,
                (
                    slot_label,
                    original_name,
                    version.storage_key,
                    page_count,
                    sha,
                    len(content),
                    uploaded_by,
                    now,
                    logical.id,
                    version.id,
                    client_firm,
                    drive_file_id,
                    client_shared_at,
                    client_shared_by,
                    spi_flag,
                    spi_retention_until,
                    doc_id,
                ),
            )
        else:
            doc_id = uuid.uuid4().hex
            conn.execute(
                """
                INSERT INTO slot_documents
                    (id, client_id, period_key, slot_id, slot_label, original_name, storage_key,
                     page_count, content_sha256, byte_size, uploaded_by, uploaded_at,
                     logical_document_id, current_version_id, firm_id, google_drive_file_id,
                     client_shared_at, client_shared_by, contains_individual_number, spi_retention_until)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    doc_id,
                    client_id,
                    period_key,
                    slot_id,
                    slot_label,
                    original_name,
                    version.storage_key,
                    page_count,
                    sha,
                    len(content),
                    uploaded_by,
                    now,
                    logical.id,
                    version.id,
                    client_firm,
                    drive_file_id,
                    client_shared_at,
                    client_shared_by,
                    spi_flag,
                    spi_retention_until,
                ),
            )
        row = conn.execute("SELECT * FROM slot_documents WHERE id=?", (doc_id,)).fetchone()
    item = _enrich_slot_item(row)
    _log_audit_event(
        request,
        "slot.upload",
        "success",
        f"client={client_id} period={period_key} slot={slot_id} ver={version.version_label}"
        + (" spi=1" if is_spi else ""),
    )
    _append_review_event(
        client_id=client_id,
        period_key=period_key,
        slot_id=slot_id,
        event_type="upload",
        content_sha256=sha,
        version_label=version.version_label,
        status="draft",
        action_title=f"アップロード: {original_name}",
        actor_stakeholder_id=identity.stakeholder_id or None,
        actor_email=identity.email or None,
        actor_role=role,
        is_major=version.version_label == "v1.0.0",
        logical_document_id=logical.id,
        document_version_id=version.id,
    )
    if auto_share_with_client:
        _append_review_event(
            client_id=client_id,
            period_key=period_key,
            slot_id=slot_id,
            event_type="client_share",
            action_title="クライアントへ共有（自動）",
            reason=f"枠「{title}」· クライアント提出",
            actor_stakeholder_id=identity.stakeholder_id or None,
            actor_email=identity.email or None,
            actor_role=role,
            is_major=True,
            logical_document_id=logical.id,
            document_version_id=version.id,
            detail=f"doc_id={doc_id}; auto_share=1",
        )
    defer_normalize = (
        is_pdf_upload
        and (not is_spi)
        and async_classify is not None
        and async_classify.strip().lower() in (
            "1",
            "true",
            "yes",
            "on",
        )
    )
    if is_pdf_upload and not is_spi:
        # I2: index extractable PDF text immediately (OCR path also re-ingests later).
        from services.slot_rag_ingest import maybe_ingest_pdf_bytes_for_rag

        maybe_ingest_pdf_bytes_for_rag(
            firm_id=client_firm,
            client_id=client_id,
            document_version_id=version.id,
            content_sha256=sha,
            content=content,
            logical_document_id=logical.id,
            skip=False,
        )

    if is_spi or not is_pdf_upload:
        # 特定個人情報 / 非 PDF は AI 分類・OCR の対象外
        pass
    elif defer_normalize:
        job = create_ocr_job(
            firm_id=client_firm,
            client_id=client_id,
            document_version_id=version.id,
            period_key=period_key,
            slot_id=slot_id,
            slot_label=slot_label or title,
        )
        background_tasks.add_task(run_ocr_job, job["id"])
        item.ocr_job_id = job["id"]
        _log_audit_event(
            request,
            "ocr.job",
            "queued",
            f"job={job['id']} ver={version.id} source=slot.upload",
        )
    else:
        norm = ingest_from_slot_document(
            firm_id=client_firm,
            client_id=client_id,
            period_key=period_key,
            slot_id=slot_id,
            slot_label=slot_label or title,
            pdf_content=content,
            classify_metadata=json.loads(metadata_json) if metadata_json else None,
            updated_by=identity.email or uploaded_by,
            updated_by_id=identity.stakeholder_id,
        )
        if norm.applied or norm.metrics_applied:
            _log_audit_event(
                request,
                "ssot.normalize",
                "success",
                f"client={client_id} applied={len(norm.applied)} metrics={len(norm.metrics_applied)}",
            )
        item.normalize_result = ingest_result_for_response(norm)
        if norm.extraction_review:
            try:
                from services.ocr_job_service import update_version_metadata

                review = norm.extraction_review
                base_meta: dict = {}
                if metadata_json:
                    base_meta = json.loads(metadata_json)
                enriched = enrich_classify_metadata(
                    {
                        **base_meta,
                        "confidence": float(base_meta.get("confidence") or 1.0),
                        "engine": base_meta.get("engine") or "schema",
                        "extracted_profile": review.get("extracted_profile"),
                        "field_extractions": review.get("fields"),
                        "extraction_review_status": review.get("review_status"),
                        "schema_version": review.get("schema_version"),
                    },
                    client_id=client_id,
                    period_key=period_key,
                    slot_id=slot_id,
                )
                update_version_metadata(version.id, enriched)
                item.classify_metadata = enriched
            except Exception:
                pass
    return item


@router.get("/api/slots", response_model=List[SlotDocumentItem])
async def list_slot_documents(
    request: Request,
    client_id: str = Query(...),
    period_key: Optional[str] = Query(None),
    include_deleted: bool = Query(False),
):
    role = _require_client_permission(request, "document.view", client_id)
    if include_deleted:
        _require_permission(request, "document.purge")
    _init_slot_documents_db()
    access_clause = _slot_access_sql_filters(request, include_deleted=include_deleted)
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        if period_key:
            rows = conn.execute(
                f"SELECT * FROM slot_documents WHERE client_id=? AND period_key=?{access_clause} ORDER BY slot_id",
                (client_id, period_key),
            ).fetchall()
        else:
            rows = conn.execute(
                f"SELECT * FROM slot_documents WHERE client_id=?{access_clause} ORDER BY period_key, slot_id",
                (client_id,),
            ).fetchall()
    return [_enrich_slot_item(r) for r in rows]


@router.get("/api/slots/{doc_id}/file")
async def get_slot_document_file(request: Request, doc_id: str):
    role = _require_permission(request, "document.view")
    _init_slot_documents_db()
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM slot_documents WHERE id=?", (doc_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    is_spi = False
    if "contains_individual_number" in row.keys() and row["contains_individual_number"]:
        is_spi = str(row["contains_individual_number"]).strip().lower() in ("1", "true", "yes")
    from services.spi_vault import is_spi_storage_key, read_decrypted_by_storage_key

    if is_spi or is_spi_storage_key(row["storage_key"]):
        is_spi = True
        _require_permission(request, "my_number.view")
        _require_client_access(request, role, row["client_id"], required_permission="my_number.view")
    else:
        _require_client_access(request, role, row["client_id"], required_permission="document.view")
    _deny_soft_deleted_row_unless_purge(request, row)
    _deny_client_slot_unless_shared(request, row)
    logical_id = row["logical_document_id"] if "logical_document_id" in row.keys() else None
    _deny_if_logical_purged(logical_id)
    ctx = _auth_context(request)
    row_firm = row["firm_id"] if "firm_id" in row.keys() and row["firm_id"] else None
    if row_firm:
        authorize_firm_resource(ctx, str(row_firm))
    from services.upload_file_kinds import content_disposition_for, guess_media_type

    media_type = guess_media_type(row["original_name"], storage_key=row["storage_key"])
    disposition = content_disposition_for(row["original_name"])
    if is_spi:
        try:
            plain = read_decrypted_by_storage_key(row["storage_key"])
        except (FileNotFoundError, ValueError) as exc:
            raise HTTPException(status_code=404, detail="File missing") from exc
        _log_audit_event(
            request,
            "slot.download",
            "success",
            f"id={doc_id} client={row['client_id']} spi=1",
        )
        return Response(
            content=plain,
            media_type=media_type,
            headers={"Content-Disposition": disposition},
        )
    path = resolve_storage_path(row["storage_key"])
    if not path.exists():
        drive_id = row["google_drive_file_id"] if "google_drive_file_id" in row.keys() else None
        if drive_id:
            cfg = _load_system_config(ctx.firm_id)
            if cfg.google_drive_connected:
                remote = fetch_slot_from_drive(ctx.firm_id, drive_id)
                if remote:
                    _log_audit_event(
                        request,
                        "slot.download",
                        "success",
                        f"id={doc_id} client={row['client_id']} source=drive",
                    )
                    return Response(
                        content=remote,
                        media_type=media_type,
                        headers={"Content-Disposition": disposition},
                    )
        raise HTTPException(status_code=404, detail="File missing")
    _log_audit_event(request, "slot.download", "success", f"id={doc_id} client={row['client_id']}")
    from services.upload_file_kinds import is_pdf_name

    return FileResponse(
        str(path),
        media_type=media_type,
        filename=row["original_name"],
        content_disposition_type="inline" if is_pdf_name(row["original_name"]) else "attachment",
    )


@router.post("/api/slots/{doc_id}/convert-to-pdf", response_model=SlotDocumentItem)
async def convert_slot_document_to_pdf(request: Request, doc_id: str):
    """画像スロットを PDF 新版にして閲覧可能にする（元ファイルは版履歴に残る）。"""
    role = _require_permission(request, "document.upload")
    _init_slot_documents_db()
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM slot_documents WHERE id=?", (doc_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    _require_client_access(request, role, row["client_id"], required_permission="document.upload")
    _deny_soft_deleted_row_unless_purge(request, row)
    ctx = _auth_context(request)
    row_firm = row["firm_id"] if "firm_id" in row.keys() and row["firm_id"] else None
    if row_firm:
        authorize_firm_resource(ctx, str(row_firm))
    from services.upload_file_kinds import (
        guess_media_type,
        is_convertible_image_name,
        is_pdf_name,
    )

    if is_pdf_name(row["original_name"]):
        raise HTTPException(status_code=400, detail="Already a PDF")
    if not is_convertible_image_name(row["original_name"]):
        raise HTTPException(status_code=400, detail="Only images can be converted to PDF")
    if row["contains_individual_number"] if "contains_individual_number" in row.keys() else None:
        if str(row["contains_individual_number"]).strip().lower() in ("1", "true", "yes"):
            raise HTTPException(status_code=400, detail="SPI documents cannot use this convert path")

    path = resolve_storage_path(row["storage_key"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="File missing")
    content = path.read_bytes()
    mime = guess_media_type(row["original_name"], storage_key=row["storage_key"])
    from services.capture_routing import capture_bytes_as_pdf

    try:
        pdf_bytes, pdf_name = capture_bytes_as_pdf(content, mime, row["original_name"])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    page_count = _validate_pdf_bytes(pdf_bytes)
    sha = hashlib.sha256(pdf_bytes).hexdigest()
    identity = resolve_identity(request)
    uploaded_by = identity.stakeholder_id or identity.email or ""
    now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
    logical_id = row["logical_document_id"] if "logical_document_id" in row.keys() else None
    if not logical_id:
        raise HTTPException(status_code=400, detail="Missing logical document")
    parent_id = row["current_version_id"] if "current_version_id" in row.keys() else None
    set_logical_status(logical_id, "processing")
    version = create_document_version(
        logical_id=logical_id,
        content=pdf_bytes,
        original_name=pdf_name,
        content_sha256=sha,
        source="image_convert",
        bump="upload",
        parent_version_id=parent_id,
        created_by_stakeholder_id=identity.stakeholder_id,
        created_by_email=identity.email,
        page_count=page_count,
    )
    client_firm = get_client_firm_id(row["client_id"])
    drive_cfg = _load_system_config(client_firm)
    existing_drive = row["google_drive_file_id"] if "google_drive_file_id" in row.keys() else None
    drive_file_id = maybe_upload_slot_to_drive(
        firm_id=client_firm,
        drive_connected=drive_cfg.google_drive_connected,
        drive_root_folder_id=drive_cfg.drive_root_folder_id,
        client_id=row["client_id"],
        period_key=row["period_key"],
        slot_label=row["slot_label"] or row["slot_id"],
        content=pdf_bytes,
        filename=pdf_name,
        existing_file_id=existing_drive,
    )
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        conn.execute(
            """
            UPDATE slot_documents SET
                original_name=?, storage_key=?,
                page_count=?, content_sha256=?, byte_size=?, uploaded_by=?, uploaded_at=?,
                current_version_id=?, google_drive_file_id=COALESCE(?, google_drive_file_id)
            WHERE id=?
            """,
            (
                pdf_name,
                version.storage_key,
                page_count,
                sha,
                len(pdf_bytes),
                uploaded_by,
                now,
                version.id,
                drive_file_id,
                doc_id,
            ),
        )
        updated = conn.execute("SELECT * FROM slot_documents WHERE id=?", (doc_id,)).fetchone()
    _log_audit_event(
        request,
        "slot.convert_to_pdf",
        "success",
        f"id={doc_id} client={row['client_id']} ver={version.version_label}",
    )
    _append_review_event(
        client_id=row["client_id"],
        period_key=row["period_key"],
        slot_id=row["slot_id"],
        event_type="upload",
        content_sha256=sha,
        version_label=version.version_label,
        status="draft",
        action_title=f"画像を PDF 化: {pdf_name}",
        actor_stakeholder_id=identity.stakeholder_id or None,
        actor_email=identity.email or None,
        actor_role=role,
        is_major=False,
        logical_document_id=logical_id,
        document_version_id=version.id,
    )
    from services.slot_rag_ingest import maybe_ingest_pdf_bytes_for_rag

    maybe_ingest_pdf_bytes_for_rag(
        firm_id=client_firm,
        client_id=row["client_id"],
        document_version_id=version.id,
        content_sha256=sha,
        content=pdf_bytes,
        logical_document_id=logical_id,
    )
    return _enrich_slot_item(updated)


@router.delete("/api/slots/{doc_id}")
async def delete_slot_document(request: Request, doc_id: str, mode: str = "delete"):
    if mode == "purge":
        slot_perm = "document.purge"
    elif mode == "detach":
        slot_perm = "document.upload"
    else:
        slot_perm = "document.upload"
    role = _require_permission(request, slot_perm)
    _init_slot_documents_db()
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM slot_documents WHERE id=?", (doc_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        _require_client_access(request, role, row["client_id"], required_permission=slot_perm)
        if mode == "detach":
            if row["deleted_at"] if "deleted_at" in row.keys() else None:
                raise HTTPException(status_code=409, detail="Cannot detach deleted document")
            unassigned_id = f"unassigned_{doc_id}"
            conn.execute(
                """
                UPDATE slot_documents
                SET slot_id=?, slot_label=COALESCE(slot_label, original_name)
                WHERE id=?
                """,
                (unassigned_id, doc_id),
            )
            _log_audit_event(
                request,
                "slot.detach",
                "success",
                f"doc_id={doc_id} slot={unassigned_id} period={row['period_key']}",
            )
            return {"ok": True, "mode": "detach", "slot_id": unassigned_id}

        identity = resolve_identity(request)
        logical_id = row["logical_document_id"] if "logical_document_id" in row.keys() else None
        origin_slot_id = (
            row["deleted_from_slot_id"]
            if row["deleted_from_slot_id"]
            else row["slot_id"]
        )
        slot_label = (
            (row["deleted_from_slot_label"] or row["slot_label"] or "").strip()
            if ("deleted_from_slot_label" in row.keys() and row["deleted_from_slot_label"])
            or ("slot_label" in row.keys() and row["slot_label"])
            else str(origin_slot_id)
        )

        if mode == "purge":
            _append_review_event(
                client_id=row["client_id"],
                period_key=row["period_key"],
                slot_id=origin_slot_id,
                event_type="document_delete",
                action_title="資料を完全削除",
                reason=f"枠「{slot_label}」",
                actor_stakeholder_id=identity.stakeholder_id,
                actor_email=identity.email,
                actor_role=identity.role,
                is_major=True,
                logical_document_id=logical_id,
                detail=f"slot_id={origin_slot_id}; period={row['period_key']}",
            )
            if logical_id:
                set_logical_status(logical_id, "deleted")
                redact_logical_document_filenames(logical_id)
            if "/versions/" not in str(row["storage_key"]):
                path = resolve_storage_path(row["storage_key"])
                try:
                    if path.exists():
                        path.unlink()
                except OSError:
                    pass
            conn.execute("DELETE FROM slot_documents WHERE id=?", (doc_id,))
            _log_audit_event(
                request,
                "slot.purge",
                "success",
                f"doc_id={doc_id} slot={origin_slot_id} period={row['period_key']}",
            )
            return {"ok": True, "mode": "purge"}

        # Soft delete (default) — 復元可能
        if row["deleted_at"] if "deleted_at" in row.keys() else None:
            raise HTTPException(status_code=409, detail="Already deleted")
        now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
        deleted_slot_id = f"deleted_{doc_id}"
        conn.execute(
            """
            UPDATE slot_documents
            SET slot_id=?,
                deleted_at=?,
                deleted_from_slot_id=?,
                deleted_from_slot_label=COALESCE(slot_label, original_name),
                client_shared_at=NULL,
                client_shared_by=NULL
            WHERE id=?
            """,
            (deleted_slot_id, now, row["slot_id"], doc_id),
        )
        if logical_id:
            set_logical_status(logical_id, "soft_deleted")
        _append_review_event(
            client_id=row["client_id"],
            period_key=row["period_key"],
            slot_id=row["slot_id"],
            event_type="document_soft_delete",
            action_title="資料を削除（復元可能）",
            reason=f"枠「{slot_label}」",
            actor_stakeholder_id=identity.stakeholder_id,
            actor_email=identity.email,
            actor_role=identity.role,
            is_major=True,
            logical_document_id=logical_id,
            detail=f"slot_id={row['slot_id']}; period={row['period_key']}; doc_id={doc_id}",
        )
    _log_audit_event(
        request,
        "slot.soft_delete",
        "success",
        f"doc_id={doc_id} slot={row['slot_id']} period={row['period_key']}",
    )
    return {"ok": True, "mode": "delete"}


@router.post("/api/slots/{doc_id}/restore")
async def restore_slot_document(request: Request, doc_id: str):
    role = _require_permission(request, "document.purge")
    _init_slot_documents_db()
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM slot_documents WHERE id=?", (doc_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        _require_client_access(request, role, row["client_id"], required_permission="document.purge")
        deleted_at = row["deleted_at"] if "deleted_at" in row.keys() else None
        if not deleted_at:
            raise HTTPException(status_code=409, detail="Document is not deleted")
        restore_slot_id = row["deleted_from_slot_id"] if "deleted_from_slot_id" in row.keys() else None
        if not restore_slot_id:
            raise HTTPException(status_code=409, detail="Restore origin missing")
        logical_id = row["logical_document_id"] if "logical_document_id" in row.keys() else None
        if logical_id and not is_logical_soft_deleted(logical_id):
            raise HTTPException(status_code=409, detail="Document cannot be restored")
        conflict = conn.execute(
            """
            SELECT id FROM slot_documents
            WHERE client_id=? AND period_key=? AND slot_id=? AND id<>?
              AND (deleted_at IS NULL OR deleted_at = '')
            """,
            (row["client_id"], row["period_key"], restore_slot_id, doc_id),
        ).fetchone()
        if conflict:
            raise HTTPException(status_code=409, detail="Slot already occupied")
        restore_label = row["deleted_from_slot_label"] if "deleted_from_slot_label" in row.keys() else None
        conn.execute(
            """
            UPDATE slot_documents
            SET slot_id=?,
                slot_label=COALESCE(?, slot_label),
                deleted_at=NULL,
                deleted_from_slot_id=NULL,
                deleted_from_slot_label=NULL
            WHERE id=?
            """,
            (restore_slot_id, restore_label, doc_id),
        )
        updated = conn.execute("SELECT * FROM slot_documents WHERE id=?", (doc_id,)).fetchone()
    if logical_id:
        try:
            restore_logical_document(logical_id)
        except ValueError as exc:
            if str(exc) == "not_soft_deleted":
                raise HTTPException(status_code=409, detail="Document cannot be restored")
            raise
    identity = resolve_identity(request)
    slot_label = (restore_label or restore_slot_id or "").strip() or restore_slot_id
    _append_review_event(
        client_id=row["client_id"],
        period_key=row["period_key"],
        slot_id=restore_slot_id,
        event_type="document_restore",
        action_title="資料を復元",
        reason=f"枠「{slot_label}」",
        actor_stakeholder_id=identity.stakeholder_id,
        actor_email=identity.email,
        actor_role=identity.role,
        is_major=True,
        logical_document_id=logical_id,
        detail=f"slot_id={restore_slot_id}; period={row['period_key']}; doc_id={doc_id}",
    )
    _log_audit_event(
        request,
        "slot.restore",
        "success",
        f"doc_id={doc_id} slot={restore_slot_id} period={row['period_key']}",
    )
    return {"ok": True, "item": _enrich_slot_item(updated)}


@router.post("/api/slots/{doc_id}/share-with-client")
async def share_slot_with_client(request: Request, doc_id: str):
    """事務所アップロード資料をクライアントポータルへ明示的に公開する。"""
    role = _require_permission(request, "document.upload")
    identity = resolve_identity(request)
    if _is_client_portal_role(identity.role):
        raise HTTPException(status_code=403, detail="Firm users only")
    _init_slot_documents_db()
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM slot_documents WHERE id=?", (doc_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        _require_client_access(request, role, row["client_id"], required_permission="document.upload")
        if "contains_individual_number" in row.keys() and str(
            row["contains_individual_number"] or ""
        ).strip().lower() in ("1", "true", "yes"):
            raise HTTPException(
                status_code=403,
                detail="Specific personal information documents cannot be shared to the client portal",
            )
        if row["deleted_at"] if "deleted_at" in row.keys() else None:
            raise HTTPException(status_code=409, detail="Cannot share deleted document")
        if row["client_shared_at"] if "client_shared_at" in row.keys() else None:
            return {"ok": True, "already_shared": True, "item": _enrich_slot_item(row)}
        now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
        shared_by = identity.stakeholder_id or identity.email or ""
        conn.execute(
            "UPDATE slot_documents SET client_shared_at=?, client_shared_by=? WHERE id=?",
            (now, shared_by, doc_id),
        )
        updated = conn.execute("SELECT * FROM slot_documents WHERE id=?", (doc_id,)).fetchone()
    slot_label = (
        (row["slot_label"] or "").strip()
        if "slot_label" in row.keys() and row["slot_label"]
        else str(row["slot_id"])
    )
    _append_review_event(
        client_id=row["client_id"],
        period_key=row["period_key"],
        slot_id=row["slot_id"],
        event_type="client_share",
        action_title="クライアントへ共有",
        reason=f"枠「{slot_label}」",
        actor_stakeholder_id=identity.stakeholder_id,
        actor_email=identity.email,
        actor_role=identity.role,
        is_major=True,
        logical_document_id=row["logical_document_id"] if "logical_document_id" in row.keys() else None,
        detail=f"doc_id={doc_id}; period={row['period_key']}",
    )
    _log_audit_event(request, "slot.client_share", "success", f"doc_id={doc_id} client={row['client_id']}")
    return {"ok": True, "item": _enrich_slot_item(updated)}


@router.post("/api/slots/{doc_id}/unshare-with-client")
async def unshare_slot_with_client(request: Request, doc_id: str):
    """クライアントポータルへの共有を解除する（事務所のみ）。"""
    role = _require_permission(request, "document.upload")
    identity = resolve_identity(request)
    if _is_client_portal_role(identity.role):
        raise HTTPException(status_code=403, detail="Firm users only")
    _init_slot_documents_db()
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM slot_documents WHERE id=?", (doc_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        _require_client_access(request, role, row["client_id"], required_permission="document.upload")
        if row["deleted_at"] if "deleted_at" in row.keys() else None:
            raise HTTPException(status_code=409, detail="Cannot unshare deleted document")
        if not (row["client_shared_at"] if "client_shared_at" in row.keys() else None):
            return {"ok": True, "already_unshared": True, "item": _enrich_slot_item(row)}
        conn.execute(
            "UPDATE slot_documents SET client_shared_at=NULL, client_shared_by=NULL WHERE id=?",
            (doc_id,),
        )
        updated = conn.execute("SELECT * FROM slot_documents WHERE id=?", (doc_id,)).fetchone()
    slot_label = (
        (row["slot_label"] or "").strip()
        if "slot_label" in row.keys() and row["slot_label"]
        else str(row["slot_id"])
    )
    _append_review_event(
        client_id=row["client_id"],
        period_key=row["period_key"],
        slot_id=row["slot_id"],
        event_type="client_unshare",
        action_title="クライアント共有を解除",
        reason=f"枠「{slot_label}」",
        actor_stakeholder_id=identity.stakeholder_id,
        actor_email=identity.email,
        actor_role=identity.role,
        is_major=True,
        logical_document_id=row["logical_document_id"] if "logical_document_id" in row.keys() else None,
        detail=f"doc_id={doc_id}; period={row['period_key']}",
    )
    _log_audit_event(request, "slot.client_unshare", "success", f"doc_id={doc_id} client={row['client_id']}")
    return {"ok": True, "item": _enrich_slot_item(updated)}


@router.patch("/api/slots/{doc_id}")
async def move_slot_document(request: Request, doc_id: str):
    """資料を別枠／別期／別顧問先へ移す。

    body:
      - slot_id (任意・省略時は現状維持)
      - slot_label (任意)
      - period_key (任意)
      - client_id (任意・行き先顧問先)
    """
    role = _require_permission(request, "document.upload")
    body = await request.json()
    target_slot_id = str(body.get("slot_id") or "").strip() or None
    slot_label = str(body.get("slot_label") or "").strip() or None
    target_period_key = str(body.get("period_key") or "").strip() or None
    target_client_id = str(body.get("client_id") or "").strip() or None

    _init_slot_documents_db()
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM slot_documents WHERE id=?", (doc_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Not found")

        src_client = row["client_id"]
        src_period = row["period_key"]
        src_slot = row["slot_id"]
        _require_client_access(request, role, src_client, required_permission="document.upload")

        dst_client = target_client_id or src_client
        dst_period = target_period_key or src_period
        dst_slot = target_slot_id or src_slot
        if not dst_slot:
            raise HTTPException(status_code=400, detail="slot_id required")

        if dst_client != src_client:
            _require_client_access(
                request, role, dst_client, required_permission="document.upload"
            )
            src_firm = get_client_firm_id(src_client)
            dst_firm = get_client_firm_id(dst_client)
            if src_firm and dst_firm and src_firm != dst_firm:
                raise HTTPException(status_code=403, detail="Cross-firm move not allowed")

        if (
            dst_client == src_client
            and dst_period == src_period
            and dst_slot == src_slot
            and slot_label is None
        ):
            return _enrich_slot_item(row)

        conflict = conn.execute(
            """
            SELECT id FROM slot_documents
            WHERE client_id=? AND period_key=? AND slot_id=? AND id<>?
            """,
            (dst_client, dst_period, dst_slot, doc_id),
        ).fetchone()
        if conflict:
            raise HTTPException(status_code=409, detail="Slot already occupied")

        logical_id = (
            row["logical_document_id"] if "logical_document_id" in row.keys() else None
        )
        dst_firm = get_client_firm_id(dst_client)
        new_label = slot_label if slot_label is not None else row["slot_label"]

        if logical_id:
            try:
                from services.document_version_service import relocate_logical_document

                relocate_logical_document(
                    logical_id=logical_id,
                    client_id=dst_client,
                    period_key=dst_period,
                    slot_id=dst_slot,
                    title=new_label,
                )
            except ValueError as exc:
                code = str(exc)
                if code == "target_occupied":
                    raise HTTPException(
                        status_code=409, detail="Destination logical document occupied"
                    )
                if code == "logical_not_found":
                    logical_id = None
                else:
                    raise

        # OCR 下書きも座標を追従（失敗しても移動自体は続行）
        try:
            from services.extraction_draft_service import (
                get_extraction_draft,
                save_extraction_draft,
                clear_extraction_draft,
            )

            firm_for_draft = (
                row["firm_id"]
                if "firm_id" in row.keys() and row["firm_id"]
                else get_client_firm_id(src_client)
            )
            if firm_for_draft and (
                dst_client != src_client
                or dst_period != src_period
                or dst_slot != src_slot
            ):
                draft = get_extraction_draft(
                    firm_id=firm_for_draft,
                    client_id=src_client,
                    period_key=src_period,
                    slot_id=src_slot,
                )
                if draft and draft.get("edited_ids"):
                    save_extraction_draft(
                        firm_id=dst_firm or firm_for_draft,
                        client_id=dst_client,
                        period_key=dst_period,
                        slot_id=dst_slot,
                        fields=draft.get("fields") or {},
                        edited_ids=draft.get("edited_ids") or [],
                    )
                    clear_extraction_draft(
                        firm_id=firm_for_draft,
                        client_id=src_client,
                        period_key=src_period,
                        slot_id=src_slot,
                    )
        except Exception:
            pass

        conn.execute(
            """
            UPDATE slot_documents
            SET client_id=?, period_key=?, slot_id=?,
                slot_label=COALESCE(?, slot_label),
                firm_id=COALESCE(?, firm_id)
            WHERE id=?
            """,
            (dst_client, dst_period, dst_slot, slot_label, dst_firm, doc_id),
        )
        updated = conn.execute("SELECT * FROM slot_documents WHERE id=?", (doc_id,)).fetchone()

    _log_audit_event(
        request,
        "slot.move",
        "success",
        f"id={doc_id} {src_client}/{src_period}/{src_slot} -> {dst_client}/{dst_period}/{dst_slot}",
    )
    return _enrich_slot_item(updated)


def _update_slot_current_version(
    *,
    client_id: str,
    period_key: str,
    slot_id: str,
    version,
    slot_label: Optional[str],
    uploaded_by: str,
) -> None:
    """slot_documents の current ポインタを最新版に更新する。"""
    client_firm = get_client_firm_id(client_id)
    _init_slot_documents_db()
    now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        prev = conn.execute(
            "SELECT id FROM slot_documents WHERE client_id=? AND period_key=? AND slot_id=?",
            (client_id, period_key, slot_id),
        ).fetchone()
        if prev:
            conn.execute(
                """
                UPDATE slot_documents SET
                    slot_label=COALESCE(?, slot_label), original_name=?, storage_key=?,
                    page_count=?, content_sha256=?, byte_size=?, uploaded_by=?, uploaded_at=?,
                    logical_document_id=?, current_version_id=?, firm_id=?
                WHERE id=?
                """,
                (
                    slot_label,
                    version.original_name,
                    version.storage_key,
                    version.page_count,
                    version.content_sha256,
                    version.byte_size,
                    uploaded_by,
                    now,
                    version.logical_document_id,
                    version.id,
                    client_firm,
                    prev["id"],
                ),
            )
        else:
            conn.execute(
                """
                INSERT INTO slot_documents
                    (id, client_id, period_key, slot_id, slot_label, original_name, storage_key,
                     page_count, content_sha256, byte_size, uploaded_by, uploaded_at,
                     logical_document_id, current_version_id, firm_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    uuid.uuid4().hex,
                    client_id,
                    period_key,
                    slot_id,
                    slot_label,
                    version.original_name,
                    version.storage_key,
                    version.page_count,
                    version.content_sha256,
                    version.byte_size,
                    uploaded_by,
                    now,
                    version.logical_document_id,
                    version.id,
                    client_firm,
                ),
            )


@router.get("/api/logical-documents/versions", response_model=List[DocumentVersionItem])
async def list_logical_document_versions(
    request: Request,
    client_id: str = Query(...),
    period_key: str = Query(...),
    slot_id: str = Query(...),
):
    role = _require_client_permission(request, "document.view", client_id)
    logical = get_logical_by_slot(client_id, period_key, slot_id)
    if not logical or logical.status == "deleted":
        return []
    return [_version_to_item(v) for v in list_versions(logical.id)]


@router.get("/api/document-versions/{version_id}/file")
async def get_document_version_file(request: Request, version_id: str):
    role = _require_permission(request, "document.view")
    version = get_version(version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    init_document_versions_db()
    from services.document_version_service import VERSIONS_DB_PATH
    from services.spi_vault import is_spi_storage_key, read_decrypted_by_storage_key

    with sqlite3.connect(VERSIONS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        lrow = conn.execute(
            "SELECT client_id FROM logical_documents WHERE id=?",
            (version.logical_document_id,),
        ).fetchone()
    if not lrow:
        raise HTTPException(status_code=404, detail="Logical document not found")
    if is_spi_storage_key(version.storage_key):
        _require_permission(request, "my_number.view")
        _require_client_access(request, role, lrow["client_id"], required_permission="my_number.view")
    else:
        _require_client_access(request, role, lrow["client_id"], required_permission="document.view")
    _deny_if_logical_purged(version.logical_document_id)
    vfirm = resolve_version_firm_id(version_id)
    if vfirm:
        authorize_firm_resource(_auth_context(request), vfirm)
    from services.upload_file_kinds import content_disposition_for, guess_media_type

    media_type = guess_media_type(version.original_name, storage_key=version.storage_key)
    disposition = content_disposition_for(version.original_name)
    if is_spi_storage_key(version.storage_key):
        try:
            plain = read_decrypted_by_storage_key(version.storage_key)
        except (FileNotFoundError, ValueError) as exc:
            raise HTTPException(status_code=404, detail="File missing") from exc
        _log_audit_event(request, "version.download", "success", f"version={version_id} spi=1")
        return Response(
            content=plain,
            media_type=media_type,
            headers={"Content-Disposition": disposition},
        )
    path = version_file_path(version)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File missing")
    _log_audit_event(request, "version.download", "success", f"version={version_id}")
    from services.upload_file_kinds import is_pdf_name as _is_pdf_name

    return FileResponse(
        str(path),
        media_type=media_type,
        filename=version.original_name,
        content_disposition_type="inline" if _is_pdf_name(version.original_name) else "attachment",
    )


@router.delete("/api/document-versions/{version_id}")
async def delete_document_version_endpoint(request: Request, version_id: str):
    role = _require_permission(request, "document.upload")
    version = get_version(version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    logical = get_logical_by_id(version.logical_document_id)
    if not logical:
        raise HTTPException(status_code=404, detail="Logical document not found")
    _require_client_access(request, role, logical.client_id, required_permission="document.upload")
    _deny_if_logical_deleted(logical.id)
    ctx = _auth_context(request)
    authorize_firm_resource(ctx, logical.firm_id)

    try:
        logical_after, deleted, promoted = delete_document_version(version_id)
    except ValueError as exc:
        code = str(exc)
        if code == "logical_deleted":
            raise HTTPException(status_code=410, detail="Document deleted")
        raise HTTPException(status_code=404, detail="Version not found")

    _init_audit_links_db()
    with sqlite3.connect(AUDIT_LINKS_DB_PATH) as conn:
        conn.execute("DELETE FROM audit_links WHERE version_id=?", (version_id,))

    _init_slot_documents_db()
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        slot_row = conn.execute(
            """
            SELECT id FROM slot_documents
            WHERE client_id=? AND period_key=? AND slot_id=? AND current_version_id=?
            """,
            (logical.client_id, logical.period_key, logical.slot_id, version_id),
        ).fetchone()
        if slot_row:
            if promoted:
                conn.execute(
                    """
                    UPDATE slot_documents SET
                        storage_key=?, page_count=?, content_sha256=?, byte_size=?,
                        current_version_id=?, uploaded_at=?
                    WHERE id=?
                    """,
                    (
                        promoted.storage_key,
                        promoted.page_count,
                        promoted.content_sha256,
                        promoted.byte_size,
                        promoted.id,
                        datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
                        slot_row["id"],
                    ),
                )
            else:
                conn.execute("DELETE FROM slot_documents WHERE id=?", (slot_row["id"],))

    identity = resolve_identity(request)
    slot_label = logical.title or logical.slot_id
    _append_review_event(
        client_id=logical.client_id,
        period_key=logical.period_key,
        slot_id=logical.slot_id,
        event_type="version_delete",
        version_label=deleted.version_label,
        action_title=f"版 {deleted.version_label} を削除",
        reason=f"枠「{slot_label}」",
        actor_stakeholder_id=identity.stakeholder_id,
        actor_email=identity.email,
        actor_role=identity.role,
        is_major=True,
        logical_document_id=logical.id,
        detail=f"version_label={deleted.version_label}; slot_id={logical.slot_id}; period={logical.period_key}",
    )
    _log_audit_event(
        request,
        "version.delete",
        "success",
        f"version_label={deleted.version_label} slot={logical.slot_id} period={logical.period_key}",
    )
    return {
        "ok": True,
        "deleted_version_id": version_id,
        "deleted_version_label": deleted.version_label,
        "current_version_id": logical_after.current_version_id,
        "remaining_versions": count_versions(logical.id),
    }


@router.post("/api/document-versions", response_model=DocumentVersionItem)
async def post_document_version(
    request: Request,
    client_id: str = Form(...),
    period_key: str = Form(...),
    slot_id: str = Form(...),
    slot_label: Optional[str] = Form(None),
    bump: str = Form("minor"),
    file: UploadFile = File(...),
):
    """編集・監査・承認時の immutable 新版スナップショットを作成する。"""
    role = _require_client_permission(request, "document.upload", client_id)
    if bump not in ("minor", "major", "audit_start"):
        raise HTTPException(status_code=400, detail="bump must be minor, major, or audit_start")
    content = await _read_upload_content(file)
    page_count = _validate_pdf_bytes(content)
    sha = hashlib.sha256(content).hexdigest()
    identity = resolve_identity(request)
    uploaded_by = identity.stakeholder_id or identity.email or ""
    title = slot_label or f"slot-{slot_id}"
    logical = ensure_logical_document(
        client_id=client_id,
        period_key=period_key,
        slot_id=slot_id,
        title=title,
    )
    source_map = {
        "minor": "annotation_export",
        "major": "firm_upload",
        "audit_start": "firm_upload",
    }
    version = create_document_version(
        logical_id=logical.id,
        content=content,
        original_name=file.filename or "document.pdf",
        content_sha256=sha,
        source=source_map.get(bump, "annotation_export"),
        bump=bump,  # type: ignore[arg-type]
        parent_version_id=logical.current_version_id,
        created_by_stakeholder_id=identity.stakeholder_id,
        created_by_email=identity.email,
        page_count=page_count,
    )
    if bump == "major":
        mark_approved(logical.id, version.id)
    _update_slot_current_version(
        client_id=client_id,
        period_key=period_key,
        slot_id=slot_id,
        version=version,
        slot_label=slot_label,
        uploaded_by=uploaded_by,
    )
    _log_audit_event(
        request,
        "version.create",
        "success",
        f"client={client_id} slot={slot_id} ver={version.version_label} bump={bump}",
    )
    return _version_to_item(version)


