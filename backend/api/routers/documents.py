"""DocuGrid API — documents routes."""

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

@router.post("/api/classify")
async def classify_document(
    request: Request,
    file: UploadFile = File(...),
    candidates: str = Form(...),
    client_id: Optional[str] = Form(None),
    period_key: Optional[str] = Form(None),
    slot_id: Optional[str] = Form(None),
):
    """OCR/テキスト抽出＋ルールベース分類で、候補スロットの推定を返す（自動振り分け v1）。"""
    role = _require_permission(request, "document.upload")
    if client_id:
        _require_client_access(request, role, client_id, required_permission="document.upload")
    else:
        _require_client_scope(request, role)

    try:
        parsed = json.loads(candidates)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="candidates must be valid JSON")
    if not isinstance(parsed, list) or not parsed:
        raise HTTPException(status_code=400, detail="candidates must be a non-empty list")
    norm_candidates = [
        {"id": str(c.get("id", c.get("label", ""))), "label": str(c.get("label", ""))}
        for c in parsed
        if isinstance(c, dict) and c.get("label")
    ]
    if not norm_candidates:
        raise HTTPException(status_code=400, detail="candidates require label")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    ctx = _auth_context(request)
    ai_gate: dict | None = None
    if client_id:
        ai_gate = check_ai_allowed(ctx.firm_id, client_id)
        if not ai_gate.get("allowed"):
            raise HTTPException(
                status_code=403,
                detail={
                    "code": ai_gate.get("code"),
                    "message": ai_gate.get("message"),
                    "clientUsage": ai_gate.get("clientUsage"),
                },
            )

    logical_for_classify = None
    if client_id and period_key and slot_id:
        logical_for_classify = get_logical_by_slot(client_id, period_key, slot_id)
        if logical_for_classify:
            set_logical_status(logical_for_classify.id, "processing")

    try:
        result = classify_pdf(content, file.filename, norm_candidates)
        cfg = _load_system_config(ctx.firm_id)
        excerpt = str(result.get("text_excerpt") or "")
        conf = float(result.get("confidence") or 0)
        text_prompt_tpl, _ = get_prompt_template(ctx.firm_id, PROMPT_KEY_CLASSIFY_TEXT)
        if cfg.ocr_auto_extract_enabled and conf < 0.6:
            catalog_boost = try_catalog_slot_classify(content, file.filename, norm_candidates)
            if catalog_boost and float(catalog_boost.get("confidence") or 0) > conf:
                result["best"] = catalog_boost["best"]
                result["confidence"] = catalog_boost["confidence"]
                result["engine"] = "form_catalog"
                result["ai_reason"] = catalog_boost.get("reason")
                conf = float(catalog_boost["confidence"])
            if conf < 0.6 and cfg.ai_openai_enabled:
                api_key = get_openai_key(ctx.firm_id)
                if api_key:
                    boost = ai_classify_boost(
                        excerpt,
                        file.filename,
                        norm_candidates,
                        api_key,
                        cfg.ai_openai_model,
                        prompt_template=text_prompt_tpl,
                    )
                    if boost and float(boost.get("confidence") or 0) > conf:
                        result["best"] = boost["best"]
                        result["confidence"] = boost["confidence"]
                        result["engine"] = "openai"
                        result["ai_reason"] = boost.get("reason")
                        conf = float(boost["confidence"])
            if conf < 0.6 and cfg.ai_gemini_enabled:
                gemini_key = get_gemini_key(ctx.firm_id)
                if gemini_key:
                    boost = gemini_classify_boost(
                        excerpt,
                        file.filename,
                        norm_candidates,
                        gemini_key,
                        cfg.ai_gemini_model,
                        prompt_template=text_prompt_tpl,
                    )
                    if boost and float(boost.get("confidence") or 0) > conf:
                        result["best"] = boost["best"]
                        result["confidence"] = boost["confidence"]
                        result["engine"] = "gemini"
                        result["ai_reason"] = boost.get("reason")
        best = result.get("best") or {}
        openai_key = get_openai_key(ctx.firm_id)
        gemini_key = get_gemini_key(ctx.firm_id)
        result["capabilities"] = {
            "ocr_auto_extract_enabled": cfg.ocr_auto_extract_enabled,
            "ai_openai_enabled": cfg.ai_openai_enabled,
            "ai_gemini_enabled": cfg.ai_gemini_enabled,
            "ai_openai_key_configured": bool(openai_key),
            "ai_gemini_key_configured": bool(gemini_key),
        }
        if slot_id:
            full_text, _ = extract_text_from_pdf(content)
            if full_text and len(full_text.strip()) >= 8:
                from services.document_extraction_schema import extract_from_schema, has_extraction_schema

                if has_extraction_schema(slot_id):
                    schema_result = extract_from_schema(slot_id, full_text)
                    result["extracted_profile"] = schema_result.extracted_profile
                    result["extraction_review"] = schema_result.to_dict()
                else:
                    extracted = profile_fields_from_text(slot_id, full_text)
                    if extracted:
                        result["extracted_profile"] = extracted
        if client_id:
            excerpt_for_tokens = str(result.get("text_excerpt") or "")
            tokens = estimate_tokens_from_text(excerpt_for_tokens)
            if result.get("engine") in ("openai", "gemini"):
                usage = record_ai_usage(ctx.firm_id, client_id, tokens, feature="classify")
                result["aiUsage"] = usage.get("clientUsage")
            elif ai_gate and ai_gate.get("announce"):
                result["aiAnnouncement"] = ai_gate.get("message")
        _log_audit_event(
            request,
            "document.classify",
            "success",
            f"engine={result.get('engine')} best={best.get('label')} conf={result.get('confidence')}",
        )
        return result
    finally:
        if logical_for_classify and logical_for_classify.current_version_id:
            set_logical_status(logical_for_classify.id, "uploaded")


@router.post("/api/extraction/apply")
async def apply_extraction_fields(request: Request, body: ExtractionApplyBody):
    """人が確認・補完した抽出フィールドを client-master へ反映する。"""
    role = _require_client_permission(request, "document.upload", body.client_id)
    if not body.fields:
        raise HTTPException(status_code=400, detail="fields must be non-empty")
    ctx = _auth_context(request)
    identity = resolve_identity(request)
    norm = ingest_from_confirmed_fields(
        firm_id=ctx.firm_id,
        client_id=body.client_id,
        period_key=body.period_key,
        slot_id=body.slot_id,
        slot_label=body.slot_label,
        fields=body.fields,
        updated_by=identity.email or None,
        updated_by_id=identity.stakeholder_id or None,
    )
    if norm.applied or norm.metrics_applied:
        _log_audit_event(
            request,
            "extraction.apply",
            "success",
            f"client={body.client_id} slot={body.slot_id} applied={len(norm.applied)}",
        )
    return ingest_result_for_response(norm)


@router.get("/api/document-templates")
async def get_document_templates(request: Request):
    """事務所の申告書類並び順テンプレートを返す。"""
    role = _require_permission(request, "document.view")
    _require_client_scope(request, role)
    ctx = _auth_context(request)
    payload = load_document_template(ctx.firm_id)
    _log_audit_event(request, "document_templates.get", "success")
    return payload


@router.put("/api/document-templates")
async def put_document_templates(request: Request, body: DocumentTemplateUpdateBody):
    """申告書類並び順テンプレートを更新（プラットフォーム設定権限）。"""
    _require_platform_settings(request)
    ctx = _auth_context(request)
    saved = save_document_template(
        ctx.firm_id,
        template_name=body.templateName,
        sort_order=body.sortOrder,
    )
    _log_audit_event(request, "document_templates.put", "success", saved.get("templateName", ""))
    return saved


def _client_record_for_render(ctx: AuthContext, client_id: str) -> dict:
    master = _merge_client_master_for_firm(ctx, _load_client_master())
    for client in master.clients:
        if client.id == client_id:
            return client.model_dump()
    raise HTTPException(status_code=404, detail="Client not found")


@router.get("/api/authoring-templates")
async def get_authoring_templates(request: Request):
    _require_permission(request, "document.view")
    ctx = _auth_context(request)
    payload = list_all_for_firm(ctx.firm_id)
    _log_audit_event(request, "authoring_templates.list", "success")
    return payload


@router.get("/api/authoring-templates/{template_id}")
async def get_authoring_template(request: Request, template_id: str):
    _require_permission(request, "document.view")
    ctx = _auth_context(request)
    item = get_template_by_id(template_id, ctx.firm_id)
    if not item:
        raise HTTPException(status_code=404, detail="Template not found")
    return item


@router.post("/api/authoring-templates")
async def post_authoring_template(request: Request, body: AuthoringTemplateCreateBody):
    ctx = _auth_context(request)
    scope = (body.scope or "local").strip().lower()
    if scope == "global":
        _require_platform_settings(request)
        created = create_global_template(
            title=body.title.strip(),
            body=body.body,
            description=body.description.strip(),
            category=body.category.strip() or "general",
        )
    else:
        _require_permission(request, "settings.manage")
        created = create_local_template(
            ctx.firm_id,
            title=body.title.strip(),
            body=body.body,
            description=body.description.strip(),
            category=body.category.strip() or "general",
        )
    _log_audit_event(request, "authoring_templates.create", "success", created["id"])
    return created


@router.put("/api/authoring-templates/{template_id}")
async def put_authoring_template(
    request: Request, template_id: str, body: AuthoringTemplateUpdateBody
):
    ctx = _auth_context(request)
    existing = get_template_by_id(template_id, ctx.firm_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Template not found")
    if existing["scope"] == "global":
        _require_platform_settings(request)
    else:
        _require_permission(request, "settings.manage")
    updated = update_template(
        template_id,
        ctx.firm_id,
        title=body.title,
        body=body.body,
        description=body.description,
        category=body.category,
        is_platform="settings.platform" in _get_role_permissions().get(
            _auth_context(request).role, set()
        ),
    )
    if not updated:
        raise HTTPException(status_code=403, detail="Cannot update template")
    _log_audit_event(request, "authoring_templates.update", "success", template_id)
    return updated


@router.delete("/api/authoring-templates/{template_id}")
async def delete_authoring_template(request: Request, template_id: str):
    ctx = _auth_context(request)
    existing = get_template_by_id(template_id, ctx.firm_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Template not found")
    if existing["scope"] == "global":
        _require_platform_settings(request)
    else:
        _require_permission(request, "settings.manage")
    ok = delete_template(
        template_id,
        ctx.firm_id,
        is_platform="settings.platform" in _get_role_permissions().get(ctx.role, set()),
    )
    if not ok:
        raise HTTPException(status_code=403, detail="Cannot delete template")
    _log_audit_event(request, "authoring_templates.delete", "success", template_id)
    return {"ok": True}


@router.post("/api/authoring-templates/parse")
async def parse_authoring_template_body(request: Request, body: AuthoringTemplateParseBody):
    _require_permission(request, "settings.manage")
    variables = extract_variable_names(body.body)
    return {"variables": variables}


@router.post("/api/authoring-templates/{template_id}/render")
async def render_authoring_template(
    request: Request, template_id: str, body: AuthoringTemplateRenderBody
):
    role = _require_client_permission(request, "document.view", body.client_id)
    ctx = _auth_context(request)
    template = get_template_by_id(template_id, ctx.firm_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    client = _client_record_for_render(ctx, body.client_id)
    resolved = merge_render_values(client, body.values or {})
    missing = missing_variables(template.get("variables") or [], resolved)
    rendered = render_template_body(template.get("body") or "", resolved)
    _log_audit_event(
        request,
        "authoring_templates.render",
        "success",
        f"template={template_id} client={body.client_id}",
    )
    return {
        "renderedBody": rendered,
        "resolvedValues": resolved,
        "missingVariables": missing,
        "templateId": template_id,
        "templateTitle": template.get("title"),
        "templateBody": template.get("body"),
        "targetSlotLabel": template.get("targetSlotLabel") or "",
    }


@router.post("/api/authoring-templates/export-pdf")
async def export_authoring_pdf(request: Request, body: AuthoringExportPdfBody):
    role = _require_client_permission(request, "document.upload", body.client_id)
    if not (body.body or "").strip():
        raise HTTPException(status_code=400, detail="body required")
    safe_title = (body.title or "document").strip() or "document"
    pdf_bytes = text_to_pdf_bytes(body.body, title=safe_title)
    filename = f"{safe_title}.pdf".replace('"', "_")
    _log_audit_event(
        request,
        "authoring_templates.export_pdf",
        "success",
        f"client={body.client_id} title={safe_title}",
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": _attachment_content_disposition(filename)},
    )


@router.get("/api/review-checklists/templates")
async def list_review_checklist_templates_endpoint(request: Request):
    _require_permission(request, "document.view")
    ctx = _auth_context(request)
    payload = list_review_checklist_templates(ctx.firm_id)
    _log_audit_event(request, "review_checklist.templates.list", "success")
    return payload


@router.get("/api/review-checklists/templates/{template_id}")
async def get_review_checklist_template_by_id_endpoint(request: Request, template_id: str):
    _require_permission(request, "document.view")
    ctx = _auth_context(request)
    template = get_review_checklist_template(ctx.firm_id, template_id)
    _log_audit_event(request, "review_checklist.template.get", "success", template_id)
    return template


@router.post("/api/review-checklists/templates")
async def post_review_checklist_template_endpoint(request: Request, body: ReviewChecklistCreateBody):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    created = create_review_checklist_template(
        ctx.firm_id,
        title=body.title.strip(),
        description=body.description.strip(),
        period_types=body.periodTypes,
        sections=body.sections,
        source_template_id=body.sourceTemplateId,
    )
    _log_audit_event(request, "review_checklist.template.create", "success", created.get("id", ""))
    return created


@router.put("/api/review-checklists/templates/{template_id}")
async def put_review_checklist_template_by_id_endpoint(
    request: Request, template_id: str, body: ReviewChecklistTemplateBody
):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    payload = body.model_dump(exclude_none=True)
    try:
        saved = update_review_checklist_template(ctx.firm_id, template_id, payload)
    except PermissionError as exc:
        if str(exc) == "global_template_readonly":
            raise HTTPException(status_code=403, detail="global_template_readonly") from exc
        raise
    except KeyError as exc:
        if str(exc) == "template_not_found":
            raise HTTPException(status_code=404, detail="template_not_found") from exc
        raise
    _log_audit_event(request, "review_checklist.template.put", "success", template_id)
    return saved


@router.delete("/api/review-checklists/templates/{template_id}")
async def delete_review_checklist_template_endpoint(request: Request, template_id: str):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    try:
        ok = delete_review_checklist_template(ctx.firm_id, template_id)
    except PermissionError as exc:
        if str(exc) == "global_template_readonly":
            raise HTTPException(status_code=403, detail="global_template_readonly") from exc
        raise
    except ValueError as exc:
        if str(exc) == "cannot_delete_default":
            raise HTTPException(status_code=400, detail="cannot_delete_default") from exc
        raise
    if not ok:
        raise HTTPException(status_code=404, detail="template_not_found")
    _log_audit_event(request, "review_checklist.template.delete", "success", template_id)
    return {"ok": True}


@router.put("/api/review-checklists/templates/default")
async def put_review_checklist_default_template_endpoint(
    request: Request, body: ReviewChecklistDefaultBody
):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    try:
        payload = set_default_review_checklist_template(ctx.firm_id, body.template_id)
    except KeyError as exc:
        if str(exc) == "template_not_found":
            raise HTTPException(status_code=404, detail="template_not_found") from exc
        raise
    _log_audit_event(request, "review_checklist.template.default", "success", body.template_id)
    return payload


@router.get("/api/review-checklists/template")
async def get_review_checklist_template_endpoint(request: Request):
    _require_permission(request, "document.view")
    ctx = _auth_context(request)
    template = get_review_checklist_template(ctx.firm_id)
    _log_audit_event(request, "review_checklist.template.get", "success")
    return template


@router.put("/api/review-checklists/template")
async def put_review_checklist_template_endpoint(
    request: Request, body: ReviewChecklistTemplateBody
):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    payload = body.model_dump(exclude_none=True)
    if body.items:
        payload["items"] = [item.model_dump() for item in body.items]
    saved = save_review_checklist_template(ctx.firm_id, payload)
    _log_audit_event(request, "review_checklist.template.put", "success")
    return saved


@router.get("/api/review-checklists/prefill")
async def get_review_checklist_prefill_endpoint(
    request: Request,
    client_id: str,
    period_key: str,
):
    role = _require_client_permission(request, "document.view", client_id)
    ctx = _auth_context(request)
    client = _client_record_for_render(ctx, client_id)
    header = prefill_header(client, period_key)
    return {"header": header, "clientId": client_id, "periodKey": period_key}


@router.get("/api/review-checklists/instance")
async def get_review_checklist_instance_endpoint(
    request: Request,
    client_id: str,
    period_key: str,
    template_id: Optional[str] = None,
):
    role = _require_client_permission(request, "document.view", client_id)
    ctx = _auth_context(request)
    instance = get_instance(ctx.firm_id, client_id, period_key, template_id)
    tid = instance.get("templateId") or template_id
    template = get_review_checklist_template(ctx.firm_id, tid)
    return {"template": template, "instance": instance}


@router.put("/api/review-checklists/instance")
async def put_review_checklist_instance_endpoint(
    request: Request, body: ReviewChecklistChecksBody
):
    role, permissions = _require_any_permission(
        request, "document.annotate", "review_checklist.edit"
    )
    firm_workflow = "document.annotate" in permissions
    checklist_perm = (
        "document.annotate" if "document.annotate" in permissions else "review_checklist.edit"
    )
    _require_client_access(request, role, body.client_id, required_permission=checklist_perm)
    ctx = _auth_context(request)
    try:
        if body.itemStates is not None or body.header is not None:
            instance = save_instance(
                ctx.firm_id,
                body.client_id,
                body.period_key,
                template_id=body.template_id,
                header=body.header,
                item_states=body.itemStates,
                workflow_status=body.workflowStatus if firm_workflow else None,
                circulation_memo=body.circulationMemo if firm_workflow else None,
                actor_email=ctx.email,
            )
        else:
            instance = save_instance_checks(
                ctx.firm_id,
                body.client_id,
                body.period_key,
                body.checks,
                template_id=body.template_id,
                actor_email=ctx.email,
            )
    except ValueError as exc:
        if str(exc) == "period_not_applicable":
            raise HTTPException(status_code=400, detail="period_not_applicable") from exc
        raise
    _log_audit_event(
        request,
        "review_checklist.instance.put",
        "success",
        f"client={body.client_id} period={body.period_key}",
    )
    return instance


@router.get("/api/review-checklists/alerts")
async def get_review_checklist_alerts_endpoint(
    request: Request,
    client_id: str,
    period_key: str,
    template_id: Optional[str] = None,
):
    role = _require_client_permission(request, "document.view", client_id)
    ctx = _auth_context(request)
    result = evaluate_alerts(ctx.firm_id, client_id, period_key, template_id)
    _log_audit_event(
        request,
        "review_checklist.alerts",
        "success",
        f"client={client_id} period={period_key} n={result['summary']['total']}",
    )
    return result


@router.post("/api/review-checklists/export-pdf")
async def post_review_checklist_export_pdf_endpoint(
    request: Request, body: ReviewChecklistExportPdfBody
):
    role = _require_client_permission(request, "document.view", body.client_id)
    ctx = _auth_context(request)
    client = _client_record_for_render(ctx, body.client_id)
    pdf_bytes = export_checklist_pdf(
        ctx.firm_id,
        body.client_id,
        body.period_key,
        template_id=body.template_id,
        client_name=str(client.get("name") or ""),
    )
    safe_name = str(client.get("name") or body.client_id).replace('"', "_")
    filename = f"checklist-{safe_name}.pdf"
    _log_audit_event(
        request,
        "review_checklist.export_pdf",
        "success",
        f"client={body.client_id} period={body.period_key}",
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": _attachment_content_disposition(filename)},
    )


@router.post("/api/classify/batch")
async def classify_documents_batch(
    request: Request,
    files: List[UploadFile] = File(...),
    client_id: Optional[str] = Form(None),
):
    """複数 PDF を TaxDocumentType で一括分類（Vision LLM + ルール）。"""
    role = _require_permission(request, "document.upload")
    if client_id:
        _require_client_access(request, role, client_id, required_permission="document.upload")
    else:
        _require_client_scope(request, role)

    if not files:
        raise HTTPException(status_code=400, detail="files required")

    ctx = _auth_context(request)
    cfg = _load_system_config(ctx.firm_id)
    openai_key = get_openai_key(ctx.firm_id)
    gemini_key = get_gemini_key(ctx.firm_id)
    use_openai_vision = bool(cfg.ocr_auto_extract_enabled and cfg.ai_openai_enabled and openai_key)
    use_gemini_vision = bool(cfg.ocr_auto_extract_enabled and cfg.ai_gemini_enabled and gemini_key)
    use_vision = use_openai_vision or use_gemini_vision
    vision_prompt_tpl, _ = get_prompt_template(ctx.firm_id, PROMPT_KEY_CLASSIFY_VISION)

    documents: List[dict] = []
    for upload in files:
        content = await upload.read()
        if not content:
            continue
        text, extract_engine = extract_text_from_pdf(content)
        excerpt = (text or "")[:400]
        fname = upload.filename or "document.pdf"

        def _vision_classify(
            _content: bytes = content,
            _fname: str = fname,
            _excerpt: str = excerpt,
            _extract_engine: str = extract_engine,
        ) -> dict:
            if use_vision:
                return classify_tax_document(
                    _content,
                    _fname,
                    text_excerpt=_excerpt,
                    openai_key=openai_key,
                    openai_model=cfg.ai_openai_model,
                    gemini_key=gemini_key,
                    gemini_model=cfg.ai_gemini_model,
                    use_openai_vision=use_openai_vision,
                    use_gemini_vision=use_gemini_vision,
                    prompt_template=vision_prompt_tpl,
                )
            doc_type, conf, reason = infer_type_from_text(_excerpt, _fname)
            return {
                "identifiedType": doc_type,
                "confidence": conf,
                "reason": reason,
                "engine": _extract_engine if _extract_engine != "none" else "rules",
            }

        rows = classify_pdf_for_tax_package(
            content,
            fname,
            vision_classify=_vision_classify,
        )
        documents.extend(rows)

    template = load_document_template(ctx.firm_id)
    sort_order = template.get("sortOrder") or []
    documents.sort(
        key=lambda d: (
            sort_order.index(d["identifiedType"])
            if d["identifiedType"] in sort_order
            else len(sort_order) + (1 if d["identifiedType"] == "UNKNOWN" else 0)
        )
    )

    _log_audit_event(
        request,
        "document.classify_batch",
        "success",
        f"count={len(documents)} vision={use_vision}",
    )
    return {
        "documents": documents,
        "template": template,
        "capabilities": {
            "ocr_auto_extract_enabled": cfg.ocr_auto_extract_enabled,
            "ai_openai_enabled": cfg.ai_openai_enabled,
            "ai_gemini_enabled": cfg.ai_gemini_enabled,
            "ai_openai_key_configured": bool(openai_key),
            "ai_gemini_key_configured": bool(gemini_key),
            "vision_enabled": use_vision,
            "vision_openai": use_openai_vision,
            "vision_gemini": use_gemini_vision,
        },
    }


@router.get("/api/classify/pending")
async def list_classify_pending(
    request: Request,
    client_id: str = Query(...),
    period_key: str = Query(...),
):
    """要確認キュー一覧（メタデータのみ、ファイルは別 GET）。"""
    role = _require_client_permission(request, "document.view", client_id)
    ctx = _auth_context(request)
    items = list_pending_items(ctx.firm_id, client_id, period_key)
    _log_audit_event(request, "classify.pending.list", "success", f"count={len(items)}")
    return items


@router.post("/api/classify/pending")
async def create_classify_pending(
    request: Request,
    file: UploadFile = File(...),
    client_id: str = Form(...),
    period_key: str = Form(...),
    confidence: float = Form(0),
    engine: str = Form("none"),
    suggested_slot_id: Optional[str] = Form(None),
    classify_metadata: Optional[str] = Form(None),
    ranked: Optional[str] = Form(None),
):
    """要確認キューに PDF を追加。"""
    role = _require_client_permission(request, "document.upload", client_id)
    content = await _read_upload_content(file)
    _validate_pdf_bytes(content)
    ctx = _auth_context(request)
    meta = None
    ranked_list = None
    if classify_metadata:
        try:
            meta = json.loads(classify_metadata)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="classify_metadata must be valid JSON")
    if ranked:
        try:
            ranked_list = json.loads(ranked)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="ranked must be valid JSON")
    item = create_pending_item(
        firm_id=ctx.firm_id,
        client_id=client_id,
        period_key=period_key,
        file_name=file.filename or "document.pdf",
        content=content,
        confidence=confidence,
        engine=engine,
        suggested_slot_id=suggested_slot_id,
        classify_metadata=meta,
        ranked=ranked_list if isinstance(ranked_list, list) else None,
        created_by=ctx.email,
    )
    _log_audit_event(request, "classify.pending.create", "success", f"id={item['id']}")
    return item


@router.get("/api/classify/pending/{item_id}/file")
async def get_classify_pending_file(request: Request, item_id: str):
    """要確認キュー項目の PDF バイナリ。"""
    role = _require_permission(request, "document.view")
    ctx = _auth_context(request)
    from services.pending_classify_service import get_pending_item

    existing = get_pending_item(ctx.firm_id, item_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Pending item not found")
    _require_client_access(
        request,
        role,
        existing["client_id"],
        required_permission="document.view",
    )
    path = get_pending_file_path(ctx.firm_id, item_id)
    if not path:
        raise HTTPException(status_code=404, detail="Pending item not found")
    _log_audit_event(request, "classify.pending.file", "success", f"id={item_id}")
    return FileResponse(path, media_type="application/pdf", filename=path.name.split("_", 1)[-1])


@router.delete("/api/classify/pending/{item_id}")
async def delete_classify_pending(request: Request, item_id: str):
    """要確認キューから削除（確定・却下時）。"""
    ctx = _auth_context(request)
    from services.pending_classify_service import get_pending_item

    existing = get_pending_item(ctx.firm_id, item_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Pending item not found")
    role = _require_client_permission(request, "document.upload", existing["client_id"])
    if not delete_pending_item(ctx.firm_id, item_id):
        raise HTTPException(status_code=404, detail="Pending item not found")
    _log_audit_event(request, "classify.pending.delete", "success", f"id={item_id}")
    return {"ok": True}


