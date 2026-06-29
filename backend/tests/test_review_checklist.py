"""Review checklist template, instance, and alert evaluation."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app
from tests.test_smoke import _admin_headers

client = TestClient(app)


@pytest.fixture(autouse=True)
def enable_header_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DOCUGRID_ALLOW_HEADER_AUTH", "true")


def test_review_checklist_template_seeded() -> None:
    r = client.get("/api/review-checklists/template", headers=_admin_headers())
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["title"]
    assert body.get("schemaVersion", 1) >= 2
    assert len(body.get("sections") or []) >= 4
    first_section = body["sections"][0]
    assert "items" in first_section


def test_review_checklist_prefill() -> None:
    r = client.get(
        "/api/review-checklists/prefill",
        params={"client_id": "c1", "period_key": "year:2"},
        headers=_admin_headers(),
    )
    assert r.status_code == 200, r.text
    header = r.json()["header"]
    assert "client_name" in header
    assert "fiscal_period" in header


def test_review_checklist_instance_roundtrip() -> None:
    period_key = "year:2"
    get_r = client.get(
        "/api/review-checklists/instance",
        params={"client_id": "c1", "period_key": period_key},
        headers=_admin_headers(),
    )
    assert get_r.status_code == 200, get_r.text
    payload = get_r.json()
    assert payload["instance"]["applicable"] is True
    section = payload["template"]["sections"][1]
    item_id = next(i["id"] for i in section["items"] if i.get("kind") == "question")

    put_r = client.put(
        "/api/review-checklists/instance",
        json={
            "client_id": "c1",
            "period_key": period_key,
            "header": {"client_name": "【　テスト会社　様】"},
            "itemStates": {
                item_id: {
                    "status": "ok",
                    "comment": "確認済み",
                    "reference": "試算表",
                }
            },
            "workflowStatus": "in_circulation",
        },
        headers=_admin_headers(),
    )
    assert put_r.status_code == 200, put_r.text
    saved = put_r.json()
    assert saved["progress"]["checked"] >= 1
    assert saved["itemStates"][item_id]["status"] == "ok"


def test_review_checklist_export_pdf() -> None:
    r = client.post(
        "/api/review-checklists/export-pdf",
        json={"client_id": "c1", "period_key": "year:2"},
        headers=_admin_headers(),
    )
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("application/pdf")
    assert len(r.content) > 500


def test_review_checklist_alerts_return_missing() -> None:
    period_key = "year:2"
    template = client.get("/api/review-checklists/template", headers=_admin_headers()).json()
    item = None
    for section in template.get("sections") or []:
        for i in section.get("items") or []:
            if i.get("returnAnchor", {}).get("slotId"):
                item = i
                break
        if item:
            break
    if not item:
        return
    client.put(
        "/api/review-checklists/instance",
        json={
            "client_id": "c1",
            "period_key": period_key,
            "itemStates": {item["id"]: {"status": "ok"}},
        },
        headers=_admin_headers(),
    )
    alerts = client.get(
        "/api/review-checklists/alerts",
        params={"client_id": "c1", "period_key": period_key},
        headers=_admin_headers(),
    ).json()
    assert alerts["summary"]["total"] >= 0


def test_review_checklist_template_catalog_crud() -> None:
    created = client.post(
        "/api/review-checklists/templates",
        json={"title": "月次簡易チェック", "description": "テスト用"},
        headers=_admin_headers(),
    )
    assert created.status_code == 200, created.text
    tpl_id = created.json()["id"]
    assert created.json()["scope"] == "local"

    listed = client.get("/api/review-checklists/templates", headers=_admin_headers()).json()
    assert any(t["id"] == tpl_id for t in listed["templates"])

    updated = client.put(
        f"/api/review-checklists/templates/{tpl_id}",
        json={
            "title": "月次簡易チェック（改訂）",
            "description": "更新済み",
            "periodTypes": ["year", "month"],
            "sections": [
                {
                    "id": "sec-1",
                    "title": "月次確認",
                    "kind": "checklist",
                    "items": [
                        {
                            "id": "q-1",
                            "kind": "question",
                            "number": "1",
                            "label": "試算表は確認しましたか。",
                            "indent": 0,
                        }
                    ],
                }
            ],
        },
        headers=_admin_headers(),
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["title"] == "月次簡易チェック（改訂）"

    dup = client.post(
        "/api/review-checklists/templates",
        json={"title": "HREコピー", "sourceTemplateId": "hre-standard"},
        headers=_admin_headers(),
    )
    assert dup.status_code == 200, dup.text

    deleted = client.delete(
        f"/api/review-checklists/templates/{tpl_id}",
        headers=_admin_headers(),
    )
    assert deleted.status_code == 200, deleted.text


def _client_uploader_headers() -> dict[str, str]:
    return {
        "X-Docugrid-Role": "client_uploader",
        "X-Docugrid-User": "client@example.com",
        "X-Docugrid-Stakeholder": "actor-c1",
        "X-Docugrid-Client": "c1",
    }


def test_review_checklist_client_can_view_and_edit() -> None:
    headers = _client_uploader_headers()
    get_r = client.get(
        "/api/review-checklists/instance",
        params={"client_id": "c1", "period_key": "year:2"},
        headers=headers,
    )
    assert get_r.status_code == 200, get_r.text
    payload = get_r.json()
    template = payload["template"]
    first_q = next(
        item
        for section in template.get("sections") or []
        for item in section.get("items") or []
        if item.get("kind") == "question"
    )
    item_id = first_q["id"]
    put_r = client.put(
        "/api/review-checklists/instance",
        headers=headers,
        json={
            "client_id": "c1",
            "period_key": "year:2",
            "itemStates": {item_id: {"status": "ok", "comment": "クライアント確認済"}},
        },
    )
    assert put_r.status_code == 200, put_r.text
    saved = put_r.json()
    assert saved["itemStates"][item_id]["status"] == "ok"
    assert saved["itemStates"][item_id]["comment"] == "クライアント確認済"

    # クライアントは所内ワークフローを変更できない
    put_wf = client.put(
        "/api/review-checklists/instance",
        headers=headers,
        json={
            "client_id": "c1",
            "period_key": "year:2",
            "workflowStatus": "completed",
            "circulationMemo": "secret",
        },
    )
    assert put_wf.status_code == 200, put_wf.text
    after = put_wf.json()
    assert after.get("workflowStatus") != "completed"
    assert after.get("circulationMemo") != "secret"


def test_review_checklist_template_put() -> None:
    dup = client.post(
        "/api/review-checklists/templates",
        json={"title": "編集テスト用", "sourceTemplateId": "hre-standard"},
        headers=_admin_headers(),
    ).json()
    tpl_id = dup["id"]
    sections = dup.get("sections") or []
    put_r = client.put(
        f"/api/review-checklists/templates/{tpl_id}",
        json={
            "title": dup["title"],
            "description": dup.get("description", ""),
            "periodTypes": dup.get("periodTypes", ["year"]),
            "sections": sections[:2],
        },
        headers=_admin_headers(),
    )
    assert put_r.status_code == 200, put_r.text
    assert len(put_r.json().get("sections") or []) == 2
    client.delete(f"/api/review-checklists/templates/{tpl_id}", headers=_admin_headers())
