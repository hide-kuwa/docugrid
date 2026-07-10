"""DocuGrid API — dev_form_catalog routes."""

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

# --- Form catalog (AI classification reference) ---


def _form_catalog_write_dict(body: FormCatalogWriteBody) -> dict:
    maps = body.maps_to.model_dump() if body.maps_to else {}
    page_scan = body.page_scan.model_dump() if body.page_scan else {}
    return {
        "form_id": body.form_id.strip(),
        "label_ja": body.label_ja.strip(),
        "role": body.role or "body",
        "maps_to": maps,
        "anchors": [a.model_dump() for a in body.anchors],
        "must_not": body.must_not,
        "page_scan": page_scan,
        "filename_hints": body.filename_hints,
        "notes": body.notes,
    }


@router.get("/api/dev/form-catalog", response_model=FormCatalogListPayload)
async def list_dev_form_catalog(request: Request):
    _require_platform_settings(request)
    summary = form_catalog_config_summary()
    forms = list_form_catalog_forms()
    _log_audit_event(request, "dev.form_catalog.list", "success", f"count={len(forms)}")
    return FormCatalogListPayload(
        version=int(summary["version"]),
        form_count=int(summary["form_count"]),
        config_path=str(summary["config_path"]),
        max_scan_pages=int(summary["max_scan_pages"]),
        forms=[FormCatalogFormItem(**f) for f in forms],
    )


@router.get("/api/dev/form-catalog/export", response_model=FormCatalogExportPayload)
async def export_dev_form_catalog(request: Request):
    _require_platform_settings(request)
    try:
        yaml_text = export_form_catalog_yaml()
        cfg = reload_form_catalog_config()
    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    _log_audit_event(request, "dev.form_catalog.export", "success")
    return FormCatalogExportPayload(
        version=cfg["version"],
        form_count=len(cfg["forms"]),
        yaml_text=yaml_text,
    )


@router.post("/api/dev/form-catalog/validate", response_model=FormCatalogValidatePayload)
async def validate_dev_form_catalog(request: Request, body: FormCatalogValidateBody):
    _require_platform_settings(request)
    errors, parsed = validate_form_catalog_yaml(body.yaml_text)
    _log_audit_event(
        request,
        "dev.form_catalog.validate",
        "success" if not errors else "error",
        f"errors={len(errors)}",
    )
    if errors or parsed is None:
        return FormCatalogValidatePayload(valid=False, errors=errors)
    return FormCatalogValidatePayload(
        valid=True,
        errors=[],
        version=parsed["version"],
        form_count=len(parsed["forms"]),
    )


@router.post("/api/dev/form-catalog/import", response_model=FormCatalogImportPayload)
async def import_dev_form_catalog(request: Request, body: FormCatalogImportBody):
    _require_platform_settings(request)
    try:
        cfg = import_form_catalog_yaml(body.yaml_text, mode=body.mode)  # type: ignore[arg-type]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (FileNotFoundError, RuntimeError) as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    _log_audit_event(request, "dev.form_catalog.import", "success", f"mode={body.mode}")
    return FormCatalogImportPayload(
        version=cfg["version"],
        form_count=len(cfg["forms"]),
        message=f"Imported ({body.mode}) into {form_catalog_config_path()}",
    )


@router.post("/api/dev/form-catalog/reload", response_model=FormCatalogReloadPayload)
async def reload_dev_form_catalog(request: Request):
    _require_platform_settings(request)
    try:
        cfg = reload_form_catalog_config()
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    _log_audit_event(request, "dev.form_catalog.reload", "success")
    return FormCatalogReloadPayload(
        version=cfg["version"],
        form_count=len(cfg["forms"]),
        message=f"Reloaded {form_catalog_config_path()}",
    )


@router.post("/api/dev/form-catalog/forms", response_model=FormCatalogFormItem, status_code=201)
async def create_dev_form_catalog_form(request: Request, body: FormCatalogWriteBody):
    _require_platform_settings(request)
    try:
        created = create_form_catalog_entry(_form_catalog_write_dict(body))  # type: ignore[arg-type]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "dev.form_catalog.create", "success", body.form_id)
    return FormCatalogFormItem(**dict(created))


@router.get("/api/dev/form-catalog/forms/{form_id}", response_model=FormCatalogFormItem)
async def get_dev_form_catalog_form(request: Request, form_id: str):
    _require_platform_settings(request)
    form = get_form_catalog_entry(form_id)
    if not form:
        raise HTTPException(status_code=404, detail=f"Form not found: {form_id}")
    return FormCatalogFormItem(**dict(form))


@router.put("/api/dev/form-catalog/forms/{form_id}", response_model=FormCatalogFormItem)
async def update_dev_form_catalog_form(
    request: Request, form_id: str, body: FormCatalogWriteBody
):
    _require_platform_settings(request)
    try:
        updated = update_form_catalog_entry(form_id, _form_catalog_write_dict(body))  # type: ignore[arg-type]
    except ValueError as exc:
        status = 404 if "not found" in str(exc) else 400
        raise HTTPException(status_code=status, detail=str(exc)) from exc
    _log_audit_event(request, "dev.form_catalog.update", "success", form_id)
    return FormCatalogFormItem(**dict(updated))


@router.delete("/api/dev/form-catalog/forms/{form_id}")
async def delete_dev_form_catalog_form(request: Request, form_id: str):
    _require_platform_settings(request)
    try:
        delete_form_catalog_entry(form_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    _log_audit_event(request, "dev.form_catalog.delete", "success", form_id)
    return {"ok": True}


@router.post("/api/dev/form-catalog/scan")
async def scan_dev_form_catalog_pdf(
    request: Request,
    file: UploadFile = File(...),
    max_pages: Optional[int] = Form(None),
):
    """PDF をページ単位で様式カタログと照合（開発者テスト用）。"""
    _require_platform_settings(request)
    content = await _read_upload_content(file)
    _validate_pdf_bytes(content)
    result = scan_pdf_pages(
        content,
        filename=file.filename,
        max_pages=max_pages,
    )
    _log_audit_event(
        request,
        "dev.form_catalog.scan",
        "success",
        f"pages={result.get('page_count_scanned')} segments={len(result.get('segments') or [])}",
    )
    return result


@router.get("/api/dev/form-catalog/samples", response_model=FormCatalogSampleListPayload)
async def list_dev_form_catalog_samples(request: Request):
    _require_platform_settings(request)
    samples = list_form_catalog_samples()
    ann_count = sum(len(s.get("annotations") or []) for s in samples)
    _log_audit_event(request, "dev.form_catalog.samples.list", "success", f"count={len(samples)}")
    return FormCatalogSampleListPayload(
        sample_count=len(samples),
        annotation_count=ann_count,
        samples=[FormCatalogSampleItem(**s) for s in samples],
        presets=list_form_presets(),
        slot_options=slot_label_options(),
    )


@router.post("/api/dev/form-catalog/samples", response_model=FormCatalogSampleItem, status_code=201)
async def upload_dev_form_catalog_sample(
    request: Request,
    file: UploadFile = File(...),
    notes: str = Form(""),
):
    _require_platform_settings(request)
    content = await _read_upload_content(file)
    _validate_pdf_bytes(content)
    created = add_form_catalog_sample(
        filename=file.filename or "document.pdf",
        content=content,
        notes=notes,
    )
    _log_audit_event(
        request,
        "dev.form_catalog.samples.upload",
        "success",
        f"id={created.get('id')} pages={created.get('page_count')}",
    )
    return FormCatalogSampleItem(**dict(created))


@router.get("/api/dev/form-catalog/samples/{sample_id}", response_model=FormCatalogSampleItem)
async def get_dev_form_catalog_sample(request: Request, sample_id: str):
    _require_platform_settings(request)
    sample = get_form_catalog_sample(sample_id)
    if not sample:
        raise HTTPException(status_code=404, detail="sample not found")
    return FormCatalogSampleItem(**dict(sample))


@router.delete("/api/dev/form-catalog/samples/{sample_id}")
async def delete_dev_form_catalog_sample(request: Request, sample_id: str):
    _require_platform_settings(request)
    try:
        delete_form_catalog_sample(sample_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    _log_audit_event(request, "dev.form_catalog.samples.delete", "success", sample_id)
    return {"ok": True}


@router.get("/api/dev/form-catalog/samples/{sample_id}/pages/{page}/image")
async def get_dev_form_catalog_sample_page_image(
    request: Request,
    sample_id: str,
    page: int,
):
    _require_platform_settings(request)
    try:
        png = render_sample_page_png(sample_id, page)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "dev.form_catalog.samples.page_image", "success", f"{sample_id}:p{page}")
    return Response(content=png, media_type="image/png")


@router.get("/api/dev/form-catalog/samples/{sample_id}/pages/{page}/text")
async def get_dev_form_catalog_sample_page_text(
    request: Request,
    sample_id: str,
    page: int,
    use_ai: bool = Query(False),
):
    _require_platform_settings(request)
    ctx = _auth_context(request)
    cfg = _load_system_config(ctx.firm_id)
    gemini_key = get_gemini_key(ctx.firm_id) if cfg.ai_gemini_enabled else None
    try:
        result = extract_sample_page_text(
            sample_id,
            page,
            gemini_key=gemini_key,
            gemini_model=cfg.ai_gemini_model,
            use_ai=use_ai,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return result


@router.put("/api/dev/form-catalog/samples/{sample_id}/annotations")
async def upsert_dev_form_catalog_page_annotation(
    request: Request,
    sample_id: str,
    body: FormCatalogPageAnnotationBody,
):
    _require_platform_settings(request)
    try:
        saved = upsert_form_catalog_page_annotation(
            sample_id,
            {
                **body.model_dump(),
                "markers": [m.model_dump() for m in body.markers],
            },
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(
        request,
        "dev.form_catalog.samples.annotate",
        "success",
        f"{sample_id}:p{body.page}",
    )
    return saved


@router.delete("/api/dev/form-catalog/samples/{sample_id}/annotations/{annotation_id}")
async def delete_dev_form_catalog_page_annotation(
    request: Request,
    sample_id: str,
    annotation_id: str,
):
    _require_platform_settings(request)
    try:
        delete_form_catalog_page_annotation(sample_id, annotation_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    _log_audit_event(
        request,
        "dev.form_catalog.samples.annotate_delete",
        "success",
        f"{sample_id}:{annotation_id}",
    )
    return {"ok": True}


@router.post("/api/dev/form-catalog/compile-from-samples", response_model=FormCatalogCompilePayload)
async def compile_dev_form_catalog_from_samples(request: Request):
    _require_platform_settings(request)
    try:
        result = compile_catalog_from_samples(merge=True)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(
        request,
        "dev.form_catalog.compile",
        "success",
        f"forms={result.get('forms_updated')}",
    )
    return FormCatalogCompilePayload(**result)


@router.get("/api/dev/form-catalog/prompt-preview", response_model=FormCatalogPromptPreviewPayload)
async def preview_dev_form_catalog_prompt(request: Request):
    _require_platform_settings(request)
    samples = list_form_catalog_samples()
    ann_count = sum(len(s.get("annotations") or []) for s in samples)
    return FormCatalogPromptPreviewPayload(
        prompt_preview=build_learning_vision_prompt(),
        annotation_count=ann_count,
        sample_count=len(samples),
    )


