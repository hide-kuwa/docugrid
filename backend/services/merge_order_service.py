"""
Merge PDF pages according to OrderPayload.ordered_pages, optionally burning in highlights
from highlights_by_page (normalized 0..1 coordinates → page space).
"""

from __future__ import annotations

import io
from typing import Dict, List

import fitz

from schemas.order_payload import HighlightBatchItem, NormalizedCoord, OrderPayload


def _normalized_to_fitz_rect(page: fitz.Page, n: NormalizedCoord) -> fitz.Rect:
    """0..1 の相対座標をページの実寸（ポイント）の fitz.Rect へ。"""
    r = page.rect
    x0 = r.x0 + n.x * r.width
    y0 = r.y0 + n.y * r.height
    x1 = r.x0 + (n.x + n.w) * r.width
    y1 = r.y0 + (n.y + n.h) * r.height
    return fitz.Rect(x0, y0, x1, y1)


def _highlights_by_page_id(payload: OrderPayload) -> Dict[str, List[HighlightBatchItem]]:
    out: Dict[str, List[HighlightBatchItem]] = {}
    if not payload.highlights_by_page:
        return out
    for entry in payload.highlights_by_page:
        out[entry.page_id] = list(entry.items)
    return out


def _apply_highlights_to_page(page: fitz.Page, items: List[HighlightBatchItem]) -> None:
    """
    main.py /api/highlight と同系統の見た目で焼き付け（注釈または draw_*）。
    """
    for item in items:
        rect = _normalized_to_fitz_rect(page, item.rect)
        abs_x = rect.x0
        abs_y = rect.y0
        abs_w = rect.width
        abs_h = rect.height
        t = item.tool

        if t == "box":
            page.draw_rect(rect, color=(1, 0, 0), width=3)
        elif t == "marker":
            annot = page.add_highlight_annot(rect)
            annot.set_colors(stroke=(1, 1, 0))
            annot.update()
        elif t == "line":
            page.draw_line(
                (abs_x, abs_y),
                (abs_x + abs_w, abs_y + abs_h),
                color=(0, 0, 1),
                width=3,
            )
        elif t == "check":
            page.draw_line(
                (abs_x, abs_y + abs_h * 0.6),
                (abs_x + abs_w * 0.4, abs_y + abs_h),
                color=(0, 0.8, 0),
                width=4,
            )
            page.draw_line(
                (abs_x + abs_w * 0.4, abs_y + abs_h),
                (abs_x + abs_w, abs_y),
                color=(0, 0.8, 0),
                width=4,
            )
        else:
            annot = page.add_highlight_annot(rect)
            annot.set_colors(stroke=(1, 1, 0))
            annot.update()


def merge_pdf_bytes_from_order_payload(
    file_bytes_by_id: Dict[str, bytes],
    payload: OrderPayload,
) -> bytes:
    hl_map = _highlights_by_page_id(payload)
    merged = fitz.open()
    try:
        for ref in payload.ordered_pages:
            fb = ref.fallback
            if fb is None:
                raise ValueError("orderedPages[].fallback is required for merge-ordered")
            raw = file_bytes_by_id.get(fb.file_id)
            if raw is None:
                raise ValueError(f"unknown fileId in fallback: {fb.file_id}")

            src = fitz.open(stream=raw, filetype="pdf")
            try:
                n_pages = len(src)
                if fb.original_index < 0 or fb.original_index >= n_pages:
                    raise ValueError(
                        f"originalIndex out of range: {fb.original_index} (page_count={n_pages})"
                    )

                one = fitz.open()
                try:
                    one.insert_pdf(
                        src,
                        from_page=fb.original_index,
                        to_page=fb.original_index,
                    )
                    page = one[0]
                    items = hl_map.get(ref.page_id, [])
                    if items:
                        _apply_highlights_to_page(page, items)
                    merged.insert_pdf(one)
                finally:
                    one.close()
            finally:
                src.close()

        out = io.BytesIO()
        merged.save(out)
        return out.getvalue()
    finally:
        merged.close()
