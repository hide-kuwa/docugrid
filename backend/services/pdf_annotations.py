"""PDF 上への注釈描画（/api/highlight と merge で共有）。"""

from __future__ import annotations

import json
import math
import uuid
from datetime import datetime, timezone
from typing import List, Optional

import fitz

DOCUGRID_ANNOT_SUBJECT_PREFIX = "DocuGrid:"


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
    return max(page.rect.width, page.rect.height) * 0.016


def path_to_fitz_points(page: fitz.Page, path: List[dict[str, float]]) -> List[fitz.Point]:
    pw, ph = page.rect.width, page.rect.height
    return [fitz.Point(p["x"] * pw, p["y"] * ph) for p in path]


def tag_docugrid_annotation(annot: fitz.Annot, kind: str) -> fitz.Annot:
    """注釈自身に識別データを保持し、保存後も要素単位で削除可能にする。"""
    metadata = {
        "schema": "docugrid.annotation.v1",
        "id": uuid.uuid4().hex,
        "kind": kind,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    annot.set_info(
        title="DocuGrid",
        subject=f"{DOCUGRID_ANNOT_SUBJECT_PREFIX}{kind}",
        content=json.dumps(metadata, ensure_ascii=False, separators=(",", ":")),
    )
    return annot


def draw_freehand_marker(page: fitz.Page, path: List[dict[str, float]]) -> fitz.Annot:
    """削除可能な1要素として保存する、半透明の蛍光ペンストローク。"""
    w = marker_stroke_width(page)
    pts = path_to_fitz_points(page, path)
    if len(pts) == 1:
        pts.append(fitz.Point(pts[0].x + 0.01, pts[0].y + 0.01))
    ink_path = [[p.x, p.y] for p in pts]
    annot = tag_docugrid_annotation(page.add_ink_annot([ink_path]), "marker")
    annot.set_colors(stroke=(1, 0.88, 0.15))
    annot.set_border(width=w)
    annot.update(blend_mode="Multiply", opacity=0.2)
    return annot


def add_box_annotation(page: fitz.Page, rect: fitz.Rect) -> fitz.Annot:
    annot = tag_docugrid_annotation(page.add_rect_annot(rect), "box")
    annot.set_colors(stroke=(1, 0, 0))
    annot.set_border(width=3)
    annot.update()
    return annot


def add_line_annotation(
    page: fitz.Page, start: fitz.Point, end: fitz.Point
) -> fitz.Annot:
    annot = tag_docugrid_annotation(page.add_line_annot(start, end), "line")
    annot.set_colors(stroke=(0, 0, 1))
    annot.set_border(width=3)
    annot.update()
    return annot


def add_check_annotation(page: fitz.Page, rect: fitz.Rect) -> fitz.Annot:
    p1 = fitz.Point(rect.x0, rect.y0 + rect.height * 0.6)
    p2 = fitz.Point(rect.x0 + rect.width * 0.4, rect.y1)
    p3 = fitz.Point(rect.x1, rect.y0)
    ink_path = [[p1.x, p1.y], [p2.x, p2.y], [p3.x, p3.y]]
    annot = tag_docugrid_annotation(page.add_ink_annot([ink_path]), "check")
    annot.set_colors(stroke=(0, 0.8, 0))
    annot.set_border(width=4)
    annot.update()
    return annot


def delete_one_docugrid_annotation(page: fitz.Page, hit_rect: fitz.Rect) -> bool:
    """消しゴムに触れたDocuGrid注釈を、近いものから1要素だけ削除する。"""
    center = fitz.Point(
        (hit_rect.x0 + hit_rect.x1) / 2,
        (hit_rect.y0 + hit_rect.y1) / 2,
    )
    candidates: list[tuple[float, fitz.Annot]] = []
    for annot in list(page.annots() or []):
        subject = str((annot.info or {}).get("subject") or "")
        if not subject.startswith(DOCUGRID_ANNOT_SUBJECT_PREFIX):
            continue
        if not annot.rect.intersects(hit_rect):
            continue
        annot_center = fitz.Point(
            (annot.rect.x0 + annot.rect.x1) / 2,
            (annot.rect.y0 + annot.rect.y1) / 2,
        )
        distance = math.hypot(annot_center.x - center.x, annot_center.y - center.y)
        candidates.append((distance, annot))
    if not candidates:
        return False
    _, target = min(candidates, key=lambda item: item[0])
    page.delete_annot(target)
    return True


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
