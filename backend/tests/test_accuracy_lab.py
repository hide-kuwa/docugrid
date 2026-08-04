"""Accuracy lab journal / presets / markdown export."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app
from services.accuracy_lab_service import (
    create_entry,
    list_entries,
    load_presets,
    publish_docs_findings,
    render_markdown,
    save_presets_override,
)
from tests.test_smoke import _admin_headers

client = TestClient(app)


@pytest.fixture(autouse=True)
def enable_header_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DOCUGRID_ALLOW_HEADER_AUTH", "true")


@pytest.fixture
def lab_paths(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("services.accuracy_lab_service.STORAGE_DIR", tmp_path)
    monkeypatch.setattr(
        "services.accuracy_lab_service.DOCS_FINDINGS_PATH",
        tmp_path / "docs" / "accuracy-lab-findings.md",
    )
    yield tmp_path


def test_presets_load_and_override(lab_paths) -> None:
    base = load_presets("firm_default")
    assert "源泉徴収" in (base.get("trial_keywords") or [])
    saved = save_presets_override("firm_default", {"trial_keywords": ["テスト語"]})
    assert saved["trial_keywords"] == ["テスト語"]


def test_create_list_and_markdown(lab_paths) -> None:
    create_entry(
        firm_id="firm_default",
        source="auto",
        kind="search",
        title="検索ゼロ件: 源泉",
        outcome="fail",
        body="ヒットなし",
        client_id="c1",
        context={"keyword": "源泉", "count": 0},
        created_by="admin@example.com",
    )
    create_entry(
        firm_id="firm_default",
        source="manual",
        kind="note",
        title="手動メモ",
        outcome="partial",
        body="抜粋が短い",
    )
    items = list_entries("firm_default")
    assert len(items) == 2
    md = render_markdown("firm_default")
    assert "検索ゼロ件" in md
    assert "手動メモ" in md
    assert "失敗・要改善" in md


def test_accuracy_lab_api(lab_paths) -> None:
    r = client.get("/api/accuracy-lab/presets", headers=_admin_headers())
    assert r.status_code == 200
    assert "trial_keywords" in r.json()

    post = client.post(
        "/api/accuracy-lab/entries",
        headers=_admin_headers(),
        json={
            "source": "manual",
            "kind": "note",
            "title": "APIメモ",
            "outcome": "fail",
            "body": "再現手順",
            "tags": ["t"],
        },
    )
    assert post.status_code == 200
    entry_id = post.json()["id"]

    listed = client.get("/api/accuracy-lab/entries", headers=_admin_headers())
    assert listed.status_code == 200
    assert any(e["id"] == entry_id for e in listed.json()["items"])

    md = client.get("/api/accuracy-lab/export.md", headers=_admin_headers())
    assert md.status_code == 200
    assert "APIメモ" in md.text

    pub = client.post("/api/accuracy-lab/publish-docs", headers=_admin_headers())
    assert pub.status_code == 200
    assert pub.json()["docs_path"] == "docs/accuracy-lab-findings.md"
    assert (lab_paths / "docs" / "accuracy-lab-findings.md").exists()

    deleted = client.delete(
        f"/api/accuracy-lab/entries/{entry_id}",
        headers=_admin_headers(),
    )
    assert deleted.status_code == 200


def test_publish_docs_findings_helper(lab_paths) -> None:
    create_entry(
        firm_id="firm_default",
        source="auto",
        kind="failure",
        title="OCR failed",
        outcome="fail",
    )
    result = publish_docs_findings("firm_default")
    assert "OCR failed" in result["markdown"]
    assert (lab_paths / "docs" / "accuracy-lab-findings.md").read_text(encoding="utf-8")
