"""DocuGrid API — capture routes."""

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

# --- キャプチャギャラリー（G1）---
@router.get("/api/capture/items")
async def list_capture_gallery(
    request: Request,
    client_id: str = Query(...),
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
):
    role = _require_client_permission(request, "document.view", client_id)
    ctx = _auth_context(request)
    items = list_capture_items(ctx.firm_id, client_id, status=status, category=category)
    return items


@router.post("/api/capture/items")
async def upload_capture_item(
    request: Request,
    file: UploadFile = File(...),
    client_id: str = Form(...),
    category: str = Form("general"),
    period_key: Optional[str] = Form(None),
    slot_id: Optional[str] = Form(None),
):
    role = _require_client_permission(request, "document.upload", client_id)
    content = await _read_upload_content(file)
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    ctx = _auth_context(request)
    try:
        item = create_capture_item(
            firm_id=ctx.firm_id,
            client_id=client_id,
            file_name=file.filename or "capture.jpg",
            content=content,
            content_type=file.content_type,
            category=category,
            period_key=period_key,
            slot_id=slot_id,
            created_by=ctx.email,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    # OCR・監査はアップロード時には走らせない（手動解析 or 数字入力トリガー）
    item = get_capture_item(ctx.firm_id, item["id"]) or item
    _log_audit_event(request, "capture.upload", "success", f"id={item['id']}")
    return item


@router.get("/api/capture/items/{item_id}/file")
async def get_capture_item_file(request: Request, item_id: str):
    role = _require_permission(request, "document.view")
    ctx = _auth_context(request)
    from services.capture_service import get_capture_item

    item = get_capture_item(ctx.firm_id, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Capture item not found")
    _require_client_access(request, role, item["client_id"], required_permission="document.view")
    path = get_capture_file_path(ctx.firm_id, item_id)
    if not path:
        raise HTTPException(status_code=404, detail="File not found")
    mime = get_capture_mime(ctx.firm_id, item_id) or "application/octet-stream"
    _log_audit_event(request, "capture.file", "success", f"id={item_id}")
    return FileResponse(path, media_type=mime, filename=item["file_name"])


@router.patch("/api/capture/items/{item_id}")
async def patch_capture_item(request: Request, item_id: str, body: CaptureItemPatchBody):
    role = _require_permission(request, "document.upload")
    ctx = _auth_context(request)
    from services.capture_service import get_capture_item

    existing = get_capture_item(ctx.firm_id, item_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Capture item not found")
    _require_client_access(request, role, existing["client_id"], required_permission="document.upload")
    try:
        updated = update_capture_item(
            ctx.firm_id,
            item_id,
            status=body.status,
            title=body.title,
            audit_message=body.audit_message,
            pinned=body.pinned,
            category=body.category,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "capture.patch", "success", f"id={item_id}")
    return updated


@router.post("/api/capture/items/{item_id}/analyze")
async def analyze_capture_gallery_item(
    request: Request,
    item_id: str,
    body: CaptureAnalyzeBody | None = None,
):
    """キャプチャ資料の OCR・監査を再実行。手入力ヒントで OCR なしでも試算可能。"""
    role = _require_permission(request, "document.upload")
    ctx = _auth_context(request)
    from services.capture_service import get_capture_item

    existing = get_capture_item(ctx.firm_id, item_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Capture item not found")
    _require_client_access(request, role, existing["client_id"], required_permission="document.upload")
    hints = body.model_dump(exclude_none=True) if body else None
    updated = _run_capture_item_analysis(ctx.firm_id, item_id, manual_hints=hints or None)
    _log_audit_event(request, "capture.analyze", "success", f"id={item_id}")
    return updated


@router.post("/api/capture/items/{item_id}/reaudit")
async def reaudit_capture_gallery_item(
    request: Request,
    item_id: str,
    body: CaptureReauditBody,
):
    """手入力の数字を metadata に反映して監査結果を再計算。"""
    role = _require_permission(request, "document.upload")
    ctx = _auth_context(request)
    from services.capture_service import get_capture_item, update_capture_item

    item = get_capture_item(ctx.firm_id, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Capture item not found")
    _require_client_access(request, role, item["client_id"], required_permission="document.upload")
    metadata = item.get("metadata") or {}
    overrides = body.model_dump(exclude_none=True)
    if not overrides:
        raise HTTPException(status_code=400, detail="No overrides provided")
    result = reaudit_capture_metadata(
        metadata=metadata,
        category=item.get("category") or "general",
        client_id=item["client_id"],
        overrides=overrides,
    )
    updated = update_capture_item(
        ctx.firm_id,
        item_id,
        status=result["status"],
        audit_message=result.get("audit_message"),
        pinned=result.get("pinned"),
        metadata=result["metadata"],
    )
    _log_audit_event(request, "capture.reaudit", "success", f"id={item_id}")
    return updated


@router.post("/api/capture/items/{item_id}/route")
async def route_capture_to_matrix(request: Request, item_id: str, body: CaptureRouteBody):
    """キャプチャを PDF 化してマトリクススロットへ振り分け。"""
    role = _require_permission(request, "document.upload")
    ctx = _auth_context(request)
    item = get_capture_item(ctx.firm_id, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Capture item not found")
    _require_client_access(request, role, item["client_id"], required_permission="document.upload")

    period_key = body.period_key or item.get("period_key")
    slot_id = body.slot_id or item.get("slot_id")
    if not period_key or not slot_id:
        raise HTTPException(
            status_code=400,
            detail="period_key and slot_id are required (or set by analysis)",
        )
    slot_label = body.slot_label or item.get("title") or f"slot-{slot_id}"

    try:
        pdf_bytes, pdf_name, _ = load_capture_as_pdf(ctx.firm_id, item_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        doc = fitz.open("pdf", pdf_bytes)
        page_count = len(doc)
        doc.close()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid PDF after conversion") from exc

    sha = hashlib.sha256(pdf_bytes).hexdigest()
    identity = resolve_identity(request)
    uploaded_by = identity.stakeholder_id or identity.email or ""
    now = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
    classify_meta = (item.get("metadata") or {}).get("classify")
    metadata_json = None
    if classify_meta and isinstance(classify_meta, dict):
        enriched = enrich_classify_metadata(
            classify_meta,
            client_id=item["client_id"],
            period_key=period_key,
            slot_id=slot_id,
        )
        metadata_json = json.dumps(enriched, ensure_ascii=False)

    logical = ensure_logical_document(
        client_id=item["client_id"],
        period_key=period_key,
        slot_id=slot_id,
        title=slot_label,
    )
    if logical.current_version_id:
        set_logical_status(logical.id, "processing")
    version = create_document_version(
        logical_id=logical.id,
        content=pdf_bytes,
        original_name=pdf_name,
        content_sha256=sha,
        source="capture_route",
        bump="upload",
        parent_version_id=logical.current_version_id,
        created_by_stakeholder_id=identity.stakeholder_id,
        created_by_email=identity.email,
        page_count=page_count,
        metadata_json=metadata_json,
    )

    client_firm = get_client_firm_id(item["client_id"])
    _init_slot_documents_db()
    existing_drive_file_id: Optional[str] = None
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        prev_row = conn.execute(
            "SELECT id, google_drive_file_id FROM slot_documents WHERE client_id=? AND period_key=? AND slot_id=?",
            (item["client_id"], period_key, slot_id),
        ).fetchone()
        if prev_row:
            existing_drive_file_id = prev_row["google_drive_file_id"]

    drive_cfg = _load_system_config(client_firm)
    drive_file_id = maybe_upload_slot_to_drive(
        firm_id=client_firm,
        drive_connected=drive_cfg.google_drive_connected,
        drive_root_folder_id=drive_cfg.drive_root_folder_id,
        client_id=item["client_id"],
        period_key=period_key,
        slot_label=slot_label,
        content=pdf_bytes,
        filename=pdf_name,
        existing_file_id=existing_drive_file_id,
    )
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        prev = conn.execute(
            "SELECT id FROM slot_documents WHERE client_id=? AND period_key=? AND slot_id=?",
            (item["client_id"], period_key, slot_id),
        ).fetchone()
        if prev:
            doc_id = prev["id"]
            conn.execute(
                """
                UPDATE slot_documents SET
                    slot_label=?, original_name=?, storage_key=?,
                    page_count=?, content_sha256=?, byte_size=?, uploaded_by=?, uploaded_at=?,
                    logical_document_id=?, current_version_id=?, firm_id=?, google_drive_file_id=?
                WHERE id=?
                """,
                (
                    slot_label,
                    pdf_name,
                    version.storage_key,
                    page_count,
                    sha,
                    len(pdf_bytes),
                    uploaded_by,
                    now,
                    logical.id,
                    version.id,
                    client_firm,
                    drive_file_id,
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
                     logical_document_id, current_version_id, firm_id, google_drive_file_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    doc_id,
                    item["client_id"],
                    period_key,
                    slot_id,
                    slot_label,
                    pdf_name,
                    version.storage_key,
                    page_count,
                    sha,
                    len(pdf_bytes),
                    uploaded_by,
                    now,
                    logical.id,
                    version.id,
                    client_firm,
                    drive_file_id,
                ),
            )
        row = conn.execute("SELECT * FROM slot_documents WHERE id=?", (doc_id,)).fetchone()

    update_capture_item(
        ctx.firm_id,
        item_id,
        status="confirmed",
        pinned=False,
        period_key=period_key,
        slot_id=slot_id,
    )
    slot_item = _enrich_slot_item(row)
    norm = ingest_from_slot_document(
        firm_id=client_firm,
        client_id=item["client_id"],
        period_key=period_key,
        slot_id=slot_id,
        slot_label=slot_label,
        pdf_content=pdf_bytes,
        classify_metadata=classify_meta if isinstance(classify_meta, dict) else None,
        updated_by=identity.email or uploaded_by,
        updated_by_id=identity.stakeholder_id,
    )
    if norm.applied or norm.metrics_applied:
        _log_audit_event(
            request,
            "ssot.normalize",
            "success",
            f"client={item['client_id']} applied={len(norm.applied)} metrics={len(norm.metrics_applied)}",
        )
    slot_item.normalize_result = ingest_result_for_response(norm)
    _log_audit_event(
        request,
        "capture.route",
        "success",
        f"id={item_id} period={period_key} slot={slot_id}",
    )
    return {"capture": get_capture_item(ctx.firm_id, item_id), "slot": slot_item}


@router.post("/api/capture/items/{item_id}/apply-payroll")
async def apply_capture_to_payroll(
    request: Request,
    item_id: str,
    body: CaptureApplyPayrollBody,
):
    """まるふ OCR 結果を源泉徴収簿（従業員マスタ）へ反映。"""
    role = _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    item = get_capture_item(ctx.firm_id, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Capture item not found")
    _require_client_access(request, role, item["client_id"], required_permission="document.upload")

    parsed = build_marufu_parsed_from_capture(item)
    if not parsed.get("dependent_count") and not parsed.get("life_insurance_yen"):
        raw = get_capture_file_bytes(ctx.firm_id, item_id)
        if raw:
            from services.marufu_parser import parse_marufu_text
            from services.capture_analyzer import extract_text_from_capture

            mime = get_capture_mime(ctx.firm_id, item_id) or "application/octet-stream"
            text, _ = extract_text_from_capture(raw, mime)
            ocr_parsed = parse_marufu_text(text)
            for key, val in ocr_parsed.items():
                if parsed.get(key) in (None, False, "", []):
                    parsed[key] = val

    try:
        result = apply_marufu_to_payroll(
            ctx.firm_id,
            item["client_id"],
            parsed,
            employee_id=body.employee_id,
            capture_item_id=item_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    update_capture_item(
        ctx.firm_id,
        item_id,
        status="confirmed",
        pinned=False,
        audit_message="源泉徴収簿（従業員マスタ）へ反映済み",
    )
    _log_audit_event(request, "capture.apply_payroll", "success", f"id={item_id}")
    return {
        "capture": get_capture_item(ctx.firm_id, item_id),
        **result,
    }


@router.post("/api/invoice/verify")
async def verify_invoice_number(request: Request, body: InvoiceVerifyBody):
    """適格請求書登録番号の形式・チェックデジット・公表照合。"""
    role = _require_permission(request, "document.view")
    _require_client_scope(request, role)
    result = verify_invoice_registration(body.registration_number)
    _log_audit_event(
        request,
        "invoice.verify",
        "success",
        f"reg={result.get('normalized')} status={result.get('registration_status')}",
    )
    return result


@router.get("/api/clients/{client_id}/payroll/marufu")
async def get_marufu_submissions(request: Request, client_id: str):
    role = _require_client_permission(request, "client.view", client_id)
    ctx = _auth_context(request)
    return {"submissions": list_marufu_submissions(ctx.firm_id, client_id)}


@router.post("/api/clients/{client_id}/payroll/year-end/run")
async def post_year_end_adjustment_run(
    request: Request,
    client_id: str,
    body: YearEndRunBody,
):
    """年末調整を一括試算（源泉徴収簿 + まるふ控除を統合）。"""
    role = _require_client_permission(request, "settings.manage", client_id)
    ctx = _auth_context(request)
    try:
        run = run_year_end_adjustment(
            ctx.firm_id,
            client_id,
            tax_year=body.tax_year,
            settlement_month=body.settlement_month,
            created_by=ctx.email,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "payroll.year_end.run", "success", f"year={body.tax_year}")
    return run


@router.get("/api/clients/{client_id}/payroll/year-end/runs")
async def get_year_end_adjustment_runs(request: Request, client_id: str):
    role = _require_client_permission(request, "client.view", client_id)
    ctx = _auth_context(request)
    return {"runs": list_year_end_runs(ctx.firm_id, client_id)}


@router.get("/api/clients/{client_id}/payroll/year-end/runs/{run_id}")
async def get_year_end_adjustment_run(request: Request, client_id: str, run_id: str):
    role = _require_client_permission(request, "client.view", client_id)
    ctx = _auth_context(request)
    run = get_year_end_run(ctx.firm_id, run_id)
    if not run or run["client_id"] != client_id:
        raise HTTPException(status_code=404, detail="Year-end run not found")
    return run


@router.post("/api/clients/{client_id}/payroll/year-end/runs/{run_id}/apply")
async def apply_year_end_adjustment_run(request: Request, client_id: str, run_id: str):
    """過不足額を精算月の給与台帳へ反映。"""
    role = _require_client_permission(request, "settings.manage", client_id)
    ctx = _auth_context(request)
    try:
        out = apply_year_end_settlement(ctx.firm_id, client_id, run_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "payroll.year_end.apply", "success", f"id={run_id}")
    return out


@router.post("/api/clients/{client_id}/payroll/santei/apply")
async def apply_santei_grades(request: Request, client_id: str, body: SanteiRunBody):
    """4・5・6月給与から算定基礎届等級を試算して従業員マスタへ反映。"""
    role = _require_client_permission(request, "settings.manage", client_id)
    ctx = _auth_context(request)
    result = compute_and_apply_santei_grades(ctx.firm_id, client_id, tax_year=body.tax_year)
    _log_audit_event(request, "payroll.santei.apply", "success", f"year={body.tax_year}")
    return result


@router.get("/api/clients/{client_id}/payroll/santei/preview")
async def preview_santei_grades(
    request: Request,
    client_id: str,
    tax_year: int = Query(...),
):
    """算定基礎届の等級試算プレビュー（反映なし）。"""
    role = _require_client_permission(request, "client.view", client_id)
    ctx = _auth_context(request)
    from services.social_insurance_santei import compute_client_santei

    employees = list_employees(ctx.firm_id, client_id)
    rows = list_ledger_rows(ctx.firm_id, client_id)
    return compute_client_santei(employees, rows, tax_year=tax_year)


