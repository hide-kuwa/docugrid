"""Screen design 3-layer merge tests."""

from fastapi.testclient import TestClient

from main import app
from services.screen_design import merge_persona_design, resolve_screen_design
from services.tenancy import DEFAULT_FIRM_ID

client = TestClient(app)


def _admin_headers() -> dict[str, str]:
    return {
        "X-Docugrid-Role": "admin",
        "X-Docugrid-User": "admin@tax.co.jp",
        "X-Docugrid-Stakeholder": "actor-admin",
        "X-Docugrid-Client": "c1",
        "X-Docugrid-Firm": DEFAULT_FIRM_ID,
    }


def test_merge_persona_member_overrides_firm() -> None:
    merged = merge_persona_design(
        persona_id="client_accounting",
        code_defaults={"pageTitle": "Default", "welcomeMessage": ""},
        platform={"personas": {"client_accounting": {"pageTitle": "Platform Title"}}},
        firm={"personas": {"client_accounting": {"welcomeMessage": "Firm hello"}}},
        member={"personas": {"client_accounting": {"pageTitle": "My Title"}}},
    )
    assert merged["pageTitle"] == "My Title"
    assert merged["welcomeMessage"] == "Firm hello"


def test_screen_design_resolved_api() -> None:
    r = client.get("/api/screen-design/resolved", headers=_admin_headers())
    assert r.status_code == 200, r.text
    data = r.json()
    assert "merged" in data
    assert "layers" in data


def test_member_screen_design_put_and_resolve() -> None:
    put = client.put(
        "/api/screen-design/member",
        headers=_admin_headers(),
        json={
            "personas": {
                "platform_admin": {
                    "pageTitle": "My Admin Home",
                    "welcomeMessage": "Personal override",
                }
            }
        },
    )
    assert put.status_code == 200, put.text
    r = client.get(
        "/api/screen-design/resolved?persona_id=platform_admin",
        headers=_admin_headers(),
    )
    assert r.status_code == 200
    assert r.json()["merged"]["pageTitle"] == "My Admin Home"
