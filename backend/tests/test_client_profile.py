from services.client_profile_fields import sanitize_client_profile


def test_sanitize_client_profile_keeps_known_fields() -> None:
    raw = {
        "customer_name": "株式会社テスト",
        "corporate_number": "1234567890123",
        "unknown_field": "drop me",
    }
    out = sanitize_client_profile(raw)
    assert out["customer_name"] == "株式会社テスト"
    assert out["corporate_number"] == "1234567890123"
    assert "unknown_field" not in out


def test_sanitize_client_profile_rejects_non_string_values() -> None:
    out = sanitize_client_profile({"officer_count": 3})
    assert out == {}
