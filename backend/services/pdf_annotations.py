"""PDF 上への注釈描画（/api/highlight と merge で共有）。"""

from __future__ import annotations

import json
import math
from typing import List, Optional

import fitz


def parse_norm_path_json(path_json: Optional[str]) -> Optional[List[dict[str, float]]]:
    if not path_json or not str(path_json).strip():
        return None
    try:
        raw = json.loads(path_json)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(raw, list) or len(raw) < 1:
        return None
    out: List[dict[str, float]] = []
    for p in raw:
        if not isinstance(p, dict):
            continue
        if "x" not in p or "y" not in p:
            continue
        out.append({"x": float(p["x"]), "y": float(p["y"])})
    return out or None


def marker_stroke_width(page: fitz.Page) -> float:
    return max(page.rect.width, page.rect.height) * 0.012


def path_to_fitz_points(page: fitz.Page, path: List[dict[str, float]]) -> List[fitz.Point]:
    pw, ph = page.rect.width, page.rect.height
    return [fitz.Point(p["x"] * pw, p["y"] * ph) for p in path]


def draw_freehand_marker(page: fitz.Page, path: List[dict[str, float]]) -> None:
    """蛍光ペン風の半透明ストローク（矩形ハイライト注釈ではなく線のみ）。"""
    w = marker_stroke_width(page)
    pts = path_to_fitz_points(page, path)
    if len(pts) == 1:
        page.draw_circle(pts[0], w * 0.45, color=(1, 1, 0), fill=(1, 1, 0), fill_opacity=0.4)
        return
    page.draw_polyline(
        pts,
        color=(1, 1, 0),
        fill=(1, 1, 0),
        width=w,
        fill_opacity=0.4,
        closePath=False,
        lineCap=1,
    )


def _segment_rect(p1: fitz.Point, p2: fitz.Point, half_w: float) -> fitz.Rect:
    dx = p2.x - p1.x
    dy = p2.y - p1.y
    length = math.hypot(dx, dy)
    if length < 1e-6:
        return fitz.Rect(p1.x - half_w, p1.y - half_w, p1.x + half_w, p1.y + half_w)
    nx = -dy / length * half_w
    ny = dx / length * half_w
    xs = [p1.x + nx, p1.x - nx, p2.x - nx, p2.x + nx]
    ys = [p1.y + ny, p1.y - ny, p2.y - ny, p2.y + ny]
    return fitz.Rect(min(xs), min(ys), max(xs), max(ys))


def _queue_redact_rect(page: fitz.Page, rect: fitz.Rect) -> None:
    clipped = rect & page.rect
    if clipped.is_empty:
        return
    page.add_redact_annot(clipped, fill=(1, 1, 1))


def _apply_redactions(page: fitz.Page) -> None:
    page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)


def erase_region(page: fitz.Page, rect: fitz.Rect) -> None:
    """矩形領域を redaction で除去（焼き付け線・テキストを消す）。"""
    _queue_redact_rect(page, rect)
    _apply_redactions(page)


def draw_freehand_eraser(page: fitz.Page, path: List[dict[str, float]]) -> None:
    """ストローク軌道に沿って redaction を適用（焼き付け蛍光ペンを確実に消す）。"""
    w = marker_stroke_width(page) * 1.15
    half_w = w * 0.5
    pts = path_to_fitz_points(page, path)
    if not pts:
        return
    if len(pts) == 1:
        erase_region(page, fitz.Rect(pts[0].x - half_w, pts[0].y - half_w, pts[0].x + half_w, pts[0].y + half_w))
        return
    for i in range(len(pts) - 1):
        _queue_redact_rect(page, _segment_rect(pts[i], pts[i + 1], half_w))
    _apply_redactions(page)


def path_bbox_rect(page: fitz.Page, path: List[dict[str, float]], pad_ratio: float = 0.008) -> fitz.Rect:
    pw, ph = page.rect.width, page.rect.height
    xs = [p["x"] * pw for p in path]
    ys = [p["y"] * ph for p in path]
    pad = max(pw, ph) * pad_ratio
    return fitz.Rect(min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad)


def delete_annots_intersecting(page: fitz.Page, rect: fitz.Rect) -> None:
    for annot in list(page.annots() or []):
        try:
            if annot.rect.intersects(rect):
                page.delete_annot(annot)
        except Exception:
            pass
