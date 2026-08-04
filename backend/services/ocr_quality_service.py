"""I3 OCR quality — escalate to Vision only when local classify is weak.

Reuses existing catalog / text AI / Vision paths. Vision is capped at 2 pages
(see vision_classifier._MAX_VISION_PAGES). Never runs full-document VLM.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from services.ai_prompts import PROMPT_KEY_CLASSIFY_TEXT, PROMPT_KEY_CLASSIFY_VISION, get_prompt_template
from services.ai_usage_service import (
    check_ai_allowed,
    estimate_tokens_from_text,
    record_ai_usage,
)
from services.firm_settings import get_gemini_key, get_openai_key, load_system_config_raw

logger = logging.getLogger(__name__)

LOW_CONFIDENCE = 0.6
VISION_CONFIDENCE = 0.45
WEAK_TEXT_LEN = 40
VISION_TOKEN_FLOOR = 800


def needs_vision_escalate(
    *,
    confidence: float,
    text: str,
    text_engine: str,
) -> bool:
    """True when text is unusable / sparse or confidence is still low after boosts."""
    conf = float(confidence or 0)
    text_len = len((text or "").strip())
    if (text_engine or "") in ("none", "") or text_len < WEAK_TEXT_LEN:
        return True
    return conf < VISION_CONFIDENCE


def _cfg_bool(raw: dict, key: str, default: bool = False) -> bool:
    if key not in raw:
        return default
    return bool(raw.get(key))


def _match_candidate(
    candidates: list[dict[str, Any]],
    identified_type: str,
) -> Optional[dict[str, Any]]:
    """Best-effort map TaxDocumentType / reason keywords onto slot candidates."""
    needle = (identified_type or "").strip().upper()
    if not needle or needle == "UNKNOWN" or not candidates:
        return None
    for c in candidates:
        cid = str(c.get("id") or "").upper()
        label = str(c.get("label") or "").upper()
        if needle in cid or needle in label or cid in needle or label in needle:
            return {
                "id": c.get("id"),
                "label": c.get("label"),
                "score": 3,
            }
    # Partial token overlap (e.g. WITHHOLDING vs 源泉)
    tokens = [t for t in needle.replace("-", "_").split("_") if len(t) >= 3]
    for c in candidates:
        blob = f"{c.get('id') or ''} {c.get('label') or ''}".upper()
        if any(t in blob for t in tokens):
            return {"id": c.get("id"), "label": c.get("label"), "score": 2}
    return None


def apply_ocr_quality_boost(
    *,
    firm_id: str,
    client_id: str,
    content: bytes,
    filename: str,
    candidates: list[dict[str, Any]],
    classify_result: dict[str, Any],
    full_text: str,
    text_engine: str,
) -> dict[str, Any]:
    """Mutate-and-return classify_result with catalog → text AI → Vision (if needed)."""
    result = dict(classify_result)
    conf = float(result.get("confidence") or 0)
    excerpt = str(result.get("text_excerpt") or full_text or "")[:400]
    raw = load_system_config_raw(firm_id) or {}
    if not _cfg_bool(raw, "ocr_auto_extract_enabled", True):
        result["vision_escalated"] = False
        return result

    openai_on = _cfg_bool(raw, "ai_openai_enabled", False)
    gemini_on = _cfg_bool(raw, "ai_gemini_enabled", False)
    openai_model = str(raw.get("ai_openai_model") or "gpt-4o-mini")
    gemini_model = str(raw.get("ai_gemini_model") or "gemini-2.5-flash")
    openai_key = get_openai_key(firm_id) if openai_on else None
    gemini_key = get_gemini_key(firm_id) if gemini_on else None

    # Catalog boost (no AI tokens)
    if conf < LOW_CONFIDENCE:
        try:
            from services.form_catalog_classify import try_catalog_slot_classify

            catalog_boost = try_catalog_slot_classify(content, filename, candidates)
            if catalog_boost and float(catalog_boost.get("confidence") or 0) > conf:
                result["best"] = catalog_boost["best"]
                result["confidence"] = catalog_boost["confidence"]
                result["engine"] = "form_catalog"
                result["ai_reason"] = catalog_boost.get("reason")
                conf = float(catalog_boost["confidence"])
        except Exception:
            logger.exception("catalog boost failed")

    gate = check_ai_allowed(firm_id, client_id)
    if not gate.get("allowed"):
        result["vision_escalated"] = False
        result["ai_gate"] = gate
        return result

    text_prompt_tpl, _ = get_prompt_template(firm_id, PROMPT_KEY_CLASSIFY_TEXT)
    used_ai = False

    if conf < LOW_CONFIDENCE and openai_key:
        try:
            from services.ai_classifier import ai_classify_boost

            boost = ai_classify_boost(
                excerpt,
                filename,
                candidates,
                openai_key,
                openai_model,
                prompt_template=text_prompt_tpl,
            )
            if boost and float(boost.get("confidence") or 0) > conf:
                result["best"] = boost["best"]
                result["confidence"] = boost["confidence"]
                result["engine"] = "openai"
                result["ai_reason"] = boost.get("reason")
                conf = float(boost["confidence"])
                used_ai = True
        except Exception:
            logger.exception("openai text boost failed")

    if conf < LOW_CONFIDENCE and gemini_key:
        try:
            from services.ai_classifier import gemini_classify_boost

            boost = gemini_classify_boost(
                excerpt,
                filename,
                candidates,
                gemini_key,
                gemini_model,
                prompt_template=text_prompt_tpl,
            )
            if boost and float(boost.get("confidence") or 0) > conf:
                result["best"] = boost["best"]
                result["confidence"] = boost["confidence"]
                result["engine"] = "gemini"
                result["ai_reason"] = boost.get("reason")
                conf = float(boost["confidence"])
                used_ai = True
        except Exception:
            logger.exception("gemini text boost failed")

    vision_escalated = False
    use_vision = bool(
        (openai_key or gemini_key)
        and needs_vision_escalate(confidence=conf, text=full_text or excerpt, text_engine=text_engine)
    )
    if use_vision:
        try:
            from services.vision_classifier import classify_tax_document

            vision_tpl, _ = get_prompt_template(firm_id, PROMPT_KEY_CLASSIFY_VISION)
            vision = classify_tax_document(
                content,
                filename,
                text_excerpt=excerpt,
                openai_key=openai_key,
                openai_model=openai_model,
                gemini_key=gemini_key,
                gemini_model=gemini_model,
                use_openai_vision=bool(openai_key),
                use_gemini_vision=bool(gemini_key),
                prompt_template=vision_tpl,
            )
            v_conf = float(vision.get("confidence") or 0)
            if v_conf > conf:
                matched = _match_candidate(candidates, str(vision.get("identifiedType") or ""))
                if matched:
                    result["best"] = matched
                result["confidence"] = v_conf
                result["engine"] = str(vision.get("engine") or "vision")
                result["ai_reason"] = vision.get("reason")
                result["vision_type"] = vision.get("identifiedType")
                conf = v_conf
                vision_escalated = True
                used_ai = True
            else:
                result["vision_type"] = vision.get("identifiedType")
                result["vision_skipped_reason"] = "not_better_than_current"
        except Exception:
            logger.exception("vision escalate failed firm=%s client=%s", firm_id, client_id)

    result["vision_escalated"] = vision_escalated

    if used_ai:
        tokens = max(VISION_TOKEN_FLOOR if vision_escalated else 0, estimate_tokens_from_text(excerpt))
        try:
            usage = record_ai_usage(
                firm_id,
                client_id,
                tokens,
                feature="ocr_vision" if vision_escalated else "ocr_classify",
            )
            result["aiUsage"] = usage.get("clientUsage")
        except Exception:
            logger.exception("record_ai_usage failed")
    elif gate.get("announce"):
        result["aiAnnouncement"] = gate.get("message")

    return result
