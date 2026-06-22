"""ひな形本文から {{variable}} タグを抽出・置換する。"""

from __future__ import annotations

import re
from datetime import date
from typing import Dict, Iterable, List, Set

TAG_PATTERN = re.compile(r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}")

BUILTIN_CLIENT_TAGS = frozenset({"client_name", "client_id", "fiscal_month"})
BUILTIN_SYSTEM_TAGS = frozenset({"today"})


def extract_variable_names(body: str) -> List[str]:
    seen: Set[str] = set()
    ordered: List[str] = []
    for match in TAG_PATTERN.finditer(body or ""):
        name = match.group(1)
        if name not in seen:
            seen.add(name)
            ordered.append(name)
    return ordered


def render_template_body(body: str, values: Dict[str, str]) -> str:
    def repl(match: re.Match[str]) -> str:
        key = match.group(1)
        return values.get(key, match.group(0))

    return TAG_PATTERN.sub(repl, body or "")


def builtin_values_for_client(client: dict) -> Dict[str, str]:
    fiscal = client.get("fiscalMonth")
    merged: Dict[str, str] = {
        "client_name": str(client.get("name") or ""),
        "client_id": str(client.get("id") or ""),
        "fiscal_month": str(fiscal) if fiscal is not None else "",
        "today": date.today().isoformat(),
        "minutes_date": date.today().strftime("%Y年%m月%d日"),
        "meeting_number": "1",
        "proxy_count": "0",
        "attendance_ratio": "100",
    }
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
            value = merged.get(profile_key) or (profile.get(profile_key) if isinstance(profile.get(profile_key), str) else "")
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


def merge_render_values(
  client: dict,
  user_values: Dict[str, str] | None,
) -> Dict[str, str]:
    merged = builtin_values_for_client(client)
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
