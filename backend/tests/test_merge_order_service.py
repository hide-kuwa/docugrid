"""merge_order_service: page-order merge from OrderPayload."""

import fitz

from schemas.order_payload import OrderPayload
from services.merge_order_service import merge_pdf_bytes_from_order_payload


def _two_page_pdf_bytes() -> bytes:
    doc = fitz.open()
    doc.new_page()
    doc.new_page()
    out = doc.write()
    doc.close()
    return out


def test_merge_pdf_bytes_from_order_payload_applies_marker_highlight() -> None:
    raw = _two_page_pdf_bytes()
    fid = "file-a"
    file_bytes_by_id = {fid: raw}
    order_json = {
        "version": 1,
        "orderedPages": [
            {"pageId": "p0", "fallback": {"fileId": fid, "originalIndex": 0}},
        ],
        "highlightsByPage": [
            {
                "pageId": "p0",
                "items": [
                    {
                        "highlightId": "h1",
                        "tool": "marker",
                        "rect": {"x": 0.1, "y": 0.1, "w": 0.3, "h": 0.2},
                    }
                ],
            }
        ],
    }
    payload = OrderPayload.model_validate(order_json)
    merged = merge_pdf_bytes_from_order_payload(file_bytes_by_id, payload)
    out = fitz.open(stream=merged, filetype="pdf")
    try:
        assert len(out) == 1
        anns = list(out[0].annots() or [])
        assert len(anns) >= 1
    finally:
        out.close()


def test_merge_pdf_bytes_from_order_payload_reorders_pages() -> None:
    raw = _two_page_pdf_bytes()
    fid = "file-a"
    file_bytes_by_id = {fid: raw}
    order_json = {
        "version": 1,
        "orderedPages": [
            {"pageId": "p1", "fallback": {"fileId": fid, "originalIndex": 1}},
            {"pageId": "p0", "fallback": {"fileId": fid, "originalIndex": 0}},
        ],
    }
    payload = OrderPayload.model_validate(order_json)
    merged = merge_pdf_bytes_from_order_payload(file_bytes_by_id, payload)
    out = fitz.open(stream=merged, filetype="pdf")
    try:
        assert len(out) == 2
    finally:
        out.close()
