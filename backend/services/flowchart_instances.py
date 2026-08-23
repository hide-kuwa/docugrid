"""判定フローの下書きと保存済み呼び出し（顧問先単位）。"""

from __future__ import annotations

import copy
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from services.tenancy import DEFAULT_FIRM_ID

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
_CLIENT_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{1,80}$")
_FIRM_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,80}$")


def _firm(raw: str) -> str:
    fid = (raw or "").strip() or DEFAULT_FIRM_ID
    return fid if _FIRM_ID_RE.match(fid) else DEFAULT_FIRM_ID


def _client(raw: str) -> str:
    cid = (raw or "").strip()
    if not _CLIENT_ID_RE.match(cid):
        raise ValueError("client_id is invalid")
    return cid


def _now() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


def _draft_path(firm_id: str, client_id: str, template_id: str) -> Path:
    safe_tid = re.sub(r"[^A-Za-z0-9._:-]", "_", template_id)[:80]
    return (
        STORAGE_DIR
        / "firms"
        / _firm(firm_id)
        / "flowchart_drafts"
        / _client(client_id)
        / f"{safe_tid}.json"
    )


def _legacy_consumption_path(firm_id: str, client_id: str) -> Path:
    return STORAGE_DIR / "firms" / _firm(firm_id) / "consumption_taxable" / f"{_client(client_id)}.json"


def _instances_path(firm_id: str, client_id: str) -> Path:
    return STORAGE_DIR / "firms" / _firm(firm_id) / "flowchart_instances" / f"{_client(client_id)}.json"


def load_draft(firm_id: str, client_id: str, template_id: str) -> dict[str, Any]:
    path = _draft_path(firm_id, client_id, template_id)
    raw = _read_json(path)
    if not raw and template_id == "global-consumption-taxable":
        legacy = _read_json(_legacy_consumption_path(firm_id, client_id))
        if legacy:
            override = legacy.get("result_override") or "auto"
            if override == "taxable":
                override = "yes"
            elif override == "exempt":
                override = "no"
            return {
                "result_override": override,
                "input_overrides": legacy.get("input_overrides") or {},
                "updated_at": legacy.get("updated_at"),
                "updated_by": legacy.get("updated_by"),
            }
    if not raw:
        return {"result_override": "auto", "input_overrides": {}}
    override = raw.get("result_override") or "auto"
    if override not in ("auto", "yes", "no"):
        override = "auto"
    inputs = raw.get("input_overrides") if isinstance(raw.get("input_overrides"), dict) else {}
    return {
        "result_override": override,
        "input_overrides": inputs,
        "updated_at": raw.get("updated_at"),
        "updated_by": raw.get("updated_by"),
    }


def save_draft(
    firm_id: str,
    client_id: str,
    template_id: str,
    *,
    result_override: str,
    input_overrides: dict[str, Any] | None,
    updated_by: str | None = None,
) -> dict[str, Any]:
    payload = {
        "result_override": result_override if result_override in ("auto", "yes", "no") else "auto",
        "input_overrides": dict(input_overrides or {}),
        "updated_at": _now(),
        "updated_by": updated_by,
    }
    path = _draft_path(firm_id, client_id, template_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


def list_instances(
    firm_id: str,
    client_id: str,
    *,
    template_id: str | None = None,
    family_id: str | None = None,
    related_template_ids: list[str] | None = None,
) -> list[dict]:
    data = _read_json(_instances_path(firm_id, client_id))
    items = data.get("items") if isinstance(data, dict) else None
    if not isinstance(items, list):
        return []
    if family_id or related_template_ids:
        fid = (family_id or "").strip()
        related = set(related_template_ids or [])
        if template_id:
            related.add(template_id)
        items = [
            i
            for i in items
            if isinstance(i, dict)
            and (
                (fid and i.get("family_id") == fid)
                or i.get("template_id") in related
            )
        ]
    elif template_id:
        items = [i for i in items if isinstance(i, dict) and i.get("template_id") == template_id]
    items.sort(key=lambda i: str(i.get("saved_at") or ""), reverse=True)
    return items


def save_instance(
    firm_id: str,
    client_id: str,
    *,
    template_id: str,
    title: str,
    run: dict[str, Any],
    saved_by: str | None = None,
) -> dict[str, Any]:
    path = _instances_path(firm_id, client_id)
    data = _read_json(path)
    items = data.get("items") if isinstance(data, dict) and isinstance(data.get("items"), list) else []
    frozen_definition = copy.deepcopy(run.get("definition") or {})
    snapshot = copy.deepcopy(run)
    snapshot["frozen"] = True
    snapshot["definition"] = frozen_definition
    item = {
        "id": uuid.uuid4().hex,
        "template_id": template_id,
        "family_id": run.get("family_id") or template_id,
        "title": (title or "").strip() or (run.get("template_title") or "判定"),
        "saved_at": _now(),
        "saved_by": saved_by,
        "as_of": run.get("as_of"),
        "law_valid_from": run.get("law_valid_from"),
        "law_valid_to": run.get("law_valid_to"),
        "law_label": run.get("law_label") or "",
        "law_range": run.get("law_range") or "",
        "frozen": True,
        "outcome_label": run.get("outcome_label"),
        "passed": run.get("passed"),
        "result_override": run.get("result_override"),
        "input_overrides": run.get("input_overrides")
        or {k: run.get("inputs", {}).get(k) for k in run.get("input_override_keys") or []},
        "frozen_definition": frozen_definition,
        "snapshot": snapshot,
    }
    items.append(item)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"items": items, "updatedAt": _now()}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return item


def get_instance(firm_id: str, client_id: str, instance_id: str) -> Optional[dict]:
    for item in list_instances(firm_id, client_id):
        if item.get("id") == instance_id:
            return item
    return None


def delete_instance(firm_id: str, client_id: str, instance_id: str) -> bool:
    path = _instances_path(firm_id, client_id)
    data = _read_json(path)
    items = data.get("items") if isinstance(data, dict) and isinstance(data.get("items"), list) else []
    next_items = [i for i in items if not (isinstance(i, dict) and i.get("id") == instance_id)]
    if len(next_items) == len(items):
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"items": next_items, "updatedAt": _now()}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return True


def _read_json(path: Path) -> dict:
    if not path.is_file():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return raw if isinstance(raw, dict) else {}
