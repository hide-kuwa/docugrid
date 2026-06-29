"""監査チェックリスト — 複数テンプレートカタログ・実行・PDF・アラート。"""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from services.document_version_service import get_logical_by_slot, list_versions
from services.firm_settings import STORAGE_DIR, _load_json, _write_json
from services.requirements import period_type
from services.text_to_pdf import text_to_pdf_bytes

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
HRE_TEMPLATE_PATH = DATA_DIR / "hre_review_checklist_template.json"
LEGACY_TEMPLATE_PATH_NAME = "review_checklist_template.json"

STATUS_SYMBOLS = {
    "ok": "〇",
    "ng": "✖",
    "na": "ー",
    "pending": "",
    "note": "※",
}

DEFAULT_HEADER_FIELDS = [
    {
        "id": "client_name",
        "label": "顧客名",
        "autoKey": "client_name",
        "placeholder": "【　会社名　様】",
    },
    {
        "id": "fiscal_period",
        "label": "法人（事業年度）",
        "autoKey": "fiscal_period_label",
        "placeholder": "第 ２期 ４ 月 １ 日 ～ ３ 月 ３１ 日",
    },
    {
        "id": "consumption_tax",
        "label": "消費税申告",
        "autoKey": "consumption_tax_summary",
        "placeholder": "あり　還付申告",
    },
]

DEFAULT_STATUS_OPTIONS = [
    {"value": "ok", "label": "〇", "symbol": "〇"},
    {"value": "ng", "label": "✖", "symbol": "✖"},
    {"value": "na", "label": "ー", "symbol": "ー"},
    {"value": "pending", "label": "未確認", "symbol": ""},
    {"value": "note", "label": "コメント", "symbol": ""},
]


def _catalog_path(firm_id: str) -> Path:
    return STORAGE_DIR / "firms" / firm_id / "review_checklist_catalog.json"


def _legacy_template_path(firm_id: str) -> Path:
    return STORAGE_DIR / "firms" / firm_id / LEGACY_TEMPLATE_PATH_NAME


def _instances_path(firm_id: str) -> Path:
    return STORAGE_DIR / "firms" / firm_id / "review_checklist_instances.json"


def _now() -> str:
    return datetime.utcnow().isoformat()


def _instance_key(client_id: str, period_key: str, template_id: str) -> str:
    return f"{client_id}|{period_key}|{template_id}"


def _new_id(prefix: str = "cl") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


def _load_platform_hre_template() -> dict:
    if HRE_TEMPLATE_PATH.exists():
        data = json.loads(HRE_TEMPLATE_PATH.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
    raise FileNotFoundError("hre_review_checklist_template.json not found")


def _normalize_item(raw: dict, *, section_id: str) -> dict:
    kind = str(raw.get("kind") or "question")
    item_id = str(raw.get("id") or _new_id("item"))
    return {
        "id": item_id,
        "number": str(raw.get("number") or ""),
        "label": str(raw.get("label") or ""),
        "indent": int(raw.get("indent") or 0),
        "kind": kind,
        "subgroup": str(raw.get("subgroup") or ""),
        "returnAnchor": raw.get("returnAnchor") if isinstance(raw.get("returnAnchor"), dict) else {},
        "alertRule": str(raw.get("alertRule") or ""),
    }


def _normalize_section(raw: dict) -> dict:
    section_id = str(raw.get("id") or _new_id("section"))
    items_in = raw.get("items") if isinstance(raw.get("items"), list) else []
    items = [_normalize_item(item, section_id=section_id) for item in items_in if isinstance(item, dict)]
    return {
        "id": section_id,
        "title": str(raw.get("title") or "セクション"),
        "sheetLabel": str(raw.get("sheetLabel") or raw.get("title") or "セクション"),
        "kind": str(raw.get("kind") or "checklist"),
        "items": items,
    }


def _normalize_v2_template(raw: dict, *, scope: str = "local", firm_id: Optional[str] = None) -> dict:
    sections_in = raw.get("sections") if isinstance(raw.get("sections"), list) else []
    period_types = raw.get("periodTypes") or ["year"]
    if not isinstance(period_types, list):
        period_types = ["year"]
    template_id = str(raw.get("templateId") or raw.get("id") or _new_id("tpl"))
    return {
        "schemaVersion": int(raw.get("schemaVersion") or 2),
        "id": template_id,
        "templateId": template_id,
        "scope": str(raw.get("scope") or scope),
        "title": str(raw.get("title") or "監査チェックリスト"),
        "description": str(raw.get("description") or ""),
        "periodTypes": [str(p) for p in period_types],
        "headerFields": raw.get("headerFields")
        if isinstance(raw.get("headerFields"), list) and raw.get("headerFields")
        else list(DEFAULT_HEADER_FIELDS),
        "statusOptions": raw.get("statusOptions")
        if isinstance(raw.get("statusOptions"), list) and raw.get("statusOptions")
        else list(DEFAULT_STATUS_OPTIONS),
        "sections": [_normalize_section(s) for s in sections_in if isinstance(s, dict)],
        "createdAt": raw.get("createdAt") or _now(),
        "updatedAt": raw.get("updatedAt") or _now(),
        **({"firmId": firm_id} if firm_id else {}),
    }


def _template_summary(template: dict) -> dict:
    sections = template.get("sections") or []
    question_count = sum(
        1
        for s in sections
        for i in s.get("items") or []
        if i.get("kind") in ("question", "adjustment_point")
    )
    return {
        "id": template.get("id") or template.get("templateId"),
        "templateId": template.get("templateId") or template.get("id"),
        "scope": template.get("scope") or "local",
        "title": template.get("title"),
        "description": template.get("description"),
        "periodTypes": template.get("periodTypes") or ["year"],
        "sectionCount": len(sections),
        "itemCount": question_count,
        "updatedAt": template.get("updatedAt"),
    }


def _blank_template(*, title: str = "新しいチェックリスト") -> dict:
    return _normalize_v2_template(
        {
            "title": title,
            "description": "",
            "periodTypes": ["year"],
            "sections": [
                {
                    "id": _new_id("section"),
                    "title": "確認項目",
                    "sheetLabel": "確認項目",
                    "kind": "checklist",
                    "items": [],
                }
            ],
        },
        scope="local",
    )


def _load_catalog_raw(firm_id: str) -> dict:
    path = _catalog_path(firm_id)
    if path.exists():
        raw = _load_json(path)
        if isinstance(raw.get("templates"), list) and raw["templates"]:
            return raw

    templates: list[dict] = []
    hre = _normalize_v2_template(_load_platform_hre_template(), scope="global")
    hre["id"] = hre.get("templateId") or "hre-standard"
    templates.append(hre)

    legacy_path = _legacy_template_path(firm_id)
    if legacy_path.exists():
        legacy = _load_json(legacy_path)
        if legacy and isinstance(legacy.get("sections"), list):
            legacy_tpl = _normalize_v2_template(legacy, scope="local", firm_id=firm_id)
            if legacy_tpl.get("templateId") != hre["id"]:
                legacy_tpl["id"] = legacy_tpl.get("templateId") or _new_id("tpl")
                templates.append(legacy_tpl)

    catalog = {
        "schemaVersion": 2,
        "defaultTemplateId": hre["id"],
        "templates": templates,
        "updatedAt": _now(),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    _write_json(path, catalog)
    return catalog


def _save_catalog(firm_id: str, catalog: dict) -> None:
    catalog["updatedAt"] = _now()
    _write_json(_catalog_path(firm_id), catalog)


def _find_template_in_catalog(catalog: dict, template_id: str) -> Optional[dict]:
    for tpl in catalog.get("templates") or []:
        tid = tpl.get("id") or tpl.get("templateId")
        if tid == template_id:
            return tpl
    return None


def list_templates(firm_id: str) -> dict:
    catalog = _load_catalog_raw(firm_id)
    templates = [_template_summary(t) for t in catalog.get("templates") or []]
    return {
        "defaultTemplateId": catalog.get("defaultTemplateId"),
        "templates": templates,
    }


def get_template(firm_id: str, template_id: Optional[str] = None) -> dict:
    catalog = _load_catalog_raw(firm_id)
    tid = template_id or catalog.get("defaultTemplateId")
    tpl = _find_template_in_catalog(catalog, str(tid))
    if not tpl:
        tpl = (catalog.get("templates") or [None])[0]
    if not tpl:
        hre = _normalize_v2_template(_load_platform_hre_template(), scope="global")
        return hre
    return _normalize_v2_template(tpl, scope=str(tpl.get("scope") or "local"), firm_id=firm_id)


def create_template(
    firm_id: str,
    *,
    title: str,
    description: str = "",
    period_types: Optional[List[str]] = None,
    sections: Optional[List[dict]] = None,
    source_template_id: Optional[str] = None,
) -> dict:
    if source_template_id:
        source = get_template(firm_id, source_template_id)
        payload = {
            **source,
            "id": _new_id("tpl"),
            "templateId": None,
            "title": title or f"{source.get('title')}（コピー）",
            "description": description or source.get("description") or "",
            "scope": "local",
            "createdAt": _now(),
        }
        created = _normalize_v2_template(payload, scope="local", firm_id=firm_id)
    elif sections is not None:
        created = _normalize_v2_template(
            {
                "title": title,
                "description": description,
                "periodTypes": period_types or ["year"],
                "sections": sections,
            },
            scope="local",
            firm_id=firm_id,
        )
    else:
        created = _blank_template(title=title or "新しいチェックリスト")
        created["description"] = description
        if period_types:
            created["periodTypes"] = period_types

    catalog = _load_catalog_raw(firm_id)
    catalog.setdefault("templates", []).append(created)
    if len(catalog["templates"]) == 1:
        catalog["defaultTemplateId"] = created["id"]
    _save_catalog(firm_id, catalog)
    return created


def update_template(firm_id: str, template_id: str, payload: dict) -> dict:
    catalog = _load_catalog_raw(firm_id)
    templates = catalog.get("templates") or []
    updated: Optional[dict] = None
    next_templates: list[dict] = []
    for raw in templates:
        tid = raw.get("id") or raw.get("templateId")
        if tid != template_id:
            next_templates.append(raw)
            continue
        if raw.get("scope") == "global":
            raise PermissionError("global_template_readonly")
        merged = {**raw}
        for key in (
            "title",
            "description",
            "periodTypes",
            "sections",
            "headerFields",
            "statusOptions",
        ):
            if key in payload and payload[key] is not None:
                merged[key] = payload[key]
        merged["updatedAt"] = _now()
        updated = _normalize_v2_template(merged, scope="local", firm_id=firm_id)
        next_templates.append(updated)
    if not updated:
        raise KeyError("template_not_found")
    catalog["templates"] = next_templates
    _save_catalog(firm_id, catalog)
    return updated


def delete_template(firm_id: str, template_id: str) -> bool:
    catalog = _load_catalog_raw(firm_id)
    target = _find_template_in_catalog(catalog, template_id)
    if not target:
        return False
    if target.get("scope") == "global":
        raise PermissionError("global_template_readonly")
    if catalog.get("defaultTemplateId") == template_id:
        raise ValueError("cannot_delete_default")
    catalog["templates"] = [
        t
        for t in catalog.get("templates") or []
        if (t.get("id") or t.get("templateId")) != template_id
    ]
    _save_catalog(firm_id, catalog)
    return True


def set_default_template(firm_id: str, template_id: str) -> dict:
    catalog = _load_catalog_raw(firm_id)
    if not _find_template_in_catalog(catalog, template_id):
        raise KeyError("template_not_found")
    catalog["defaultTemplateId"] = template_id
    _save_catalog(firm_id, catalog)
    return list_templates(firm_id)


def save_template(firm_id: str, payload: dict) -> dict:
    """後方互換: デフォルトテンプレートを更新（ローカルにフォークしてから）。"""
    catalog = _load_catalog_raw(firm_id)
    default_id = str(catalog.get("defaultTemplateId") or "")
    default = _find_template_in_catalog(catalog, default_id)
    if default and default.get("scope") == "global":
        forked = create_template(
            firm_id,
            title=str(default.get("title") or "カスタムチェックリスト"),
            description=str(default.get("description") or ""),
            source_template_id=default_id,
        )
        for key in ("title", "description", "periodTypes", "sections", "headerFields", "statusOptions"):
            if key in payload and payload[key] is not None:
                forked[key] = payload[key]
        updated = update_template(firm_id, forked["id"], forked)
        set_default_template(firm_id, forked["id"])
        return updated
    return update_template(firm_id, default_id, payload)


def iter_questions(template: dict) -> Iterable[dict]:
    for section in template.get("sections") or []:
        for item in section.get("items") or []:
            if item.get("kind") in ("question", "adjustment_point"):
                yield item


def iter_alert_items(template: dict) -> Iterable[dict]:
    for section in template.get("sections") or []:
        for item in section.get("items") or []:
            anchor = item.get("returnAnchor") or {}
            if anchor.get("slotId"):
                yield item


def _fiscal_period_label(client: dict, period_key: str) -> str:
    fiscal_month = client.get("fiscalMonth") or client.get("fiscal_month")
    try:
        fm = int(fiscal_month) if fiscal_month is not None else 3
    except (TypeError, ValueError):
        fm = 3
    start_month = (fm % 12) + 1
    end_month = fm
    term_no = 1
    if period_key.startswith("year:"):
        try:
            term_no = int(period_key.split(":", 1)[1])
        except ValueError:
            term_no = 1
    return f"第 {term_no} 期 {start_month} 月 １ 日 ～ {end_month} 月 ３１ 日"


def _consumption_tax_summary(client: dict) -> str:
    profile = client.get("profile") if isinstance(client.get("profile"), dict) else {}
    val = profile.get("consumption_tax") or profile.get("consumption_tax_election_notice") or ""
    return str(val).strip()


def prefill_header(client: dict, period_key: str) -> dict[str, str]:
    name = str(client.get("name") or "").strip()
    display_name = f"【　{name}　様】" if name else ""
    return {
        "client_name": display_name,
        "fiscal_period": _fiscal_period_label(client, period_key),
        "consumption_tax": _consumption_tax_summary(client) or "",
    }


def _load_instances_raw(firm_id: str) -> dict:
    raw = _load_json(_instances_path(firm_id))
    instances = raw.get("instances") if isinstance(raw, dict) else {}
    return instances if isinstance(instances, dict) else {}


def _save_instances_raw(firm_id: str, instances: dict) -> None:
    _write_json(_instances_path(firm_id), {"instances": instances, "updatedAt": _now()})


def _resolve_instance_storage(
    firm_id: str, client_id: str, period_key: str, template_id: Optional[str]
) -> tuple[str, dict]:
    catalog = _load_catalog_raw(firm_id)
    tid = template_id or catalog.get("defaultTemplateId") or "hre-standard"
    instances = _load_instances_raw(firm_id)
    key = _instance_key(client_id, period_key, str(tid))
    stored = instances.get(key)
    if isinstance(stored, dict):
        return str(tid), stored

    legacy_key = f"{client_id}|{period_key}"
    legacy = instances.get(legacy_key)
    if isinstance(legacy, dict) and (not template_id or template_id == catalog.get("defaultTemplateId")):
        return str(tid), legacy
    return str(tid), {}


def _count_progress(template: dict, item_states: dict) -> dict[str, int]:
    total = 0
    done = 0
    for item in iter_questions(template):
        total += 1
        state = item_states.get(item["id"]) or {}
        if item.get("kind") == "adjustment_point":
            if str(state.get("result") or state.get("label") or "").strip():
                done += 1
            continue
        status = str(state.get("status") or "pending")
        if status not in ("", "pending"):
            done += 1
    return {"total": total, "checked": done}


def _legacy_checks_from_states(item_states: dict) -> dict:
    out: dict[str, dict] = {}
    for item_id, state in item_states.items():
        if not isinstance(state, dict):
            continue
        status = state.get("status")
        out[item_id] = {
            "checked": status in ("ok", "ng", "na", "note"),
            "note": state.get("comment") or state.get("note") or "",
        }
    return out


def get_instance(
    firm_id: str,
    client_id: str,
    period_key: str,
    template_id: Optional[str] = None,
) -> dict:
    tid, stored = _resolve_instance_storage(firm_id, client_id, period_key, template_id)
    template = get_template(firm_id, tid)
    if period_type(period_key) not in template.get("periodTypes", ["year"]):
        return {
            "schemaVersion": 2,
            "templateId": tid,
            "clientId": client_id,
            "periodKey": period_key,
            "applicable": False,
            "header": {},
            "itemStates": {},
            "checks": {},
            "workflowStatus": "draft",
            "circulationMemo": "",
            "progress": {"total": 0, "checked": 0},
            "updatedAt": None,
        }

    item_states = stored.get("itemStates") if isinstance(stored.get("itemStates"), dict) else {}
    if not item_states and isinstance(stored.get("checks"), dict):
        for iid, chk in stored["checks"].items():
            if isinstance(chk, dict) and chk.get("checked"):
                item_states[iid] = {"status": "ok", "comment": chk.get("note") or ""}
    header = stored.get("header") if isinstance(stored.get("header"), dict) else {}
    progress = _count_progress(template, item_states)
    return {
        "schemaVersion": 2,
        "templateId": tid,
        "clientId": client_id,
        "periodKey": period_key,
        "applicable": True,
        "header": header,
        "itemStates": item_states,
        "checks": _legacy_checks_from_states(item_states),
        "workflowStatus": str(stored.get("workflowStatus") or "draft"),
        "circulationMemo": str(stored.get("circulationMemo") or ""),
        "progress": progress,
        "updatedAt": stored.get("updatedAt"),
        "completedAt": stored.get("completedAt"),
        "exportedAt": stored.get("exportedAt"),
    }


def save_instance(
    firm_id: str,
    client_id: str,
    period_key: str,
    *,
    template_id: Optional[str] = None,
    header: Optional[dict] = None,
    item_states: Optional[dict] = None,
    workflow_status: Optional[str] = None,
    circulation_memo: Optional[str] = None,
    actor_email: Optional[str] = None,
) -> dict:
    tid, stored = _resolve_instance_storage(firm_id, client_id, period_key, template_id)
    template = get_template(firm_id, tid)
    if period_type(period_key) not in template.get("periodTypes", ["year"]):
        raise ValueError("period_not_applicable")

    valid_ids = {item["id"] for item in iter_questions(template)}
    instances = _load_instances_raw(firm_id)
    key = _instance_key(client_id, period_key, tid)

    next_header = dict(stored.get("header") or {})
    if header is not None:
        next_header.update({k: str(v) for k, v in header.items()})

    prev_states = stored.get("itemStates") if isinstance(stored.get("itemStates"), dict) else {}
    next_states = dict(prev_states)
    if item_states is not None:
        for item_id, state in item_states.items():
            if item_id not in valid_ids or not isinstance(state, dict):
                continue
            entry: dict[str, Any] = {
                "status": str(state.get("status") or prev_states.get(item_id, {}).get("status") or "pending"),
                "comment": str(state.get("comment") or state.get("note") or ""),
                "reference": str(state.get("reference") or ""),
                "answer": str(state.get("answer") or ""),
                "result": str(state.get("result") or ""),
                "label": str(state.get("label") or ""),
            }
            if entry["status"] not in ("", "pending") and actor_email:
                entry["checkedBy"] = actor_email
                entry["checkedAt"] = _now()
            next_states[item_id] = entry

    wf = workflow_status or stored.get("workflowStatus") or "draft"
    completed_at = stored.get("completedAt")
    if wf == "completed" and not completed_at:
        completed_at = _now()

    instances[key] = {
        "schemaVersion": 2,
        "templateId": tid,
        "header": next_header,
        "itemStates": next_states,
        "workflowStatus": wf,
        "circulationMemo": circulation_memo if circulation_memo is not None else stored.get("circulationMemo", ""),
        "updatedAt": _now(),
        "completedAt": completed_at,
        "exportedAt": stored.get("exportedAt"),
    }
    _save_instances_raw(firm_id, instances)
    return get_instance(firm_id, client_id, period_key, tid)


def save_instance_checks(
    firm_id: str,
    client_id: str,
    period_key: str,
    checks: dict,
    *,
    template_id: Optional[str] = None,
    actor_email: Optional[str] = None,
) -> dict:
    item_states: dict[str, dict] = {}
    for item_id, state in checks.items():
        if not isinstance(state, dict):
            continue
        if "status" in state:
            item_states[item_id] = state
        else:
            item_states[item_id] = {
                "status": "ok" if state.get("checked") else "pending",
                "comment": state.get("note") or "",
            }
    return save_instance(
        firm_id,
        client_id,
        period_key,
        template_id=template_id,
        item_states=item_states,
        actor_email=actor_email,
    )


def _status_symbol(status: str) -> str:
    return STATUS_SYMBOLS.get(status, status)


def build_checklist_text(template: dict, instance: dict, *, client_name: str = "") -> str:
    lines: list[str] = []
    title = template.get("title") or "監査チェックリスト"
    lines.append(f">> {title}")
    lines.append("")

    header = instance.get("header") or {}
    for field in template.get("headerFields") or []:
        fid = field.get("id")
        label = field.get("label") or fid
        value = str(header.get(fid) or "").strip()
        if not value and fid == "client_name" and client_name:
            value = f"【　{client_name}　様】"
        lines.append(f"{label}：{value or '（未入力）'}")
    if instance.get("circulationMemo"):
        lines.append(f"所内メモ：{instance['circulationMemo']}")
    lines.append("")

    item_states = instance.get("itemStates") or {}
    for section in template.get("sections") or []:
        lines.append(f">> {section.get('title') or ''}")
        kind = section.get("kind")
        if kind == "adjustments":
            lines.append("No.\tPoint．\tResult．")
            for item in section.get("items") or []:
                st = item_states.get(item["id"]) or {}
                point = st.get("label") or item.get("label") or ""
                result = st.get("result") or ""
                lines.append(f"{item.get('number', '')}\t{point}\t{result}")
            lines.append("")
            continue

        lines.append("No.\t確認事項\t確認済\t確認資料\tチェック者コメント\t回答")
        for item in section.get("items") or []:
            if item.get("kind") == "group_header":
                lines.append(f"\t{item.get('label', '')}")
                continue
            if item.get("kind") != "question":
                continue
            st = item_states.get(item["id"]) or {}
            indent = "　" * int(item.get("indent") or 0)
            label = indent + str(item.get("label") or "")
            lines.append(
                "\t".join(
                    [
                        str(item.get("number") or ""),
                        label,
                        _status_symbol(str(st.get("status") or "")),
                        str(st.get("reference") or ""),
                        str(st.get("comment") or ""),
                        str(st.get("answer") or ""),
                    ]
                )
            )
        lines.append("")

    lines.append(f"出力日時：{_now()}")
    wf = instance.get("workflowStatus") or "draft"
    lines.append(f"ステータス：{wf}")
    return "\n".join(lines)


def export_checklist_pdf(
    firm_id: str,
    client_id: str,
    period_key: str,
    *,
    template_id: Optional[str] = None,
    client_name: str = "",
) -> bytes:
    tid, _ = _resolve_instance_storage(firm_id, client_id, period_key, template_id)
    template = get_template(firm_id, tid)
    instance = get_instance(firm_id, client_id, period_key, tid)
    body = build_checklist_text(template, instance, client_name=client_name)
    pdf_title = f"{template.get('title') or 'チェックリスト'} - {client_name or client_id}"
    pdf = text_to_pdf_bytes(body, title=pdf_title)

    instances = _load_instances_raw(firm_id)
    key = _instance_key(client_id, period_key, tid)
    if key in instances:
        instances[key]["exportedAt"] = _now()
        _save_instances_raw(firm_id, instances)
    return pdf


def _slot_text_excerpt(client_id: str, period_key: str, slot_id: str) -> tuple[bool, str]:
    logical = get_logical_by_slot(client_id, period_key, slot_id)
    if not logical:
        return False, ""
    versions = list_versions(logical.id)
    if not versions:
        return True, ""
    latest = versions[0]
    if not latest.metadata_json:
        return True, ""
    try:
        meta = json.loads(latest.metadata_json)
    except json.JSONDecodeError:
        return True, ""
    if not isinstance(meta, dict):
        return True, ""
    parts: list[str] = []
    for key in ("text_excerpt", "ocr_text", "full_text"):
        val = meta.get(key)
        if isinstance(val, str) and val.strip():
            parts.append(val)
    ocr_pages = meta.get("ocr_page_texts")
    if isinstance(ocr_pages, list):
        for page in ocr_pages:
            if isinstance(page, dict) and isinstance(page.get("text"), str):
                parts.append(page["text"])
    return True, "\n".join(parts)


def _keywords_found(text: str, keywords: list[str]) -> bool:
    if not keywords:
        return True
    if not text.strip():
        return False
    normalized = re.sub(r"\s+", "", text)
    hits = sum(
        1
        for kw in keywords
        if re.sub(r"\s+", "", kw) and re.sub(r"\s+", "", kw) in normalized
    )
    return hits >= max(1, len(keywords) // 2 + (1 if len(keywords) % 2 else 0))


def evaluate_alerts(
    firm_id: str,
    client_id: str,
    period_key: str,
    template_id: Optional[str] = None,
) -> dict:
    tid, _ = _resolve_instance_storage(firm_id, client_id, period_key, template_id)
    template = get_template(firm_id, tid)
    instance = get_instance(firm_id, client_id, period_key, tid)
    alerts: list[dict] = []
    if not instance.get("applicable"):
        return {
            "clientId": client_id,
            "periodKey": period_key,
            "templateId": tid,
            "alerts": [],
            "summary": {"total": 0, "warning": 0, "info": 0},
        }

    item_states = instance.get("itemStates") or {}
    for item in iter_alert_items(template):
        anchor = item.get("returnAnchor") or {}
        slot_id = str(anchor.get("slotId") or "")
        keywords = anchor.get("keywords") or []
        state = item_states.get(item["id"]) or {}
        checked = state.get("status") in ("ok", "ng", "note") or state.get("checked")
        uploaded, excerpt = _slot_text_excerpt(client_id, period_key, slot_id)
        label = item.get("label") or item.get("id")

        if checked and not uploaded:
            alerts.append(
                {
                    "itemId": item["id"],
                    "label": label,
                    "severity": "warning",
                    "code": "return_missing",
                    "message": f"「{label}」は確認済みですが、紐付け先の申告書類が未提出です。",
                    "returnAnchor": anchor,
                }
            )
            continue
        if not checked and uploaded and keywords:
            alerts.append(
                {
                    "itemId": item["id"],
                    "label": label,
                    "severity": "info",
                    "code": "unchecked_with_return",
                    "message": f"「{anchor.get('scheduleRef') or label}」の確認が未完了です（申告書類は提出済み）。",
                    "returnAnchor": anchor,
                }
            )
            continue
        if checked and uploaded and keywords:
            if not excerpt.strip():
                alerts.append(
                    {
                        "itemId": item["id"],
                        "label": label,
                        "severity": "info",
                        "code": "unverified",
                        "message": "確認済みですが OCR テキストがないため申告書との自動突合は保留中です。",
                        "returnAnchor": anchor,
                    }
                )
            elif not _keywords_found(excerpt, keywords):
                alerts.append(
                    {
                        "itemId": item["id"],
                        "label": label,
                        "severity": "warning",
                        "code": "not_in_return",
                        "message": f"チェックリストにあるのに申告書テキストに該当記載が見つかりません（{', '.join(keywords[:3])} 等）。",
                        "returnAnchor": anchor,
                    }
                )

    summary = {
        "total": len(alerts),
        "warning": sum(1 for a in alerts if a["severity"] == "warning"),
        "info": sum(1 for a in alerts if a["severity"] == "info"),
    }
    return {
        "clientId": client_id,
        "periodKey": period_key,
        "templateId": tid,
        "alerts": alerts,
        "summary": summary,
    }
