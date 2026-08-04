"""Shared imports for API route modules (extracted from application.py)."""

import base64
import csv
import hashlib
import io
import json
import logging
import os
import sqlite3
import urllib.parse
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional



import fitz  # PyMuPDF
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, Query, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response, StreamingResponse
from pydantic import BaseModel, Field

from services.pdf_annotations import (
    add_box_annotation,
    add_check_annotation,
    add_line_annotation,
    delete_one_docugrid_annotation,
    draw_freehand_marker,
    parse_norm_path_json,
    path_bbox_rect,
    tag_docugrid_annotation,
)

from docugrid_auth import (
    MCP_JWT_AUDIENCE,
    SESSION_COOKIE_NAME,
    STAKEHOLDER_ROLE_BY_ID,
    attach_csrf_cookie,
    clear_csrf_cookie,
    create_access_token,
    create_mcp_access_token,
    csrf_protection_enabled,
    csrf_validation_failed,
    ensure_csrf_cookie_on_response,
    get_cors_origins,
    get_jwt_exp_seconds,
    get_mcp_jwt_exp_seconds,
    is_production,
    legacy_files_enabled,
    peek_identity_for_audit,
    resolve_identity,
    session_cookie_enabled,
    session_cookie_secure,
    validate_auth_config,
)
from database import init_db
from schemas.docugrid_persist import DocugridSaveRequest
from schemas.order_payload import OrderPayload
from services.ai_classifier import ai_classify_boost, gemini_classify_boost
from services.ai_prompts import (
    PROMPT_KEY_CLASSIFY_TEXT,
    PROMPT_KEY_CLASSIFY_VISION,
    PROMPT_KEYS,
    PROMPT_VARIABLES,
    builtin_default,
    execute_prompt_test,
    get_prompt_template,
    list_prompt_definitions,
    reset_prompt_template,
    save_prompt_template,
)
from services.firm_members import (
    MEMBER_STATUS_ACTIVE,
    MEMBER_STATUS_INACTIVE,
    bootstrap_firm_members,
    get_member_by_id,
    get_member_by_stakeholder_id,
    init_firm_members_db,
    list_members_for_firm,
    resolve_member_for_login,
    set_member_status,
)
from services.personas import persona_label, resolve_persona_id
from services.screen_design import (
    bootstrap_screen_design_examples,
    load_firm_design,
    load_member_design,
    load_platform_design,
    resolve_screen_design,
    save_firm_design,
    save_member_design,
    save_platform_design,
)
from services.firm_settings import (
    configured_flags,
    get_gemini_key,
    get_openai_key,
    load_system_config_raw,
    migrate_legacy_settings_if_needed,
    save_drive_credentials,
    clear_drive_credentials,
    get_drive_service_account_email,
    save_system_config_raw,
    update_secrets,
)
from services.doc_classifier import classify_pdf, extract_text_from_pdf
from services.document_templates import load_document_template, save_document_template
from services.authoring_templates import (
    create_global_template,
    create_local_template,
    delete_template,
    get_template_by_id,
    list_all_for_firm,
    update_template,
)
from services.review_checklist_service import (
    create_template as create_review_checklist_template,
    delete_template as delete_review_checklist_template,
    evaluate_alerts,
    export_checklist_pdf,
    get_instance,
    get_template as get_review_checklist_template,
    list_templates as list_review_checklist_templates,
    prefill_header,
    save_instance,
    save_instance_checks,
    save_template as save_review_checklist_template,
    set_default_template as set_default_review_checklist_template,
    update_template as update_review_checklist_template,
)
from services.text_to_pdf import text_to_pdf_bytes
from services.template_variable_parser import (
    extract_variable_names,
    merge_render_values,
    missing_variables,
    render_template_body,
    BUILTIN_CLIENT_TAGS,
    BUILTIN_SYSTEM_TAGS,
)
from services.tax_document_types import (
    infer_type_from_text,
    label_for_type,
    slot_id_for_type,
)
from services.pending_classify_service import (
    create_pending_item,
    delete_pending_item,
    get_pending_file_path,
    init_pending_classify_db,
    list_pending_items,
)
from services.payroll_ledger_service import (
    apply_marufu_to_payroll,
    apply_year_end_settlement,
    compute_and_apply_santei_grades,
    delete_ledger_row,
    get_year_end_run,
    init_payroll_ledger_db,
    ledger_summary,
    list_employees,
    list_ledger_rows,
    list_marufu_submissions,
    list_year_end_runs,
    replace_employees,
    run_year_end_adjustment,
    upsert_ledger_row,
)
from services.invoice_registry import ensure_invoice_cache_seed, verify_invoice_registration
from services.capture_service import (
    create_capture_item,
    delete_capture_item,
    get_capture_file_path,
    get_capture_mime,
    get_capture_item,
    init_capture_db,
    list_capture_items,
    update_capture_item,
    apply_capture_analysis,
    get_capture_file_bytes,
)
from services.capture_normalize import build_marufu_parsed_from_capture
from services.ssot_ingest import ingest_from_slot_document, ingest_result_for_response, ingest_from_confirmed_fields
from services.profile_extractors import profile_fields_from_text
from services.extracted_document_meta import enrich_classify_metadata
from services.document_catalog_service import (
    build_catalog_rows,
    list_all_catalog_field_defs,
    list_catalog_field_defs,
)
from services.ocr_job_service import (
    create_ocr_job,
    get_ocr_job,
    init_ocr_jobs_db,
    run_ocr_job,
)
from services.auto_vouching import (
    get_vouch_stamp,
    init_auto_vouch_db,
    init_auto_vouch_queue_db,
    list_vouch_stamps,
    resolve_stamp_output_path,
    run_auto_vouch,
)
from services.auto_vouch_fields import list_auto_vouch_fields, refresh_metric_index, suggest_from_metric
from services.metric_mapping_registry import (
    config_path as metric_mappings_config_path,
    config_summary as metric_mappings_config_summary,
    create_mapping as create_metric_mapping,
    delete_mapping as delete_metric_mapping,
    export_csv_text as export_metric_mappings_csv,
    export_yaml_text as export_metric_mappings_yaml,
    get_mapping as get_metric_mapping,
    import_csv_text as import_metric_mappings_csv,
    import_yaml_text as import_metric_mappings_yaml,
    list_mappings as list_metric_mappings,
    reload_metric_mappings_config,
    update_mapping as update_metric_mapping,
    validate_csv_text as validate_metric_mappings_csv,
    validate_yaml_text as validate_metric_mappings_yaml,
)
from services.legal_master_service import (
    create_entry as create_legal_master_entry,
    delete_entry as delete_legal_master_entry,
    export_csv_text as export_legal_master_csv,
    get_entry as get_legal_master_entry,
    import_csv_text as import_legal_master_csv,
    init_legal_master_db,
    list_entries as list_legal_master_entries,
    list_income_tax_brackets,
    lookup_rate as lookup_legal_master_rate,
    seed_from_file as seed_legal_master_from_file,
    summary as legal_master_summary,
    update_entry as update_legal_master_entry,
    validate_csv_text as validate_legal_master_csv,
)
from services.legal_master_nta_import import (
    preview_nta_import as preview_legal_master_nta_import,
)
from services.withholding_tax_service import (
    get_table as get_withholding_monthly_table,
    list_tables as list_withholding_tables,
    lookup_monthly as lookup_withholding_monthly,
    reload_tables as reload_withholding_tables,
)
from services.corporate_tax_service import (
    compute_corporate_tax,
    get_table as get_corporate_tax_table,
    list_tables as list_corporate_tax_tables,
    reload_table as reload_corporate_tax_table,
)
from services.ref_table_service import (
    effective_version as ref_table_effective_version,
    get_ref_table,
    list_ref_tables,
    reload_ref_tables,
    save_ref_table,
    upsert_ref_table_row,
)
from services.legal_calc_service import (
    build_association_health_amount_table,
    calc_association_health_premium,
    calc_corporate_enterprise_tax,
    calc_corporate_local_taxes,
    calc_defense_surtax,
    calc_employment_income,
    calc_employment_insurance,
    calc_individual_resident_tax,
    calc_simplified_consumption,
    check_minimum_wage,
    clip_social_insurance_basis,
    list_association_health_prefectures,
    lookup_association_health_rate,
    lookup_basic_deduction,
    lookup_corporate_percapita,
    lookup_spouse_deduction,
    lookup_standard_grade,
)
from services.handoff_dry_run import (
    HandoffTestContext,
    get_last_test_result,
    list_test_health,
    run_port_test,
    sample_response,
)
from services.integration_registry import (
    config_path as integration_ports_config_path,
    config_summary as integration_ports_config_summary,
    create_port as create_integration_port,
    delete_port as delete_integration_port,
    export_yaml_text as export_integration_ports_yaml,
    get_port as get_integration_port,
    import_yaml_text as import_integration_ports_yaml,
    list_ports as list_integration_ports,
    reload_integration_ports_config,
    update_port as update_integration_port,
    validate_yaml_text as validate_integration_ports_yaml,
)
from services.document_types import (
    config_summary as document_types_config_summary,
    list_types as list_document_types,
    reload_document_types_config,
)
from services.document_categories import (
    config_summary as document_categories_config_summary,
    list_categories_with_forms as list_document_categories_with_forms,
    reload_document_categories_config,
)
from services.form_catalog import (
    config_path as form_catalog_config_path,
    config_summary as form_catalog_config_summary,
    create_form as create_form_catalog_entry,
    delete_form as delete_form_catalog_entry,
    export_yaml_text as export_form_catalog_yaml,
    get_form as get_form_catalog_entry,
    import_yaml_text as import_form_catalog_yaml,
    list_forms as list_form_catalog_forms,
    reload_form_catalog_config,
    reorder_forms as reorder_form_catalog_entries,
    update_form as update_form_catalog_entry,
    validate_yaml_text as validate_form_catalog_yaml,
)
from services.form_page_scanner import scan_pdf_pages
from services.form_catalog_classify import (
    classify_pdf_for_tax_package,
    try_catalog_slot_classify,
)
from services.form_catalog_compiler import (
    build_learning_vision_prompt,
    compile_catalog_from_samples,
    list_form_presets,
    slot_label_options,
)
from services.form_catalog_samples import (
    add_sample as add_form_catalog_sample,
    delete_page_annotation as delete_form_catalog_page_annotation,
    delete_sample as delete_form_catalog_sample,
    extract_sample_page_text,
    get_sample as get_form_catalog_sample,
    list_samples as list_form_catalog_samples,
    render_sample_page_png,
    sample_coverage_by_form as form_catalog_sample_coverage,
    upsert_page_annotation as upsert_form_catalog_page_annotation,
)
from services.capture_analyzer import analyze_capture_content, reaudit_capture_metadata
from services.capture_routing import load_capture_as_pdf
from services.expense_context import ensure_demo_calendar_seed
from services.slot_drive_sync import maybe_upload_slot_to_drive, fetch_slot_from_drive
from services.drive_context import (
    drive_credentials_configured,
    get_drive_service,
    invalidate_drive_service_cache,
    resolve_drive_mode,
)
from services.vision_classifier import classify_tax_document
from services.client_profile_fields import (
    sanitize_client_profile,
    sanitize_client_profile_history,
    sanitize_client_profile_meta,
)
from services.client_assignments import (
    backfill_assignments_from_legacy,
    build_client_assignee_index,
    build_member_client_index,
    init_client_assignments_db,
    load_assignment_scope_map,
    sync_assignments_from_scope_map,
    validate_assignments_for_clients,
)
from services.stripe_billing_service import (
    create_ai_topup_checkout,
    create_checkout_session,
    create_portal_session,
    frontend_base_url,
    get_billing_status,
    handle_webhook,
    is_stripe_configured,
    sync_firm_billing_usage,
)
from services.ai_usage_service import (
    check_ai_allowed,
    enable_paygo,
    estimate_tokens_from_text,
    get_firm_ai_summary,
    init_ai_usage_db,
    list_client_usages,
    record_ai_usage,
)
from services.stripe_connect_service import (
    attach_partner_to_firm,
    create_onboarding_link,
    create_partner,
    list_partners,
)
from services.platform_analytics_service import (
    build_executive_dashboard,
    build_firm_detail,
    init_platform_metrics_db,
)
from services.ma_goals_service import build_ma_goals, save_ma_assumptions
from services.moneytree_link_service import (
    build_authorize_url,
    build_vault_url,
    callback_redirect_url,
    disconnect as disconnect_moneytree,
    firm_clients_status,
    handle_oauth_callback,
    is_mock_mode,
    is_moneytree_configured,
    list_accounts as list_moneytree_accounts,
    list_transactions as list_moneytree_transactions,
    mock_connect,
    status_payload as moneytree_status_payload,
    sync_accounts as sync_moneytree_accounts,
)
from services.document_version_service import (
    create_document_version,
    delete_document_version,
    ensure_logical_document,
    get_logical_by_id,
    get_logical_by_slot,
    get_version,
    init_document_versions_db,
    list_versions,
    count_versions,
    is_logical_deleted,
    is_logical_purged,
    is_logical_soft_deleted,
    mark_approved,
    mark_remanded,
    migrate_logical_firm_id_backfill,
    redact_logical_document_filenames,
    restore_logical_document,
    set_logical_status,
    slot_status_map,
    version_file_path,
)
from services.docugrid_persist_service import load_workspace, save_workspace
from services.google_oauth import get_google_oauth_client_id, verify_google_id_token
from services.member_directory import (
    bootstrap_member_directory_example,
    login_stakeholder_pick_allowed,
    password_login_allowed,
)
from services.merge_order_service import merge_pdf_bytes_from_order_payload
from services.requirements import compute_period_status, period_type
from services.tenancy import (
    DEFAULT_FIRM_ID,
    AuthContext,
    authorize_client_access,
    authorize_client_permission,
    authorize_client_scope_header,
    build_auth_context,
    filter_client_master_clients,
    get_client_firm_id,
    get_client_firm_map,
    invalidate_client_firm_cache,
    resolve_docugrid_client_id,
    resolve_version_client_id,
    authorize_firm_resource,
    firm_label,
    resolve_version_firm_id,
    visible_client_ids,
)
from services.login_rate_limit import login_rate_limit_exceeded, mcp_token_rate_limit_exceeded
from services.storage_paths import resolve_storage_path
from services.upload_limits import enforce_upload_size

