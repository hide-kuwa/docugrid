"""Persist / load DocuGrid workspace metadata to SQLite via SQLModel."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlmodel import Session, select

from database import MVP_USER_ID, delete_document_children, engine
from models.mvp_docugrid import Document, Highlight, Page
from schemas.docugrid_persist import DocugridSaveRequest


def _parse_uuid(s: str) -> UUID:
    try:
        return UUID(s)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"invalid uuid: {s}") from e


def save_workspace(
    body: DocugridSaveRequest,
    *,
    client_id: str | None = None,
    firm_id: str | None = None,
) -> dict[str, Any]:
    doc_id = _parse_uuid(body.document_id) if body.document_id else uuid4()

    first_name = "document.pdf"
    if body.file_order:
        fid = body.file_order[0]
        fmeta = body.files_by_id.get(fid) or {}
        first_name = str(fmeta.get("name") or first_name)

    with Session(engine) as session:
        existing = session.get(Document, doc_id)
        if existing:
            delete_document_children(session, doc_id)
            session.delete(existing)
            session.flush()

        doc = Document(
            id=doc_id,
            owner_user_id=MVP_USER_ID,
            storage_key="",
            original_filename=first_name[:512],
            mime_type="application/pdf",
            page_count=len(body.page_order),
            updated_at=datetime.utcnow(),
            files_json=json.dumps(body.files_by_id, ensure_ascii=False),
            page_order_json=json.dumps(body.page_order, ensure_ascii=False),
            client_id=client_id,
            firm_id=firm_id,
        )
        session.add(doc)
        session.flush()

        page_id_map: dict[str, UUID] = {}
        for ord_idx, page_key in enumerate(body.page_order):
            pe = body.pages_by_id.get(page_key)
            if not pe:
                raise HTTPException(status_code=400, detail=f"missing pagesById[{page_key}]")
            p = Page(
                document_id=doc.id,
                ordinal=ord_idx,
                source_page_index=int(pe.get("originalIndex", 0)),
                frontend_page_id=page_key[:512],
                frontend_file_id=str(pe.get("fileId", ""))[:128],
                display_key=str(pe.get("displayKey", ""))[:512],
            )
            session.add(p)
            session.flush()
            page_id_map[page_key] = p.id

        for hk, hv in body.highlights_by_id.items():
            pid_str = str(hv.get("pageId", ""))
            if pid_str not in page_id_map:
                continue
            r = hv.get("rect") or {}
            session.add(
                Highlight(
                    page_id=page_id_map[pid_str],
                    frontend_highlight_id=str(hk)[:128],
                    tool=str(hv.get("tool", "marker"))[:16],
                    x=float(r.get("x", 0)),
                    y=float(r.get("y", 0)),
                    w=float(r.get("w", 0)),
                    h=float(r.get("h", 0)),
                    z_index=int(hv.get("zIndex", 0)),
                )
            )

        session.commit()

    return {"ok": True, "documentId": str(doc_id)}


def load_workspace(document_id: str) -> dict[str, Any]:
    did = _parse_uuid(document_id)
    with Session(engine) as session:
        doc = session.get(Document, did)
        if doc is None:
            raise HTTPException(status_code=404, detail="document not found")

        files_by_id: dict[str, Any] = {}
        if doc.files_json:
            try:
                files_by_id = json.loads(doc.files_json)
            except json.JSONDecodeError:
                files_by_id = {}

        try:
            page_order: list[str] = json.loads(doc.page_order_json or "[]")
        except json.JSONDecodeError:
            page_order = []

        pages = session.exec(select(Page).where(Page.document_id == did).order_by(Page.ordinal)).all()
        pages_by_id: dict[str, Any] = {}
        for p in pages:
            pages_by_id[p.frontend_page_id] = {
                "id": p.frontend_page_id,
                "fileId": p.frontend_file_id,
                "originalIndex": p.source_page_index,
                "displayKey": p.display_key or f"{p.frontend_file_id}-pg-{p.source_page_index}",
            }

        highlights_by_id: dict[str, Any] = {}
        highlight_ids_by_page_id: dict[str, list[str]] = {}
        for p in pages:
            highlight_ids_by_page_id[p.frontend_page_id] = []
            hs = session.exec(select(Highlight).where(Highlight.page_id == p.id)).all()
            for h in hs:
                hid = h.frontend_highlight_id or str(h.id)
                highlights_by_id[hid] = {
                    "id": hid,
                    "pageId": p.frontend_page_id,
                    "tool": h.tool,
                    "rect": {"x": h.x, "y": h.y, "w": h.w, "h": h.h},
                    "zIndex": h.z_index,
                }
                highlight_ids_by_page_id[p.frontend_page_id].append(hid)

        file_order = list(files_by_id.keys()) if files_by_id else []

        return {
            "documentId": str(doc.id),
            "filesById": files_by_id,
            "pagesById": pages_by_id,
            "highlightsById": highlights_by_id,
            "pageOrder": page_order,
            "fileOrder": file_order,
            "highlightIdsByPageId": highlight_ids_by_page_id,
        }
