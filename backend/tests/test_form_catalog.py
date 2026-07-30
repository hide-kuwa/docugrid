"""Form catalog and page scanner tests."""

from __future__ import annotations

from services.form_catalog import load_form_catalog_config, reload_form_catalog_config
from services.form_catalog_classify import (
    classify_pdf_for_tax_package,
    try_catalog_slot_classify,
)
from services.form_page_scanner import classify_page, merge_page_segments, scan_pdf_pages


def test_form_catalog_loads_seed() -> None:
    reload_form_catalog_config()
    cfg = load_form_catalog_config()
    assert cfg["version"] >= 1
    assert len(cfg["forms"]) >= 5
    ids = {f["form_id"] for f in cfg["forms"]}
    assert "corp_tax_beppyo_1" in ids
    assert "cover" in ids


def test_classify_page_beppyo_1() -> None:
    text = "別表一（一）\n法人税の明細書\n課税標準法人税額"
    result = classify_page(text, filename="別表一_2024.pdf")
    assert result["form_id"] == "corp_tax_beppyo_1"
    assert float(result["confidence"]) >= 0.35


def test_classify_page_cover() -> None:
    text = "送付状\n在中\nご確認の上ご提出ください"
    result = classify_page(text)
    assert result["form_id"] == "cover"


def test_merge_page_segments() -> None:
    pages = [
        {"page": 1, "form_id": "cover", "label_ja": "表紙", "confidence": 0.6, "maps_to": {}},
        {"page": 2, "form_id": None, "confidence": 0.0},
        {"page": 3, "form_id": "corp_tax_beppyo_1", "label_ja": "別表一", "confidence": 0.8, "maps_to": {}},
        {"page": 4, "form_id": "corp_tax_beppyo_1", "label_ja": "別表一", "confidence": 0.75, "maps_to": {}},
    ]
    segments = merge_page_segments(pages)
    assert len(segments) == 2
    assert segments[0]["form_id"] == "cover"
    assert segments[1]["start_page"] == 3
    assert segments[1]["end_page"] == 4


def test_scan_pdf_minimal() -> None:
    import fitz

    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "別表一\n法人税の明細書\n課税標準法人税額")
    content = doc.tobytes()
    doc.close()

    result = scan_pdf_pages(content, filename="別表一_2024.pdf", max_pages=5)
    assert result["page_count_scanned"] >= 1
    assert result["pages"][0]["form_id"] == "corp_tax_beppyo_1"


def test_scan_pdf_vertical_top_right_title() -> None:
    """右上に縦書きの「別表四」だけがある PDF を検出できる（縦書き対応）。"""
    import fitz

    doc = fitz.open()
    page = doc.new_page()  # 既定 612x792 (Letter)
    # 右上に 2 列の縦書きを配置し、既定抽出では列が混ざるようにする。
    right_col = [("別", 72), ("表", 96), ("四", 120)]
    left_col = [("所", 72), ("得", 96)]
    for ch, y in right_col:
        page.insert_text((545, y), ch, fontname="japan")
    for ch, y in left_col:
        page.insert_text((505, y), ch, fontname="japan")
    # 本文にはカタログのアンカー語を置かない（縦書きタイトルのみで判定させる）。
    page.insert_text((72, 400), "参考資料メモ数値表", fontname="japan")
    content = doc.tobytes()
    doc.close()

    result = scan_pdf_pages(content, filename="scan_0001.pdf", max_pages=3)
    assert result["pages"][0]["form_id"] == "corp_tax_beppyo_4"


def test_classify_pdf_splits_bundle_without_vision(monkeypatch) -> None:
    mock_scan = {
        "page_count_scanned": 3,
        "package_forms": [
            {
                "form_id": "corp_tax_beppyo_1",
                "label_ja": "別表一",
                "confidence": 0.8,
                "maps_to": {"tax_type": "CORP_TAX_RETURN", "slot_label": "法人税申告書"},
                "start_page": 2,
                "end_page": 2,
                "reasons": ["本文: 別表一"],
            },
            {
                "form_id": "corp_tax_beppyo_4",
                "label_ja": "別表四",
                "confidence": 0.75,
                "maps_to": {"tax_type": "CORP_TAX_RETURN", "slot_label": "法人税申告書"},
                "start_page": 3,
                "end_page": 3,
                "reasons": ["本文: 別表四"],
            },
        ],
    }

    def fake_scan(_content: bytes, *, filename=None, max_pages=25):
        return mock_scan

    monkeypatch.setattr("services.form_catalog_classify.scan_pdf_pages", fake_scan)

    vision_called: list[bool] = []

    def vision() -> dict:
        vision_called.append(True)
        return {
            "identifiedType": "UNKNOWN",
            "confidence": 0.1,
            "reason": "vision",
            "engine": "gemini-vision",
        }

    rows = classify_pdf_for_tax_package(b"%PDF", "bundle.pdf", vision_classify=vision)
    assert len(rows) == 2
    assert not vision_called
    assert all(r["engine"] == "form_catalog" for r in rows)
    assert rows[0]["startPage"] == 2
    assert rows[1]["startPage"] == 3


def test_try_catalog_slot_classify_matrix() -> None:
    import fitz

    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "別表一\n法人税の明細書\n課税標準法人税額")
    content = doc.tobytes()
    doc.close()

    candidates = [{"id": "slot-corp", "label": "法人税申告書"}]
    result = try_catalog_slot_classify(content, "別表一_2024.pdf", candidates)
    assert result is not None
    assert result["engine"] == "form_catalog"
    assert result["best"]["label"] == "法人税申告書"
