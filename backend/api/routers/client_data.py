"""DocuGrid API — client_data routes."""

from __future__ import annotations

from fastapi import APIRouter

from api.router_imports import *  # noqa: F403
from api.constants import *  # noqa: F403
from api.deps import *  # noqa: F403
from api.persistence import *  # noqa: F403
from api.master_store import *  # noqa: F403
from api.session import *  # noqa: F403
from api.billing_access import *  # noqa: F403
from api.schemas import *  # noqa: F403
from api.route_helpers import *  # noqa: F403

router = APIRouter()

# --- クライアント指標 SSOT（CHARTS）---
@router.get("/api/clients/{client_id}/metrics/charts")
async def get_client_charts_metrics(request: Request, client_id: str):
    role = _require_client_permission(request, "client.view", client_id)
    ctx = _auth_context(request)
    from services.client_metrics_service import build_charts_payload

    master = _load_client_master()
    client_row = next((c for c in master.clients if c.id == client_id), None)
    base_yen = 48_000_000
    if client_row and client_row.profile:
        raw = client_row.profile.get("profit_taxable_income", "")
        if raw:
            digits = "".join(ch for ch in str(raw) if ch.isdigit())
            if digits:
                base_yen = int(digits)
    return build_charts_payload(ctx.firm_id, client_id, seed_base_yen=base_yen)


@router.put("/api/clients/{client_id}/metrics/facts")
async def upsert_client_metric_fact(
    request: Request,
    client_id: str,
    body: ClientMetricUpsertBody,
):
    role = _require_client_permission(request, "settings.manage", client_id)
    ctx = _auth_context(request)
    from services.client_metrics_service import upsert_metric_fact

    fact = upsert_metric_fact(
        ctx.firm_id,
        client_id,
        metric_key=body.metric_key,
        period_key=body.period_key,
        value_yen=body.value_yen,
        value_num=body.value_num,
        source_type="manual",
    )
    _log_audit_event(
        request,
        "metrics.upsert",
        "success",
        f"key={body.metric_key}:{body.period_key}",
    )
    return fact


# --- コミュニケーション SSOT（COMMS）---
@router.get("/api/clients/{client_id}/comms/threads")
async def get_client_comm_threads(request: Request, client_id: str):
    role = _require_client_permission(request, "client.view", client_id)
    ctx = _auth_context(request)
    from services.client_comms_service import list_comm_threads, seed_client_comms_if_empty

    master = _load_client_master()
    client_row = next((c for c in master.clients if c.id == client_id), None)
    contact = "経理担当"
    if client_row and client_row.profile:
        contact = client_row.profile.get("accounting_contact_name") or contact
    seed_client_comms_if_empty(ctx.firm_id, client_id, contact_name=contact)
    return {"threads": list_comm_threads(ctx.firm_id, client_id)}


@router.put("/api/clients/{client_id}/comms/threads")
async def upsert_client_comm_thread(
    request: Request,
    client_id: str,
    body: ClientCommThreadBody,
):
    role = _require_client_permission(request, "settings.manage", client_id)
    ctx = _auth_context(request)
    from services.client_comms_service import upsert_comm_thread

    thread = upsert_comm_thread(
        ctx.firm_id,
        client_id,
        body.model_dump(),
    )
    _log_audit_event(request, "comms.upsert", "success", f"id={thread['id']}")
    return thread


@router.delete("/api/clients/{client_id}/comms/threads/{thread_id}")
async def delete_client_comm_thread(request: Request, client_id: str, thread_id: str):
    role = _require_client_permission(request, "settings.manage", client_id)
    ctx = _auth_context(request)
    from services.client_comms_service import delete_comm_thread

    if not delete_comm_thread(ctx.firm_id, client_id, thread_id):
        raise HTTPException(status_code=404, detail="thread-not-found")
    _log_audit_event(request, "comms.delete", "success", f"id={thread_id}")
    return {"ok": True}


@router.get("/api/clients/{client_id}/metrics/valuation")
async def get_client_valuation_metrics(request: Request, client_id: str):
    role = _require_client_permission(request, "client.view", client_id)
    ctx = _auth_context(request)
    from services.client_metrics_service import build_valuation_payload

    master = _load_client_master()
    client_row = next((c for c in master.clients if c.id == client_id), None)
    profile = client_row.profile if client_row else {}
    return build_valuation_payload(ctx.firm_id, client_id, profile)


# --- シミュレーションオーバーレイ（正規 metrics とは別ストア）---
@router.get("/api/clients/{client_id}/simulation/{panel_key}")
async def get_client_simulation_overlay(request: Request, client_id: str, panel_key: str):
    role = _require_client_permission(request, "client.view", client_id)
    ctx = _auth_context(request)
    from services.client_simulation_service import get_simulation_overlay

    try:
        row = get_simulation_overlay(ctx.firm_id, client_id, panel_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not row or row.get("payload") is None:
        return {"client_id": client_id, "panel_key": panel_key, "payload": None}
    return row


@router.put("/api/clients/{client_id}/simulation/{panel_key}")
async def upsert_client_simulation_overlay(
    request: Request,
    client_id: str,
    panel_key: str,
    body: ClientSimulationBody,
):
    role = _require_client_permission(request, "settings.manage", client_id)
    ctx = _auth_context(request)
    from services.client_simulation_service import upsert_simulation_overlay

    try:
        row = upsert_simulation_overlay(ctx.firm_id, client_id, panel_key, body.payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "simulation.upsert", "success", f"panel={panel_key}")
    return row


@router.delete("/api/clients/{client_id}/simulation/{panel_key}")
async def delete_client_simulation_overlay(request: Request, client_id: str, panel_key: str):
    role = _require_client_permission(request, "settings.manage", client_id)
    ctx = _auth_context(request)
    from services.client_simulation_service import delete_simulation_overlay

    try:
        delete_simulation_overlay(ctx.firm_id, client_id, panel_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "simulation.delete", "success", f"panel={panel_key}")
    return {"ok": True}


@router.get("/api/clients/{client_id}/records")
async def get_client_records(
    request: Request,
    client_id: str,
    domain: str | None = Query(None),
):
    role = _require_client_permission(request, "client.view", client_id)
    ctx = _auth_context(request)
    from services.client_records_service import list_record_items, seed_records_from_profile

    master = _load_client_master()
    client_row = next((c for c in master.clients if c.id == client_id), None)
    profile = client_row.profile if client_row else {}
    seed_records_from_profile(ctx.firm_id, client_id, profile)
    items = list_record_items(ctx.firm_id, client_id, domain=domain)
    return {"items": items}


@router.put("/api/clients/{client_id}/records")
async def upsert_client_record(request: Request, client_id: str, body: ClientRecordItemBody):
    role = _require_client_permission(request, "settings.manage", client_id)
    ctx = _auth_context(request)
    from services.client_records_service import upsert_record_item

    item = upsert_record_item(ctx.firm_id, client_id, body.model_dump())
    _log_audit_event(request, "records.upsert", "success", f"id={item['id']}")
    return item


@router.delete("/api/clients/{client_id}/records/{item_id}")
async def delete_client_record(request: Request, client_id: str, item_id: str):
    role = _require_client_permission(request, "settings.manage", client_id)
    ctx = _auth_context(request)
    from services.client_records_service import delete_record_item

    if not delete_record_item(ctx.firm_id, item_id):
        raise HTTPException(status_code=404, detail="Record not found")
    return {"ok": True}


@router.get("/api/clients/{client_id}/calendar/events")
async def get_client_calendar_events(request: Request, client_id: str):
    role = _require_client_permission(request, "client.view", client_id)
    ctx = _auth_context(request)
    from services.client_calendar_service import list_calendar_events

    return {"events": list_calendar_events(ctx.firm_id, client_id)}


@router.put("/api/clients/{client_id}/calendar/events")
async def upsert_client_calendar_event(
    request: Request,
    client_id: str,
    body: ClientCalendarEventBody,
):
    role = _require_client_permission(request, "settings.manage", client_id)
    ctx = _auth_context(request)
    from services.client_calendar_service import upsert_calendar_event

    event = upsert_calendar_event(ctx.firm_id, client_id, body.model_dump())
    _log_audit_event(request, "calendar.upsert", "success", f"id={event['id']}")
    return event


@router.delete("/api/capture/items/{item_id}")
async def delete_capture_gallery_item(request: Request, item_id: str):
    role = _require_permission(request, "document.upload")
    ctx = _auth_context(request)
    from services.capture_service import get_capture_item

    existing = get_capture_item(ctx.firm_id, item_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Capture item not found")
    _require_client_access(request, role, existing["client_id"], required_permission="document.upload")
    if not delete_capture_item(ctx.firm_id, item_id):
        raise HTTPException(status_code=404, detail="Capture item not found")
    _log_audit_event(request, "capture.delete", "success", f"id={item_id}")
    return {"ok": True}


@router.get("/api/document-catalog/fields")
async def get_document_catalog_fields(
    request: Request,
    category_id: Optional[str] = Query(None),
):
    role = _require_permission(request, "document.view")
    _require_client_scope(request, role)
    if category_id:
        spec = list_catalog_field_defs(category_id)
        if not spec:
            raise HTTPException(status_code=404, detail="Unknown category_id")
        return spec
    return {"categories": list_all_catalog_field_defs()}


@router.get("/api/document-catalog")
async def get_document_catalog(
    request: Request,
    category_id: str = Query(...),
    period_key: Optional[str] = Query(None),
    sort: str = Query("client_name"),
    order: str = Query("asc", pattern="^(asc|desc)$"),
    metadata_status: Optional[str] = Query(None, description="Filter by ExtractedDocumentMeta status"),
    client_id: Optional[str] = Query(None, description="Comma-separated client ids"),
):
    role = _require_permission(request, "document.view")
    ctx = _auth_context(request)
    scope_map = _get_stakeholder_client_scope_map()
    allowed = visible_client_ids(ctx, scope_map)
    if client_id:
        requested = [c.strip() for c in client_id.split(",") if c.strip()]
        client_ids = [c for c in requested if c in allowed]
    else:
        client_ids = sorted(allowed)

    spec = list_catalog_field_defs(category_id)
    if not spec:
        raise HTTPException(status_code=404, detail="Unknown category_id")
    pk = period_key or spec["default_period_key"]

    try:
        payload = build_catalog_rows(
            ctx.firm_id,
            client_ids,
            category_id,
            pk,
            sort=sort,
            order=order,
            metadata_status=metadata_status,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    _log_audit_event(
        request,
        "document.catalog",
        "success",
        f"category={category_id} period={pk} sort={sort}",
    )
    return payload


@router.post("/api/ocr/jobs")
async def post_ocr_job(
    request: Request,
    body: OcrJobCreateBody,
    background_tasks: BackgroundTasks,
):
    """資料版に対する非同期 OCR / 分類ジョブを起動する。"""
    role = _require_client_permission(request, "document.upload", body.client_id)
    ctx = _auth_context(request)
    version = get_version(body.document_version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Document version not found")
    job = create_ocr_job(
        firm_id=ctx.firm_id,
        client_id=body.client_id,
        document_version_id=body.document_version_id,
        period_key=body.period_key,
        slot_id=body.slot_id,
        slot_label=body.slot_label,
    )
    background_tasks.add_task(run_ocr_job, job["id"])
    _log_audit_event(
        request,
        "ocr.job",
        "queued",
        f"job={job['id']} ver={body.document_version_id}",
    )
    return job


@router.get("/api/ocr/jobs/{job_id}")
async def get_ocr_job_status(request: Request, job_id: str, client_id: str = Query(...)):
    role = _require_client_permission(request, "document.view", client_id)
    job = get_ocr_job(job_id)
    if not job or job["client_id"] != client_id:
        raise HTTPException(status_code=404, detail="OCR job not found")
    return job


@router.get("/api/document-status")
async def get_document_status(
    request: Request,
    client_id: str = Query(...),
    period_key: Optional[str] = Query(None),
):
    """必要書類マスタと保存済み資料を突き合わせ、不足状況を返す（不足資料エンジン v1）。

    - period_key 指定: その期間の単一ステータス（未アップロードでも必須一覧から不足を算出）。
    - 未指定: アップロード実績のある全期間のサマリ + 合計不足点数。
    """
    role = _require_client_permission(request, "document.view", client_id)
    _init_slot_documents_db()
    logical_status = slot_status_map(client_id, period_key)
    access_clause = _slot_access_sql_filters(request)

    def approved_slots(pk: str) -> set[str]:
        return {sid for sid, st in logical_status.get(pk, {}).items() if st == "approved"}

    def _active_slot_ids(rows: list[sqlite3.Row]) -> set[str]:
        out: set[str] = set()
        for r in rows:
            sid = str(r["slot_id"])
            if sid.startswith("unassigned_") or sid.startswith("deleted_"):
                continue
            out.add(sid)
        return out

    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        if period_key:
            rows = conn.execute(
                f"SELECT slot_id FROM slot_documents WHERE client_id=? AND period_key=?{access_clause}",
                (client_id, period_key),
            ).fetchall()
            filled = _active_slot_ids(rows)
            return compute_period_status(period_key, filled, approved_slots(period_key))
        rows = conn.execute(
            f"SELECT period_key, slot_id FROM slot_documents WHERE client_id=?{access_clause}",
            (client_id,),
        ).fetchall()

    by_period: Dict[str, set] = {}
    for r in rows:
        sid = str(r["slot_id"])
        if sid.startswith("unassigned_") or sid.startswith("deleted_"):
            continue
        by_period.setdefault(r["period_key"], set()).add(sid)

    periods = [
        compute_period_status(pk, ids, approved_slots(pk))
        for pk, ids in by_period.items()
    ]
    periods.sort(key=lambda p: p["period_key"])
    missing_total = sum(len(p["missing"]) for p in periods)
    pending_approval_total = sum(len(p.get("pending_approval") or []) for p in periods)
    incomplete = [p for p in periods if not p["complete"]]
    return {
        "client_id": client_id,
        "periods": periods,
        "missing_total": missing_total,
        "pending_approval_total": pending_approval_total,
        "incomplete_count": len(incomplete),
        "started_count": len(periods),
    }


@router.get("/api/firm-tasks", response_model=FirmTasksResponse)
async def get_firm_tasks(request: Request):
    """Aggregate missing / pending-approval tasks across visible clients (firm-scoped)."""
    role = _require_permission(request, "dashboard.view")
    ctx = _auth_context(request)
    scope_map = _get_stakeholder_client_scope_map()
    client_ids = sorted(visible_client_ids(ctx, scope_map))
    _init_slot_documents_db()

    assignee_index = build_client_assignee_index(ctx.firm_id)
    member_client_index = build_member_client_index(ctx.firm_id)
    member_names: dict[str, str] = {}
    for member in list_members_for_firm(ctx.firm_id):
        if member.status != MEMBER_STATUS_ACTIVE:
            continue
        label = (member.display_name or member.email or member.stakeholder_id or member.id).strip()
        member_names[member.stakeholder_id] = label
        member_names[member.id] = label

    def _assignees_for_client(client_id: str) -> List[FirmTaskAssignee]:
        pairs = assignee_index.get(client_id, [])
        out: List[FirmTaskAssignee] = []
        for member_id, assignment_role in pairs:
            out.append(
                FirmTaskAssignee(
                    member_id=member_id,
                    display_name=member_names.get(member_id, member_id),
                    assignment_role=assignment_role,
                )
            )
        return out

    def _primary_assignee_id(client_id: str) -> str | None:
        pairs = assignee_index.get(client_id, [])
        if not pairs:
            return None
        return pairs[0][0]

    items: List[FirmTaskItem] = []
    client_summaries: List[FirmClientTaskSummary] = []
    client_task_totals: dict[str, tuple[int, int]] = {}
    missing_total = 0
    pending_total = 0
    unassigned_missing = 0
    unassigned_pending = 0

    for cid in client_ids:
        logical_status = slot_status_map(cid, None)
        with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT period_key, slot_id FROM slot_documents WHERE client_id=?",
                (cid,),
            ).fetchall()
        by_period: Dict[str, set] = {}
        for row in rows:
            by_period.setdefault(str(row["period_key"]), set()).add(str(row["slot_id"]))

        client_missing = 0
        client_pending = 0
        incomplete_periods = 0
        client_assignees = _assignees_for_client(cid)
        primary_id = _primary_assignee_id(cid)

        for pk in sorted(by_period.keys()):
            filled = by_period[pk]
            approved = {sid for sid, st in logical_status.get(pk, {}).items() if st == "approved"}
            status = compute_period_status(pk, filled, approved)
            missing = status.get("missing") or []
            pending = status.get("pending_approval") or []
            client_missing += len(missing)
            client_pending += len(pending)
            if not status.get("complete"):
                incomplete_periods += 1
            for label in missing:
                if not client_assignees:
                    unassigned_missing += 1
                items.append(
                    FirmTaskItem(
                        client_id=cid,
                        period_key=pk,
                        slot_label=str(label),
                        kind="missing",
                        assignees=client_assignees,
                        primary_assignee_id=primary_id,
                    )
                )
            for label in pending:
                if not client_assignees:
                    unassigned_pending += 1
                items.append(
                    FirmTaskItem(
                        client_id=cid,
                        period_key=pk,
                        slot_label=str(label),
                        kind="pending_approval",
                        assignees=client_assignees,
                        primary_assignee_id=primary_id,
                    )
                )

        missing_total += client_missing
        pending_total += client_pending
        client_task_totals[cid] = (client_missing, client_pending)
        if client_missing or client_pending:
            client_summaries.append(
                FirmClientTaskSummary(
                    client_id=cid,
                    missing_total=client_missing,
                    pending_approval_total=client_pending,
                    incomplete_period_count=incomplete_periods,
                    assignees=client_assignees,
                )
            )

    role_map = _get_stakeholder_role_map()
    staff_summaries: List[FirmStaffTaskSummary] = []
    for member_id in sorted(member_client_index.keys()):
        if role_map.get(member_id) == "client_uploader":
            continue
        assigned = member_client_index.get(member_id, set())
        staff_missing = 0
        staff_pending = 0
        open_clients = 0
        for cid in assigned:
            if cid not in client_ids:
                continue
            m, p = client_task_totals.get(cid, (0, 0))
            staff_missing += m
            staff_pending += p
            if m or p:
                open_clients += 1
        visible_assigned = [c for c in assigned if c in client_ids]
        if not visible_assigned:
            continue
        staff_summaries.append(
            FirmStaffTaskSummary(
                member_id=member_id,
                display_name=member_names.get(member_id, member_id),
                missing_total=staff_missing,
                pending_approval_total=staff_pending,
                open_client_count=open_clients,
                assigned_client_count=len(visible_assigned),
                assigned_client_ids=sorted(visible_assigned),
            )
        )
    staff_summaries.sort(
        key=lambda row: row.missing_total + row.pending_approval_total,
        reverse=True,
    )

    _log_audit_event(
        request,
        "firm_tasks.list",
        "success",
        f"clients={len(client_ids)} items={len(items)} staff={len(staff_summaries)}",
    )
    return FirmTasksResponse(
        firm_id=ctx.firm_id,
        missing_total=missing_total,
        pending_approval_total=pending_total,
        client_count=len(client_ids),
        clients=client_summaries,
        items=items,
        staff=staff_summaries,
        unassigned_missing_total=unassigned_missing,
        unassigned_pending_total=unassigned_pending,
    )


