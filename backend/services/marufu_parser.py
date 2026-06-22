"""まるふ・控除申告書 OCR から構造化フィールドを抽出（P-W3 原型）。"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

_DEPENDENT_PATTERNS = [
    re.compile(r"扶養親族[^\d]{0,6}(\d+)\s*人"),
    re.compile(r"扶養[^\d]{0,4}(\d+)\s*人"),
    re.compile(r"控除対象扶養親族[^\d]{0,6}(\d+)"),
]

_SPOUSE_PATTERNS = [
    re.compile(r"配偶者控除"),
    re.compile(r"配偶者特別控除"),
    re.compile(r"マル基配"),
]

_NAME_PATTERNS = [
    re.compile(r"(?:氏名|本人)[\s:：]*([^\n\r]{2,20})"),
    re.compile(r"給与所得者[^\n]{0,10}氏名[^\n]{0,4}([^\n\r]{2,20})"),
]

_INSURANCE_PATTERNS = [
    re.compile(r"生命保険[^\d]{0,12}([\d,]+)\s*円?"),
    re.compile(r"地震保険[^\d]{0,12}([\d,]+)\s*円?"),
    re.compile(r"社会保険[^\d]{0,12}([\d,]+)\s*円?"),
]


def _parse_yen(raw: str) -> Optional[int]:
    try:
        return int(raw.replace(",", "").replace("，", ""))
    except ValueError:
        return None


def parse_marufu_text(text: str) -> Dict[str, Any]:
    """マル扶 / マル基配 / マル保系のフィールド推定。"""
    doc_type = "marufu_unknown"
    if "マル基配" in text or "配偶者" in text and "控除" in text:
        doc_type = "marufu_spouse"
    elif "マル保" in text or "保険料控除" in text:
        doc_type = "marufu_insurance"
    elif "マル扶" in text or "扶養控除" in text:
        doc_type = "marufu_dependents"

    dependent_count: Optional[int] = None
    for pat in _DEPENDENT_PATTERNS:
        m = pat.search(text)
        if m:
            try:
                dependent_count = int(m.group(1))
                break
            except ValueError:
                continue

    spouse_deduction = any(p.search(text) for p in _SPOUSE_PATTERNS)
    spouse_special = "配偶者特別控除" in text or "配偶者特別" in text

    employee_name: Optional[str] = None
    for pat in _NAME_PATTERNS:
        m = pat.search(text)
        if m:
            name = m.group(1).strip()
            if len(name) >= 2:
                employee_name = name
                break

    deductions: Dict[str, Optional[int]] = {}
    for key, label in (
        ("life_insurance_yen", "生命保険"),
        ("earthquake_insurance_yen", "地震保険"),
        ("social_insurance_yen", "社会保険"),
    ):
        pat = re.compile(rf"{label}[^\d]{{0,12}}([\d,]+)\s*円?")
        m = pat.search(text)
        deductions[key] = _parse_yen(m.group(1)) if m else None

    disability = "障害者" in text or "障害" in text
    widow = "寡婦" in text
    single_parent = "ひとり親" in text

    issues: List[str] = []
    if dependent_count is None and doc_type == "marufu_dependents":
        issues.append("扶養親族の人数を OCR から特定できませんでした。")
    if doc_type == "marufu_spouse" and not spouse_deduction:
        issues.append("配偶者控除・配偶者特別控除の記載を確認してください。")

    return {
        "doc_type": doc_type,
        "employee_name": employee_name,
        "dependent_count": dependent_count,
        "spouse_deduction": spouse_deduction and not spouse_special,
        "spouse_special_deduction": spouse_special,
        "disability": disability,
        "widow": widow,
        "single_parent": single_parent,
        **deductions,
        "issues": issues,
    }


def build_marufu_from_manual(
    *,
    dependent_count: Optional[int] = None,
    life_insurance_yen: Optional[int] = None,
    spouse_deduction: Optional[bool] = None,
) -> Dict[str, Any]:
    """手入力フィールドからまるふ解析結果を組み立てる。"""
    issues: List[str] = []
    if dependent_count is None:
        issues.append("扶養親族の人数を入力してください。")
    return {
        "doc_type": "marufu_dependents",
        "employee_name": None,
        "dependent_count": dependent_count,
        "spouse_deduction": bool(spouse_deduction),
        "spouse_special_deduction": False,
        "disability": False,
        "widow": False,
        "single_parent": False,
        "life_insurance_yen": life_insurance_yen,
        "earthquake_insurance_yen": None,
        "social_insurance_yen": None,
        "issues": issues,
    }


def payroll_patch_from_marufu(parsed: Dict[str, Any]) -> Dict[str, Any]:
    """従業員マスタ更新用のパッチを生成。"""
    patch: Dict[str, Any] = {}
    if parsed.get("employee_name"):
        patch["name"] = parsed["employee_name"]
    if parsed.get("dependent_count") is not None:
        patch["dependent_count"] = parsed["dependent_count"]
    if parsed.get("spouse_deduction"):
        patch["spouse_deduction"] = True
    if parsed.get("spouse_special_deduction"):
        patch["spouse_deduction"] = True
        patch["notes"] = "配偶者特別控除（OCR）"
    notes_parts: List[str] = []
    if parsed.get("disability"):
        notes_parts.append("障害者控除")
    if parsed.get("widow"):
        notes_parts.append("寡婦控除")
    if parsed.get("single_parent"):
        notes_parts.append("ひとり親控除")
    if notes_parts:
        patch["notes"] = "・".join(notes_parts)
    return patch
