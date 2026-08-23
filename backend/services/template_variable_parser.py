"""ひな形本文から {{variable}} / 【日本語項目】 を抽出・置換する。"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Dict, Iterable, List, Optional, Set

TAG_PATTERN = re.compile(r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}")
JP_TAG_PATTERN = re.compile(r"【([^】]+)】")
TOKEN_PATTERN = re.compile(
    r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}|【([^】]+)】"
)

BUILTIN_CLIENT_TAGS = frozenset({"client_name", "client_id", "fiscal_month"})
BUILTIN_SYSTEM_TAGS = frozenset({"today", "wareki_today"})

_FW_DIGITS = str.maketrans("１２３４５６７８９０", "1234567890")
_PARTY_KANJI = {"甲": 1, "乙": 2, "丙": 3, "丁": 4}
_KANJI_FOR_PARTY = {1: "甲", 2: "乙", 3: "丙", 4: "丁"}
_FW_FOR_PARTY = "１２３４５６７８９"

# 長い別名を先に照合する
_FIELD_KIND_ALIASES: tuple[tuple[str, str], ...] = (
    ("和暦本日", "wareki_today"),
    ("本日", "wareki_today"),
    ("送付先住所", "mailing_address"),
    ("本店住所", "address"),
    ("所在地", "address"),
    ("法人名住所", "address"),
    ("顧問先名", "name"),
    ("顧客名", "name"),
    ("会社名", "name"),
    ("法人名", "name"),
    ("名称", "name"),
    ("住所", "address"),
    ("送付先", "mailing_address"),
    ("代表取締役氏名", "representative"),
    ("代表取締役", "representative"),
    ("代表者名", "representative"),
    ("代表者", "representative"),
    ("法人番号", "corporate_number"),
    ("電話番号", "phone"),
    ("電話", "phone"),
    ("決算月", "fiscal_month"),
    ("資本金", "capital"),
    ("敬称", "honorific"),
    ("宛名", "addressee"),
)

_ADDRESS_SUFFIXES = frozenset({"住所", "所在地", "本店住所"})

_KIND_TO_CURRENT = {
    "name": "client_name",
    "address": "head_office_address",
    "mailing_address": "mailing_address",
    "representative": "representative_name",
    "corporate_number": "corporate_number",
    "phone": "phone",
    "fiscal_month": "fiscal_month",
    "capital": "capital",
    "honorific": "honorific",
    "addressee": "addressee",
    "wareki_today": "wareki_today",
}

_KIND_TO_PARTY_SUFFIX = {
    "name": "name",
    "address": "address",
    "mailing_address": "mailing_address",
    "representative": "representative",
    "corporate_number": "corporate_number",
    "phone": "phone",
    "fiscal_month": "fiscal_month",
    "capital": "capital",
    "honorific": "honorific",
    "addressee": "addressee",
    "wareki_today": "wareki_today",
}

_NAME_ALIAS_STEMS = ("法人名", "顧問先名", "顧客名", "会社名")
_ADDR_ALIAS_STEMS = ("本店住所", "住所", "所在地")
_REP_ALIAS_STEMS = ("代表者名", "代表取締役", "代表者")


def format_wareki(day: date | None = None) -> str:
    """契約書向けの和暦（令和）。平成以前は西暦に倒す。"""
    d = day or date.today()
    if d >= date(2019, 5, 1):
        n = d.year - 2018
        year_text = "元" if n == 1 else str(n)
        return f"令和{year_text}年{d.month}月{d.day}日"
    if d >= date(1989, 1, 8):
        n = d.year - 1988
        year_text = "元" if n == 1 else str(n)
        return f"平成{year_text}年{d.month}月{d.day}日"
    return f"{d.year}年{d.month}月{d.day}日"


def honorific_for_client(client: dict) -> str:
    cat = str(client.get("category") or "").strip().lower()
    if cat in {"individual", "sole_prop", "個人", "個人事業"}:
        return "様"
    return "御中"


@dataclass(frozen=True)
class JpMergeField:
    inner: str
    kind: Optional[str]
    party: Optional[int]
    canonical: str


def _ascii_digits(text: str) -> str:
    return (text or "").translate(_FW_DIGITS)


def _resolve_field_kind(label: str) -> Optional[str]:
    text = (label or "").strip()
    if not text:
        return "name"
    for alias, kind in _FIELD_KIND_ALIASES:
        if text == alias:
            return kind
    return None


def canonical_for_kind(kind: str, party: Optional[int]) -> str:
    if party:
        suffix = _KIND_TO_PARTY_SUFFIX.get(kind, kind)
        return f"party{party}_{suffix}"
    return _KIND_TO_CURRENT.get(kind, kind)


def parse_jp_field(inner: str) -> JpMergeField:
    raw = (inner or "").strip()
    text = _ascii_digits(raw)
    party: Optional[int] = None
    kind: Optional[str] = None

    if text in _PARTY_KANJI:
        party = _PARTY_KANJI[text]
        kind = "name"
        return JpMergeField(inner=raw, kind=kind, party=party, canonical=canonical_for_kind(kind, party))

    for kanji, slot in _PARTY_KANJI.items():
        if text.startswith(kanji):
            party = slot
            rest = text[len(kanji) :].strip()
            kind = _resolve_field_kind(rest) or ("name" if not rest else None)
            canonical = canonical_for_kind(kind, party) if kind else raw
            return JpMergeField(inner=raw, kind=kind, party=party, canonical=canonical)
        if text.endswith(kanji) and len(text) > 1:
            party = slot
            rest = text[: -len(kanji)].strip()
            kind = _resolve_field_kind(rest) or ("name" if not rest else None)
            canonical = canonical_for_kind(kind, party) if kind else raw
            return JpMergeField(inner=raw, kind=kind, party=party, canonical=canonical)

    digit_match = re.search(r"([1-9])", text)
    if digit_match:
        party = int(digit_match.group(1))
        left = text[: digit_match.start()].strip()
        right = text[digit_match.end() :].strip()
        if right in _ADDRESS_SUFFIXES or (left in _NAME_ALIAS_STEMS and right in _ADDRESS_SUFFIXES):
            kind = "address"
        elif right:
            kind = _resolve_field_kind(left + right) or _resolve_field_kind(right) or _resolve_field_kind(left)
        else:
            kind = _resolve_field_kind(left)
        if kind:
            return JpMergeField(
                inner=raw,
                kind=kind,
                party=party,
                canonical=canonical_for_kind(kind, party),
            )
        return JpMergeField(inner=raw, kind=None, party=party, canonical=raw)

    kind = _resolve_field_kind(text)
    if kind:
        return JpMergeField(inner=raw, kind=kind, party=None, canonical=canonical_for_kind(kind, None))
    return JpMergeField(inner=raw, kind=None, party=None, canonical=raw)


def extract_variable_names(body: str) -> List[str]:
    seen: Set[str] = set()
    ordered: List[str] = []
    for match in TOKEN_PATTERN.finditer(body or ""):
        if match.group(1):
            name = match.group(1)
        else:
            name = parse_jp_field(match.group(2) or "").canonical
        if name not in seen:
            seen.add(name)
            ordered.append(name)
    return ordered


def max_party_slot(body: str) -> int:
    highest = 1
    for match in JP_TAG_PATTERN.finditer(body or ""):
        parsed = parse_jp_field(match.group(1) or "")
        if parsed.party and parsed.party > highest:
            highest = parsed.party
    return highest


def render_template_body(body: str, values: Dict[str, str]) -> str:
    def brace_repl(match: re.Match[str]) -> str:
        key = match.group(1)
        val = values.get(key)
        if val is None or str(val).strip() == "":
            return match.group(0)
        return str(val)

    def jp_repl(match: re.Match[str]) -> str:
        inner = (match.group(1) or "").strip()
        parsed = parse_jp_field(inner)
        candidates = [inner, _ascii_digits(inner), parsed.canonical]
        for key in candidates:
            if not key:
                continue
            val = values.get(key)
            if val is not None and str(val).strip() != "":
                return str(val)
        return match.group(0)

    braced = TAG_PATTERN.sub(brace_repl, body or "")
    return JP_TAG_PATTERN.sub(jp_repl, braced)


def builtin_values_for_client(client: dict) -> Dict[str, str]:
    fiscal = client.get("fiscalMonth")
    merged: Dict[str, str] = {
        "client_name": str(client.get("name") or ""),
        "client_id": str(client.get("id") or ""),
        "fiscal_month": str(fiscal) if fiscal is not None else "",
        "today": date.today().isoformat(),
        "wareki_today": format_wareki(),
        "minutes_date": date.today().strftime("%Y年%m月%d日"),
        "meeting_number": "1",
        "proxy_count": "0",
        "attendance_ratio": "100",
    }
    hon = honorific_for_client(client)
    merged["honorific"] = hon
    merged["敬称"] = hon
    name = merged["client_name"].strip()
    merged["addressee"] = f"{name}　{hon}".strip() if name else hon
    merged["宛名"] = merged["addressee"]
    merged["本日"] = merged["wareki_today"]
    merged["和暦本日"] = merged["wareki_today"]
    profile = client.get("profile")
    if isinstance(profile, dict):
        for key, val in profile.items():
            if val is None:
                continue
            text = str(val).strip()
            if text:
                merged[str(key)] = text
        # よく使うエイリアス（顧客詳細 → ひな形タグ）
        aliases = {
            "customer_name": "client_name",
            "representative_name": ("representative_name", "borrower_name", "lender_name"),
            "capital": ("capital", "loan_amount"),
            "head_office_address": ("head_office_address", "meeting_place"),
            "officer_count": ("officer_count", "director_count_total"),
            "employee_count": "employee_count",
            "established_date": "established_date",
            "corporate_number": "corporate_number",
            "accounting_contact_name": "accounting_contact_name",
            "shareholder_count": "shareholder_total",
            "issued_shares": "shares_issued",
            "shareholders_with_voting_rights": "shareholders_with_voting_rights",
            "voting_rights_total": "voting_rights_total",
            "shareholders_attending": "shareholders_attending",
            "voting_rights_attending": "voting_rights_attending",
            "officer_compensation": "representative_monthly_salary",
            "director1_name": "director1_name",
            "director2_name": "director2_name",
        }
        for profile_key, targets in aliases.items():
            value = merged.get(profile_key) or (
                profile.get(profile_key) if isinstance(profile.get(profile_key), str) else ""
            )
            if not str(value).strip():
                continue
            text = str(value).strip()
            if isinstance(targets, str):
                targets = (targets,)
            for target in targets:
                if not merged.get(target):
                    merged[target] = text
        if merged.get("client_name") and not merged.get("borrower_name"):
            merged["borrower_name"] = merged["client_name"]
    return merged


def _client_field_bundle(client: dict) -> Dict[str, str]:
    base = builtin_values_for_client(client)
    address = (base.get("head_office_address") or base.get("mailing_address") or "").strip()
    mailing = (base.get("mailing_address") or base.get("head_office_address") or "").strip()
    name = (base.get("client_name") or "").strip()
    hon = honorific_for_client(client)
    return {
        "name": name,
        "address": address,
        "mailing_address": mailing,
        "representative": (base.get("representative_name") or "").strip(),
        "corporate_number": (base.get("corporate_number") or "").strip(),
        "phone": (base.get("phone") or "").strip(),
        "fiscal_month": (base.get("fiscal_month") or "").strip(),
        "capital": (base.get("capital") or "").strip(),
        "honorific": hon,
        "addressee": f"{name}　{hon}".strip() if name else hon,
    }


def _stamp_aliases(merged: Dict[str, str], stems: tuple[str, ...], party: Optional[int], value: str) -> None:
    if not value:
        return
    if party:
        n = str(party)
        fw = _FW_FOR_PARTY[party - 1]
        for stem in stems:
            merged[f"{stem}{n}"] = value
            merged[f"{stem}{fw}"] = value
    else:
        for stem in stems:
            if not merged.get(stem):
                merged[stem] = value


def stamp_party_values(merged: Dict[str, str], party: int, client: dict) -> None:
    if party < 1 or party > 9:
        return
    fields = _client_field_bundle(client)
    prefix = f"party{party}_"
    merged[f"{prefix}name"] = fields["name"]
    merged[f"{prefix}address"] = fields["address"]
    merged[f"{prefix}mailing_address"] = fields["mailing_address"]
    merged[f"{prefix}representative"] = fields["representative"]
    merged[f"{prefix}corporate_number"] = fields["corporate_number"]
    merged[f"{prefix}phone"] = fields["phone"]
    merged[f"{prefix}fiscal_month"] = fields["fiscal_month"]
    merged[f"{prefix}capital"] = fields["capital"]
    merged[f"{prefix}honorific"] = fields["honorific"]
    merged[f"{prefix}addressee"] = fields["addressee"]

    _stamp_aliases(merged, _NAME_ALIAS_STEMS, party, fields["name"])
    _stamp_aliases(merged, _ADDR_ALIAS_STEMS, party, fields["address"])
    _stamp_aliases(merged, _REP_ALIAS_STEMS, party, fields["representative"])
    _stamp_aliases(merged, ("法人番号",), party, fields["corporate_number"])
    _stamp_aliases(merged, ("電話番号", "電話"), party, fields["phone"])
    _stamp_aliases(merged, ("決算月",), party, fields["fiscal_month"])
    _stamp_aliases(merged, ("資本金",), party, fields["capital"])
    _stamp_aliases(merged, ("送付先住所", "送付先"), party, fields["mailing_address"])
    _stamp_aliases(merged, ("敬称",), party, fields["honorific"])
    _stamp_aliases(merged, ("宛名",), party, fields["addressee"])

    fw = _FW_FOR_PARTY[party - 1]
    n = str(party)
    if fields["address"]:
        merged[f"法人名{n}住所"] = fields["address"]
        merged[f"法人名{fw}住所"] = fields["address"]
        merged[f"顧問先名{n}住所"] = fields["address"]
        merged[f"顧問先名{fw}住所"] = fields["address"]
    kanji = _KANJI_FOR_PARTY.get(party)
    if kanji:
        if fields["name"]:
            merged[kanji] = fields["name"]
        if fields["address"]:
            merged[f"{kanji}住所"] = fields["address"]
            merged[f"{kanji}本店住所"] = fields["address"]
        if fields["representative"]:
            merged[f"{kanji}代表者名"] = fields["representative"]
            merged[f"{kanji}代表者"] = fields["representative"]
        if fields["honorific"]:
            merged[f"{kanji}敬称"] = fields["honorific"]
        if fields["addressee"]:
            merged[f"{kanji}宛名"] = fields["addressee"]


def stamp_current_jp_values(merged: Dict[str, str], client: dict) -> None:
    fields = _client_field_bundle(client)
    if fields["name"]:
        merged.setdefault("法人名", fields["name"])
        merged.setdefault("顧問先名", fields["name"])
        merged.setdefault("顧客名", fields["name"])
        merged.setdefault("会社名", fields["name"])
    if fields["address"]:
        merged.setdefault("本店住所", fields["address"])
        merged.setdefault("住所", fields["address"])
        merged.setdefault("所在地", fields["address"])
        merged.setdefault("法人名住所", fields["address"])
    if fields["mailing_address"]:
        merged.setdefault("送付先住所", fields["mailing_address"])
        merged.setdefault("送付先", fields["mailing_address"])
    if fields["representative"]:
        merged.setdefault("代表者名", fields["representative"])
        merged.setdefault("代表取締役", fields["representative"])
        merged.setdefault("代表者", fields["representative"])
    if fields["corporate_number"]:
        merged.setdefault("法人番号", fields["corporate_number"])
    if fields["phone"]:
        merged.setdefault("電話番号", fields["phone"])
        merged.setdefault("電話", fields["phone"])
    if fields["fiscal_month"]:
        merged.setdefault("決算月", fields["fiscal_month"])
    if fields["capital"]:
        merged.setdefault("資本金", fields["capital"])
    if fields["honorific"]:
        merged.setdefault("honorific", fields["honorific"])
        merged.setdefault("敬称", fields["honorific"])
    if fields["addressee"]:
        merged.setdefault("addressee", fields["addressee"])
        merged.setdefault("宛名", fields["addressee"])
    wareki = merged.get("wareki_today") or format_wareki()
    merged.setdefault("本日", wareki)
    merged.setdefault("和暦本日", wareki)


def merge_render_values(
    client: dict,
    user_values: Dict[str, str] | None,
    *,
    party_clients: Dict[int, dict] | None = None,
) -> Dict[str, str]:
    merged = builtin_values_for_client(client)
    stamp_current_jp_values(merged, client)
    stamp_party_values(merged, 1, client)
    if party_clients:
        for slot, party_client in party_clients.items():
            try:
                party_slot = int(slot)
            except (TypeError, ValueError):
                continue
            stamp_party_values(merged, party_slot, party_client)
    if user_values:
        for key, val in user_values.items():
            if key not in BUILTIN_CLIENT_TAGS and key not in BUILTIN_SYSTEM_TAGS:
                merged[key] = str(val)
            elif key in user_values and user_values[key]:
                merged[key] = str(user_values[key])
    return merged


def missing_variables(required: Iterable[str], resolved: Dict[str, str]) -> List[str]:
    missing: List[str] = []
    for name in required:
        val = resolved.get(name)
        if val is None or str(val).strip() == "":
            missing.append(name)
    return missing
