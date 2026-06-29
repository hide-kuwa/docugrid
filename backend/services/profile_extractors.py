"""スロット PDF テキストから profile フィールドを抽出（ルールベース v1）。

定款・謄本は `data/extraction_schemas/*.json` のスキーマ駆動。
"""

from __future__ import annotations

import re
from typing import Callable, Dict, Tuple

from services.document_extraction_schema import extract_from_schema, has_extraction_schema

Extracted = Dict[str, Tuple[str, float]]


def _first_match(pattern: str, text: str, flags: int = 0) -> Tuple[str, float] | None:
    m = re.search(pattern, text, flags)
    if not m:
        return None
    val = m.group(1).strip()
    if not val:
        return None
    return val, 0.85


def _digits_yen(pattern: str, text: str) -> Tuple[str, float] | None:
    m = re.search(pattern, text)
    if not m:
        return None
    raw = m.group(1)
    digits = re.sub(r"[^\d]", "", raw)
    if not digits:
        return None
    return f"{int(digits):,}円", 0.8


def extract_corporate_registry(text: str) -> Extracted:
    out: Extracted = {}
    corp = re.search(r"(?:法人番号|会社法人等番号)[^\d]{0,12}(\d{13})", text)
    if corp:
        out["corporate_number"] = (corp.group(1), 0.95)
    name = _first_match(
        r"(?:商\s*号|名\s*称|会社名)[\s　:：]*([^\n\r]{2,80})",
        text,
    )
    if name:
        out["customer_name"] = name
    addr = _first_match(
        r"(?:本店|所在地|本\s*店\s*所\s*在\s*地)[\s　:：]*([^\n\r]{4,120})",
        text,
    )
    if addr:
        out["head_office_address"] = addr
    cap = _digits_yen(r"資\s*本\s*金[\s　:：]*([0-9,\s]+(?:円)?)", text)
    if cap:
        out["capital"] = cap
    rep = _first_match(
        r"代表取締役[\s　]*([^\n\r（(]{2,40})",
        text,
    )
    if rep:
        val = re.sub(r"[\s　].*$", "", rep[0])
        out["representative_name"] = (val, rep[1])
    est = _first_match(
        r"設\s*立[\s　]*年[\s　]*月[\s　]*日[\s　:：]*(\d{4}年?\s*\d{1,2}月?\s*\d{1,2}日?)",
        text,
    )
    if est:
        out["established_date"] = est
    return out


def extract_articles_of_incorporation(text: str) -> Extracted:
    out: Extracted = {}
    name = _first_match(r"商\s*号[\s　:：]*([^\n\r]{2,80})", text)
    if name:
        out["customer_name"] = name
    cap = _digits_yen(r"資\s*本\s*金[\s　:：]*([0-9,\s]+(?:円)?)", text)
    if not cap:
        cap = _digits_yen(r"資\s*本\s*の\s*総\s*額[\s　:：]*([0-9,\s]+(?:円)?)", text)
    if cap:
        out["capital"] = cap
    addr = _first_match(
        r"本\s*店[\s　:：]*([^\n\r]{4,120})",
        text,
    )
    if addr:
        out["head_office_address"] = addr
    fiscal = _first_match(
        r"事\s*業\s*年\s*度[\s　:：]*([^\n\r]{2,40})",
        text,
    )
    if fiscal:
        out["fiscal_year_end_date"] = fiscal
    return out


def extract_shareholder_registry(text: str) -> Extracted:
    out: Extracted = {}
    issued = _digits_yen(r"発\s*行\s*済\s*株\s*式[\s　:：]*([0-9,\s]+)", text)
    if issued:
        out["issued_shares"] = issued
    count_match = re.search(r"株\s*主[\s　]*([0-9]{1,4})\s*名", text)
    if count_match:
        out["shareholder_count"] = (count_match.group(1), 0.75)
    elif "株主名簿" in text:
        lines = [ln for ln in text.splitlines() if ln.strip() and "株主" not in ln[:6]]
        if len(lines) >= 3:
            out["shareholder_count"] = (str(min(len(lines), 999)), 0.55)
    return out


def extract_tax_return_corporate(text: str) -> Extracted:
    out: Extracted = {}
    income = _digits_yen(
        r"課\s*税\s*所\s*得[\s　金額]*[\s　:：]*([0-9,\s]+)",
        text,
    )
    if income:
        out["profit_taxable_income"] = income
    revenue = _digits_yen(
        r"(?:売\s*上\s*金\s*額|当期\s*総\s*収\s*入\s*金\s*額|収\s*益\s*金\s*額)[\s　:：]*([0-9,\s]+)",
        text,
    )
    if revenue:
        out["_metric_annual_revenue"] = revenue
    return out


def extract_trial_balance(text: str) -> Extracted:
    """月次試算表 — 売上高等を metrics 用キーで返す。"""
    out: Extracted = {}
    sales = _digits_yen(r"売\s*上\s*(?:高|金額)?[\s　:：]*([0-9,\s]+)", text)
    if not sales:
        sales = _digits_yen(r"収\s*益[\s　:：]*([0-9,\s]+)", text)
    if sales:
        out["_metric_monthly_revenue"] = sales
    return out


def extract_financial_report(text: str) -> Extracted:
    out: Extracted = {}
    revenue = _digits_yen(r"売\s*上\s*(?:高|金額)[\s　:：]*([0-9,\s]+)", text)
    if revenue:
        out["_metric_annual_revenue"] = revenue
    profit = _digits_yen(r"(?:当期|税引前)?(?:純|当期)\s*利\s*益[\s　:：]*([0-9,\s]+)", text)
    if profit:
        out["_metric_annual_profit"] = profit
    net = _digits_yen(r"純\s*資\s*産[\s　:：]*([0-9,\s]+)", text)
    if net:
        out["_metric_net_assets"] = net
    return out


def flatten_extracted(extracted: Extracted) -> dict[str, str]:
    """confidence 付き抽出結果を profile 用 dict へ（_metric_* は除外）。"""
    return {
        k: v[0]
        for k, v in extracted.items()
        if not k.startswith("_metric_")
    }


def profile_fields_from_text(slot_id: str, text: str) -> dict[str, str]:
    return flatten_extracted(extract_profile_fields(slot_id, text))


def extract_tax_return_consumption(text: str) -> Extracted:
    out: Extracted = {}
    taxable = _digits_yen(
        r"課\s*税\s*標\s*準\s*額[\s　:：]*([0-9,\s]+)",
        text,
    )
    if taxable:
        out["_metric_consumption_taxable"] = taxable
    method = _first_match(
        r"(?:課\s*税\s*方\s*式|納\s*税\s*義\s*務\s*者\s*の\s*区\s*分)[\s　:：]*([^\n\r]{2,40})",
        text,
    )
    if method:
        out["consumption_tax"] = method
    return out


SLOT_EXTRACTORS: dict[str, Callable[[str], Extracted]] = {
    "corporate_registry": extract_corporate_registry,
    "articles_of_incorporation": extract_articles_of_incorporation,
    "shareholder_registry": extract_shareholder_registry,
    "tax_return_corporate": extract_tax_return_corporate,
    "tax_return_consumption": extract_tax_return_consumption,
    "monthly_trial_balance": extract_trial_balance,
    "ledger": lambda t: {},
    "financial_report": extract_financial_report,
}


def extract_profile_fields(slot_id: str, text: str) -> Extracted:
    if not text or len(text.strip()) < 8:
        return {}
    if has_extraction_schema(slot_id):
        return extract_from_schema(slot_id, text).extracted_with_confidence
    fn = SLOT_EXTRACTORS.get(slot_id)
    if not fn:
        return {}
    return fn(text)
