"""template_variable_parser and authoring_templates."""

import json

from fastapi.testclient import TestClient

from main import app
from services.template_variable_parser import (
    extract_variable_names,
    merge_render_values,
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
        "X-Docugrid-User": "admin@tax.co.jp",
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


def test_parse_endpoint() -> None:
    r = client.post(
        "/api/authoring-templates/parse",
        headers=_admin_headers(),
        json={"body": "{{a}} {{b}}"},
    )
    assert r.status_code == 200
    assert r.json()["variables"] == ["a", "b"]
