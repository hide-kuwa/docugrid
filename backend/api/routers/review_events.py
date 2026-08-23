"""DocuGrid API — review_events routes."""

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

_REVIEW_EVENT_TYPES = frozenset(
    {
        "upload",
        "page_view",
        "page_reorder",
        "annotate",
        "export_pdf",
        "viewer_open_preview",
        "viewer_open_edit",
        "viewer_close",
        "work_save",
        "request_review",
        "audit_start",
        "audit_suspend",
        "approve",
        "remand",
        "audit_link_create",
        "client_share",
        "client_unshare",
        "document_delete",
        "document_soft_delete",
        "document_restore",
        "version_delete",
        "acknowledge",
        "agree",
    }
)
_REVIEW_EVENT_TYPES_NEED_APPROVE = frozenset({"approve", "remand", "audit_start"})


def _authorize_review_event_write(request: Request, client_id: str, event_type: str) -> str:
    if event_type not in _REVIEW_EVENT_TYPES:
        raise HTTPException(status_code=400, detail="Invalid event_type")
    if event_type in _REVIEW_EVENT_TYPES_NEED_APPROVE:
        return _require_client_permission(request, "audit.approve", client_id)
    return _require_client_permission(request, "document.view", client_id)


@router.post("/api/review-events", response_model=ReviewEventItem)
async def create_review_event(request: Request, payload: ReviewEventCreate):
    role = _authorize_review_event_write(request, payload.client_id, payload.event_type)
    # 差戻しは理由必須（監査要件）
    if payload.event_type == "remand" and not (payload.reason and payload.reason.strip()):
        raise HTTPException(status_code=400, detail="remand requires a reason")
    identity = resolve_identity(request)
    item = _append_review_event(
        client_id=payload.client_id,
        period_key=payload.period_key,
        slot_id=payload.slot_id,
        event_type=payload.event_type,
        content_sha256=payload.content_sha256,
        version_label=payload.version_label,
        status=payload.status,
        action_title=payload.action_title,
        reason=payload.reason,
        actor_stakeholder_id=identity.stakeholder_id or None,
        actor_email=identity.email or None,
        actor_role=role,
        is_major=payload.is_major,
        logical_document_id=payload.logical_document_id,
        document_version_id=payload.document_version_id,
        detail=payload.detail,
    )
    if payload.logical_document_id:
        if payload.event_type == "approve" and payload.document_version_id:
            mark_approved(payload.logical_document_id, payload.document_version_id)
        elif payload.event_type == "remand":
            mark_remanded(payload.logical_document_id)
    _log_audit_event(
        request,
        "review_event.create",
        "success",
        f"client={payload.client_id} slot={payload.slot_id} type={payload.event_type}",
    )
    return item


@router.get("/api/review-events", response_model=List[ReviewEventItem])
async def list_review_events(
    request: Request,
    client_id: str = Query(...),
    period_key: Optional[str] = Query(None),
    slot_id: Optional[str] = Query(None),
):
    role = _require_client_permission(request, "document.view", client_id)
    ctx = _auth_context(request)
    _init_review_events_db()
    clauses = ["client_id = ?", "firm_id = ?"]
    params: list[str] = [client_id, ctx.firm_id]
    if period_key:
        clauses.append("period_key = ?")
        params.append(period_key)
    if slot_id is not None:
        clauses.append("slot_id = ?")
        params.append(slot_id)
    where = " AND ".join(clauses)
    with sqlite3.connect(REVIEW_EVENTS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            f"SELECT * FROM review_events WHERE {where} ORDER BY created_at DESC, rowid DESC",
            params,
        ).fetchall()
    filtered = _filter_review_event_rows(request, rows)
    return [_row_to_review_event(r) for r in filtered]


def _query_review_events(
    client_id: str,
    period_key: Optional[str] = None,
    slot_id: Optional[str] = None,
    *,
    firm_id: Optional[str] = None,
) -> List[sqlite3.Row]:
    _init_review_events_db()
    clauses = ["client_id = ?"]
    params: list[str] = [client_id]
    if firm_id:
        clauses.append("firm_id = ?")
        params.append(firm_id)
    if period_key:
        clauses.append("period_key = ?")
        params.append(period_key)
    if slot_id is not None:
        clauses.append("slot_id = ?")
        params.append(slot_id)
    where = " AND ".join(clauses)
    with sqlite3.connect(REVIEW_EVENTS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        return conn.execute(
            f"SELECT * FROM review_events WHERE {where} ORDER BY created_at ASC, rowid ASC",
            params,
        ).fetchall()


def _lookup_slot_label(client_id: str, period_key: str, slot_id: str) -> Optional[str]:
    _init_slot_documents_db()
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            """
            SELECT slot_label FROM slot_documents
            WHERE client_id=? AND period_key=? AND slot_id=?
            """,
            (client_id, period_key, slot_id),
        ).fetchone()
    return row["slot_label"] if row else None


def _query_review_timeline(
    client_id: str,
    period_key: Optional[str] = None,
    limit: int = 50,
    *,
    firm_id: Optional[str] = None,
) -> List[sqlite3.Row]:
    _init_review_events_db()
    clauses = ["client_id = ?"]
    params: list[str | int] = [client_id]
    if firm_id:
        clauses.append("firm_id = ?")
        params.append(firm_id)
    if period_key:
        clauses.append("period_key = ?")
        params.append(period_key)
    where = " AND ".join(clauses)
    params.append(limit)
    with sqlite3.connect(REVIEW_EVENTS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        return conn.execute(
            f"SELECT * FROM review_events WHERE {where} ORDER BY created_at DESC, rowid DESC LIMIT ?",
            params,
        ).fetchall()


@router.post("/api/review-events/batch", response_model=List[ReviewEventItem])
async def create_review_events_batch(request: Request, payload: ReviewEventBatchCreate):
    if not payload.events:
        raise HTTPException(status_code=400, detail="events must not be empty")
    if len(payload.events) > 100:
        raise HTTPException(status_code=400, detail="too many events (max 100)")
    client_ids = {e.client_id for e in payload.events}
    if len(client_ids) != 1:
        raise HTTPException(status_code=400, detail="all events must share client_id")
    client_id = next(iter(client_ids))
    identity = resolve_identity(request)
    items: List[ReviewEventItem] = []
    for event in payload.events:
        if event.client_id != client_id:
            raise HTTPException(status_code=400, detail="client_id mismatch in batch")
        role = _authorize_review_event_write(request, event.client_id, event.event_type)
        if event.event_type == "remand" and not (event.reason and event.reason.strip()):
            raise HTTPException(status_code=400, detail="remand requires a reason")
        item = _append_review_event(
            client_id=event.client_id,
            period_key=event.period_key,
            slot_id=event.slot_id,
            event_type=event.event_type,
            content_sha256=event.content_sha256,
            version_label=event.version_label,
            status=event.status,
            action_title=event.action_title,
            reason=event.reason,
            actor_stakeholder_id=identity.stakeholder_id or None,
            actor_email=identity.email or None,
            actor_role=role,
            is_major=event.is_major,
            logical_document_id=event.logical_document_id,
            document_version_id=event.document_version_id,
            detail=event.detail,
        )
        items.append(item)
    _log_audit_event(
        request,
        "review_event.batch",
        "success",
        f"client={client_id} count={len(items)}",
    )
    return items


@router.get("/api/review-events/timeline", response_model=List[ReviewTimelineItem])
async def get_review_timeline(
    request: Request,
    client_id: str = Query(...),
    period_key: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """顧問先（＋任意で期間）横断の監査イベントを新しい順に返す。"""
    role = _require_client_permission(request, "document.view", client_id)
    ctx = _auth_context(request)
    rows = _filter_review_event_rows(
        request,
        _query_review_timeline(client_id, period_key, limit, firm_id=ctx.firm_id),
    )
    label_cache: dict[tuple[str, str, str], Optional[str]] = {}
    items: List[ReviewTimelineItem] = []
    for row in rows:
        base = _row_to_review_event(row)
        cache_key = (row["client_id"], row["period_key"], row["slot_id"])
        if cache_key not in label_cache:
            label_cache[cache_key] = _lookup_slot_label(*cache_key)
        items.append(
            ReviewTimelineItem(
                **base.model_dump(),
                slot_label=label_cache[cache_key],
            )
        )
    _log_audit_event(
        request,
        "review_event.timeline",
        "success",
        f"client={client_id} period={period_key or 'all'} count={len(items)}",
    )
    return items


@router.get("/api/review-events/export")
async def export_review_events(
    request: Request,
    client_id: str = Query(...),
    period_key: Optional[str] = Query(None),
    slot_id: Optional[str] = Query(None),
    format: str = Query("csv", pattern="^(csv|json)$"),
):
    role = _require_client_permission(request, "audit.approve", client_id)
    ctx = _auth_context(request)
    rows = _filter_review_event_rows(
        request,
        _query_review_events(client_id, period_key, slot_id, firm_id=ctx.firm_id),
    )
    items = [_row_to_review_event(r) for r in rows]
    stamp = datetime.now(timezone.utc).replace(tzinfo=None).strftime("%Y%m%dT%H%M%S")
    base_name = f"review-events_{client_id}_{period_key or 'all'}_{stamp}"

    if format == "json":
        payload = json.dumps([i.model_dump() for i in items], ensure_ascii=False, indent=2)
        return Response(
            content=payload,
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{base_name}.json"'},
        )

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "created_at",
            "event_type",
            "status",
            "action_title",
            "version_label",
            "client_id",
            "period_key",
            "slot_id",
            "actor_email",
            "actor_role",
            "reason",
            "detail",
            "document_version_id",
            "logical_document_id",
        ]
    )
    for item in items:
        writer.writerow(
            [
                item.created_at,
                item.event_type,
                item.status or "",
                item.action_title or "",
                item.version_label or "",
                item.client_id,
                item.period_key,
                item.slot_id,
                item.actor_email or "",
                item.actor_role or "",
                item.reason or "",
                item.detail or "",
                item.document_version_id or "",
                item.logical_document_id or "",
            ]
        )
    return Response(
        content="\ufeff" + buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{base_name}.csv"'},
    )


