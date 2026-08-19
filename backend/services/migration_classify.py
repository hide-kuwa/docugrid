"""初回整理向けの段階的分類（月次 AI 枠は使わない）。"""

from __future__ import annotations

from typing import Any, Callable, Optional

from services.ai_usage_service import estimate_tokens_from_text
from services.doc_classifier import classify_pdf, extract_text_from_pdf
from services.form_catalog_classify import classify_pdf_for_tax_package, try_catalog_slot_classify
from services.migration_aliases import global_slot_hint_from_path
from services.tax_document_types import infer_type_from_text, slot_id_for_type

AUTO_PLACE_THRESHOLD = 0.6

VisionMode = str  # "off" | "auto" | "on"


def classify_migration_pdf(
    firm_id: str,
    content: bytes,
    filename: str,
    *,
    slot_candidates: list[dict[str, str]],
    cfg: dict[str, Any],
    openai_key: Optional[str],
    gemini_key: Optional[str],
    vision_prompt_tpl: Optional[str] = None,
    source_path: Optional[str] = None,
    vision_mode: str = "auto",
) -> dict[str, Any]:
    """path/filename 無料 → ルール/OCR → Vision（migration ウォレット）。"""
    fname = filename or "document.pdf"
    text, extract_engine = extract_text_from_pdf(content)
    excerpt = (text or "")[:400]

    # Tier 0: filename rules
    doc_type, rule_conf, rule_reason = infer_type_from_text(excerpt, fname)
    engine = extract_engine if extract_engine != "none" else "rules"
    confidence = float(rule_conf or 0)
    slot_id = slot_id_for_type(doc_type)
    reason = rule_reason
    vision_used = False
    tokens_charged = 0

    if source_path:
        global_hint = global_slot_hint_from_path(source_path)
        if global_hint:
            confidence = float(global_hint.get("confidence") or 0.88)
            slot_id = str(global_hint.get("slotId") or slot_id)
            doc_type = str(global_hint.get("identifiedType") or doc_type)
            engine = str(global_hint.get("engine") or "global_alias")
            reason = str(global_hint.get("reason") or "global_alias")

    # Tier 1: matrix slot classify when candidates provided
    if slot_candidates:
        slot_result = classify_pdf(content, fname, slot_candidates)
        slot_conf = float(slot_result.get("confidence") or 0)
        if slot_conf > confidence:
            best = slot_result.get("best") or {}
            confidence = slot_conf
            engine = str(slot_result.get("engine") or "rules")
            slot_id = str(best.get("id") or slot_id)
            reason = f"slot:{best.get('label')}"
            excerpt = str(slot_result.get("text_excerpt") or excerpt)

    catalog_boost = try_catalog_slot_classify(content, fname, slot_candidates)
    if catalog_boost and float(catalog_boost.get("confidence") or 0) > confidence:
        best = catalog_boost.get("best") or {}
        confidence = float(catalog_boost["confidence"])
        engine = "form_catalog"
        slot_id = str(best.get("id") or slot_id)
        reason = catalog_boost.get("reason") or reason

    use_openai_vision = bool(
        cfg.get("ocr_auto_extract_enabled")
        and cfg.get("ai_openai_enabled")
        and openai_key
    )
    use_gemini_vision = bool(
        cfg.get("ocr_auto_extract_enabled")
        and cfg.get("ai_gemini_enabled")
        and gemini_key
    )
    mode = (vision_mode or "auto").strip().lower()
    if mode not in ("off", "auto", "on"):
        mode = "auto"
    use_vision = use_openai_vision or use_gemini_vision
    if mode == "off":
        use_vision = False

    def _vision_classify() -> dict[str, Any]:
        nonlocal vision_used, tokens_charged
        if not use_vision:
            return {
                "identifiedType": doc_type,
                "confidence": confidence,
                "reason": reason,
                "engine": engine,
            }
        from services.vision_classifier import classify_tax_document

        vision_used = True
        result = classify_tax_document(
            content,
            fname,
            text_excerpt=excerpt,
            openai_key=openai_key,
            openai_model=str(cfg.get("ai_openai_model") or "gpt-4o-mini"),
            gemini_key=gemini_key,
            gemini_model=str(cfg.get("ai_gemini_model") or "gemini-2.5-flash"),
            use_openai_vision=use_openai_vision,
            use_gemini_vision=use_gemini_vision,
            prompt_template=vision_prompt_tpl,
        )
        usage = record_migration_usage(
            firm_id,
            estimate_tokens_from_text(excerpt),
            feature="migration_vision",
            vision=True,
        )
        tokens_charged += int(usage.get("tokens") or 0)
        return result

    if mode == "on" and use_vision:
        vision_result = _vision_classify()
        v_conf = float(vision_result.get("confidence") or 0)
        if v_conf > confidence:
            doc_type = str(vision_result.get("identifiedType") or doc_type)
            confidence = v_conf
            slot_id = slot_id_for_type(doc_type)
            engine = str(vision_result.get("engine") or "vision")
            reason = str(vision_result.get("reason") or reason)

    if confidence < AUTO_PLACE_THRESHOLD and mode != "off":
        rows = classify_pdf_for_tax_package(
            content,
            fname,
            vision_classify=_vision_classify,
        )
        if rows:
            top = rows[0]
            confidence = float(top.get("confidence") or 0)
            doc_type = str(top.get("identifiedType") or doc_type)
            slot_id = str(top.get("slotId") or slot_id_for_type(doc_type))
            engine = str(top.get("engine") or engine)
            reason = str(top.get("reason") or reason)
    elif vision_used:
        pass
    else:
        usage = record_migration_usage(
            firm_id,
            estimate_tokens_from_text(excerpt),
            feature="migration_classify",
            vision=False,
        )
        tokens_charged += int(usage.get("tokens") or 0)

    return {
        "identifiedType": doc_type,
        "slotId": slot_id,
        "confidence": confidence,
        "engine": engine,
        "reason": reason,
        "text_excerpt": excerpt[:200],
        "tokensCharged": tokens_charged,
        "visionUsed": vision_used,
        "visionMode": mode,
    }
