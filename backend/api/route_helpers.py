"""Shared route helpers (slots, review events)."""

from __future__ import annotations

from api.constants import *  # noqa: F403
from api.deps import *  # noqa: F403
from api.master_store import *  # noqa: F403
from api.persistence import *  # noqa: F403
from api.router_imports import *  # noqa: F403
from api.schemas import *  # noqa: F403

__all__ = [
    "_append_review_event",
    "_enrich_slot_item",
    "_firm_usage_counts",
    "_latest_workflow_status",
    "_lookup_slot_label",
    "_query_review_events",
    "_query_review_timeline",
    "_row_to_review_event",
    "_row_to_slot_item",
    "_update_slot_current_version",
    "_version_to_item",
]


def _firm_usage_counts(firm_id: str) -> tuple[int, int]:
    master = _load_client_master()
    client_count = sum(1 for c in master.clients if get_client_firm_id(c.id) == firm_id)
    seat_count = sum(1 for m in list_members_for_firm(firm_id) if m.status == MEMBER_STATUS_ACTIVE)
    return client_count, seat_count


def _row_to_slot_item(row: sqlite3.Row) -> SlotDocumentItem:
    return SlotDocumentItem(
        id=row["id"],
        client_id=row["client_id"],
        period_key=row["period_key"],
        slot_id=row["slot_id"],
        slot_label=row["slot_label"],
        original_name=row["original_name"],
        page_count=row["page_count"],
        content_sha256=row["content_sha256"],
        byte_size=row["byte_size"],
        uploaded_by=row["uploaded_by"],
        uploaded_at=row["uploaded_at"],
        logical_document_id=row["logical_document_id"] if "logical_document_id" in row.keys() else None,
        current_version_id=row["current_version_id"] if "current_version_id" in row.keys() else None,
        current_version_label=None,
        workflow_status=None,
        docugrid_document_id=row["docugrid_document_id"] if "docugrid_document_id" in row.keys() else None,
        logical_status=None,
        google_drive_file_id=row["google_drive_file_id"] if "google_drive_file_id" in row.keys() else None,
        deleted_at=row["deleted_at"] if "deleted_at" in row.keys() else None,
        deleted_from_slot_id=row["deleted_from_slot_id"] if "deleted_from_slot_id" in row.keys() else None,
        deleted_from_slot_label=row["deleted_from_slot_label"] if "deleted_from_slot_label" in row.keys() else None,
        client_shared_at=row["client_shared_at"] if "client_shared_at" in row.keys() else None,
        client_shared_by=row["client_shared_by"] if "client_shared_by" in row.keys() else None,
    )


def _latest_workflow_status(client_id: str, period_key: str, slot_id: str) -> Optional[str]:
    _init_review_events_db()
    with sqlite3.connect(REVIEW_EVENTS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            """
            SELECT status FROM review_events
            WHERE client_id=? AND period_key=? AND slot_id=?
            ORDER BY created_at DESC, rowid DESC
            LIMIT 1
            """,
            (client_id, period_key, slot_id),
        ).fetchone()
    return row["status"] if row else None


def _enrich_slot_item(row: sqlite3.Row) -> SlotDocumentItem:
    item = _row_to_slot_item(row)
    if item.current_version_id:
        version = get_version(item.current_version_id)
        if version:
            item.current_version_label = version.version_label
            if version.metadata_json:
                try:
                    item.classify_metadata = json.loads(version.metadata_json)
                except json.JSONDecodeError:
                    item.classify_metadata = None
    item.workflow_status = _latest_workflow_status(
        row["client_id"],
        row["period_key"],
        row["deleted_from_slot_id"] if row["deleted_from_slot_id"] else row["slot_id"],
    )
    logical_id = row["logical_document_id"] if "logical_document_id" in row.keys() else None
    logical = get_logical_by_id(logical_id) if logical_id else get_logical_by_slot(
        row["client_id"], row["period_key"], row["slot_id"]
    )
    if logical:
        item.logical_status = logical.status
        item.version_count = count_versions(logical.id)
    return item


def _version_to_item(v) -> DocumentVersionItem:
    return DocumentVersionItem(
        id=v.id,
        logical_document_id=v.logical_document_id,
        version_label=v.version_label,
        content_sha256=v.content_sha256,
        byte_size=v.byte_size,
        page_count=v.page_count,
        original_name=v.original_name,
        source=v.source,
        parent_version_id=v.parent_version_id,
        created_by_stakeholder_id=v.created_by_stakeholder_id,
        created_by_email=v.created_by_email,
        created_at=v.created_at,
    )


class ReviewTimelineItem(ReviewEventItem):
    slot_label: Optional[str] = None


def _row_to_review_event(row: sqlite3.Row) -> ReviewEventItem:
    keys = row.keys()
    return ReviewEventItem(
        id=row["id"],
        client_id=row["client_id"],
        period_key=row["period_key"],
        slot_id=row["slot_id"],
        content_sha256=row["content_sha256"],
        version_label=row["version_label"],
        event_type=row["event_type"],
        status=row["status"],
        action_title=row["action_title"],
        reason=row["reason"],
        actor_stakeholder_id=row["actor_stakeholder_id"],
        actor_email=row["actor_email"],
        actor_role=row["actor_role"],
        is_major=bool(row["is_major"]),
        created_at=row["created_at"],
        logical_document_id=row["logical_document_id"] if "logical_document_id" in keys else None,
        document_version_id=row["document_version_id"] if "document_version_id" in keys else None,
        detail=row["detail"] if "detail" in keys else None,
    )


def _append_review_event(
    *,
    client_id: str,
    period_key: str,
    slot_id: str,
    event_type: str,
    content_sha256: Optional[str] = None,
    version_label: Optional[str] = None,
    status: Optional[str] = None,
    action_title: Optional[str] = None,
    reason: Optional[str] = None,
    actor_stakeholder_id: Optional[str] = None,
    actor_email: Optional[str] = None,
    actor_role: Optional[str] = None,
    is_major: bool = False,
    logical_document_id: Optional[str] = None,
    document_version_id: Optional[str] = None,
    detail: Optional[str] = None,
) -> ReviewEventItem:
    """追記専用（append-only）の業務監査イベントを記録する。"""
    _init_review_events_db()
    event_id = uuid.uuid4().hex
    now = datetime.utcnow().isoformat()
    event_firm_id = get_client_firm_id(client_id)
    with sqlite3.connect(REVIEW_EVENTS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        conn.execute(
            """
            INSERT INTO review_events
                (id, client_id, period_key, slot_id, content_sha256, version_label,
                 event_type, status, action_title, reason,
                 actor_stakeholder_id, actor_email, actor_role, is_major, created_at,
                 logical_document_id, document_version_id, detail, firm_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                client_id,
                period_key,
                slot_id,
                content_sha256,
                version_label,
                event_type,
                status,
                action_title,
                reason,
                actor_stakeholder_id,
                actor_email,
                actor_role,
                1 if is_major else 0,
                now,
                logical_document_id,
                document_version_id,
                detail,
                event_firm_id,
            ),
        )
        row = conn.execute("SELECT * FROM review_events WHERE id=?", (event_id,)).fetchone()
    return _row_to_review_event(row)

def _update_slot_current_version(
    *,
    client_id: str,
    period_key: str,
    slot_id: str,
    version,
    slot_label: Optional[str],
    uploaded_by: str,
) -> None:
    """slot_documents の current ポインタを最新版に更新する。"""
    client_firm = get_client_firm_id(client_id)
    _init_slot_documents_db()
    now = datetime.utcnow().isoformat()
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        prev = conn.execute(
            "SELECT id FROM slot_documents WHERE client_id=? AND period_key=? AND slot_id=?",
            (client_id, period_key, slot_id),
        ).fetchone()
        if prev:
            conn.execute(
                """
                UPDATE slot_documents SET
                    slot_label=COALESCE(?, slot_label), original_name=?, storage_key=?,
                    page_count=?, content_sha256=?, byte_size=?, uploaded_by=?, uploaded_at=?,
                    logical_document_id=?, current_version_id=?, firm_id=?
                WHERE id=?
                """,
                (
                    slot_label,
                    version.original_name,
                    version.storage_key,
                    version.page_count,
                    version.content_sha256,
                    version.byte_size,
                    uploaded_by,
                    now,
                    version.logical_document_id,
                    version.id,
                    client_firm,
                    prev["id"],
                ),
            )
        else:
            conn.execute(
                """
                INSERT INTO slot_documents
                    (id, client_id, period_key, slot_id, slot_label, original_name, storage_key,
                     page_count, content_sha256, byte_size, uploaded_by, uploaded_at,
                     logical_document_id, current_version_id, firm_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    uuid.uuid4().hex,
                    client_id,
                    period_key,
                    slot_id,
                    slot_label,
                    version.original_name,
                    version.storage_key,
                    version.page_count,
                    version.content_sha256,
                    version.byte_size,
                    uploaded_by,
                    now,
                    version.logical_document_id,
                    version.id,
                    client_firm,
                ),
            )

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
