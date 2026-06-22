"""OrderPayload Pydantic schema — JSON shape aligned with frontend `schema/order-payload.ts`."""

import json

import pytest

from schemas.order_payload import ORDER_PAYLOAD_VERSION, OrderPayload


def test_order_payload_from_frontend_json() -> None:
    raw = {
        "version": 1,
        "orderedPages": [
            {"pageId": "p1", "fallback": {"fileId": "f1", "originalIndex": 0}},
            {"pageId": "p2"},
        ],
        "highlightsByPage": [
            {
                "pageId": "p1",
                "items": [
                    {
                        "highlightId": "h1",
                        "tool": "box",
                        "rect": {"x": 0.1, "y": 0.2, "w": 0.3, "h": 0.4},
                    }
                ],
            }
        ],
        "meta": {"clientId": "c1", "futureFlag": True},
        "extensions": {"ocr": {"jobId": "job-1"}, "byos": {"ref": "s3://x"}, "unknownVendor": {"a": 1}},
    }
    m = OrderPayload.model_validate(raw)
    assert m.version == ORDER_PAYLOAD_VERSION
    assert len(m.ordered_pages) == 2
    assert m.ordered_pages[0].fallback is not None
    assert m.ordered_pages[0].fallback.file_id == "f1"
    assert m.highlights_by_page is not None
    assert m.highlights_by_page[0].items[0].tool == "box"
    assert m.extensions is not None
    assert m.extensions["unknownVendor"]["a"] == 1


def test_order_payload_dump_roundtrip_camel_case() -> None:
    m = OrderPayload(
        version=1,
        ordered_pages=[],
        extensions={"k": "v"},
    )
    # model_construct or fix - ordered_pages required non-empty? empty list ok
    data = m.model_dump(mode="json", by_alias=True)
    assert data["version"] == 1
    assert data["orderedPages"] == []
    assert data["extensions"] == {"k": "v"}
    back = OrderPayload.model_validate_json(json.dumps(data))
    assert back.version == 1


def test_order_payload_rejects_wrong_version() -> None:
    with pytest.raises(Exception):
        OrderPayload.model_validate({"version": 2, "orderedPages": []})
