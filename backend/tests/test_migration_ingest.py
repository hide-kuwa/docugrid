"""初回データ整理（migration ingest）のテスト。"""

from __future__ import annotations

import io
import json
import zipfile

import pytest

from services.migration_aliases import (
    learn_alias,
    learn_from_migration_path,
    load_global_folder_slots,
    match_global_folder_slot,
)
from services.migration_path_parse import match_client_from_path, parse_period_from_path
from services.migration_wallet import (
    default_migration_token_balance,
    get_migration_wallet,
    grant_migration_tokens,
    init_migration_wallet_db,
)
from services.migration_ingest_service import (
    count_pdfs_in_zip,
    estimate_zip_ingest,
    init_migration_ingest_db,
    list_pending_items,
    start_zip_ingest,
)


@pytest.fixture(autouse=True)
def _init_db(tmp_path, monkeypatch):
    monkeypatch.setenv("MIGRATION_INCLUDED_TOKENS", "50000")
    storage = tmp_path / "storage"
    storage.mkdir()
    monkeypatch.setattr("services.migration_wallet.STORAGE_DIR", storage)
    monkeypatch.setattr("services.migration_wallet.AI_USAGE_DB_PATH", storage / "ai_usage.db")
    monkeypatch.setattr("services.migration_ingest_service.STORAGE_DIR", storage)
    monkeypatch.setattr("services.migration_ingest_service.MIGRATION_DB_PATH", storage / "migration.db")
    monkeypatch.setattr("services.migration_aliases.STORAGE_DIR", storage)
    init_migration_wallet_db()
    init_migration_ingest_db()


def _make_zip(entries: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, data in entries.items():
            zf.writestr(name, data)
    return buf.getvalue()


def test_parse_period_r8():
    pk, conf = parse_period_from_path("顧問先/R8/請求書/foo.pdf")
    assert pk == "year:1"
    assert conf >= 0.7


def test_match_client_alias():
    firm = "firm_test"
    learn_alias(firm, "株式会社サンプル", "client_a")
    cid, conf = match_client_from_path(
        "old_data/株式会社サンプル/R8/doc.pdf",
        firm,
        clients=[],
    )
    assert cid == "client_a"
    assert conf >= 0.9


def test_migration_wallet_default():
    wallet = get_migration_wallet("firm_x")
    assert wallet["tokenBalance"] == default_migration_token_balance()
    assert wallet.get("yenPerPack") is not None
    assert wallet.get("tokensPerPack") is not None


def test_yen_from_tokens():
    from services.migration_wallet import yen_from_migration_tokens, migration_tokens_per_100_yen

    rate = migration_tokens_per_100_yen()
    assert yen_from_migration_tokens(rate) == 100


def test_zip_ingest_creates_pending(monkeypatch, tmp_path):
    firm = "firm_mig"
    clients_path = tmp_path / "storage" / "client_master.json"
    clients_path.parent.mkdir(parents=True, exist_ok=True)
    clients_path.write_text(
        json.dumps(
            {
                "clients": [
                    {"id": "client_mig", "name": "テスト商事", "fiscalMonth": 3, "firmId": firm},
                ],
                "groups": [],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr("services.client_master_store.CLIENT_MASTER_PATH", clients_path)
    monkeypatch.setattr("services.client_master_store.STORAGE_DIR", clients_path.parent)
    monkeypatch.setattr("services.tenancy.CLIENT_MASTER_PATH", clients_path)

    pdf_bytes = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
    zip_bytes = _make_zip(
        {
            "テスト商事/R8/unknown_doc.pdf": pdf_bytes,
            "misc/no_client.pdf": pdf_bytes,
        }
    )

    monkeypatch.setattr(
        "services.migration_classify.classify_migration_pdf",
        lambda firm_id, content, filename, **kwargs: {
            "identifiedType": "INVOICE",
            "slotId": "slot_invoice",
            "confidence": 0.3,
            "engine": "rules",
            "reason": "test",
            "tokensCharged": 0,
            "visionUsed": False,
        },
    )

    out = start_zip_ingest(firm, zip_bytes, "test.zip", "tester")
    assert out.get("ok")
    job = out.get("job")
    assert job["status"] == "completed"
    assert job["pendingCount"] >= 1
    items = list_pending_items(firm)
    assert len(items) >= 1
    assert any("テスト商事" in i["sourcePath"] for i in items)


def test_estimate_zip():
    pdf_bytes = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
    zip_bytes = _make_zip({"a/b.pdf": pdf_bytes, "c/d.pdf": pdf_bytes})
    est = estimate_zip_ingest("firm_est", zip_bytes)
    assert est["pdfCount"] == 2
    assert est["estimatedTokens"] >= 0
    assert est["estimatedYen"] >= 0
    assert est["estimatedTokensHigh"] >= est["estimatedTokensLow"]


def test_global_learning_prolext_only(monkeypatch, tmp_path):
    storage = tmp_path / "gstorage"
    storage.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("MIGRATION_GLOBAL_LEARNING_FIRM_ID", "firm_prolext")
    monkeypatch.setattr("services.migration_aliases.STORAGE_DIR", storage)
    monkeypatch.setattr("services.migration_aliases.GLOBAL_ALIASES_PATH", storage / "migration_global_aliases.json")

    learn_from_migration_path(
        "firm_prolext",
        "顧問先A/請求書/doc.pdf",
        "client_a",
        "slot_invoice",
        "INVOICE",
    )
    hit = match_global_folder_slot("請求書")
    assert hit is not None
    assert hit["slotId"] == "slot_invoice"

    learn_from_migration_path(
        "firm_other",
        "顧問先B/請求書/doc.pdf",
        "client_b",
        "slot_invoice",
        "INVOICE",
    )
def test_reclassify_pending_vision(monkeypatch, tmp_path):
    from services.migration_ingest_service import (
        _create_pending,
        create_migration_job,
        reclassify_pending_items,
    )

    firm = "firm_reclass"
    storage = tmp_path / "mstorage"
    storage.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr("services.migration_ingest_service.STORAGE_DIR", storage)
    monkeypatch.setattr("services.migration_ingest_service.MIGRATION_DB_PATH", storage / "mig.db")
    monkeypatch.setattr("services.migration_aliases.STORAGE_DIR", storage)

    job_id = create_migration_job(firm, "t.zip", "tester")
    pdf = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
    _create_pending(
        firm_id=firm,
        job_id=job_id,
        source_path="顧問先A/請求書/doc.pdf",
        file_name="doc.pdf",
        content=pdf,
        suggestions={
            "suggestedClientId": None,
            "clientMatchConfidence": 0,
            "suggestedPeriodKey": "year:1",
            "periodMatchConfidence": 0.8,
            "suggestedSlotId": "slot_old",
            "suggestedType": "UNKNOWN",
            "slotLabel": "不明",
            "confidence": 0.2,
            "engine": "rules",
            "classifyMetadata": {},
        },
        created_by="tester",
    )
    items = list_pending_items(firm)
    item_id = items[0]["id"]

    monkeypatch.setattr(
        "services.migration_ingest_service.classify_migration_pdf",
        lambda *args, **kwargs: {
            "identifiedType": "INVOICE",
            "slotId": "slot_invoice",
            "confidence": 0.85,
            "engine": "vision",
            "reason": "test",
            "tokensCharged": 800,
            "visionUsed": True,
            "visionMode": kwargs.get("vision_mode", "on"),
        },
    )

    out = reclassify_pending_items(firm, [item_id], vision_mode="on")
    assert out.get("ok")
    assert out.get("updated") == 1
    updated = list_pending_items(firm)[0]
    assert updated["suggestedSlotId"] == "slot_invoice"
    assert updated["confidence"] >= 0.8
