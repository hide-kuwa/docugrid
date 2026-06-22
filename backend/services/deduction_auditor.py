"""控除証明書・マル扶系書類の OCR テキスト突合（P-W2 原型）。"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

_AMOUNT_PATTERNS = [
    re.compile(r"(?:証明額|証明保険料|払込証明額)[^\d]{0,12}([\d,]+)\s*円?"),
    re.compile(r"(?:申告額|申告予定額|控除申告額)[^\d]{0,12}([\d,]+)\s*円?"),
    re.compile(r"(?:保険料|支払保険料)[^\d]{0,8}([\d,]+)\s*円"),
]

_INVOICE_PATTERN = re.compile(r"T\s*(\d{13})")


def _parse_yen(raw: str) -> Optional[int]:
    try:
        return int(raw.replace(",", "").replace("，", ""))
    except ValueError:
        return None


def extract_amounts(text: str) -> Dict[str, Optional[int]]:
    """証明額・申告額らしき数字を抽出（ヒューリスティック）。"""
    proof: Optional[int] = None
    declared: Optional[int] = None
    for pat in _AMOUNT_PATTERNS:
        for m in pat.finditer(text):
            val = _parse_yen(m.group(1))
            if val is None:
                continue
            label = m.group(0)
            if "証明" in label and proof is None:
                proof = val
            elif "申告" in label and declared is None:
                declared = val
    if proof is None:
        generic = re.findall(r"([\d,]{4,})\s*円", text)
        if generic:
            proof = _parse_yen(generic[0])
    return {"proof_yen": proof, "declared_yen": declared}


def audit_deduction_certificate(text: str, category: str) -> Dict[str, Any]:
    """申告額 vs 証明額の突合とインボイス番号の抽出。"""
    amounts = extract_amounts(text)
    proof = amounts.get("proof_yen")
    declared = amounts.get("declared_yen")
    issues: List[str] = []
    suggestions: List[str] = []

    if category in ("deduction_cert", "marufu"):
        if proof is None:
            issues.append("証明額を OCR から読み取れませんでした。手入力で確認してください。")
        if declared is not None and proof is not None and declared != proof:
            issues.append(
                f"申告額（{declared:,}円）と証明額（{proof:,}円）が一致しません。"
            )
            suggestions.append(f"控除額の修正案: {proof:,}円（証明額に合わせる）")
        elif proof is not None and declared is None:
            suggestions.append(f"申告額の候補: {proof:,}円（証明額ベース）")

    invoice_match = _INVOICE_PATTERN.search(text)
    invoice_number = f"T{invoice_match.group(1)}" if invoice_match else None

    doc_kind = "unknown"
    if "生命保険" in text:
        doc_kind = "life_insurance"
    elif "地震保険" in text:
        doc_kind = "earthquake_insurance"
    elif "社会保険" in text:
        doc_kind = "social_insurance"
    elif "扶養控除" in text or "マル扶" in text or "扶養親族" in text:
        doc_kind = "marufu"
    elif "配偶者" in text and "控除" in text:
        doc_kind = "marufu_spouse"

    status = "ok"
    if issues:
        status = "needs_review"

    return {
        "doc_kind": doc_kind,
        "proof_yen": proof,
        "declared_yen": declared,
        "invoice_number": invoice_number,
        "issues": issues,
        "suggestions": suggestions,
        "status": status,
    }


def audit_deduction_amounts(
    *,
    proof_yen: Optional[int],
    declared_yen: Optional[int],
    category: str,
) -> Dict[str, Any]:
    """手入力の証明額・申告額から突合結果を生成。"""
    issues: List[str] = []
    suggestions: List[str] = []

    if category in ("deduction_cert", "marufu"):
        if proof_yen is None:
            issues.append("証明額が未入力です。")
        if declared_yen is not None and proof_yen is not None and declared_yen != proof_yen:
            issues.append(
                f"申告額（{declared_yen:,}円）と証明額（{proof_yen:,}円）が一致しません。"
            )
            suggestions.append(f"控除額の修正案: {proof_yen:,}円（証明額に合わせる）")
        elif proof_yen is not None and declared_yen is None:
            suggestions.append(f"申告額の候補: {proof_yen:,}円（証明額ベース）")

    status = "needs_review" if issues else "ok"
    return {
        "doc_kind": "manual",
        "proof_yen": proof_yen,
        "declared_yen": declared_yen,
        "invoice_number": None,
        "issues": issues,
        "suggestions": suggestions,
        "status": status,
    }
