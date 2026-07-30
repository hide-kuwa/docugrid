"""DocuGrid API — AI prompt studio routes."""

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


def _normalize_prompt_scope(scope: str, *, allow_global: bool) -> str:
    normalized = (scope or "firm").strip().lower()
    if normalized not in ("firm", "global"):
        raise HTTPException(status_code=400, detail="scope must be firm or global")
    if normalized == "global" and not allow_global:
        raise HTTPException(status_code=403, detail="global scope requires platform settings")
    return normalized


def _prompt_list_payload(firm_id: str) -> AiPromptListPayload:
    return AiPromptListPayload(prompts=[AiPromptDefinitionItem(**row) for row in list_prompt_definitions(firm_id)])


@router.get("/api/ai-prompts", response_model=AiPromptListPayload)
async def list_firm_ai_prompts(request: Request):
    """Firm-scoped prompt templates (settings.manage)."""
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    return _prompt_list_payload(ctx.firm_id)


@router.put("/api/ai-prompts/{key}", response_model=AiPromptDefinitionItem)
async def update_firm_ai_prompt(request: Request, key: str, body: AiPromptUpdateBody):
    _require_permission(request, "settings.manage")
    if key not in PROMPT_KEYS:
        raise HTTPException(status_code=400, detail="invalid_prompt_key")
    ctx = _auth_context(request)
    try:
        save_prompt_template(ctx.firm_id, key, body.template, scope="firm")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    template, source = get_prompt_template(ctx.firm_id, key)
    _log_audit_event(request, "ai_prompts.put", "success", f"key={key} scope=firm")
    return AiPromptDefinitionItem(
        key=key,
        template=template,
        source=source,
        variables=list(PROMPT_VARIABLES.get(key, [])),
        builtin_default=builtin_default(key),
    )


@router.post("/api/ai-prompts/{key}/reset", response_model=AiPromptDefinitionItem)
async def reset_firm_ai_prompt(request: Request, key: str):
    _require_permission(request, "settings.manage")
    if key not in PROMPT_KEYS:
        raise HTTPException(status_code=400, detail="invalid_prompt_key")
    ctx = _auth_context(request)
    reset_prompt_template(ctx.firm_id, key, scope="firm")
    template, source = get_prompt_template(ctx.firm_id, key)
    _log_audit_event(request, "ai_prompts.reset", "success", f"key={key} scope=firm")
    return AiPromptDefinitionItem(
        key=key,
        template=template,
        source=source,
        variables=list(PROMPT_VARIABLES.get(key, [])),
        builtin_default=builtin_default(key),
    )


@router.post("/api/ai-prompts/test", response_model=AiPromptTestResultPayload)
async def test_firm_ai_prompt(
    request: Request,
    file: UploadFile = File(...),
    key: str = Form(...),
    draft_template: str = Form(""),
    candidates: str = Form(""),
):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    return await _run_prompt_test(request, ctx, file, key, draft_template, candidates)


@router.get("/api/dev/ai-prompts", response_model=AiPromptListPayload)
async def list_dev_ai_prompts(request: Request):
    _require_platform_settings(request)
    ctx = _auth_context(request)
    return _prompt_list_payload(ctx.firm_id)


@router.put("/api/dev/ai-prompts/{key}", response_model=AiPromptDefinitionItem)
async def update_dev_ai_prompt(request: Request, key: str, body: AiPromptUpdateBody):
    _require_platform_settings(request)
    if key not in PROMPT_KEYS:
        raise HTTPException(status_code=400, detail="invalid_prompt_key")
    ctx = _auth_context(request)
    scope = _normalize_prompt_scope(body.scope, allow_global=True)
    try:
        save_prompt_template(ctx.firm_id, key, body.template, scope=scope)  # type: ignore[arg-type]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    template, source = get_prompt_template(ctx.firm_id, key)
    _log_audit_event(request, "dev.ai_prompts.put", "success", f"key={key} scope={scope}")
    return AiPromptDefinitionItem(
        key=key,
        template=template,
        source=source,
        variables=list(PROMPT_VARIABLES.get(key, [])),
        builtin_default=builtin_default(key),
    )


@router.post("/api/dev/ai-prompts/{key}/reset", response_model=AiPromptDefinitionItem)
async def reset_dev_ai_prompt(request: Request, key: str, scope: str = Query("global")):
    _require_platform_settings(request)
    if key not in PROMPT_KEYS:
        raise HTTPException(status_code=400, detail="invalid_prompt_key")
    ctx = _auth_context(request)
    normalized_scope = _normalize_prompt_scope(scope, allow_global=True)
    reset_prompt_template(ctx.firm_id, key, scope=normalized_scope)  # type: ignore[arg-type]
    template, resolved_source = get_prompt_template(ctx.firm_id, key)
    _log_audit_event(request, "dev.ai_prompts.reset", "success", f"key={key} scope={normalized_scope}")
    return AiPromptDefinitionItem(
        key=key,
        template=template,
        source=resolved_source,
        variables=list(PROMPT_VARIABLES.get(key, [])),
        builtin_default=builtin_default(key),
    )


@router.post("/api/dev/ai-prompts/test", response_model=AiPromptTestResultPayload)
async def test_dev_ai_prompt(
    request: Request,
    file: UploadFile = File(...),
    key: str = Form(...),
    draft_template: str = Form(""),
    candidates: str = Form(""),
):
    _require_platform_settings(request)
    ctx = _auth_context(request)
    return await _run_prompt_test(request, ctx, file, key, draft_template, candidates)


async def _run_prompt_test(
    request: Request,
    ctx: AuthContext,
    file: UploadFile,
    key: str,
    draft_template: str,
    candidates: str,
) -> AiPromptTestResultPayload:
    if key not in PROMPT_KEYS:
        raise HTTPException(status_code=400, detail="invalid_prompt_key")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    cfg = _load_system_config(ctx.firm_id)
    gemini_key = get_gemini_key(ctx.firm_id) if cfg.ai_gemini_enabled else None
    openai_key = get_openai_key(ctx.firm_id) if cfg.ai_openai_enabled else None
    if not gemini_key and not openai_key:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "no_api_key",
                "message": "Gemini または OpenAI の API キーを設定し、有効化してください。",
            },
        )

    result = execute_prompt_test(
        firm_id=ctx.firm_id,
        key=key,
        content=content,
        filename=file.filename or "sample.pdf",
        draft_template=(draft_template or "").strip() or None,
        candidates_json=(candidates or "").strip() or None,
        gemini_key=gemini_key,
        gemini_model=cfg.ai_gemini_model,
        openai_key=openai_key,
        openai_model=cfg.ai_openai_model,
        prefer_gemini=bool(gemini_key),
    )
    _log_audit_event(
        request,
        "ai_prompts.test",
        "success" if not result.get("error") else "partial",
        f"key={key} engine={result.get('engine')}",
    )
    return AiPromptTestResultPayload(**result)
