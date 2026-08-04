"""pdf_annotations: removable DocuGrid annotation elements."""

import json

import fitz

from services.pdf_annotations import (
    add_box_annotation,
    delete_one_docugrid_annotation,
    draw_freehand_marker,
    path_bbox_rect,
)


def _blank_page() -> fitz.Page:
    doc = fitz.open()
    page = doc.new_page(width=400, height=400)
    page.draw_rect(page.rect, color=(0.85, 0.85, 0.85), fill=(0.85, 0.85, 0.85))
    return page


def _sample_pixel(page: fitz.Page, x: float, y: float) -> tuple[int, int, int]:
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    px = int(x * page.rect.width * 2)
    py = int(y * page.rect.height * 2)
    px = min(max(px, 0), pix.width - 1)
    py = min(max(py, 0), pix.height - 1)
    offset = (py * pix.width + px) * 3
    return tuple(pix.samples[offset : offset + 3])


def _path_diagonal() -> list[dict[str, float]]:
    return [{"x": 0.2, "y": 0.2}, {"x": 0.5, "y": 0.5}, {"x": 0.8, "y": 0.8}]


def _path_at_y(y: float) -> list[dict[str, float]]:
    return [{"x": 0.2, "y": y}, {"x": 0.5, "y": y}, {"x": 0.8, "y": y}]


def test_freehand_marker_adds_yellow_stroke() -> None:
    page = _blank_page()
    before = _sample_pixel(page, 0.5, 0.5)
    draw_freehand_marker(page, _path_diagonal())
    after = _sample_pixel(page, 0.5, 0.5)
    assert after != before
    assert after[0] > after[2]  # yellow tint
    annotations = list(page.annots() or [])
    assert len(annotations) == 1
    assert annotations[0].info["subject"] == "DocuGrid:marker"
    metadata = json.loads(annotations[0].info["content"])
    assert metadata["schema"] == "docugrid.annotation.v1"
    assert metadata["kind"] == "marker"
    assert metadata["id"]
    assert metadata["createdAt"]


def test_eraser_removes_only_one_added_element() -> None:
    page = _blank_page()
    first = _path_at_y(0.3)
    second = _path_at_y(0.7)
    original = _sample_pixel(page, 0.5, 0.3)
    draw_freehand_marker(page, first)
    draw_freehand_marker(page, second)
    assert len(list(page.annots() or [])) == 2

    assert delete_one_docugrid_annotation(page, path_bbox_rect(page, first))
    remaining = list(page.annots() or [])
    assert len(remaining) == 1
    assert remaining[0].rect.intersects(path_bbox_rect(page, second))
    assert _sample_pixel(page, 0.5, 0.3) == original


def test_eraser_does_not_delete_foreign_pdf_annotation() -> None:
    page = _blank_page()
    foreign = page.add_rect_annot(fitz.Rect(50, 50, 200, 200))
    foreign.update()
    assert not delete_one_docugrid_annotation(page, fitz.Rect(40, 40, 210, 210))
    assert len(list(page.annots() or [])) == 1


def test_box_is_saved_as_one_removable_element() -> None:
    page = _blank_page()
    rect = fitz.Rect(100, 100, 200, 200)
    add_box_annotation(page, rect)
    assert len(list(page.annots() or [])) == 1
    assert delete_one_docugrid_annotation(page, rect)
    assert len(list(page.annots() or [])) == 0


def test_docugrid_element_metadata_survives_pdf_save() -> None:
    doc = fitz.open()
    page = doc.new_page(width=400, height=400)
    draw_freehand_marker(page, _path_at_y(0.5))
    reopened = fitz.open(stream=doc.write(), filetype="pdf")
    annot = next(reopened[0].annots())
    metadata = json.loads(annot.info["content"])
    assert metadata["schema"] == "docugrid.annotation.v1"
    assert metadata["kind"] == "marker"


def test_path_bbox_rect_covers_stroke() -> None:
    page = _blank_page()
    rect = path_bbox_rect(page, _path_diagonal())
    assert rect.width > 0 and rect.height > 0
    assert page.rect.contains(rect)
