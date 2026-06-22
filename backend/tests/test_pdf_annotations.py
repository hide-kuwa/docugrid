"""pdf_annotations: marker / eraser redaction."""

import fitz

from services.pdf_annotations import (
    draw_freehand_eraser,
    draw_freehand_marker,
    erase_region,
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


def test_freehand_marker_adds_yellow_stroke() -> None:
    page = _blank_page()
    before = _sample_pixel(page, 0.5, 0.5)
    draw_freehand_marker(page, _path_diagonal())
    after = _sample_pixel(page, 0.5, 0.5)
    assert after != before
    assert after[1] > before[1]


def test_freehand_eraser_removes_marker_stroke() -> None:
    page = _blank_page()
    path = _path_diagonal()
    draw_freehand_marker(page, path)
    marked = _sample_pixel(page, 0.5, 0.5)
    draw_freehand_eraser(page, path)
    erased = _sample_pixel(page, 0.5, 0.5)
    assert erased[0] >= 240 and erased[1] >= 240 and erased[2] >= 240
    assert erased != marked


def test_erase_region_clears_rect_area() -> None:
    page = _blank_page()
    page.draw_rect(fitz.Rect(100, 100, 200, 200), color=(1, 0, 0), fill=(1, 0, 0))
    before = _sample_pixel(page, 0.375, 0.375)
    assert before[0] > 200
    erase_region(page, fitz.Rect(80, 80, 220, 220))
    after = _sample_pixel(page, 0.375, 0.375)
    assert after[0] >= 240 and after[1] >= 240 and after[2] >= 240


def test_path_bbox_rect_covers_stroke() -> None:
    page = _blank_page()
    rect = path_bbox_rect(page, _path_diagonal())
    assert rect.width > 0 and rect.height > 0
    assert page.rect.contains(rect)
