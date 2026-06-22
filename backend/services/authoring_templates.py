"""Global / Local 文書ひな形（Phase 1: テキスト本文）。"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from services.firm_settings import STORAGE_DIR, _load_json, _write_json
from services.template_variable_parser import extract_variable_names

PLATFORM_DIR = STORAGE_DIR / "platform"
GLOBAL_TEMPLATES_PATH = PLATFORM_DIR / "global_authoring_templates.json"

DEFAULT_GLOBAL_TEMPLATES: List[dict] = [
    {
        "id": "global-officer-compensation-minutes",
        "scope": "global",
        "title": "役員報酬改定議事録（たたき台）",
        "description": "定時株主総会議事録の公式ひな形。法改正時は TAXX が更新します。",
        "category": "corporate_governance",
        "body": (
            ">> 定時株主総会議事録\n"
            "\n"
            "　{{meeting_date}}（{{meeting_weekday}}）午前{{meeting_time_start}}、当会社本店において、"
            "第{{meeting_number}}回定時株主総会を開催した。"
            "議長は、代表取締役{{representative_name}}は出席株主のうちもっとも多くの議決権を有する者として議長に選任され、"
            "定時株主総会は、議長の開会宣言に続き、議事に入った。\n"
            "\n"
            "　本株主総会の議決権を有する株主の状況は、次のとおりである。\n"
            "\n"
            "　　株主の総数　　　　　　　　　　　　　{{shareholder_total}}名\n"
            "　　発行済株式の総数　　　　　　　　　　{{shares_issued}}株\n"
            "　　議決権を行使することができる株主の数　　　　　{{shareholders_with_voting_rights}}名\n"
            "　　議決権を行使することができる株主の議決権の数　{{voting_rights_total}}個\n"
            "　　出席株主数（うち議決権代理権行使者　{{proxy_count}}名）　{{shareholders_attending}}名\n"
            "　　出席株主の議決権の数　　　　　　　　{{voting_rights_attending}}個\n"
            "　　総株主の議決権の{{attendance_ratio}}％に相当する株式を有する株主が出席したので、"
            "定時株主総会は適法に成立した。\n"
            "\n"
            ">> 第1号議案　取締役各個の受けるべき報酬金額決定の件\n"
            "\n"
            "　取締役各個の受けるべき報酬金額の決定については満場一致で決議した。\n"
            "　なお、報酬金額を改定することとし、{{compensation_effective_date}}からの支給分より以下の通り定める。\n"
            "\n"
            ">> 代表取締役　{{representative_name}}　月額　{{representative_monthly_salary}}円\n"
            ">> 取　締　役　{{director1_name}}　月額　{{director1_monthly_salary}}円\n"
            ">> 取　締　役　{{director2_name}}　月額　{{director2_monthly_salary}}円\n"
            ">> 　　　　　計{{director_count_total}}名　月額　{{total_monthly_salary}}円\n"
            "\n"
            "　以上をもって本日の議案の審査を終了したので、午前{{meeting_time_end}}、議長は閉会を宣した。\n"
            "　議長は、出席した取締役に対し、本議事録の作成嘱託をした。\n"
            "\n"
            "　{{minutes_date}}\n"
            "\n"
            "　{{client_name}}　株主総会\n"
            "\n"
            ">>> 議長兼代表取締役　{{representative_name}}　　㊞\n"
            ">>> 出席取締役　　　　{{director1_name}}　　　　㊞\n"
            ">>> 出席取締役　　　　{{director2_name}}　　　　㊞"
        ),
        "version": "1.1.0",
        "targetSlotLabel": "役員報酬",
    },
    {
        "id": "global-loan-agreement-stub",
        "scope": "global",
        "title": "金銭消費貸借契約書（たたき台）",
        "description": "役員借入等に用いる契約書の骨子。",
        "category": "contracts",
        "targetSlotLabel": "金銭消費貸借契約書",
        "body": (
            "金銭消費貸借契約書\n\n"
            "貸主 {{lender_name}} と借主 {{borrower_name}} は、"
            "借入金額 {{loan_amount}} 円、利率 {{interest_rate}}、"
            "返済期限 {{repayment_date}} について、以下のとおり契約する。\n\n"
            "（条文続く）"
        ),
        "version": "1.0.0",
    },
]


def _firm_local_path(firm_id: str) -> Path:
    return STORAGE_DIR / "firms" / firm_id / "local_authoring_templates.json"


def _now() -> str:
    return datetime.utcnow().isoformat()


def _enrich_template(raw: dict, *, firm_id: Optional[str] = None) -> dict:
    body = str(raw.get("body") or "")
    variables = raw.get("variables")
    if not isinstance(variables, list):
        variables = extract_variable_names(body)
    scope = raw.get("scope") or ("local" if firm_id else "global")
    return {
        "id": str(raw.get("id") or uuid.uuid4().hex),
        "scope": scope,
        "title": str(raw.get("title") or "無題のひな形"),
        "description": str(raw.get("description") or ""),
        "category": str(raw.get("category") or "general"),
        "body": body,
        "variables": variables,
        "version": str(raw.get("version") or "1.0.0"),
        "targetSlotLabel": str(raw.get("targetSlotLabel") or ""),
        "updatedAt": raw.get("updatedAt") or _now(),
        **({"firmId": firm_id} if firm_id else {}),
    }


def _version_lt(left: str, right: str) -> bool:
    def parts(value: str) -> tuple:
        out: list[int] = []
        for chunk in (value or "0").split("."):
            out.append(int(chunk) if chunk.isdigit() else 0)
        return tuple(out)

    return parts(left) < parts(right)


def _upgrade_stored_globals(stored: List[dict]) -> List[dict]:
    defaults = {str(t["id"]): t for t in DEFAULT_GLOBAL_TEMPLATES}
    upgraded: List[dict] = []
    changed = False
    for raw in stored:
        template_id = str(raw.get("id") or "")
        default = defaults.get(template_id)
        if default and _version_lt(str(raw.get("version") or "0"), str(default.get("version") or "1")):
            upgraded.append({**default, "updatedAt": _now()})
            changed = True
        else:
            upgraded.append(raw)
    known = {str(t.get("id") or "") for t in upgraded}
    for default in DEFAULT_GLOBAL_TEMPLATES:
        if default["id"] not in known:
            upgraded.append(dict(default))
            changed = True
    if changed:
        _save_global_raw(upgraded)
    return upgraded


def _load_global_raw() -> List[dict]:
    if GLOBAL_TEMPLATES_PATH.exists():
        data = _load_json(GLOBAL_TEMPLATES_PATH)
        items = data.get("templates") if isinstance(data, dict) else None
        if isinstance(items, list) and items:
            return _upgrade_stored_globals(items)
    PLATFORM_DIR.mkdir(parents=True, exist_ok=True)
    seed = {"templates": DEFAULT_GLOBAL_TEMPLATES, "updatedAt": _now()}
    GLOBAL_TEMPLATES_PATH.write_text(json.dumps(seed, indent=2, ensure_ascii=False), encoding="utf-8")
    return list(DEFAULT_GLOBAL_TEMPLATES)


def _save_global_raw(templates: List[dict]) -> None:
    PLATFORM_DIR.mkdir(parents=True, exist_ok=True)
    _write_json(GLOBAL_TEMPLATES_PATH, {"templates": templates, "updatedAt": _now()})


def list_global_templates() -> List[dict]:
    return [_enrich_template(t) for t in _load_global_raw()]


def list_local_templates(firm_id: str) -> List[dict]:
    raw = _load_json(_firm_local_path(firm_id))
    items = raw.get("templates") if isinstance(raw, dict) else []
    if not isinstance(items, list):
        items = []
    return [_enrich_template(t, firm_id=firm_id) for t in items]


def list_all_for_firm(firm_id: str) -> dict:
    return {
        "global": list_global_templates(),
        "local": list_local_templates(firm_id),
    }


def get_template_by_id(template_id: str, firm_id: str) -> Optional[dict]:
    for t in list_global_templates():
        if t["id"] == template_id:
            return t
    for t in list_local_templates(firm_id):
        if t["id"] == template_id:
            return t
    return None


def create_local_template(
    firm_id: str,
    *,
    title: str,
    body: str,
    description: str = "",
    category: str = "general",
) -> dict:
    path = _firm_local_path(firm_id)
    raw = _load_json(path)
    items = raw.get("templates") if isinstance(raw, dict) else []
    if not isinstance(items, list):
        items = []
    item = _enrich_template(
        {
            "id": uuid.uuid4().hex,
            "scope": "local",
            "title": title,
            "description": description,
            "category": category,
            "body": body,
            "version": "1.0.0",
            "updatedAt": _now(),
        },
        firm_id=firm_id,
    )
    items.append(item)
    _write_json(path, {"templates": items, "updatedAt": _now()})
    return item


def create_global_template(
    *,
    title: str,
    body: str,
    description: str = "",
    category: str = "general",
) -> dict:
    items = _load_global_raw()
    item = _enrich_template(
        {
            "id": f"global-{uuid.uuid4().hex[:12]}",
            "scope": "global",
            "title": title,
            "description": description,
            "category": category,
            "body": body,
            "version": "1.0.0",
            "updatedAt": _now(),
        }
    )
    items.append(item)
    _save_global_raw(items)
    return item


def update_template(
    template_id: str,
    firm_id: str,
    *,
    title: Optional[str] = None,
    body: Optional[str] = None,
    description: Optional[str] = None,
    category: Optional[str] = None,
    is_platform: bool,
) -> Optional[dict]:
    existing = get_template_by_id(template_id, firm_id)
    if not existing:
        return None
    if existing["scope"] == "global":
        if not is_platform:
            return None
        items = _load_global_raw()
        updated: Optional[dict] = None
        next_items: List[dict] = []
        for raw in items:
            if raw.get("id") == template_id:
                merged = dict(raw)
                if title is not None:
                    merged["title"] = title
                if body is not None:
                    merged["body"] = body
                if description is not None:
                    merged["description"] = description
                if category is not None:
                    merged["category"] = category
                merged["updatedAt"] = _now()
                updated = _enrich_template(merged)
                next_items.append(
                    {
                        **merged,
                        "variables": extract_variable_names(merged.get("body", "")),
                    }
                )
            else:
                next_items.append(raw)
        if not updated:
            return None
        _save_global_raw(next_items)
        return updated

    path = _firm_local_path(firm_id)
    raw = _load_json(path)
    items = raw.get("templates") if isinstance(raw, dict) else []
    if not isinstance(items, list):
        return None
    updated = None
    next_items = []
    for raw_item in items:
        if raw_item.get("id") == template_id:
            merged = dict(raw_item)
            if title is not None:
                merged["title"] = title
            if body is not None:
                merged["body"] = body
            if description is not None:
                merged["description"] = description
            if category is not None:
                merged["category"] = category
            merged["updatedAt"] = _now()
            updated = _enrich_template(merged, firm_id=firm_id)
            next_items.append(
                {
                    **merged,
                    "variables": extract_variable_names(merged.get("body", "")),
                }
            )
        else:
            next_items.append(raw_item)
    if not updated:
        return None
    _write_json(path, {"templates": next_items, "updatedAt": _now()})
    return updated


def delete_template(template_id: str, firm_id: str, *, is_platform: bool) -> bool:
    existing = get_template_by_id(template_id, firm_id)
    if not existing:
        return False
    if existing["scope"] == "global":
        if not is_platform:
            return False
        items = [t for t in _load_global_raw() if t.get("id") != template_id]
        if len(items) == len(_load_global_raw()):
            return False
        _save_global_raw(items)
        return True

    path = _firm_local_path(firm_id)
    raw = _load_json(path)
    items = raw.get("templates") if isinstance(raw, dict) else []
    if not isinstance(items, list):
        return False
    next_items = [t for t in items if t.get("id") != template_id]
    if len(next_items) == len(items):
        return False
    _write_json(path, {"templates": next_items, "updatedAt": _now()})
    return True
