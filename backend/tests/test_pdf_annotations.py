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


def test_text_annotation_is_erasable() -> None:
    doc = fitz.open()
    page = doc.new_page(width=400, height=400)
    # 帳票っぽい下地（白塗りと区別できる模様）
    page.draw_rect(page.rect, color=(0.9, 0.75, 0.55), fill=(0.9, 0.75, 0.55))
    for i in range(0, 400, 20):
        page.draw_line(fitz.Point(0, i), fitz.Point(400, i), color=(0.75, 0.45, 0.2), width=0.6)
        page.draw_line(fitz.Point(i, 0), fitz.Point(i, 400), color=(0.75, 0.45, 0.2), width=0.6)
    page.insert_text((50, 58), "下地ABC", fontsize=12, color=(0.2, 0.1, 0.1))

    rect = fitz.Rect(40, 40, 200, 70)
    from services.pdf_annotations import add_text_annotation

    before = _sample_pixel(page, 0.3, 0.14)
    add_text_annotation(page, rect, "確認メモ", fontsize=14)
    annotations = list(page.annots() or [])
    assert len(annotations) == 1
    assert annotations[0].info["subject"] == "DocuGrid:text"
    assert annotations[0].info["content"] == "確認メモ"
    meta = json.loads(annotations[0].info["title"])
    assert meta["kind"] == "text"
    assert "確認メモ" in page.get_text()
    after = _sample_pixel(page, 0.3, 0.14)
    assert after != before

    assert delete_one_docugrid_annotation(page, rect)
    assert list(page.annots() or []) == []
    erased = _sample_pixel(page, 0.3, 0.14)
    # 注釈削除のみなので下地ピクセルが復元される（白抜けしない）
    assert erased == before
    assert "確認メモ" not in page.get_text()
    assert "ABC" in page.get_text()


def test_text_annotation_can_be_found_and_replaced() -> None:
    page = _blank_page()
    rect = fitz.Rect(40, 40, 200, 80)
    from services.pdf_annotations import (
        add_text_annotation,
        find_text_annotation_at,
        replace_text_annotation,
    )

    add_text_annotation(page, rect, "初版", fontsize=12, text_color=(0.1, 0.1, 0.5))
    hit = find_text_annotation_at(page, fitz.Rect(50, 50, 60, 60))
    assert hit is not None
    assert hit["text"] == "初版"

    replace_text_annotation(
        page,
        rect,
        fitz.Rect(40, 40, 220, 90),
        "改訂版",
        fontsize=14,
        text_color=(0.5, 0.0, 0.0),
    )
    assert "改訂版" in page.get_text()
    assert "初版" not in page.get_text()
    hit2 = find_text_annotation_at(page, fitz.Rect(50, 50, 60, 60))
    assert hit2 is not None
    assert hit2["text"] == "改訂版"


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
