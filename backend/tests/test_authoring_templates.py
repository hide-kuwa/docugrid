"""template_variable_parser and authoring_templates."""

import json

from fastapi.testclient import TestClient

from main import app
from services.template_variable_parser import (
    extract_variable_names,
    merge_render_values,
    parse_jp_field,
    render_template_body,
)

client = TestClient(app)


def _admin_headers() -> dict[str, str]:
    return {
        "X-Docugrid-Role": "admin",
        "X-Docugrid-User": "smoke-test@example.com",
        "X-Docugrid-Stakeholder": "actor-admin",
        "X-Docugrid-Client": "c1",
    }


def _platform_headers() -> dict[str, str]:
    return {
        "X-Docugrid-Role": "platform_admin",
        "X-Docugrid-User": "admin@taxx.jp",
        "X-Docugrid-Stakeholder": "actor-admin",
        "X-Docugrid-Client": "c1",
    }


def test_extract_variable_names_ordered_unique() -> None:
    body = "{{client_name}} と {{ceo_name}}、再び {{client_name}}"
    assert extract_variable_names(body) == ["client_name", "ceo_name"]


def test_render_template_body_substitutes() -> None:
    out = render_template_body("Hello {{client_name}}", {"client_name": "鈴木商店"})
    assert out == "Hello 鈴木商店"


def test_merge_render_values_builtin_client() -> None:
    merged = merge_render_values(
        {"id": "c1", "name": "株式会社テスト", "fiscalMonth": 3},
        {"ceo_name": "山田"},
    )
    assert merged["client_name"] == "株式会社テスト"
    assert merged["fiscal_month"] == "3"
    assert merged["ceo_name"] == "山田"
    assert "today" in merged


def test_authoring_templates_list_includes_global() -> None:
    r = client.get("/api/authoring-templates", headers=_admin_headers())
    assert r.status_code == 200, r.text
    body = r.json()
    assert "global" in body and "local" in body
    assert len(body["global"]) >= 1
    assert any(t["id"] == "global-officer-compensation-minutes" for t in body["global"])


def test_local_template_crud() -> None:
    create = client.post(
        "/api/authoring-templates",
        headers=_admin_headers(),
        json={
            "title": "税務調査チェックリスト",
            "body": "{{client_name}} 向けチェック\n担当: {{staff_name}}",
            "scope": "local",
        },
    )
    assert create.status_code == 200, create.text
    item = create.json()
    assert item["scope"] == "local"
    assert "client_name" in item["variables"]
    assert "staff_name" in item["variables"]
    tid = item["id"]

    listed = client.get("/api/authoring-templates", headers=_admin_headers()).json()
    assert any(t["id"] == tid for t in listed["local"])

    render = client.post(
        f"/api/authoring-templates/{tid}/render",
        headers=_admin_headers(),
        json={"client_id": "c1", "values": {"staff_name": "田中"}},
    )
    assert render.status_code == 200, render.text
    rendered = render.json()
    assert "鈴木" in rendered["renderedBody"] or "c1" in rendered["resolvedValues"]["client_id"]
    assert rendered["resolvedValues"]["staff_name"] == "田中"

    deleted = client.delete(f"/api/authoring-templates/{tid}", headers=_admin_headers())
    assert deleted.status_code == 200


def test_parse_jp_field_party_and_address() -> None:
    name = parse_jp_field("法人名１")
    assert name.canonical == "party1_name"
    assert name.party == 1
    addr = parse_jp_field("法人名２住所")
    assert addr.canonical == "party2_address"
    assert addr.party == 2
    otsu = parse_jp_field("乙")
    assert otsu.canonical == "party2_name"
    kou_addr = parse_jp_field("甲住所")
    assert kou_addr.canonical == "party1_address"
    current = parse_jp_field("本店住所")
    assert current.canonical == "head_office_address"
    assert current.party is None


def test_extract_and_render_jp_brackets() -> None:
    body = "【法人名１】（以下、甲という）と【法人名２】（以下、乙という）は合意した。【法人名１住所】"
    assert extract_variable_names(body) == ["party1_name", "party2_name", "party1_address"]
    party1 = {
        "id": "c1",
        "name": "株式会社甲",
        "fiscalMonth": 3,
        "profile": {"head_office_address": "東京都千代田区1-1"},
    }
    party2 = {
        "id": "c2",
        "name": "合同会社乙",
        "fiscalMonth": 12,
        "profile": {"head_office_address": "大阪府大阪市2-2"},
    }
    resolved = merge_render_values(party1, {}, party_clients={1: party1, 2: party2})
    out = render_template_body(body, resolved)
    assert "株式会社甲" in out
    assert "合同会社乙" in out
    assert "東京都千代田区1-1" in out
    assert "【" not in out


def test_render_keeps_unresolved_jp_tag() -> None:
    out = render_template_body("相手は【法人名２】です", {"party1_name": "甲社"})
    assert out == "相手は【法人名２】です"


def test_parse_endpoint() -> None:
    r = client.post(
        "/api/authoring-templates/parse",
        headers=_admin_headers(),
        json={"body": "{{a}} {{b}} 【法人名１】"},
    )
    assert r.status_code == 200
    assert r.json()["variables"] == ["a", "b", "party1_name"]


def test_render_body_parties_from_master() -> None:
    r = client.post(
        "/api/authoring-templates/render-body",
        headers=_admin_headers(),
        json={
            "client_id": "c1",
            "body": "【法人名１】と【法人名２】",
            "parties": [{"slot": 1, "client_id": "c1"}, {"slot": 2, "client_id": "c2"}],
        },
    )
    assert r.status_code == 200, r.text
    payload = r.json()
    name1 = payload["resolvedValues"]["party1_name"]
    name2 = payload["resolvedValues"]["party2_name"]
    assert name1
    assert name2
    assert name1 != name2
    assert name1 in payload["renderedBody"]
    assert name2 in payload["renderedBody"]
    assert "【" not in payload["renderedBody"]


def test_render_template_parties_on_global_agreement() -> None:
    r = client.post(
        "/api/authoring-templates/global-party-agreement-stub/render",
        headers=_admin_headers(),
        json={
            "client_id": "c1",
            "parties": [{"slot": 2, "client_id": "c2"}],
        },
    )
    assert r.status_code == 200, r.text
    payload = r.json()
    name1 = payload["resolvedValues"]["party1_name"]
    name2 = payload["resolvedValues"]["party2_name"]
    assert name1 in payload["renderedBody"]
    assert name2 in payload["renderedBody"]
    assert "以下「甲」" in payload["renderedBody"]


def test_wareki_and_honorific_from_master() -> None:
    from datetime import date as date_cls

    from services.template_variable_parser import format_wareki, honorific_for_client

    assert format_wareki(date_cls(2026, 8, 19)) == "令和8年8月19日"
    assert honorific_for_client({"category": "corporate"}) == "御中"
    assert honorific_for_client({"category": "individual"}) == "様"

    corp = merge_render_values(
        {"id": "c1", "name": "株式会社甲", "category": "corporate", "fiscalMonth": 3},
        {},
    )
    person = merge_render_values(
        {"id": "c4", "name": "鈴木 太郎", "category": "individual", "fiscalMonth": 12},
        {},
    )
    assert corp["honorific"] == "御中"
    assert "御中" in corp["addressee"]
    assert person["honorific"] == "様"
    assert "令和" in render_template_body("【和暦本日】", corp)

    out = render_template_body(
        "【宛名１】",
        merge_render_values(
            {"id": "c1", "name": "株式会社甲", "category": "corporate"},
            {},
            party_clients={
                1: {"id": "c1", "name": "株式会社甲", "category": "corporate"},
            },
        ),
    )
    assert out == "株式会社甲　御中"
