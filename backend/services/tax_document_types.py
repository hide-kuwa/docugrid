"""申告パッケージ用書類種別マスタ（TaxDocumentType）。"""

from __future__ import annotations

from typing import Dict, List, Optional

TAX_DOCUMENT_TYPES: List[str] = [
    "TAX_PROXY",
    "CORP_TAX_RETURN",
    "ACCOUNT_DETAILS",
    "CORP_SUMMARY",
    "TRIAL_BALANCE",
    "CONSUMPTION_TAX",
    "UNKNOWN",
]

LABELS_JA: Dict[str, str] = {
    "TAX_PROXY": "税務代理権限証書",
    "CORP_TAX_RETURN": "法人税申告書",
    "ACCOUNT_DETAILS": "勘定科目内訳明細書",
    "CORP_SUMMARY": "法人事業概況説明書",
    "TRIAL_BALANCE": "試算表・決算報告書",
    "CONSUMPTION_TAX": "消費税申告書",
    "UNKNOWN": "未分類",
}

SLOT_ID_BY_TYPE: Dict[str, str] = {
    "TAX_PROXY": "tax_proxy",
    "CORP_TAX_RETURN": "tax_return_corporate",
    "ACCOUNT_DETAILS": "account_details",
    "CORP_SUMMARY": "corp_summary",
    "TRIAL_BALANCE": "financial_report",
    "CONSUMPTION_TAX": "tax_return_consumption",
}

DEFAULT_SORT_ORDER: List[str] = [
    "TAX_PROXY",
    "CORP_TAX_RETURN",
    "ACCOUNT_DETAILS",
    "CORP_SUMMARY",
    "TRIAL_BALANCE",
    "CONSUMPTION_TAX",
]

# ルール分類ラベル → TaxDocumentType
LABEL_TO_TYPE: Dict[str, str] = {
    "税務代理権限証書": "TAX_PROXY",
    "法人税申告書": "CORP_TAX_RETURN",
    "勘定科目内訳明細書": "ACCOUNT_DETAILS",
    "法人事業概況説明書": "CORP_SUMMARY",
    "消費税申告書": "CONSUMPTION_TAX",
    "決算報告書": "TRIAL_BALANCE",
    "月次試算表": "TRIAL_BALANCE",
    "総勘定元帳": "ACCOUNT_DETAILS",
}

# キーワードヒント（ファイル名・テキスト）
KEYWORD_TO_TYPE: List[tuple[str, str]] = [
    ("税務代理", "TAX_PROXY"),
    ("代理権限", "TAX_PROXY"),
    ("法人税", "CORP_TAX_RETURN"),
    ("別表", "CORP_TAX_RETURN"),
    ("内訳明細", "ACCOUNT_DETAILS"),
    ("勘定科目", "ACCOUNT_DETAILS"),
    ("概況説明", "CORP_SUMMARY"),
    ("事業概況", "CORP_SUMMARY"),
    ("試算表", "TRIAL_BALANCE"),
    ("決算報告", "TRIAL_BALANCE"),
    ("貸借対照表", "TRIAL_BALANCE"),
    ("消費税", "CONSUMPTION_TAX"),
]

AI_CLASSIFICATION_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "identifiedType": {
            "type": "string",
            "enum": TAX_DOCUMENT_TYPES,
        },
        "confidence": {"type": "number"},
        "reason": {"type": "string"},
    },
    "required": ["identifiedType", "confidence"],
    "additionalProperties": False,
}


def normalize_type(value: Optional[str]) -> str:
    v = (value or "").strip().upper()
    return v if v in TAX_DOCUMENT_TYPES else "UNKNOWN"


def label_for_type(doc_type: str) -> str:
    return LABELS_JA.get(doc_type, LABELS_JA["UNKNOWN"])


def slot_id_for_type(doc_type: str) -> Optional[str]:
    return SLOT_ID_BY_TYPE.get(doc_type)


def infer_type_from_text(text: str, filename: Optional[str] = None) -> tuple[str, float, str]:
    """ルールベースで TaxDocumentType を推定。"""
    haystack = f"{text or ''}\n{filename or ''}"
    if not haystack.strip():
        return "UNKNOWN", 0.0, "テキスト・ファイル名なし"

    best_type = "UNKNOWN"
    best_hits = 0
    matched_kw: List[str] = []
    for kw, doc_type in KEYWORD_TO_TYPE:
        if kw in haystack:
            matched_kw.append(kw)
            if doc_type != "UNKNOWN":
                hits = sum(1 for k, t in KEYWORD_TO_TYPE if k in haystack and t == doc_type)
                if hits > best_hits:
                    best_hits = hits
                    best_type = doc_type

    if best_hits == 0:
        return "UNKNOWN", 0.0, "キーワード不一致"

    confidence = min(1.0, 0.35 + best_hits * 0.2)
    return best_type, round(confidence, 3), f"キーワード: {', '.join(matched_kw[:4])}"


def type_from_classify_label(label: Optional[str]) -> str:
    if not label:
        return "UNKNOWN"
    return LABEL_TO_TYPE.get(label.strip(), "UNKNOWN")
