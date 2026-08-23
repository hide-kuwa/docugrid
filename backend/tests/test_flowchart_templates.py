"""判定フローひな形 — カタログ・実行・保存呼び出し。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app
from services.flowchart_engine import eval_when, run_definition
from services.flowchart_templates import CONSUMPTION_TAXABLE_DEFINITION, DEFAULT_GLOBAL_TEMPLATES

client = TestClient(app)


@pytest.fixture(autouse=True)
def enable_header_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DOCUGRID_ALLOW_HEADER_AUTH", "true")


@pytest.fixture
def flowchart_store(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("services.flowchart_templates.STORAGE_DIR", tmp_path)
    monkeypatch.setattr("services.flowchart_templates.PLATFORM_DIR", tmp_path / "platform")
    monkeypatch.setattr(
        "services.flowchart_templates.GLOBAL_PATH",
        tmp_path / "platform" / "global_flowchart_templates.json",
    )
    monkeypatch.setattr("services.flowchart_instances.STORAGE_DIR", tmp_path)
    yield tmp_path


def _admin() -> dict[str, str]:
    from tests.test_smoke import _admin_headers

    return _admin_headers()


def test_eval_when_threshold_and_all() -> None:
    inputs = {"sales": 10_000_001, "salaries": 10_000_001, "flag": True}
    assert eval_when({"input": "sales", "op": ">", "value": 10_000_000}, inputs)
    assert not eval_when({"input": "sales", "op": ">", "value": 10_000_001}, inputs)
    assert eval_when(
        {
            "all": [
                {"input": "sales", "op": ">", "value": 10_000_000},
                {"input": "salaries", "op": ">", "value": 10_000_000},
            ]
        },
        inputs,
    )


def test_consumption_definition_matches_hardcoded_checker() -> None:
    template = DEFAULT_GLOBAL_TEMPLATES[0]
    run = run_definition(
        template,
        auto_inputs={
            "is_invoice_registered": True,
            "base_period_sales": 12_000_000,
            "specified_period_sales": 0,
            "specified_period_salaries": 0,
        },
        resolved_bindings=[],
    )
    assert run["passed"] is True
    assert "invoice_registered" in run["matched_conditions"]
    assert "base_period_sales_exceeded" in run["matched_conditions"]


def test_business_category_tree_wholesale() -> None:
    template = next(t for t in DEFAULT_GLOBAL_TEMPLATES if t["id"] == "global-business-category")
    incomplete = run_definition(template, auto_inputs={}, resolved_bindings=[])
    assert incomplete["mode"] == "tree"
    assert incomplete["passed"] is False
    assert incomplete["pending_node"] == "goods_transfer"

    wholesale = run_definition(
        template,
        auto_inputs={},
        resolved_bindings=[],
        input_overrides={
            "is_goods_transfer": True,
            "is_purchased_goods": True,
            "is_modified": False,
            "is_buyer_business": True,
        },
    )
    assert wholesale["outcome_id"] == "type1"
    assert wholesale["outcome_label"] == "第1種事業"
    assert wholesale["passed"] is True

    type4 = run_definition(
        template,
        auto_inputs={},
        resolved_bindings=[],
        input_overrides={
            "is_goods_transfer": False,
            "is_fixed_asset_transfer": True,
        },
    )
    assert type4["outcome_id"] == "type4"

    forced = run_definition(
        template,
        auto_inputs={},
        resolved_bindings=[],
        result_override="type6",
    )
    assert forced["outcome_id"] == "type6"
    assert forced["result_source"] == "manual"

def test_list_and_run_and_snapshot(flowchart_store) -> None:
    listed = client.get("/api/flowchart-templates", headers=_admin())
    assert listed.status_code == 200, listed.text
    ids = [t["id"] for t in listed.json()["global"]]
    assert "global-consumption-taxable" in ids
    assert "global-business-category" in ids

    run = client.get(
        "/api/clients/c1/flowchart-run?template_id=global-consumption-taxable",
        headers=_admin(),
    )
    assert run.status_code == 200, run.text
    body = run.json()
    assert body["template_id"] == "global-consumption-taxable"
    assert body["law_valid_from"] == "2023-10-01"
    assert "conditions" in body
    assert "client_name" in body

    persisted = client.post(
        "/api/flowchart-templates/global-consumption-taxable/run",
        headers=_admin(),
        json={
            "client_id": "c1",
            "result_override": "yes",
            "input_overrides": {"is_invoice_registered": True},
            "persist_draft": True,
        },
    )
    assert persisted.status_code == 200, persisted.text
    assert persisted.json()["result_source"] == "manual"
    assert persisted.json()["passed"] is True

    saved = client.post(
        "/api/clients/c1/flowchart-instances",
        headers=_admin(),
        json={
            "template_id": "global-consumption-taxable",
            "title": "期首の見立て",
            "result_override": "yes",
            "input_overrides": {"is_invoice_registered": True},
        },
    )
    assert saved.status_code == 200, saved.text
    iid = saved.json()["id"]

    listed_i = client.get("/api/clients/c1/flowchart-instances", headers=_admin())
    assert listed_i.status_code == 200
    assert any(i["id"] == iid for i in listed_i.json()["items"])

    recalled = client.get(f"/api/clients/c1/flowchart-instances/{iid}", headers=_admin())
    assert recalled.status_code == 200
    assert recalled.json()["snapshot"]["passed"] is True
    assert recalled.json()["frozen"] is True
    assert recalled.json()["snapshot"]["frozen"] is True
    assert recalled.json().get("frozen_definition") or recalled.json()["snapshot"].get("definition")

    pdf = client.get(f"/api/clients/c1/flowchart-instances/{iid}/pdf", headers=_admin())
    assert pdf.status_code == 200, pdf.text
    assert pdf.content[:4] == b"%PDF"
    assert pdf.headers.get("content-type", "").startswith("application/pdf")

    created = client.post(
        "/api/flowchart-templates",
        headers=_admin(),
        json={"title": "事務所チェック", "description": "独自", "definition": CONSUMPTION_TAXABLE_DEFINITION},
    )
    assert created.status_code == 200, created.text
    assert created.json()["scope"] == "local"


def test_unknown_client_run_denied() -> None:
    r = client.get(
        "/api/clients/not-a-real-client/flowchart-run",
        headers=_admin(),
    )
    assert r.status_code in (403, 404)


def _mini_def(node_id: str, label: str) -> dict:
    return {
        "combine": "any",
        "bindings": [{"input_id": "flag1", "source": "const", "value": True, "transform": "bool"}],
        "nodes": [
            {
                "id": node_id,
                "label": label,
                "rule": label,
                "kind": "flag",
                "when": {"input": "flag1", "eq": True},
                "match_inputs": {"flag1": True},
                "facts": [{"input_id": "flag1", "label": label, "kind": "flag"}],
                "documents": [],
            }
        ],
        "outcomes": {
            "true": {"label": f"{label}該当", "message": label},
            "false": {"label": f"{label}非該当", "message": "no"},
        },
    }


def test_as_of_selects_law_edition(flowchart_store) -> None:
    old = client.post(
        "/api/flowchart-templates",
        headers=_admin(),
        json={
            "title": "判定A",
            "family_id": "fam-law",
            "valid_from": "2020-01-01",
            "valid_to": "2023-12-31",
            "law_label": "旧法",
            "definition": _mini_def("old_rule", "旧法ノード"),
        },
    )
    assert old.status_code == 200, old.text
    new = client.post(
        "/api/flowchart-templates",
        headers=_admin(),
        json={
            "title": "判定A",
            "family_id": "fam-law",
            "valid_from": "2024-01-01",
            "law_label": "新法",
            "definition": _mini_def("new_rule", "新法ノード"),
        },
    )
    assert new.status_code == 200, new.text

    run_old = client.get(
        "/api/clients/c1/flowchart-run?family_id=fam-law&as_of=2022-06-01",
        headers=_admin(),
    )
    assert run_old.status_code == 200, run_old.text
    assert run_old.json()["law_valid_from"] == "2020-01-01"
    assert run_old.json()["conditions"][0]["id"] == "old_rule"

    run_new = client.get(
        "/api/clients/c1/flowchart-run?family_id=fam-law&as_of=2025-04-01",
        headers=_admin(),
    )
    assert run_new.status_code == 200, run_new.text
    assert run_new.json()["law_valid_from"] == "2024-01-01"
    assert run_new.json()["conditions"][0]["id"] == "new_rule"

    missing = client.get(
        "/api/clients/c1/flowchart-run?family_id=fam-law&as_of=2010-01-01",
        headers=_admin(),
    )
    assert missing.status_code == 404


def test_frozen_snapshot_ignores_later_template_edit(flowchart_store) -> None:
    created = client.post(
        "/api/flowchart-templates",
        headers=_admin(),
        json={
            "title": "固定用",
            "family_id": "fam-freeze",
            "valid_from": "2024-01-01",
            "law_label": "保存時の税法",
            "definition": _mini_def("keep_rule", "保存時ノード"),
        },
    )
    assert created.status_code == 200, created.text
    tid = created.json()["id"]

    saved = client.post(
        "/api/clients/c1/flowchart-instances",
        headers=_admin(),
        json={
            "template_id": tid,
            "family_id": "fam-freeze",
            "title": "当時の判定",
            "as_of": "2025-01-01",
            "result_override": "auto",
            "input_overrides": {},
        },
    )
    assert saved.status_code == 200, saved.text
    iid = saved.json()["id"]
    assert saved.json()["frozen"] is True
    assert saved.json()["snapshot"]["conditions"][0]["label"] == "保存時ノード"

    edited = client.put(
        f"/api/flowchart-templates/{tid}",
        headers=_admin(),
        json={
            "title": "固定用",
            "definition": _mini_def("keep_rule", "改正後ノード"),
            "law_label": "改正後の税法",
        },
    )
    assert edited.status_code == 200, edited.text

    recalled = client.get(f"/api/clients/c1/flowchart-instances/{iid}", headers=_admin())
    assert recalled.status_code == 200
    snap = recalled.json()["snapshot"]
    assert snap["conditions"][0]["label"] == "保存時ノード"
    assert snap["law_label"] == "保存時の税法"
    assert snap["frozen"] is True
    assert (recalled.json().get("frozen_definition") or snap.get("definition"))["nodes"][0]["label"] == "保存時ノード"

    from services.flowchart_pdf import snapshot_to_text

    pdf_text = snapshot_to_text(recalled.json())
    assert "保存時ノード" in pdf_text
    assert "改正後ノード" not in pdf_text
    pdf = client.get(f"/api/clients/c1/flowchart-instances/{iid}/pdf", headers=_admin())
    assert pdf.status_code == 200
    assert pdf.content[:4] == b"%PDF"
    live = client.get(
        "/api/clients/c1/flowchart-run?family_id=fam-freeze&as_of=2025-01-01",
        headers=_admin(),
    )
    assert live.status_code == 200
    assert live.json()["conditions"][0]["label"] == "改正後ノード"
