"""顧客管理プロフィール — 許可フィールド ID（文字値のみ）。"""

from __future__ import annotations

CLIENT_PROFILE_FIELD_IDS: frozenset[str] = frozenset(
    [
        "customer_code",
        "customer_name",
        "customer_name_kana",
        "mailing_address",
        "head_office_address",
        "email",
        "phone",
        "fax",
        "appointment_method",
        "industry_type",
        "business_description",
        "entity_major",
        "entity_minor",
        "established_date",
        "capital",
        "list_display_setting",
        "fee_payment_method",
        "contract_content",
        "handling_notes",
        "tax_audit_history",
        "banks",
        "remarks",
        "fiscal_year_end_date",
        "filing_date",
        "filing_method",
        "filing_category",
        "consumption_tax",
        "corporate_number",
        "shareholder_count",
        "issued_shares",
        "shareholders_with_voting_rights",
        "voting_rights_total",
        "shareholders_attending",
        "voting_rights_attending",
        "tax_office",
        "prefectural_tax_office",
        "municipal_tax_office",
        "etax_user_id",
        "etax_pin",
        "eltax_user_id",
        "eltax_pin",
        "accounting_software",
        "processing_manual",
        "tax_returns",
        "corp_blue_return_application",
        "income_blue_return_application",
        "income_blue_family_employee_notice",
        "invoice_registration_application",
        "consumption_tax_election_notice",
        "consumption_tax_election_withdrawal",
        "officer_count",
        "officer_relative_count",
        "employee_count",
        "year_end_adjustment",
        "officer_compensation",
        "director1_monthly_salary",
        "director2_monthly_salary",
        "total_monthly_salary",
        "payroll",
        "withholding_tax",
        "resident_tax",
        "representative_name",
        "director1_name",
        "director2_name",
        "accounting_contact_name",
        "referrer",
        "personnel_info",
        "inheritance_details",
        "depreciation_asset_tax",
        "profit_taxable_income",
        "assets_taxable_estate",
        "insurance_policies",
        "insurance_needs",
        "real_estate_income_tax_needs",
        "real_estate_inheritance_tax_needs",
        "will_prospect",
        "trust_needs",
        "lifetime_consulting_needs",
        "incorporation",
        "proposal_metrics",
        "fee_by_service_type",
        "planned_hours",
        "filing_info_list",
        "staff_assignments",
        "option_settings",
    ]
)


PROFILE_FIELD_SOURCES: frozenset[str] = frozenset(
    ["manual", "ocr", "master", "import"]
)

PROFILE_META_OPTIONAL_KEYS: frozenset[str] = frozenset(
    [
        "sourceDocumentLabel",
        "sourceSlotId",
        "sourcePeriodKey",
        "updatedAt",
        "updatedBy",
        "updatedById",
    ]
)

MASTER_HISTORY_FIELD_IDS: frozenset[str] = frozenset(["_name", "_fiscal_month"])

TRACKED_HISTORY_FIELD_IDS: frozenset[str] = CLIENT_PROFILE_FIELD_IDS | MASTER_HISTORY_FIELD_IDS

PROFILE_HISTORY_ENTRY_KEYS: frozenset[str] = frozenset(
    [
        "value",
        "previousValue",
        "source",
        "updatedAt",
        "updatedBy",
        "updatedById",
    ]
)

MAX_PROFILE_HISTORY_PER_FIELD = 100


def sanitize_client_profile(raw: object) -> dict[str, str]:
    if not isinstance(raw, dict):
        return {}
    out: dict[str, str] = {}
    for key, value in raw.items():
        if key not in CLIENT_PROFILE_FIELD_IDS:
            continue
        if value is None:
            continue
        if not isinstance(value, str):
            continue
        out[key] = value
    return out


def sanitize_client_profile_meta(raw: object) -> dict[str, dict[str, str]]:
    if not isinstance(raw, dict):
        return {}
    out: dict[str, dict[str, str]] = {}
    for field_id, meta in raw.items():
        if field_id not in CLIENT_PROFILE_FIELD_IDS:
            continue
        if not isinstance(meta, dict):
            continue
        source = meta.get("source")
        if source not in PROFILE_FIELD_SOURCES:
            continue
        cleaned: dict[str, str] = {"source": str(source)}
        for opt_key in PROFILE_META_OPTIONAL_KEYS:
            opt_val = meta.get(opt_key)
            if opt_val is None:
                continue
            if not isinstance(opt_val, str):
                opt_val = str(opt_val)
            opt_val = opt_val.strip()
            if opt_val:
                cleaned[opt_key] = opt_val
        out[field_id] = cleaned
    return out


def sanitize_client_profile_history(raw: object) -> dict[str, list[dict[str, str]]]:
    if not isinstance(raw, dict):
        return {}
    out: dict[str, list[dict[str, str]]] = {}
    for field_id, entries in raw.items():
        if field_id not in TRACKED_HISTORY_FIELD_IDS:
            continue
        if not isinstance(entries, list):
            continue
        cleaned_entries: list[dict[str, str]] = []
        for entry in entries[:MAX_PROFILE_HISTORY_PER_FIELD]:
            if not isinstance(entry, dict):
                continue
            source = entry.get("source")
            if source not in PROFILE_FIELD_SOURCES:
                source = "manual"
            updated_at = entry.get("updatedAt")
            if not isinstance(updated_at, str) or not updated_at.strip():
                continue
            cleaned: dict[str, str] = {
                "source": str(source),
                "updatedAt": updated_at.strip(),
            }
            value = entry.get("value")
            if isinstance(value, str):
                cleaned["value"] = value
            prev = entry.get("previousValue")
            if isinstance(prev, str):
                cleaned["previousValue"] = prev
            for opt_key in ("updatedBy", "updatedById"):
                opt_val = entry.get(opt_key)
                if isinstance(opt_val, str) and opt_val.strip():
                    cleaned[opt_key] = opt_val.strip()
            cleaned_entries.append(cleaned)
        if cleaned_entries:
            out[field_id] = cleaned_entries
    return out
