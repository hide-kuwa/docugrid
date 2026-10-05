"""extraction draft（OCR 手動修正の状態保存・マスタ非反映）の単体テスト。"""

from __future__ import annotations

from pathlib import Path

import pytest

from services import extraction_draft_service as draft


@pytest.fixture()
def draft_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    db = tmp_path / "extraction_drafts.db"
    monkeypatch.setattr(draft, "EXTRACTION_DRAFT_DB_PATH", db)
    monkeypatch.setattr(draft, "STORAGE_DIR", tmp_path)
    draft.init_extraction_draft_db()
    return db


def test_save_and_get_draft(draft_db: Path) -> None:
    saved = draft.save_extraction_draft(
        firm_id="firm_a",
        client_id="c1",
        period_key="2025",
        slot_id="corp_tax",
        fields={"customer_name": "株式会社テスト", "ocr_fiscal_from": "R6.4.1"},
        edited_ids=["customer_name", "ocr_fiscal_from"],
    )
    assert saved["fields"]["customer_name"] == "株式会社テスト"
    assert set(saved["edited_ids"]) == {"customer_name", "ocr_fiscal_from"}

    loaded = draft.get_extraction_draft(
        firm_id="firm_a",
        client_id="c1",
        period_key="2025",
        slot_id="corp_tax",
    )
    assert loaded is not None
    assert loaded["fields"]["ocr_fiscal_from"] == "R6.4.1"


def test_empty_edited_clears_draft(draft_db: Path) -> None:
    draft.save_extraction_draft(
        firm_id="firm_a",
        client_id="c1",
        period_key="2025",
        slot_id="corp_tax",
        fields={"customer_name": "A"},
        edited_ids=["customer_name"],
    )
    draft.save_extraction_draft(
        firm_id="firm_a",
        client_id="c1",
        period_key="2025",
        slot_id="corp_tax",
        fields={},
        edited_ids=[],
    )
    assert (
        draft.get_extraction_draft(
            firm_id="firm_a",
            client_id="c1",
            period_key="2025",
            slot_id="corp_tax",
        )
        is None
    )


def test_remove_fields_keeps_document_only(draft_db: Path) -> None:
    draft.save_extraction_draft(
        firm_id="firm_a",
        client_id="c1",
        period_key="2025",
        slot_id="corp_tax",
        fields={
            "customer_name": "株式会社テスト",
            "ocr_fiscal_from": "R6.4.1",
        },
        edited_ids=["customer_name", "ocr_fiscal_from"],
    )
    remaining = draft.remove_fields_from_draft(
        firm_id="firm_a",
        client_id="c1",
        period_key="2025",
        slot_id="corp_tax",
        field_ids=["customer_name"],
    )
    assert remaining is not None
    assert remaining["fields"] == {"ocr_fiscal_from": "R6.4.1"}
    assert remaining["edited_ids"] == ["ocr_fiscal_from"]


def test_firm_isolation(draft_db: Path) -> None:
    draft.save_extraction_draft(
        firm_id="firm_a",
        client_id="c1",
        period_key="2025",
        slot_id="corp_tax",
        fields={"customer_name": "A社"},
        edited_ids=["customer_name"],
    )
    assert (
        draft.get_extraction_draft(
            firm_id="firm_b",
            client_id="c1",
            period_key="2025",
            slot_id="corp_tax",
        )
        is None
    )
