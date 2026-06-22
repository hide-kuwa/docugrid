"""キャプチャ画像/PDF の OCR・分類・監査パイプライン（G3 + P-W2 + E3）。"""

from __future__ import annotations

import io
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import fitz

from services.deduction_auditor import audit_deduction_certificate, audit_deduction_amounts
from services.doc_classifier import classify_text, extract_text_from_pdf
from services.expense_context import suggest_expense_context, build_expense_context_from_manual
from services.invoice_registry import audit_expense_invoice, verify_invoice_registration
from services.marufu_parser import parse_marufu_text, build_marufu_from_manual

CAPTURE_DOC_KEYWORDS: Dict[str, List[str]] = {
    "年末調整（マル扶）": ["扶養控除", "マル扶", "扶養親族", "源泉徴収", "給与所得"],
    "年末調整（マル基配）": ["配偶者控除", "配偶者特別控除", "マル基配", "配偶者の合計所得"],
    "年末調整（マル保）": ["マル保", "保険料控除申告", "生命保険料控除"],
    "生命保険控除証明書": ["生命保険", "保険料控除証明書", "証明額", "保険会社"],
    "地震保険控除証明書": ["地震保険", "旧長期損害保険", "証明額"],
    "給与台帳": ["給与", "賃金台帳", "源泉徴収簿", "社会保険料"],
    "経費領収書": ["領収書", "レシート", "合計", "税込", "インボイス", "適格請求書"],
    "請求書": ["請求書", "御請求", "請求金額", "登録番号"],
}

CAPTURE_ROUTE_HINTS: Dict[str, Tuple[str, str]] = {
    "給与台帳": ("month:1", "payroll_ledger"),
    "年末調整（マル扶）": ("year:1", "tax_return_corporate"),
    "年末調整（マル基配）": ("year:1", "tax_return_corporate"),
    "年末調整（マル保）": ("year:1", "tax_return_corporate"),
    "生命保険控除証明書": ("year:1", "tax_proxy"),
    "地震保険控除証明書": ("year:1", "tax_proxy"),
}


def _try_tesseract_image(content: bytes) -> Tuple[str, str]:
    try:
        import pytesseract  # type: ignore
        from PIL import Image  # type: ignore
    except Exception:
        return "", "none"
    try:
        img = Image.open(io.BytesIO(content))
        lang = "jpn"
        text = pytesseract.image_to_string(img, lang=lang)
        return (text or "").strip(), "tesseract"
    except Exception:
        return "", "none"


def extract_text_from_capture(content: bytes, mime_type: str) -> Tuple[str, str]:
    if mime_type == "application/pdf":
        return extract_text_from_pdf(content)
    if mime_type.startswith("image/"):
        return _try_tesseract_image(content)
    return "", "none"


def _candidates_for_category(category: str) -> List[Dict[str, str]]:
    if category == "marufu":
        labels = [
            "年末調整（マル扶）",
            "年末調整（マル基配）",
            "年末調整（マル保）",
            "給与台帳",
        ]
    elif category == "deduction_cert":
        labels = [
            "生命保険控除証明書",
            "地震保険控除証明書",
            "年末調整（マル保）",
        ]
    elif category == "expense":
        labels = ["経費領収書", "請求書"]
    else:
        labels = list(CAPTURE_DOC_KEYWORDS.keys())
    return [{"id": label, "label": label} for label in labels]


def _merge_manual_hints(
    *,
    category: str,
    client_id: str,
    text: str,
    manual_hints: Optional[Dict[str, Any]],
    expense_ctx: Optional[Dict[str, Any]],
    invoice_audit: Optional[Dict[str, Any]],
    marufu_parsed: Optional[Dict[str, Any]],
    audit: Dict[str, Any],
) -> tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]], Optional[Dict[str, Any]], Dict[str, Any]]:
    if not manual_hints:
        return expense_ctx, invoice_audit, marufu_parsed, audit

    if category == "expense":
        total = manual_hints.get("total_yen")
        attendees = manual_hints.get("attendees")
        if total is not None or attendees is not None:
            expense_ctx = build_expense_context_from_manual(
                client_id,
                total_yen=int(total) if total is not None else None,
                attendees=int(attendees) if attendees is not None else None,
            )
        reg = manual_hints.get("registration_number")
        if reg:
            verified = verify_invoice_registration(str(reg))
            invoice_audit = {
                "registration_number": verified.get("normalized"),
                "format_valid": verified.get("format_valid"),
                "checksum_valid": verified.get("checksum_valid"),
                "registration_status": verified.get("registration_status"),
                "issuer_name": verified.get("issuer_name"),
                "issues": list(verified.get("issues") or []),
                "suggestions": list(verified.get("suggestions") or []),
                "status": verified.get("status", "ok"),
            }
        audit = {
            "status": "ok",
            "issues": list(expense_ctx.get("issues") or []) + list(invoice_audit.get("issues") or [] if invoice_audit else []),
            "suggestions": [
                *( [expense_ctx["suggestion_text"]] if expense_ctx and expense_ctx.get("suggestion_text") else []),
                *((invoice_audit or {}).get("suggestions") or []),
            ],
        }
        if invoice_audit and invoice_audit.get("status") == "needs_review":
            audit["status"] = "needs_review"
        elif expense_ctx and expense_ctx.get("status") == "needs_review":
            audit["status"] = "needs_review"

    elif category in ("deduction_cert", "marufu"):
        proof = manual_hints.get("proof_yen")
        declared = manual_hints.get("declared_yen")
        dep = manual_hints.get("dependent_count")
        life = manual_hints.get("life_insurance_yen")
        spouse = manual_hints.get("spouse_deduction")
        if proof is not None or declared is not None:
            audit = audit_deduction_amounts(
                proof_yen=int(proof) if proof is not None else None,
                declared_yen=int(declared) if declared is not None else None,
                category=category,
            )
        if dep is not None or life is not None or spouse is not None:
            marufu_parsed = build_marufu_from_manual(
                dependent_count=int(dep) if dep is not None else None,
                life_insurance_yen=int(life) if life is not None else None,
                spouse_deduction=bool(spouse) if spouse is not None else None,
            )

    elif manual_hints.get("total_yen") is not None:
        synthetic = f"合計 {int(manual_hints['total_yen']):,}円"
        text = f"{text}\n{synthetic}".strip()

    return expense_ctx, invoice_audit, marufu_parsed, audit


def analyze_capture_content(
    *,
    content: bytes,
    mime_type: str,
    file_name: str,
    category: str,
    client_id: str,
    manual_hints: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    text, engine = extract_text_from_capture(content, mime_type)
    candidates = _candidates_for_category(category)
    for label, keywords in CAPTURE_DOC_KEYWORDS.items():
        if not any(c["label"] == label for c in candidates):
            candidates.append({"id": label, "label": label})

    classify = classify_text(text, file_name, candidates)
    classify["engine"] = engine
    classify["text_excerpt"] = (text or "")[:600]

    best_label = (classify.get("best") or {}).get("label")
    period_key: Optional[str] = None
    slot_id: Optional[str] = None
    if best_label and best_label in CAPTURE_ROUTE_HINTS:
        period_key, slot_id = CAPTURE_ROUTE_HINTS[best_label]

    audit: Dict[str, Any] = {"status": "ok", "issues": [], "suggestions": []}
    expense_ctx: Optional[Dict[str, Any]] = None
    invoice_audit: Optional[Dict[str, Any]] = None
    marufu_parsed: Optional[Dict[str, Any]] = None

    if category in ("deduction_cert", "marufu"):
        audit = audit_deduction_certificate(text, category)
        marufu_parsed = parse_marufu_text(text)
    elif category == "expense":
        expense_ctx = suggest_expense_context(client_id, text)
        invoice_audit = audit_expense_invoice(text)
        audit = {
            "status": "ok",
            "issues": list(expense_ctx.get("issues") or []) + list(invoice_audit.get("issues") or []),
            "suggestions": [
                *( [expense_ctx["suggestion_text"]] if expense_ctx.get("suggestion_text") else []),
                *(invoice_audit.get("suggestions") or []),
            ],
        }
        if invoice_audit.get("status") == "needs_review" or expense_ctx.get("status") == "needs_review":
            audit["status"] = "needs_review"

    expense_ctx, invoice_audit, marufu_parsed, audit = _merge_manual_hints(
        category=category,
        client_id=client_id,
        text=text,
        manual_hints=manual_hints,
        expense_ctx=expense_ctx,
        invoice_audit=invoice_audit,
        marufu_parsed=marufu_parsed,
        audit=audit,
    )

    all_issues = list(audit.get("issues") or [])
    all_suggestions = list(audit.get("suggestions") or [])
    if marufu_parsed:
        all_issues.extend(marufu_parsed.get("issues") or [])

    confidence = float(classify.get("confidence") or 0)
    status = "ok"
    pinned = False
    if all_issues:
        status = "needs_review"
        pinned = True
    elif confidence < 0.45 and not text:
        status = "needs_review"
        pinned = True
        all_issues.append("OCR で文字を読み取れませんでした。再撮影または PDF をご利用ください。")
    elif confidence < 0.45:
        status = "needs_review"
        pinned = True
        all_issues.append("書類種別の判定が低信頼です。内容を確認してください。")

    title = best_label or file_name
    if expense_ctx and expense_ctx.get("store_name"):
        title = str(expense_ctx["store_name"])
    if marufu_parsed and marufu_parsed.get("employee_name"):
        title = str(marufu_parsed["employee_name"])

    audit_message = all_issues[0] if all_issues else None
    if not audit_message and all_suggestions:
        audit_message = all_suggestions[0]

    return {
        "title": title,
        "status": status,
        "pinned": pinned,
        "audit_message": audit_message,
        "period_key": period_key,
        "slot_id": slot_id,
        "metadata": {
            "analyzed_at": datetime.utcnow().isoformat(),
            "ocr_engine": engine,
            "classify": classify,
            "deduction_audit": audit if category in ("deduction_cert", "marufu") else None,
            "expense_context": expense_ctx,
            "invoice_audit": invoice_audit,
            "marufu_parsed": marufu_parsed,
            "manual_hints": manual_hints,
            "issues": all_issues,
            "suggestions": all_suggestions,
        },
    }


def reaudit_capture_metadata(
    *,
    metadata: Dict[str, Any],
    category: str,
    client_id: str,
    overrides: Dict[str, Any],
) -> Dict[str, Any]:
    """既存 metadata に手入力 overrides をマージして監査結果を再計算。"""
    merged_hints = {**(metadata.get("manual_hints") or {}), **overrides}
    expense_ctx = metadata.get("expense_context")
    invoice_audit = metadata.get("invoice_audit")
    marufu_parsed = metadata.get("marufu_parsed")
    audit = metadata.get("deduction_audit") or {"status": "ok", "issues": [], "suggestions": []}

    expense_ctx, invoice_audit, marufu_parsed, audit = _merge_manual_hints(
        category=category,
        client_id=client_id,
        text="",
        manual_hints=merged_hints,
        expense_ctx=expense_ctx,
        invoice_audit=invoice_audit,
        marufu_parsed=marufu_parsed,
        audit=audit if isinstance(audit, dict) else {"status": "ok", "issues": [], "suggestions": []},
    )

    all_issues = list(audit.get("issues") or [])
    if marufu_parsed:
        all_issues.extend(marufu_parsed.get("issues") or [])
    if expense_ctx:
        all_issues.extend(expense_ctx.get("issues") or [])
    if invoice_audit:
        all_issues.extend(invoice_audit.get("issues") or [])

    all_suggestions = list(audit.get("suggestions") or [])
    if expense_ctx and expense_ctx.get("suggestion_text"):
        all_suggestions.insert(0, expense_ctx["suggestion_text"])

    status = "ok"
    pinned = False
    if all_issues:
        status = "needs_review"
        pinned = True

    audit_message = all_issues[0] if all_issues else None
    if not audit_message and all_suggestions:
        audit_message = all_suggestions[0]

    return {
        "status": status,
        "pinned": pinned,
        "audit_message": audit_message,
        "metadata": {
            **metadata,
            "analyzed_at": datetime.utcnow().isoformat(),
            "deduction_audit": audit if category in ("deduction_cert", "marufu") else metadata.get("deduction_audit"),
            "expense_context": expense_ctx,
            "invoice_audit": invoice_audit,
            "marufu_parsed": marufu_parsed,
            "manual_hints": merged_hints,
            "issues": all_issues,
            "suggestions": all_suggestions,
        },
    }
