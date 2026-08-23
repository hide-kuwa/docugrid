"""判定フローひな形 API（文書ひな形と同じ Global / Local）。"""

from __future__ import annotations

import copy
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel

from api.deps import (
    _attachment_content_disposition,
    _auth_context,
    _log_audit_event,
    _require_client_permission,
    _require_permission,
    _require_platform_settings,
)
from api.master_store import _load_client_master
from services.flowchart_engine import run_template_for_client
from services.flowchart_instances import (
    delete_instance,
    get_instance,
    list_instances,
    load_draft,
    save_draft,
    save_instance,
)
from services.flowchart_pdf import instance_to_pdf_bytes
from services.flowchart_templates import (
    BLANK_DEFINITION,
    create_local_template,
    delete_template,
    get_template_by_id,
    list_all_for_firm,
    resolve_template,
    today_iso,
    update_template,
)

router = APIRouter(tags=["flowchart-templates"])


class FlowchartTemplateBody(BaseModel):
    title: str = ""
    description: str = ""
    category: str = "general"
    definition: dict[str, Any] | None = None
    family_id: Optional[str] = None
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None
    law_label: Optional[str] = None


class FlowchartRunBody(BaseModel):
    client_id: str
    result_override: str = "auto"
    input_overrides: dict[str, Any] | None = None
    persist_draft: bool = True
    as_of: Optional[str] = None
    family_id: Optional[str] = None


class FlowchartInstanceBody(BaseModel):
    template_id: str = ""
    family_id: Optional[str] = None
    title: str = ""
    result_override: str = "auto"
    input_overrides: dict[str, Any] | None = None
    as_of: Optional[str] = None


def _client_context(client_id: str) -> dict[str, Any]:
    master = _load_client_master()
    row = next((c for c in master.clients if c.id == client_id), None)
    if not row:
        return {"id": client_id, "name": "", "fiscalMonth": 0, "category": "", "profile": {}}
    return {
        "id": row.id,
        "name": row.name,
        "fiscalMonth": row.fiscalMonth,
        "category": row.category,
        "profile": dict(row.profile or {}),
    }


def _is_platform(request: Request) -> bool:
    ctx = _auth_context(request)
    from api.deps import _get_role_permissions

    return "settings.platform" in _get_role_permissions().get(ctx.role, set())


def _pick_template(
    request: Request,
    *,
    template_id: str | None = None,
    family_id: str | None = None,
    as_of: str | None = None,
) -> tuple[dict[str, Any], str]:
    ctx = _auth_context(request)
    as_of_date = (as_of or "").strip() or today_iso()
    template = resolve_template(
        ctx.firm_id,
        template_id=template_id,
        family_id=family_id,
        as_of=as_of_date,
    )
    if not template:
        raise HTTPException(
            status_code=404,
            detail="No flowchart edition covers this as_of date",
        )
    return template, as_of_date


@router.get("/api/flowchart-templates")
def get_flowchart_templates(request: Request):
    _require_permission(request, "document.view")
    ctx = _auth_context(request)
    payload = list_all_for_firm(ctx.firm_id)
    _log_audit_event(request, "flowchart_templates.list", "success")
    return payload


@router.get("/api/flowchart-templates/{template_id}")
def get_flowchart_template(request: Request, template_id: str):
    _require_permission(request, "document.view")
    ctx = _auth_context(request)
    item = get_template_by_id(template_id, ctx.firm_id)
    if not item:
        raise HTTPException(status_code=404, detail="Template not found")
    return item


@router.post("/api/flowchart-templates")
def post_flowchart_template(request: Request, body: FlowchartTemplateBody):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="title is required")
    created = create_local_template(
        ctx.firm_id,
        title=body.title.strip(),
        description=body.description.strip(),
        category=body.category.strip() or "general",
        definition=body.definition or dict(BLANK_DEFINITION),
        family_id=body.family_id or "",
        valid_from=body.valid_from,
        valid_to=body.valid_to,
        law_label=body.law_label or "",
    )
    _log_audit_event(request, "flowchart_templates.create", "success", created["id"])
    return created


@router.put("/api/flowchart-templates/{template_id}")
def put_flowchart_template(request: Request, template_id: str, body: FlowchartTemplateBody):
    ctx = _auth_context(request)
    existing = get_template_by_id(template_id, ctx.firm_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Template not found")
    if existing["scope"] == "global":
        _require_platform_settings(request)
    else:
        _require_permission(request, "settings.manage")
    updated = update_template(
        template_id,
        ctx.firm_id,
        title=body.title or None,
        description=body.description,
        category=body.category or None,
        definition=body.definition,
        family_id=body.family_id,
        valid_from=body.valid_from,
        valid_to=body.valid_to,
        law_label=body.law_label,
        is_platform=_is_platform(request),
    )
    if not updated:
        raise HTTPException(status_code=403, detail="Cannot update template")
    _log_audit_event(request, "flowchart_templates.update", "success", template_id)
    return updated


@router.delete("/api/flowchart-templates/{template_id}")
def delete_flowchart_template(request: Request, template_id: str):
    ctx = _auth_context(request)
    existing = get_template_by_id(template_id, ctx.firm_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Template not found")
    if existing["scope"] == "global":
        _require_platform_settings(request)
    else:
        _require_permission(request, "settings.manage")
    if not delete_template(template_id, ctx.firm_id, is_platform=_is_platform(request)):
        raise HTTPException(status_code=403, detail="Cannot delete template")
    _log_audit_event(request, "flowchart_templates.delete", "success", template_id)
    return {"ok": True}


@router.post("/api/flowchart-templates/{template_id}/run")
def run_flowchart_template(request: Request, template_id: str, body: FlowchartRunBody):
    _require_client_permission(request, "client.view", body.client_id)
    ctx = _auth_context(request)
    template, as_of = _pick_template(
        request,
        template_id=template_id,
        family_id=body.family_id,
        as_of=body.as_of,
    )
    if body.persist_draft:
        _require_client_permission(request, "client.edit", body.client_id)
        save_draft(
            ctx.firm_id,
            body.client_id,
            template["id"],
            result_override=body.result_override,
            input_overrides=body.input_overrides,
            updated_by=ctx.email,
        )
        draft = {
            "result_override": body.result_override,
            "input_overrides": body.input_overrides or {},
        }
    else:
        draft = load_draft(ctx.firm_id, body.client_id, template["id"])
        if body.input_overrides is not None or body.result_override != "auto":
            draft = {
                "result_override": body.result_override,
                "input_overrides": body.input_overrides
                if body.input_overrides is not None
                else draft.get("input_overrides"),
            }
    try:
        run = run_template_for_client(
            template,
            firm_id=ctx.firm_id,
            client=_client_context(body.client_id),
            input_overrides=draft.get("input_overrides"),
            result_override=str(draft.get("result_override") or "auto"),
            as_of=as_of,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    run["client_id"] = body.client_id
    return run


@router.get("/api/clients/{client_id}/flowchart-run")
def get_client_flowchart_run(
    request: Request,
    client_id: str,
    template_id: Optional[str] = Query(None),
    family_id: Optional[str] = Query(None),
    as_of: Optional[str] = Query(None),
):
    _require_client_permission(request, "client.view", client_id)
    ctx = _auth_context(request)
    template, as_of_date = _pick_template(
        request,
        template_id=template_id or "global-consumption-taxable",
        family_id=family_id,
        as_of=as_of,
    )
    draft = load_draft(ctx.firm_id, client_id, template["id"])
    try:
        run = run_template_for_client(
            template,
            firm_id=ctx.firm_id,
            client=_client_context(client_id),
            input_overrides=draft.get("input_overrides"),
            result_override=str(draft.get("result_override") or "auto"),
            as_of=as_of_date,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    run["client_id"] = client_id
    run["draft_updated_at"] = draft.get("updated_at")
    return run


@router.get("/api/clients/{client_id}/flowchart-instances")
def get_client_flowchart_instances(
    request: Request,
    client_id: str,
    template_id: Optional[str] = Query(None),
    family_id: Optional[str] = Query(None),
):
    _require_client_permission(request, "client.view", client_id)
    ctx = _auth_context(request)
    related_ids: list[str] | None = None
    if family_id:
        bags = list_all_for_firm(ctx.firm_id)
        related_ids = [
            t["id"]
            for t in bags["global"] + bags["local"]
            if str(t.get("family_id") or t.get("id")) == family_id
        ]
    items = list_instances(
        ctx.firm_id,
        client_id,
        template_id=template_id,
        family_id=family_id,
        related_template_ids=related_ids,
    )
    summaries = [
        {
            "id": i.get("id"),
            "template_id": i.get("template_id"),
            "family_id": i.get("family_id"),
            "title": i.get("title"),
            "saved_at": i.get("saved_at"),
            "saved_by": i.get("saved_by"),
            "outcome_label": i.get("outcome_label"),
            "passed": i.get("passed"),
            "as_of": i.get("as_of"),
            "law_label": i.get("law_label"),
            "law_range": i.get("law_range"),
            "frozen": i.get("frozen", True),
        }
        for i in items
    ]
    return {"items": summaries}


@router.post("/api/clients/{client_id}/flowchart-instances")
def post_client_flowchart_instance(request: Request, client_id: str, body: FlowchartInstanceBody):
    _require_client_permission(request, "client.edit", client_id)
    ctx = _auth_context(request)
    template, as_of = _pick_template(
        request,
        template_id=body.template_id or None,
        family_id=body.family_id,
        as_of=body.as_of,
    )
    save_draft(
        ctx.firm_id,
        client_id,
        template["id"],
        result_override=body.result_override,
        input_overrides=body.input_overrides,
        updated_by=ctx.email,
    )
    try:
        run = run_template_for_client(
            template,
            firm_id=ctx.firm_id,
            client=_client_context(client_id),
            input_overrides=body.input_overrides,
            result_override=body.result_override,
            as_of=as_of,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    run["definition"] = copy.deepcopy(template.get("definition") or {})
    item = save_instance(
        ctx.firm_id,
        client_id,
        template_id=template["id"],
        title=body.title,
        run={**run, "input_overrides": body.input_overrides or {}},
        saved_by=ctx.email,
    )
    _log_audit_event(request, "flowchart_instance.create", "success", item["id"])
    return item


@router.get("/api/clients/{client_id}/flowchart-instances/{instance_id}")
def get_client_flowchart_instance(request: Request, client_id: str, instance_id: str):
    _require_client_permission(request, "client.view", client_id)
    ctx = _auth_context(request)
    item = get_instance(ctx.firm_id, client_id, instance_id)
    if not item:
        raise HTTPException(status_code=404, detail="Instance not found")
    snapshot = item.get("snapshot") if isinstance(item.get("snapshot"), dict) else {}
    snapshot = dict(snapshot)
    snapshot["frozen"] = True
    if item.get("frozen_definition") and not snapshot.get("definition"):
        snapshot["definition"] = item.get("frozen_definition")
    item = dict(item)
    item["snapshot"] = snapshot
    item["frozen"] = True
    return item


@router.get("/api/clients/{client_id}/flowchart-instances/{instance_id}/pdf")
def get_client_flowchart_instance_pdf(request: Request, client_id: str, instance_id: str):
    _require_client_permission(request, "client.view", client_id)
    ctx = _auth_context(request)
    item = get_instance(ctx.firm_id, client_id, instance_id)
    if not item:
        raise HTTPException(status_code=404, detail="Instance not found")
    pdf_bytes = instance_to_pdf_bytes(item)
    title = str(item.get("title") or "判定記録").strip() or "判定記録"
    filename = f"{title}.pdf"
    _log_audit_event(request, "flowchart_instance.export_pdf", "success", instance_id)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": _attachment_content_disposition(filename)},
    )


@router.delete("/api/clients/{client_id}/flowchart-instances/{instance_id}")
def delete_client_flowchart_instance(request: Request, client_id: str, instance_id: str):
    _require_client_permission(request, "client.edit", client_id)
    ctx = _auth_context(request)
    if not delete_instance(ctx.firm_id, client_id, instance_id):
        raise HTTPException(status_code=404, detail="Instance not found")
    _log_audit_event(request, "flowchart_instance.delete", "success", instance_id)
    return {"ok": True}
