"""定款・謄本の抽出スキーマテスト。"""

from __future__ import annotations

from services.document_extraction_schema import (
    extract_from_schema,
    has_extraction_schema,
    list_schema_slot_ids,
)
from services.profile_extractors import extract_corporate_registry, extract_profile_fields

SAMPLE_REGISTRY = """
履歴事項全部証明書
商号 株式会社テスト商事
本店 東京都千代田区丸の内1-1-1
法人番号 1234567890123
資本金 金1,000,000円
代表取締役 山田太郎
設立年月日 2010年4月1日
"""

SAMPLE_ARTICLES = """
定款
（商号）
第1条 当会社は、株式会社テスト商事と称する。
（本店）
第2条 当会社は、本店を東京都千代田区丸の内二丁目1番地に置く。
（事業年度）
第3条 当会社の事業年度は、毎年4月1日から翌年3月31日までとする。
（資本金）
第4条 当会社の資本金の額は、金1,000,000円とする。
"""


def test_schema_registry_listed() -> None:
    ids = list_schema_slot_ids()
    assert "corporate_registry" in ids
    assert "articles_of_incorporation" in ids
    assert has_extraction_schema("corporate_registry")
    assert has_extraction_schema("articles_of_incorporation")


def test_corporate_registry_schema_extracts_required_fields() -> None:
    result = extract_from_schema("corporate_registry", SAMPLE_REGISTRY)
    by_id = {f.field_id: f for f in result.fields}
    assert by_id["corporate_number"].status == "extracted"
    assert by_id["corporate_number"].value == "1234567890123"
    assert by_id["customer_name"].status == "extracted"
    assert "テスト商事" in (by_id["customer_name"].value or "")
    assert by_id["head_office_address"].status == "extracted"
    assert result.extracted_profile["corporate_number"] == "1234567890123"


def test_corporate_registry_schema_marks_missing() -> None:
    result = extract_from_schema("corporate_registry", "履歴事項全部証明書\n商号 株式会社のみ")
    by_id = {f.field_id: f for f in result.fields}
    assert by_id["corporate_number"].status == "missing"
    assert result.review_status == "needs_review"


def test_articles_schema_extracts_fields() -> None:
    result = extract_from_schema("articles_of_incorporation", SAMPLE_ARTICLES)
    by_id = {f.field_id: f for f in result.fields}
    assert by_id["customer_name"].status == "extracted"
    assert "テスト商事" in (by_id["customer_name"].value or "")
    assert by_id["head_office_address"].status == "extracted"
    assert by_id["capital"].status == "extracted"
    assert by_id["fiscal_year_end_date"].status == "extracted"


def test_profile_extractors_delegates_to_schema() -> None:
    legacy = extract_corporate_registry(SAMPLE_REGISTRY)
    schema = extract_profile_fields("corporate_registry", SAMPLE_REGISTRY)
    assert legacy["corporate_number"][0] == schema["corporate_number"][0]
    assert "テスト商事" in legacy["customer_name"][0]
    assert "テスト商事" in schema["customer_name"][0]


def test_extraction_result_serializes() -> None:
    result = extract_from_schema("corporate_registry", SAMPLE_REGISTRY)
    payload = result.to_dict()
    assert payload["slot_id"] == "corporate_registry"
    assert payload["document_label"] == "履歴事項全部証明書"
    assert len(payload["fields"]) >= 5
    assert "extracted_profile" in payload
