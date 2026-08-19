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


def _text_box_from_rect(
    page: fitz.Page,
    rect: fitz.Rect,
    *,
    content: str,
    fs: float,
) -> fitz.Rect:
    lines = content.splitlines() or [" "]
    line_count = max(1, len(lines))
    longest = max((len(line) for line in lines), default=1)
    min_h = max(page.rect.height * 0.028, fs * 1.35 * line_count + 10)
    min_w = max(
        page.rect.width * 0.12,
        min(page.rect.width * 0.75, fs * 0.6 * longest + 18),
    )
    box = fitz.Rect(rect)
    if box.height < min_h:
        box.y1 = box.y0 + min_h
    if box.width < min_w:
        box.x1 = box.x0 + min_w
    box = box & page.rect
    if box.is_empty:
        box = fitz.Rect(
            max(0, rect.x0),
            max(0, rect.y0),
            min(page.rect.width, rect.x0 + min_w),
            min(page.rect.height, rect.y0 + min_h),
        )
    return box


def add_text_annotation(
    page: fitz.Page,
    rect: fitz.Rect,
    text: str,
    *,
    fontsize: float | None = None,
    text_color: tuple[float, float, float] | None = None,
) -> fitz.Annot:
    """テキストを注釈層（FreeText）に載せる。ページ本体は変更しない。

    消しゴムは注釈削除のみで、元 PDF の帳票線・文字を傷つけない。
    """
    content = (text or "").rstrip() or " "
    fs = float(fontsize) if fontsize and fontsize > 0 else 12.0
    fs = min(36.0, max(8.0, fs))
    box = _text_box_from_rect(page, rect, content=content, fs=fs)
    color = text_color or (0.05, 0.15, 0.55)
    has_cjk = any(ord(ch) > 0x2E80 for ch in content)
    font_candidates = ("japan", "china-s", "korea-s", "helv") if has_cjk else ("helv", "japan")

    annot: fitz.Annot | None = None
    last_err: Exception | None = None
    for fontname in font_candidates:
        try:
            annot = page.add_freetext_annot(
                box,
                content,
                fontsize=fs,
                fontname=fontname,
                text_color=color,
                fill_color=(1.0, 0.97, 0.72),
                align=fitz.TEXT_ALIGN_LEFT,
            )
            break
        except Exception as exc:
            last_err = exc
            annot = None
    if annot is None:
        raise RuntimeError(f"failed to add FreeText annotation: {last_err}")

    color_hex = "#{:02x}{:02x}{:02x}".format(
        max(0, min(255, int(round(color[0] * 255)))),
        max(0, min(255, int(round(color[1] * 255)))),
        max(0, min(255, int(round(color[2] * 255)))),
    )
    # FreeText の content = 表示文字。メタは title に置く（content を JSON にすると文字が壊れる）
    metadata = {
        "schema": "docugrid.annotation.v1",
        "id": uuid.uuid4().hex,
        "kind": "text",
        "fontsize": fs,
        "color": color_hex,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    annot.set_border(width=0.7)
    annot.set_opacity(0.72)
    annot.set_info(
        title=json.dumps(metadata, ensure_ascii=False, separators=(",", ":")),
        subject=f"{DOCUGRID_ANNOT_SUBJECT_PREFIX}text",
        content=content[:2000],
    )
    annot.update()
    return annot


def _parse_text_annot_payload(annot: fitz.Annot) -> dict[str, object]:
    """FreeText の表示文字 + title メタから text / fontsize / color を取り出す。"""
    text = str((annot.info or {}).get("content") or "")
    fontsize = 14.0
    color = "#1e3a8a"
    # 旧実装: content が JSON の場合
    try:
        data = json.loads(text)
        if isinstance(data, dict) and "text" in data:
            text = str(data.get("text") or "")
            try:
                fontsize = float(data.get("fontsize") or 14)
            except (TypeError, ValueError):
                fontsize = 14.0
            c = data.get("color")
            if isinstance(c, str) and c.startswith("#") and len(c) >= 7:
                color = c[:7]
            return {"text": text, "fontsize": fontsize, "color": color}
    except (json.JSONDecodeError, TypeError):
        pass

    title_raw = str((annot.info or {}).get("title") or "")
    try:
        meta = json.loads(title_raw)
        if isinstance(meta, dict):
            try:
                fontsize = float(meta.get("fontsize") or 14)
            except (TypeError, ValueError):
                fontsize = 14.0
            c = meta.get("color")
            if isinstance(c, str) and c.startswith("#") and len(c) >= 7:
                color = c[:7]
    except (json.JSONDecodeError, TypeError):
        pass
    return {"text": text, "fontsize": fontsize, "color": color}


def find_text_annotation_at(page: fitz.Page, hit_rect: fitz.Rect) -> dict[str, object] | None:
    """クリック位置に重なる DocuGrid テキスト注釈を返す（正規化座標）。"""
    center = fitz.Point(
        (hit_rect.x0 + hit_rect.x1) / 2,
        (hit_rect.y0 + hit_rect.y1) / 2,
    )
    candidates: list[tuple[float, fitz.Annot]] = []
    for annot in list(page.annots() or []):
        subject = str((annot.info or {}).get("subject") or "")
        if subject != f"{DOCUGRID_ANNOT_SUBJECT_PREFIX}text":
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
        return None
    _, target = min(candidates, key=lambda item: item[0])
    pw = max(page.rect.width, 1e-6)
    ph = max(page.rect.height, 1e-6)
    r = target.rect
    payload = _parse_text_annot_payload(target)
    return {
        "x": r.x0 / pw,
        "y": r.y0 / ph,
        "w": max(0.0, (r.x1 - r.x0) / pw),
        "h": max(0.0, (r.y1 - r.y0) / ph),
        "text": payload["text"],
        "fontsize": payload["fontsize"],
        "color": payload["color"],
    }


def replace_text_annotation(
    page: fitz.Page,
    origin: fitz.Rect,
    new_rect: fitz.Rect,
    text: str,
    *,
    fontsize: float | None = None,
    text_color: tuple[float, float, float] | None = None,
) -> fitz.Annot:
    """既存テキスト注釈を消して書き直す（ページ本体は触らない）。"""
    delete_one_docugrid_annotation(page, origin)
    return add_text_annotation(
        page,
        new_rect,
        text,
        fontsize=fontsize,
        text_color=text_color,
    )


def delete_one_docugrid_annotation(page: fitz.Page, hit_rect: fitz.Rect) -> bool:
    """消しゴム: DocuGrid 注釈を1つ削除するだけ。元 PDF コンテンツは変更しない。"""
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


def draw_freehand_eraser(page: fitz.Page, path: List[dict[str, float]]) -> None:
    """ストロークに触れた DocuGrid 注釈だけを削除する（ページ本体は触らない）。"""
    erase_rect = path_bbox_rect(page, path)
    # 太めのヒット幅で注釈を拾う
    w = marker_stroke_width(page) * 1.15
    erase_rect = fitz.Rect(
        erase_rect.x0 - w * 0.5,
        erase_rect.y0 - w * 0.5,
        erase_rect.x1 + w * 0.5,
        erase_rect.y1 + w * 0.5,
    )
    delete_one_docugrid_annotation(page, erase_rect)


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
