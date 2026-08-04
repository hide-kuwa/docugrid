"""I2 minimal RAG index — firm scope + idempotent ingest."""

from __future__ import annotations

import json

import pytest

from services.rag_index_service import (
    SOURCE_DOCUMENT,
    chunk_text,
    ingest_ocr_document,
    init_rag_index_db,
    search_documents_for_api,
    search_rag,
)


@pytest.fixture
def rag_env(tmp_path, monkeypatch):
    monkeypatch.setattr("services.rag_index_service.RAG_DB_PATH", tmp_path / "rag_index.db")
    monkeypatch.setattr("services.rag_index_service.STORAGE_DIR", tmp_path)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    init_rag_index_db()
    return tmp_path


def test_chunk_text_splits_headings(rag_env) -> None:
    text = "【源泉徴収票】\n氏名 太郎\n\n【摘要】\n支払金額 100万円"
    chunks = chunk_text(text, max_chars=200)
    assert len(chunks) >= 2
    assert any("源泉" in c for c in chunks)


def test_ingest_idempotent_same_sha(rag_env) -> None:
    text = "源泉徴収票 山田太郎 支払金額"
    r1 = ingest_ocr_document(
        firm_id="firm-a",
        client_id="c1",
        document_version_id="v1",
        content_sha256="sha-1",
        text=text,
        logical_document_id="doc-1",
    )
    assert r1["reused"] is False
    assert r1["chunk_count"] >= 1

    r2 = ingest_ocr_document(
        firm_id="firm-a",
        client_id="c1",
        document_version_id="v1",
        content_sha256="sha-1",
        text=text + " ignored because sha same",
        logical_document_id="doc-1",
    )
    assert r2["reused"] is True
    assert r2["chunk_count"] == r1["chunk_count"]


def test_search_does_not_leak_other_firm(rag_env) -> None:
    ingest_ocr_document(
        firm_id="firm-a",
        client_id="c1",
        document_version_id="v-a",
        content_sha256="sha-a",
        text="源泉徴収票 社員A 年末調整",
    )
    ingest_ocr_document(
        firm_id="firm-b",
        client_id="c1",
        document_version_id="v-b",
        content_sha256="sha-b",
        text="源泉徴収票 社員B 年末調整",
    )

    hits_a = search_rag("firm-a", query="源泉徴収票", client_id="c1", mode="hybrid")
    assert hits_a
    assert all(h["firm_id"] == "firm-a" for h in hits_a)
    assert all(h["version_id"] != "v-b" for h in hits_a)

    hits_b = search_rag("firm-b", query="源泉徴収票", client_id="c1", mode="keyword")
    assert hits_b
    assert all(h["firm_id"] == "firm-b" for h in hits_b)


def test_search_does_not_sync_karte(rag_env, monkeypatch) -> None:
    called = {"n": 0}

    def boom(*_a, **_k):
        called["n"] += 1
        raise AssertionError("search must not sync karte")

    monkeypatch.setattr("services.rag_index_service.sync_karte_for_client", boom)
    ingest_ocr_document(
        firm_id="firm-a",
        client_id="c1",
        document_version_id="v1",
        content_sha256="sha-1",
        text="源泉徴収票",
    )
    hits = search_rag("firm-a", query="源泉", client_id="c1", mode="hybrid")
    assert hits
    assert called["n"] == 0


def test_search_documents_for_api_keyword_fallback(rag_env, monkeypatch, tmp_path) -> None:
    from services import ocr_job_service

    monkeypatch.setattr("services.ocr_job_service.OCR_JOBS_DB_PATH", tmp_path / "ocr_jobs.db")
    ocr_job_service.init_ocr_jobs_db()
    ocr_job_service.upsert_index_state(
        document_version_id="v-kw",
        firm_id="firm-a",
        client_id="c1",
        content_sha256="sha-kw",
        ocr_status="ready",
        text_excerpt="法人税申告書 別表",
        indexed_at="2026-01-01T00:00:00",
    )

    payload = search_documents_for_api(
        "firm-a",
        query="法人税",
        client_id="c1",
        mode="keyword",
        limit=10,
    )
    assert payload["mode"] == "keyword"
    assert payload["count"] >= 1
    hit = next(
        it
        for it in payload["items"]
        if (it.get("document_version_id") or it.get("version_id")) == "v-kw"
    )
    assert hit.get("legacy_index") is True


def test_search_prefers_rag_over_legacy_duplicate(rag_env, monkeypatch, tmp_path) -> None:
    from services import ocr_job_service

    monkeypatch.setattr("services.ocr_job_service.OCR_JOBS_DB_PATH", tmp_path / "ocr_jobs.db")
    ocr_job_service.init_ocr_jobs_db()
    ingest_ocr_document(
        firm_id="firm-a",
        client_id="c1",
        document_version_id="v1",
        content_sha256="sha-1",
        text="源泉徴収票 太郎",
    )
    ocr_job_service.upsert_index_state(
        document_version_id="v1",
        firm_id="firm-a",
        client_id="c1",
        content_sha256="sha-1",
        ocr_status="ready",
        text_excerpt="源泉徴収票 太郎",
        indexed_at="2026-01-01T00:00:00",
    )
    payload = search_documents_for_api(
        "firm-a", query="源泉", client_id="c1", mode="keyword", limit=10
    )
    v1_hits = [it for it in payload["items"] if it.get("version_id") == "v1"]
    assert v1_hits
    assert all(not it.get("legacy_index") for it in v1_hits)


def test_semantic_finds_related_chunk(rag_env) -> None:
    ingest_ocr_document(
        firm_id="firm-a",
        client_id="c1",
        document_version_id="v1",
        content_sha256="sha-1",
        text="令和6年分 給与所得の源泉徴収票 支払者 株式会社テスト",
    )
    hits = search_rag(
        "firm-a",
        query="源泉徴収票",
        client_id="c1",
        mode="semantic",
    )
    assert hits
    assert hits[0]["source"] == SOURCE_DOCUMENT
    assert hits[0]["score"] > 0


def test_ocr_job_sets_rag_status(rag_env, monkeypatch, tmp_path) -> None:
    from services.document_version_service import (
        create_document_version,
        ensure_logical_document,
        init_document_versions_db,
    )
    from services.ocr_job_service import (
        create_ocr_job,
        get_index_state,
        init_ocr_jobs_db,
        run_ocr_job,
    )

    monkeypatch.setattr("services.ocr_job_service.OCR_JOBS_DB_PATH", tmp_path / "ocr_jobs.db")
    monkeypatch.setattr("services.ocr_job_service.STORAGE_DIR", tmp_path)
    monkeypatch.setattr("services.document_version_service.STORAGE_DIR", tmp_path)
    monkeypatch.setattr(
        "services.document_version_service.VERSIONS_DB_PATH", tmp_path / "versions.db"
    )
    monkeypatch.setattr("services.storage_paths.STORAGE_DIR", tmp_path)
    init_ocr_jobs_db()
    init_document_versions_db()

    logical = ensure_logical_document(
        client_id="c1",
        period_key="year:2",
        slot_id="tax_return_corporate",
        title="法人税申告書",
    )
    pdf = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
    version = create_document_version(
        logical_id=logical.id,
        content=pdf,
        original_name="corp.pdf",
        content_sha256="abc",
        source="test",
        bump="upload",
        metadata_json=json.dumps({"status": "processing", "schema_version": 1}),
    )
    monkeypatch.setattr(
        "services.ocr_job_service.classify_pdf",
        lambda content, name, candidates, max_pages=None: {
            "confidence": 0.9,
            "engine": "pymupdf",
            "text_excerpt": "法人税申告書",
            "best": {"id": "tax_return_corporate", "label": "法人税", "score": 3},
            "ranked": [],
        },
    )
    monkeypatch.setattr(
        "services.ocr_job_service.extract_text_from_pdf",
        lambda content, max_pages=None: ("課税所得 1,000,000", "pymupdf"),
    )
    monkeypatch.setattr(
        "services.ocr_job_service.profile_fields_from_text",
        lambda slot_id, text: {},
    )
    monkeypatch.setattr(
        "services.ssot_ingest.ingest_from_slot_document",
        lambda **kwargs: type("R", (), {})(),
    )
    monkeypatch.setattr(
        "services.ssot_ingest.ingest_result_for_response",
        lambda r: {"propagate": True, "applied": [], "metrics_applied": []},
    )

    job = create_ocr_job(
        firm_id="default",
        client_id="c1",
        document_version_id=version.id,
        period_key="year:2",
        slot_id="tax_return_corporate",
    )
    run_ocr_job(job["id"])
    state = get_index_state(version.id)
    assert state is not None
    assert state["ocr_status"] == "ready"
    assert state["rag_status"] == "ready"
