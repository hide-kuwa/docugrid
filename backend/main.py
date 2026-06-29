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
    delete_annots_intersecting,
    draw_freehand_eraser,
    draw_freehand_marker,
    erase_region,
    parse_norm_path_json,
    path_bbox_rect,
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

app = FastAPI()


@app.middleware("http")
async def csrf_middleware(request: Request, call_next):
    if csrf_validation_failed(request):
        return JSONResponse(status_code=403, content={"detail": "CSRF validation failed"})
    response = await call_next(request)
    return response


@app.on_event("startup")
def _startup_init_db() -> None:
    init_db()
    init_pending_classify_db()
    init_payroll_ledger_db()
    init_legal_master_db()
    try:
        reload_metric_mappings_config()
        refresh_metric_index()
    except (FileNotFoundError, ValueError, RuntimeError):
        refresh_metric_index()
    init_capture_db()
    from services.client_metrics_service import init_client_metrics_db
    from services.client_comms_service import init_client_comms_db

    init_client_metrics_db()
    init_client_comms_db()
    from services.client_records_service import init_client_records_db
    from services.client_calendar_service import init_client_calendar_db

    init_client_records_db()
    init_client_calendar_db()
    from services.client_simulation_service import init_client_simulation_db

    init_client_simulation_db()
    init_ocr_jobs_db()
    ensure_demo_calendar_seed()
    ensure_invoice_cache_seed()

_cors_origins = get_cors_origins()
if _cors_origins is not None:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"http://(localhost|127\.0\.0\.1|(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})):\d+",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.get("/")
def root() -> dict:
    """ブラウザで http://127.0.0.1:8000/ を開いたときに 404 にならないようにする。"""
    return {
        "ok": True,
        "service": "DocuGrid API",
        "docs": "/docs",
        "health": "/health",
        "api": "/api",
    }


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}

STORAGE_DIR = Path("storage")
STORAGE_DIR.mkdir(parents=True, exist_ok=True)
AUDIT_LINKS_DB_PATH = STORAGE_DIR / "audit_links.db"
AUDIT_EVENTS_DB_PATH = STORAGE_DIR / "audit_events.db"
SYSTEM_CONFIG_PATH = STORAGE_DIR / "system_config.json"
CLIENT_MASTER_PATH = STORAGE_DIR / "client_master.json"
STAKEHOLDER_MASTER_PATH = STORAGE_DIR / "stakeholder_master.json"
ROLE_PERMISSIONS_PATH = STORAGE_DIR / "role_permissions.json"
SLOT_DOCS_DB_PATH = STORAGE_DIR / "slot_documents.db"
SLOT_FILES_DIR = STORAGE_DIR / "slots"
SLOT_FILES_DIR.mkdir(parents=True, exist_ok=True)
REVIEW_EVENTS_DB_PATH = STORAGE_DIR / "review_events.db"

DEFAULT_ROLE_PERMISSIONS: dict[str, set[str]] = {
    "viewer": {"client.view", "document.view", "dashboard.view"},
    "client_uploader": {
        "client.view",
        "document.view",
        "document.upload",
        "review_checklist.edit",
        "dashboard.view",
    },
    "operator": {
        "client.view",
        "client.edit",
        "document.view",
        "document.upload",
        "document.annotate",
        "document.comment",
        "audit.link",
        "review_checklist.edit",
        "dashboard.view",
        "alert.view",
    },
    "reviewer": {
        "client.view",
        "document.view",
        "document.annotate",
        "document.comment",
        "audit.link",
        "review_checklist.edit",
        "dashboard.view",
        "alert.view",
    },
    "approver": {"client.view", "document.view", "audit.link", "audit.approve", "dashboard.view", "alert.view"},
    "admin": {
        "client.view",
        "client.edit",
        "document.view",
        "document.upload",
        "document.annotate",
        "document.comment",
        "audit.link",
        "audit.approve",
        "dashboard.view",
        "alert.view",
        "alert.manage",
        "settings.manage",
        "document.purge",
    },
    "firm_admin": {
        "client.view",
        "client.edit",
        "document.view",
        "document.upload",
        "document.annotate",
        "document.comment",
        "audit.link",
        "audit.approve",
        "dashboard.view",
        "alert.view",
        "alert.manage",
        "settings.manage",
        "document.purge",
    },
    "platform_admin": {
        "client.view",
        "client.edit",
        "document.view",
        "document.upload",
        "document.annotate",
        "document.comment",
        "audit.link",
        "audit.approve",
        "dashboard.view",
        "alert.view",
        "alert.manage",
        "settings.manage",
        "settings.platform",
    },
}

DEFAULT_STAKEHOLDER_CLIENT_SCOPES: dict[str, set[str]] = {
    "actor-admin": {"c1", "c2", "c3", "c4", "c5"},
    "actor-s1": {"c1", "c2", "c3"},
    "actor-s2": {"c4", "c5"},
    "actor-s3": {"c1", "c2", "c3", "c4", "c5"},
    "actor-c1": {"c1"},
    "actor-b1": {"c1"},
    "actor-tp1": {"c2"},
    "actor-tax1": {"c1", "c2", "c3", "c4", "c5"},
}

_stakeholder_maps_cache: tuple[dict[str, str], dict[str, set[str]]] | None = None
_role_permissions_cache: dict[str, set[str]] | None = None

KNOWN_APP_PERMISSIONS: set[str] = {
    perm for perms in DEFAULT_ROLE_PERMISSIONS.values() for perm in perms
}


def _invalidate_role_permissions_cache() -> None:
    global _role_permissions_cache
    _role_permissions_cache = None


def _get_role_permissions() -> dict[str, set[str]]:
    global _role_permissions_cache
    if _role_permissions_cache is not None:
        return _role_permissions_cache
    merged = {role: set(perms) for role, perms in DEFAULT_ROLE_PERMISSIONS.items()}
    if ROLE_PERMISSIONS_PATH.exists():
        try:
            raw = json.loads(ROLE_PERMISSIONS_PATH.read_text(encoding="utf-8"))
            for role, perms in (raw.get("permissionsByRole") or {}).items():
                if role in merged and isinstance(perms, list):
                    merged[role] = {str(p) for p in perms if isinstance(p, str)}
        except Exception:
            pass
    if not is_production():
        merged.setdefault("admin", set()).add("settings.platform")
    _role_permissions_cache = merged
    return _role_permissions_cache


def _invalidate_stakeholder_maps_cache() -> None:
    global _stakeholder_maps_cache
    _stakeholder_maps_cache = None


def _legacy_stakeholder_scopes() -> dict[str, set[str]]:
    scopes = {k: set(v) for k, v in DEFAULT_STAKEHOLDER_CLIENT_SCOPES.items()}
    if STAKEHOLDER_MASTER_PATH.exists():
        try:
            raw = json.loads(STAKEHOLDER_MASTER_PATH.read_text(encoding="utf-8"))
            for k, v in (raw.get("clientScopesByStakeholderId") or {}).items():
                if isinstance(k, str) and isinstance(v, list):
                    scopes[k] = {str(x) for x in v}
        except Exception:
            pass
    return scopes


def _get_stakeholder_merged_maps() -> tuple[dict[str, str], dict[str, set[str]]]:
    global _stakeholder_maps_cache
    if _stakeholder_maps_cache is not None:
        return _stakeholder_maps_cache
    roles = dict(STAKEHOLDER_ROLE_BY_ID)
    if STAKEHOLDER_MASTER_PATH.exists():
        try:
            raw = json.loads(STAKEHOLDER_MASTER_PATH.read_text(encoding="utf-8"))
            for k, v in (raw.get("roleByStakeholderId") or {}).items():
                if isinstance(k, str) and isinstance(v, str) and k not in STAKEHOLDER_ROLE_BY_ID:
                    roles[k] = v
        except Exception:
            pass
    roles.update(STAKEHOLDER_ROLE_BY_ID)
    init_client_assignments_db()
    assignment_scopes = load_assignment_scope_map()
    if not assignment_scopes:
        backfill_assignments_from_legacy(_legacy_stakeholder_scopes())
        assignment_scopes = load_assignment_scope_map()
    scopes = assignment_scopes if assignment_scopes else _legacy_stakeholder_scopes()
    _stakeholder_maps_cache = (roles, scopes)
    return _stakeholder_maps_cache


def _get_stakeholder_role_map() -> dict[str, str]:
    return _get_stakeholder_merged_maps()[0]


def _get_stakeholder_client_scope_map() -> dict[str, set[str]]:
    return _get_stakeholder_merged_maps()[1]


def _require_permission(request: Request, required_permission: str) -> str:
    identity = resolve_identity(request)
    permissions = _get_role_permissions().get(identity.role, set())
    if required_permission not in permissions:
        raise HTTPException(status_code=403, detail=f"Permission denied: {required_permission}")
    return identity.role


def _require_any_permission(request: Request, *required_permissions: str) -> tuple[str, set[str]]:
    identity = resolve_identity(request)
    permissions = _get_role_permissions().get(identity.role, set())
    if not any(p in permissions for p in required_permissions):
        names = ", ".join(required_permissions)
        raise HTTPException(status_code=403, detail=f"Permission denied: need one of {names}")
    return identity.role, permissions


def _require_platform_settings(request: Request) -> str:
    """Global settings (role matrix, AI keys) — platform_admin only in production."""
    return _require_permission(request, "settings.platform")


def _require_platform(request: Request) -> str:
    """Alias for platform-only endpoints (billing partners, executive dashboard)."""
    return _require_platform_settings(request)


def _auth_context(request: Request) -> AuthContext:
    identity = resolve_identity(request)
    return build_auth_context(
        role=identity.role,
        email=identity.email,
        stakeholder_id=identity.stakeholder_id,
        firm_id=identity.firm_id,
        member_id=identity.member_id,
    )


def _require_client_scope(request: Request, role: str) -> str:
    ctx = _auth_context(request)
    client_id = (request.headers.get("X-Docugrid-Client") or "").strip()
    return authorize_client_scope_header(ctx, client_id, _get_stakeholder_client_scope_map())


def _require_client_access(request: Request, role: str, client_id: str) -> None:
    """Verify firm boundary + assignment for an explicit client_id."""
    ctx = _auth_context(request)
    authorize_client_access(ctx, client_id, _get_stakeholder_client_scope_map())


def _require_moneytree_client(
    request: Request,
    client_id: str,
    *,
    write: bool = False,
) -> AuthContext:
    """顧問先スコープの Moneytree 連携（接続は顧問先ユーザーが実施）。"""
    cid = (client_id or "").strip()
    if not cid:
        raise HTTPException(status_code=400, detail="client_id_required")
    if write:
        _require_permission(request, "document.upload")
    else:
        _require_any_permission(request, "client.view")
    ctx = _auth_context(request)
    authorize_client_access(ctx, cid, _get_stakeholder_client_scope_map())
    return ctx


def _format_http_detail(detail: object) -> str:
    if isinstance(detail, str):
        return detail
    try:
        return json.dumps(detail, ensure_ascii=False)
    except Exception:
        return str(detail)


def _attachment_content_disposition(filename: str) -> str:
    """HTTP ヘッダー用 Content-Disposition（日本語ファイル名対応 RFC 5987）。"""
    safe = (filename or "download").replace('"', "_").replace("\\", "_")
    if all(ord(c) < 128 for c in safe):
        ascii_fallback = safe
    else:
        suffix = Path(safe).suffix if "." in safe else ""
        ascii_fallback = f"document{suffix}" if suffix else "document"
    encoded = urllib.parse.quote(safe)
    return f'attachment; filename="{ascii_fallback}"; filename*=UTF-8\'\'{encoded}'


def _audit_detail(request: Request, detail: str = "") -> str:
    """Annotate audit rows when the caller is DocuGrid MCP (AI channel)."""
    if (request.headers.get("X-Docugrid-MCP") or "").strip():
        return f"channel=mcp; {detail}" if detail else "channel=mcp"
    return detail


def _can_manage_deleted_documents(request: Request) -> bool:
    identity = resolve_identity(request)
    return "document.purge" in _get_role_permissions().get(identity.role, set())


def _slot_row_is_soft_deleted(row: sqlite3.Row) -> bool:
    deleted_at = row["deleted_at"] if "deleted_at" in row.keys() else None
    if deleted_at:
        return True
    return str(row["slot_id"]).startswith("deleted_")


def _deny_soft_deleted_row_unless_purge(request: Request, row: sqlite3.Row) -> None:
    if _slot_row_is_soft_deleted(row) and not _can_manage_deleted_documents(request):
        raise HTTPException(status_code=404, detail="Not found")


_DIRECTOR_ONLY_REVIEW_EVENT_TYPES = frozenset({"document_soft_delete", "document_restore"})


def _is_client_portal_role(role: str) -> bool:
    return role == "client_uploader"


def _slot_access_sql_filters(request: Request, *, include_deleted: bool = False) -> str:
    parts: list[str] = []
    if not include_deleted:
        parts.append("(deleted_at IS NULL OR deleted_at = '')")
    identity = resolve_identity(request)
    if _is_client_portal_role(identity.role):
        parts.append("(client_shared_at IS NOT NULL AND client_shared_at != '')")
    if not parts:
        return ""
    return " AND " + " AND ".join(parts)


def _deny_client_slot_unless_shared(request: Request, row: sqlite3.Row) -> None:
    identity = resolve_identity(request)
    if not _is_client_portal_role(identity.role):
        return
    shared_at = row["client_shared_at"] if "client_shared_at" in row.keys() else None
    if not shared_at:
        raise HTTPException(status_code=404, detail="Not found")


def _filter_review_event_rows(request: Request, rows: list[sqlite3.Row]) -> list[sqlite3.Row]:
    if _can_manage_deleted_documents(request):
        return rows
    return [r for r in rows if r["event_type"] not in _DIRECTOR_ONLY_REVIEW_EVENT_TYPES]


def _deny_if_logical_purged(logical_id: Optional[str]) -> None:
    if logical_id and is_logical_purged(logical_id):
        raise HTTPException(status_code=410, detail="Document deleted")


def _deny_if_logical_deleted(logical_id: Optional[str]) -> None:
    if logical_id and is_logical_deleted(logical_id):
        raise HTTPException(status_code=410, detail="Document deleted")


def _log_audit_event(request: Request, action: str, result: str, detail: str = "") -> None:
    identity = resolve_identity(request)
    _init_audit_events_db()
    detail = _audit_detail(request, detail)
    with sqlite3.connect(AUDIT_EVENTS_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO audit_events (
                created_at, stakeholder_id, user_email, role, client_id, path, action, result, detail, http_status, firm_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
            """,
            (
                datetime.utcnow().isoformat(),
                identity.stakeholder_id or "",
                identity.email or "",
                identity.role,
                (request.headers.get("X-Docugrid-Client") or "").strip(),
                str(request.url.path),
                action,
                result,
                detail,
                identity.firm_id or "",
            ),
        )


def _log_audit_denial(request: Request, status_code: int, detail: str) -> None:
    if getattr(request.state, "_audit_denial_logged", False):
        return
    request.state._audit_denial_logged = True
    role, email, stid = peek_identity_for_audit(request)
    firm_id = ""
    try:
        firm_id = _auth_context(request).firm_id
    except HTTPException:
        pass
    detail = _audit_detail(request, detail)
    _init_audit_events_db()
    with sqlite3.connect(AUDIT_EVENTS_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO audit_events (
                created_at, stakeholder_id, user_email, role, client_id, path, action, result, detail, http_status, firm_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                datetime.utcnow().isoformat(),
                stid or "",
                email or "",
                role or "",
                (request.headers.get("X-Docugrid-Client") or "").strip() or None,
                str(request.url.path),
                "access.denied",
                "denied",
                detail,
                status_code,
                firm_id,
            ),
        )


class FileInfo(BaseModel):
    id: str
    name: str
    updated_at: str
    url: str


class AuditPoint(BaseModel):
    side: str
    page: int
    x: float
    y: float
    fileName: str | None = None
    fileHash: str | None = None


class AuditLink(BaseModel):
    id: str
    createdAt: str
    createdBy: str | None = None
    comment: str | None = None
    left: AuditPoint
    right: AuditPoint


class AutoLinkMatchedCoordinate(BaseModel):
    page: int
    x: float
    y: float
    width: float
    height: float
    matched_text: str
    x_norm: float = 0.0
    y_norm: float = 0.0
    width_norm: float = 0.0
    height_norm: float = 0.0


class AutoLinkRequest(BaseModel):
    pdf_file_path: str | None = None
    version_id: str | None = None
    target_value: str | float
    user_id: str
    field_id: str
    match_strategy: str = "best"
    context_hint: str | None = None
    dry_run: bool = False
    create_version: bool = False
    queue_on_ocr: bool = False
    trigger_ocr: bool = False


class AutoLinkResponse(BaseModel):
    status: str
    output_pdf_path: str = ""
    matched_coordinates: List[AutoLinkMatchedCoordinate] = []
    message: str = ""
    ocr_recommended: bool = False
    stamp_id: str = ""
    error_code: str | None = None
    dry_run: bool = False
    source_pdf_path: str | None = None
    total_matches_found: int = 0
    new_version_id: str | None = None
    queue_id: str | None = None
    ocr_job_id: str | None = None
    match_source: str | None = None


class AutoVouchStampItem(BaseModel):
    id: str
    source_pdf_path: str
    output_pdf_path: str
    field_id: str
    user_id: str
    target_value: str
    match_count: int
    matched_coordinates: list = []
    created_at: str
    version_id: str | None = None
    dry_run: bool = False


class SystemConfigPayload(BaseModel):
    google_drive_connected: bool = False
    notification_email_enabled: bool = True
    ocr_auto_extract_enabled: bool = True
    alert_consumption_tax_months_before_due: int = 2
    alert_corporate_tax_months_before_due: int = 2
    ai_openai_enabled: bool = False
    ai_openai_model: str = "gpt-4o-mini"
    ai_openai_key_configured: bool = False
    ai_gemini_enabled: bool = False
    ai_gemini_model: str = "gemini-2.5-flash"
    ai_gemini_key_configured: bool = False
    drive_root_folder_id: Optional[str] = None
    drive_credentials_configured: bool = False
    drive_mode: str = "unconfigured"
    updated_at: str | None = None


class SystemConfigUpdateBody(BaseModel):
    google_drive_connected: bool = False
    notification_email_enabled: bool = True
    ocr_auto_extract_enabled: bool = True
    alert_consumption_tax_months_before_due: int = 2
    alert_corporate_tax_months_before_due: int = 2
    ai_openai_enabled: bool = False
    ai_openai_model: str = "gpt-4o-mini"
    ai_gemini_enabled: bool = False
    ai_gemini_model: str = "gemini-2.5-flash"
    ai_openai_api_key: Optional[str] = None
    ai_gemini_api_key: Optional[str] = None
    clear_ai_openai_key: bool = False
    clear_ai_gemini_key: bool = False
    drive_root_folder_id: Optional[str] = None


class ClientMasterClient(BaseModel):
    id: str
    name: str
    fiscalMonth: int
    category: str
    tags: list[str] = []
    firmId: str | None = None
    profile: dict[str, str] = Field(default_factory=dict)
    profileMeta: dict[str, dict[str, str]] = Field(default_factory=dict)
    profileHistory: dict[str, list[dict[str, str]]] = Field(default_factory=dict)


class ClientMasterGroup(BaseModel):
    id: str
    name: str
    relationType: str
    clientIds: list[str]
    note: str | None = None


class ClientMasterPayload(BaseModel):
    clients: list[ClientMasterClient]
    groups: list[ClientMasterGroup]
    updated_at: str | None = None


class StakeholderMasterPayload(BaseModel):
    roleByStakeholderId: dict[str, str]
    clientScopesByStakeholderId: dict[str, list[str]]
    updated_at: str | None = None


class AuditEventItem(BaseModel):
    id: int
    created_at: str
    stakeholder_id: str | None = None
    user_email: str | None = None
    role: str | None = None
    client_id: str | None = None
    path: str
    action: str
    result: str
    detail: str | None = None
    http_status: int | None = None


class LoginRequest(BaseModel):
    email: str
    password: str
    stakeholder_id: str = ""


class GoogleLoginRequest(BaseModel):
    credential: str


class AuthConfigResponse(BaseModel):
    google_client_id: str = ""
    password_login_enabled: bool = False
    session_cookie: bool = True
    legacy_files: bool = False
    csrf: bool = True


class FirmMemberItem(BaseModel):
    id: str
    email: str
    stakeholder_id: str
    firm_role: str
    persona_id: str = ""
    status: str
    display_name: str | None = None


class FirmMemberPatchBody(BaseModel):
    status: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class McpTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    expires_at: str
    audience: str = MCP_JWT_AUDIENCE


class RolePermissionsPayload(BaseModel):
    permissionsByRole: dict[str, list[str]]
    updated_at: str | None = None


class FirmTaskAssignee(BaseModel):
    member_id: str
    display_name: str
    assignment_role: str = "main"


class FirmTaskItem(BaseModel):
    client_id: str
    period_key: str
    slot_label: str
    kind: str
    assignees: List[FirmTaskAssignee] = []
    primary_assignee_id: str | None = None


class FirmClientTaskSummary(BaseModel):
    client_id: str
    missing_total: int
    pending_approval_total: int
    incomplete_period_count: int
    assignees: List[FirmTaskAssignee] = []


class FirmStaffTaskSummary(BaseModel):
    member_id: str
    display_name: str
    missing_total: int
    pending_approval_total: int
    open_client_count: int
    assigned_client_count: int
    assigned_client_ids: List[str] = []


class FirmTasksResponse(BaseModel):
    firm_id: str
    missing_total: int
    pending_approval_total: int
    client_count: int
    clients: List[FirmClientTaskSummary]
    items: List[FirmTaskItem]
    staff: List[FirmStaffTaskSummary] = []
    unassigned_missing_total: int = 0
    unassigned_pending_total: int = 0


class BillingCheckoutBody(BaseModel):
    plan_id: str


class BillingPortalBody(BaseModel):
    return_path: str = "/settings?tab=billing"


class BillingAiTopupBody(BaseModel):
    packs: int = 1


class BillingPartnerCreateBody(BaseModel):
    name: str
    email: str
    commission_percent: float | None = None


class BillingPartnerAttachBody(BaseModel):
    partner_id: str
    contract_years: int = 1


class PayrollEmployeeItem(BaseModel):
    id: str
    client_id: str
    employee_code: str | None = None
    name: str
    hire_date: str | None = None
    tax_column: str = "甲"
    dependent_count: int = 0
    spouse_deduction: bool = False
    social_insurance_grade: int | None = None
    notes: str | None = None
    active: bool = True
    created_at: str | None = None
    updated_at: str | None = None


class PayrollEmployeesPayload(BaseModel):
    employees: List[PayrollEmployeeItem]


class WithholdingLedgerRowItem(BaseModel):
    id: str
    client_id: str
    employee_id: str
    year_month: str
    gross_pay_yen: int = 0
    bonus_yen: int = 0
    health_insurance_yen: int = 0
    pension_yen: int = 0
    employment_insurance_yen: int = 0
    income_tax_yen: int = 0
    resident_tax_yen: int = 0
    net_pay_yen: int = 0
    notes: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class WithholdingLedgerPayload(BaseModel):
    rows: List[WithholdingLedgerRowItem]
    summary: dict | None = None


class YearEndRunBody(BaseModel):
    tax_year: int
    settlement_month: str | None = None


class SanteiRunBody(BaseModel):
    tax_year: int


class CaptureItemPatchBody(BaseModel):
    status: str | None = None
    title: str | None = None
    audit_message: str | None = None
    pinned: bool | None = None
    category: str | None = None


class CaptureAnalyzeBody(BaseModel):
    total_yen: int | None = None
    proof_yen: int | None = None
    declared_yen: int | None = None
    dependent_count: int | None = None
    life_insurance_yen: int | None = None
    spouse_deduction: bool | None = None
    attendees: int | None = None
    registration_number: str | None = None


class CaptureReauditBody(BaseModel):
    total_yen: int | None = None
    proof_yen: int | None = None
    declared_yen: int | None = None
    dependent_count: int | None = None
    life_insurance_yen: int | None = None
    spouse_deduction: bool | None = None
    attendees: int | None = None
    registration_number: str | None = None


class CaptureRouteBody(BaseModel):
    period_key: str | None = None
    slot_id: str | None = None
    slot_label: str | None = None


class CaptureApplyPayrollBody(BaseModel):
    employee_id: str | None = None


class InvoiceVerifyBody(BaseModel):
    registration_number: str


class ClientMetricUpsertBody(BaseModel):
    metric_key: str
    period_key: str
    value_yen: int | None = None
    value_num: float | None = None


class ClientCommThreadBody(BaseModel):
    id: str | None = None
    channel: str = "email"
    subject: str
    preview: str = ""
    participants: str = ""
    occurred_at: str | None = None


class ClientSimulationBody(BaseModel):
    payload: dict


class ClientRecordItemBody(BaseModel):
    id: str | None = None
    domain: str
    title: str = ""
    body: str = ""
    meta: dict | None = None
    sort_order: int = 0


class ClientCalendarEventBody(BaseModel):
    id: str | None = None
    date: str
    time: str | None = None
    title: str
    company: str | None = None
    contact: str | None = None
    attendees: int = 1
    type: str = "meeting"


class MeResponse(BaseModel):
    email: str
    role: str
    stakeholder_id: str
    firm_id: str = ""
    firm_label: str = ""
    persona_id: str = ""
    persona_label: str = ""
    permissions: list[str] = []
    visible_client_ids: list[str] = []


class ScreenDesignSaveBody(BaseModel):
    """Non-engineer editable layer. Only `personas` keys need to be set."""
    version: int = 1
    personas: dict[str, dict] = {}


def _get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(AUDIT_LINKS_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _init_audit_links_db() -> None:
    with _get_db_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS audit_links (
                version_id TEXT NOT NULL,
                link_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                left_side TEXT NOT NULL,
                left_page INTEGER NOT NULL,
                left_x REAL NOT NULL,
                left_y REAL NOT NULL,
                left_file_name TEXT,
                left_file_hash TEXT,
                right_side TEXT NOT NULL,
                right_page INTEGER NOT NULL,
                right_x REAL NOT NULL,
                right_y REAL NOT NULL,
                right_file_name TEXT,
                right_file_hash TEXT,
                created_by TEXT,
                PRIMARY KEY (version_id, link_id)
            )
            """
        )
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(audit_links)").fetchall()}
        if "left_file_hash" not in columns:
            conn.execute("ALTER TABLE audit_links ADD COLUMN left_file_hash TEXT")
        if "right_file_hash" not in columns:
            conn.execute("ALTER TABLE audit_links ADD COLUMN right_file_hash TEXT")
        if "created_by" not in columns:
            conn.execute("ALTER TABLE audit_links ADD COLUMN created_by TEXT")
        if "comment" not in columns:
            conn.execute("ALTER TABLE audit_links ADD COLUMN comment TEXT")


def _init_audit_events_db() -> None:
    with sqlite3.connect(AUDIT_EVENTS_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS audit_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                stakeholder_id TEXT,
                user_email TEXT,
                role TEXT,
                client_id TEXT,
                path TEXT NOT NULL,
                action TEXT NOT NULL,
                result TEXT NOT NULL,
                detail TEXT,
                http_status INTEGER
            )
            """
        )
        columns = {row[1] for row in conn.execute("PRAGMA table_info(audit_events)").fetchall()}
        if "http_status" not in columns:
            conn.execute("ALTER TABLE audit_events ADD COLUMN http_status INTEGER")
        if "firm_id" not in columns:
            conn.execute("ALTER TABLE audit_events ADD COLUMN firm_id TEXT")


def _init_review_events_db() -> None:
    with sqlite3.connect(REVIEW_EVENTS_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS review_events (
                id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                period_key TEXT NOT NULL,
                slot_id TEXT NOT NULL,
                content_sha256 TEXT,
                version_label TEXT,
                event_type TEXT NOT NULL,
                status TEXT,
                action_title TEXT,
                reason TEXT,
                actor_stakeholder_id TEXT,
                actor_email TEXT,
                actor_role TEXT,
                is_major INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
            """
        )
        for col in ("logical_document_id", "document_version_id", "detail", "firm_id"):
            try:
                conn.execute(f"ALTER TABLE review_events ADD COLUMN {col} TEXT")
            except sqlite3.OperationalError:
                pass
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_review_events_slot
                ON review_events (client_id, period_key, slot_id, created_at DESC)
            """
        )


def _init_slot_documents_db() -> None:
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS slot_documents (
                id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                period_key TEXT NOT NULL,
                slot_id TEXT NOT NULL,
                slot_label TEXT,
                original_name TEXT NOT NULL,
                storage_key TEXT NOT NULL,
                page_count INTEGER,
                content_sha256 TEXT NOT NULL,
                byte_size INTEGER NOT NULL,
                uploaded_by TEXT,
                uploaded_at TEXT NOT NULL,
                logical_document_id TEXT,
                current_version_id TEXT,
                UNIQUE (client_id, period_key, slot_id)
            )
            """
        )
        for col in (
            "logical_document_id",
            "current_version_id",
            "docugrid_document_id",
            "firm_id",
            "google_drive_file_id",
            "deleted_at",
            "deleted_from_slot_id",
            "deleted_from_slot_label",
            "client_shared_at",
            "client_shared_by",
        ):
            try:
                conn.execute(f"ALTER TABLE slot_documents ADD COLUMN {col} TEXT")
            except sqlite3.OperationalError:
                pass


def _migrate_audit_firm_id_backfill() -> None:
    _init_audit_events_db()
    with sqlite3.connect(AUDIT_EVENTS_DB_PATH) as conn:
        rows = conn.execute(
            """
            SELECT id, client_id FROM audit_events
            WHERE firm_id IS NULL OR firm_id = ''
            """
        ).fetchall()
        for event_id, client_id in rows:
            fid = get_client_firm_id(str(client_id)) if client_id else DEFAULT_FIRM_ID
            conn.execute(
                "UPDATE audit_events SET firm_id=? WHERE id=?",
                (fid, event_id),
            )


def _migrate_firm_id_backfill() -> None:
    _migrate_audit_firm_id_backfill()
    _init_slot_documents_db()
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        rows = conn.execute(
            "SELECT id, client_id FROM slot_documents WHERE firm_id IS NULL OR firm_id = ''"
        ).fetchall()
        for doc_id, client_id in rows:
            conn.execute(
                "UPDATE slot_documents SET firm_id=? WHERE id=?",
                (get_client_firm_id(str(client_id)), doc_id),
            )
    _init_review_events_db()
    with sqlite3.connect(REVIEW_EVENTS_DB_PATH) as conn:
        rows = conn.execute(
            "SELECT id, client_id FROM review_events WHERE firm_id IS NULL OR firm_id = ''"
        ).fetchall()
        for event_id, client_id in rows:
            conn.execute(
                "UPDATE review_events SET firm_id=? WHERE id=?",
                (get_client_firm_id(str(client_id)), event_id),
            )


def _link_docugrid_to_slot(client_id: str, period_key: str, slot_id: str, document_id: str) -> None:
    _init_slot_documents_db()
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.execute(
            """
            UPDATE slot_documents
            SET docugrid_document_id=?
            WHERE client_id=? AND period_key=? AND slot_id=?
            """,
            (document_id, client_id, period_key, slot_id),
        )


def _load_system_config(firm_id: str) -> SystemConfigPayload:
    data = load_system_config_raw(firm_id)
    if data:
        try:
            base = SystemConfigPayload(
                **{k: v for k, v in data.items() if k in SystemConfigPayload.model_fields}
            )
        except Exception:
            base = SystemConfigPayload(google_drive_connected=False, updated_at=None)
    else:
        base = SystemConfigPayload(google_drive_connected=False, updated_at=None)
    flags = configured_flags(firm_id)
    return base.model_copy(
        update={
            **flags,
            "drive_credentials_configured": drive_credentials_configured(firm_id),
            "drive_mode": resolve_drive_mode(firm_id),
        }
    )


def _save_system_config(firm_id: str, body: SystemConfigUpdateBody) -> SystemConfigPayload:
    update_secrets(
        firm_id,
        openai_api_key=body.ai_openai_api_key,
        gemini_api_key=body.ai_gemini_api_key,
        clear_openai=body.clear_ai_openai_key,
        clear_gemini=body.clear_ai_gemini_key,
    )
    next_payload = SystemConfigPayload(
        google_drive_connected=body.google_drive_connected,
        notification_email_enabled=body.notification_email_enabled,
        ocr_auto_extract_enabled=body.ocr_auto_extract_enabled,
        alert_consumption_tax_months_before_due=body.alert_consumption_tax_months_before_due,
        alert_corporate_tax_months_before_due=body.alert_corporate_tax_months_before_due,
        ai_openai_enabled=body.ai_openai_enabled,
        ai_openai_model=body.ai_openai_model or "gpt-4o-mini",
        ai_gemini_enabled=body.ai_gemini_enabled,
        ai_gemini_model=body.ai_gemini_model or "gemini-2.5-flash",
        drive_root_folder_id=(body.drive_root_folder_id or "").strip() or None,
        updated_at=datetime.utcnow().isoformat(),
        **configured_flags(firm_id),
        drive_credentials_configured=drive_credentials_configured(firm_id),
        drive_mode=resolve_drive_mode(firm_id),
    )
    store = next_payload.model_dump(
        exclude={
            "ai_openai_key_configured",
            "ai_gemini_key_configured",
            "drive_credentials_configured",
            "drive_mode",
        }
    )
    save_system_config_raw(firm_id, store)
    return next_payload


def _system_config_update_touches_platform(
    body: SystemConfigUpdateBody, existing: SystemConfigPayload
) -> bool:
    if body.ai_openai_api_key or body.ai_gemini_api_key:
        return True
    if body.clear_ai_openai_key or body.clear_ai_gemini_key:
        return True
    if body.ocr_auto_extract_enabled != existing.ocr_auto_extract_enabled:
        return True
    if body.ai_openai_enabled != existing.ai_openai_enabled:
        return True
    if body.ai_gemini_enabled != existing.ai_gemini_enabled:
        return True
    if (body.ai_openai_model or "gpt-4o-mini") != existing.ai_openai_model:
        return True
    if (body.ai_gemini_model or "gemini-2.5-flash") != existing.ai_gemini_model:
        return True
    if (body.drive_root_folder_id or "").strip() != (existing.drive_root_folder_id or "").strip():
        return True
    if body.google_drive_connected != existing.google_drive_connected:
        return True
    return False


def _mask_system_config_for_role(payload: SystemConfigPayload, role: str) -> SystemConfigPayload:
    perms = _get_role_permissions().get(role, set())
    if "settings.platform" in perms:
        return payload
    return payload.model_copy(
        update={
            "ocr_auto_extract_enabled": True,
            "ai_openai_enabled": False,
            "ai_gemini_enabled": False,
            "ai_openai_key_configured": False,
            "ai_gemini_key_configured": False,
            "drive_credentials_configured": False,
            "drive_mode": "unconfigured",
            "drive_root_folder_id": None,
        }
    )


def _default_client_master() -> ClientMasterPayload:
    return ClientMasterPayload(
        clients=[
            ClientMasterClient(id="c1", name="株式会社 鈴木商店", fiscalMonth=3, category="corporate", tags=["製造"]),
            ClientMasterClient(id="c2", name="合同会社 テック", fiscalMonth=12, category="corporate", tags=["IT"]),
            ClientMasterClient(id="c3", name="佐藤商事", fiscalMonth=9, category="corporate", tags=["卸売"]),
            ClientMasterClient(id="c4", name="鈴木 太郎 (個人)", fiscalMonth=12, category="individual", tags=["個人事業"]),
            ClientMasterClient(id="c5", name="山田不動産", fiscalMonth=12, category="corporate", tags=["不動産"]),
        ],
        groups=[
            ClientMasterGroup(id="g1", name="鈴木グループ", relationType="group_company", clientIds=["c1", "c2"], note="グループ会社として連結管理"),
            ClientMasterGroup(id="g2", name="鈴木家資産管理", relationType="relative_group", clientIds=["c1", "c4"], note="親族保有資産・個人事業を含む"),
            ClientMasterGroup(id="g3", name="山田不動産 株主関係", relationType="shareholder", clientIds=["c5", "c3"], note="主要株主の関連先を監視"),
        ],
        updated_at=None,
    )


def _load_client_master() -> ClientMasterPayload:
    if not CLIENT_MASTER_PATH.exists():
        return _default_client_master()
    try:
        data = json.loads(CLIENT_MASTER_PATH.read_text(encoding="utf-8"))
        return ClientMasterPayload(**data)
    except Exception:
        return _default_client_master()


def _merge_client_master_for_firm(ctx: AuthContext, payload: ClientMasterPayload) -> ClientMasterPayload:
    existing = _load_client_master()
    firm = ctx.firm_id
    other_clients = [
        c
        for c in existing.clients
        if get_client_firm_id(c.id) != firm
    ]
    other_client_ids = {c.id for c in other_clients}
    firm_clients_by_id = {
        c.id: c
        for c in existing.clients
        if get_client_firm_id(c.id) == firm
    }
    for c in payload.clients:
        if c.id in other_client_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot modify client {c.id!r} belonging to another firm",
            )
        assigned_firm = (c.firmId or "").strip() or firm
        if assigned_firm != firm:
            raise HTTPException(
                status_code=400,
                detail=f"Client {c.id!r} firmId must be {firm!r}",
            )
        c.firmId = firm
        firm_clients_by_id[c.id] = c
    merged_clients = other_clients + list(firm_clients_by_id.values())
    if len({c.id for c in merged_clients}) != len(merged_clients):
        raise HTTPException(status_code=400, detail="Duplicate client id across firms")
    payload_client_ids = set(firm_clients_by_id.keys())
    kept_groups = [
        g
        for g in existing.groups
        if g.clientIds and all(cid in other_client_ids for cid in g.clientIds)
    ]
    merged_groups = kept_groups + [
        g
        for g in payload.groups
        if all(cid in payload_client_ids for cid in g.clientIds)
    ]
    return ClientMasterPayload(
        clients=merged_clients,
        groups=merged_groups,
        updated_at=datetime.utcnow().isoformat(),
    )


def _save_client_master(payload: ClientMasterPayload) -> ClientMasterPayload:
    CLIENT_MASTER_PATH.write_text(payload.model_dump_json(indent=2), encoding="utf-8")
    invalidate_client_firm_cache()
    return payload


def _validate_client_master(payload: ClientMasterPayload) -> None:
    ids = [c.id for c in payload.clients]
    if len(ids) != len(set(ids)):
        raise HTTPException(status_code=400, detail="Duplicate client id")
    id_set = set(ids)
    gids = [g.id for g in payload.groups]
    if len(gids) != len(set(gids)):
        raise HTTPException(status_code=400, detail="Duplicate group id")
    for c in payload.clients:
        if not (c.id or "").strip():
            raise HTTPException(status_code=400, detail="Client id must not be empty")
        if not (c.name or "").strip():
            raise HTTPException(status_code=400, detail="Client name must not be empty")
        if not 1 <= c.fiscalMonth <= 12:
            raise HTTPException(
                status_code=400,
                detail=f"Client {c.id!r} fiscalMonth must be between 1 and 12",
            )
        c.profile = sanitize_client_profile(c.profile)
        c.profileMeta = sanitize_client_profile_meta(c.profileMeta)
        c.profileHistory = sanitize_client_profile_history(c.profileHistory)
    for g in payload.groups:
        if not (g.id or "").strip():
            raise HTTPException(status_code=400, detail="Group id must not be empty")
        for cid in g.clientIds:
            if cid not in id_set:
                raise HTTPException(
                    status_code=400,
                    detail=f"Group {g.id!r} references unknown client {cid!r}",
                )


def _role_permissions_payload_from_store() -> RolePermissionsPayload:
    perms = _get_role_permissions()
    updated_at: str | None = None
    if ROLE_PERMISSIONS_PATH.exists():
        try:
            raw = json.loads(ROLE_PERMISSIONS_PATH.read_text(encoding="utf-8"))
            updated_at = raw.get("updated_at")
        except Exception:
            pass
    return RolePermissionsPayload(
        permissionsByRole={role: sorted(perms.get(role, set())) for role in DEFAULT_ROLE_PERMISSIONS},
        updated_at=updated_at,
    )


def _validate_role_permissions(payload: RolePermissionsPayload) -> None:
    known_roles = set(DEFAULT_ROLE_PERMISSIONS.keys())
    for role, perms in payload.permissionsByRole.items():
        if role not in known_roles:
            raise HTTPException(status_code=400, detail=f"Unknown role: {role}")
        if not isinstance(perms, list):
            raise HTTPException(status_code=400, detail=f"Invalid permissions for role {role}")
        invalid = [p for p in perms if p not in KNOWN_APP_PERMISSIONS]
        if invalid:
            raise HTTPException(status_code=400, detail=f"Unknown permission(s) for {role}: {invalid}")
    admin_perms = set(payload.permissionsByRole.get("admin", []))
    if "settings.manage" not in admin_perms:
        raise HTTPException(
            status_code=400,
            detail="admin role must retain settings.manage permission",
        )


def _save_role_permissions(payload: RolePermissionsPayload) -> RolePermissionsPayload:
    _validate_role_permissions(payload)
    normalized = {
        role: sorted(set(payload.permissionsByRole.get(role, [])))
        for role in DEFAULT_ROLE_PERMISSIONS
    }
    saved = RolePermissionsPayload(
        permissionsByRole=normalized,
        updated_at=datetime.utcnow().isoformat(),
    )
    ROLE_PERMISSIONS_PATH.write_text(
        json.dumps(saved.model_dump(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    _invalidate_role_permissions_cache()
    return saved


def _validate_stakeholder_master(payload: StakeholderMasterPayload) -> None:
    known_roles = set(_get_role_permissions().keys())
    for sid, role in payload.roleByStakeholderId.items():
        if role not in known_roles:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid role {role!r} for stakeholder {sid!r}",
            )
    cm = _load_client_master()
    valid_ids = set(get_client_firm_map().keys()) | {c.id for c in cm.clients}
    validate_assignments_for_clients(payload.clientScopesByStakeholderId, valid_ids)


def _save_stakeholder_master(payload: StakeholderMasterPayload) -> StakeholderMasterPayload:
    _validate_stakeholder_master(payload)
    roles = dict(payload.roleByStakeholderId)
    roles.update(STAKEHOLDER_ROLE_BY_ID)
    next_payload = StakeholderMasterPayload(
        roleByStakeholderId=roles,
        clientScopesByStakeholderId=payload.clientScopesByStakeholderId,
        updated_at=datetime.utcnow().isoformat(),
    )
    STAKEHOLDER_MASTER_PATH.write_text(next_payload.model_dump_json(indent=2), encoding="utf-8")
    sync_assignments_from_scope_map(payload.clientScopesByStakeholderId)
    _invalidate_stakeholder_maps_cache()
    return next_payload


@app.get("/api/system-config", response_model=SystemConfigPayload)
async def get_system_config(request: Request):
    role = _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    payload = _load_system_config(ctx.firm_id)
    payload = _mask_system_config_for_role(payload, role)
    _log_audit_event(request, "system_config.get", "success")
    return payload


@app.put("/api/system-config", response_model=SystemConfigPayload)
async def update_system_config(request: Request, payload: SystemConfigUpdateBody):
    role = _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    existing = _load_system_config(ctx.firm_id)
    if _system_config_update_touches_platform(payload, existing):
        _require_platform_settings(request)
    if payload.alert_consumption_tax_months_before_due < 0 or payload.alert_corporate_tax_months_before_due < 0:
        raise HTTPException(status_code=400, detail="Alert months must be non-negative")
    saved = _save_system_config(ctx.firm_id, payload)
    saved = _mask_system_config_for_role(saved, role)
    _log_audit_event(
        request,
        "system_config.put",
        "success",
        f"drive={saved.google_drive_connected} ocr={saved.ocr_auto_extract_enabled} ai_openai={saved.ai_openai_enabled}",
    )
    return saved


class IntegrationPortItem(BaseModel):
    port_id: str
    label_ja: str
    ssot_owner: str = ""
    ssot_owner_label: str = ""
    manual_policy: Optional[str] = None
    manual_policy_label: str = ""
    direction: Optional[str] = None
    source: str = ""
    target: str = ""
    api_method: str = ""
    api_path: str = ""
    idempotency_key_template: str = ""
    status: str = "planned"
    notes: str = ""


class IntegrationPortWriteBody(BaseModel):
    port_id: str = Field(..., min_length=1)
    label_ja: str = Field(..., min_length=1)
    ssot_owner: str = ""
    ssot_owner_label: str = ""
    manual_policy: Optional[str] = None
    manual_policy_label: str = ""
    direction: Optional[str] = None
    source: str = ""
    target: str = ""
    api_method: str = ""
    api_path: str = ""
    idempotency_key_template: str = ""
    status: str = "planned"
    notes: str = ""


class IntegrationPortsListPayload(BaseModel):
    version: int
    port_count: int
    config_path: str
    ports: List[IntegrationPortItem]


class IntegrationPortsReloadPayload(BaseModel):
    version: int
    port_count: int
    message: str


class IntegrationPortsExportPayload(BaseModel):
    version: int
    port_count: int
    yaml_text: str


class IntegrationPortsValidateBody(BaseModel):
    yaml_text: str = Field(..., min_length=1)


class IntegrationPortsValidatePayload(BaseModel):
    valid: bool
    errors: List[str] = Field(default_factory=list)
    version: Optional[int] = None
    port_count: Optional[int] = None


class IntegrationPortsImportBody(BaseModel):
    yaml_text: str = Field(..., min_length=1)
    mode: str = Field(default="replace", pattern="^(replace|merge)$")


class IntegrationPortsImportPayload(BaseModel):
    version: int
    port_count: int
    message: str


@app.get("/api/dev/integration-ports", response_model=IntegrationPortsListPayload)
async def list_dev_integration_ports(request: Request):
    """連携ポートカタログ — settings.platform 必須。"""
    _require_platform_settings(request)
    summary = integration_ports_config_summary()
    ports = list_integration_ports()
    _log_audit_event(request, "dev.integration_ports.list", "success", f"count={len(ports)}")
    return IntegrationPortsListPayload(
        version=int(summary["version"]),
        port_count=int(summary["port_count"]),
        config_path=str(summary["config_path"]),
        ports=[IntegrationPortItem(**p) for p in ports],
    )


@app.get("/api/dev/integration-ports/export", response_model=IntegrationPortsExportPayload)
async def export_dev_integration_ports(request: Request):
    _require_platform_settings(request)
    try:
        yaml_text = export_integration_ports_yaml()
        cfg = reload_integration_ports_config()
    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    _log_audit_event(request, "dev.integration_ports.export", "success")
    return IntegrationPortsExportPayload(
        version=cfg["version"],
        port_count=len(cfg["ports"]),
        yaml_text=yaml_text,
    )


@app.post("/api/dev/integration-ports/validate", response_model=IntegrationPortsValidatePayload)
async def validate_dev_integration_ports(request: Request, body: IntegrationPortsValidateBody):
    _require_platform_settings(request)
    errors, parsed = validate_integration_ports_yaml(body.yaml_text)
    _log_audit_event(
        request,
        "dev.integration_ports.validate",
        "success" if not errors else "error",
        f"errors={len(errors)}",
    )
    if errors or parsed is None:
        return IntegrationPortsValidatePayload(valid=False, errors=errors)
    return IntegrationPortsValidatePayload(
        valid=True,
        errors=[],
        version=parsed["version"],
        port_count=len(parsed["ports"]),
    )


@app.post("/api/dev/integration-ports/import", response_model=IntegrationPortsImportPayload)
async def import_dev_integration_ports(request: Request, body: IntegrationPortsImportBody):
    _require_platform_settings(request)
    try:
        cfg = import_integration_ports_yaml(body.yaml_text, mode=body.mode)  # type: ignore[arg-type]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (FileNotFoundError, RuntimeError) as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    _log_audit_event(request, "dev.integration_ports.import", "success", f"mode={body.mode}")
    return IntegrationPortsImportPayload(
        version=cfg["version"],
        port_count=len(cfg["ports"]),
        message=f"Imported ({body.mode}) into {integration_ports_config_path()}",
    )


@app.post("/api/dev/integration-ports/reload", response_model=IntegrationPortsReloadPayload)
async def reload_dev_integration_ports(request: Request):
    """YAML を再読み込み（ファイル編集後）。"""
    _require_platform_settings(request)
    try:
        cfg = reload_integration_ports_config()
    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    _log_audit_event(request, "dev.integration_ports.reload", "success")
    return IntegrationPortsReloadPayload(
        version=cfg["version"],
        port_count=len(cfg["ports"]),
        message=f"Reloaded from {integration_ports_config_path()}",
    )


@app.post("/api/dev/integration-ports", response_model=IntegrationPortItem, status_code=201)
async def create_dev_integration_port(request: Request, body: IntegrationPortWriteBody):
    _require_platform_settings(request)
    try:
        port = create_integration_port(body.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "dev.integration_ports.create", "success", port["port_id"])
    return IntegrationPortItem(**port)


@app.get("/api/dev/integration-ports/{port_id}", response_model=IntegrationPortItem)
async def get_dev_integration_port(request: Request, port_id: str):
    _require_platform_settings(request)
    port = get_integration_port(port_id)
    if not port:
        raise HTTPException(status_code=404, detail=f"Port not found: {port_id}")
    _log_audit_event(request, "dev.integration_ports.get", "success", port_id)
    return IntegrationPortItem(**port)


@app.put("/api/dev/integration-ports/{port_id}", response_model=IntegrationPortItem)
async def update_dev_integration_port(
    request: Request, port_id: str, body: IntegrationPortWriteBody
):
    _require_platform_settings(request)
    try:
        port = update_integration_port(port_id, body.model_dump())
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Port not found: {port_id}") from None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "dev.integration_ports.update", "success", port_id)
    return IntegrationPortItem(**port)


@app.delete("/api/dev/integration-ports/{port_id}")
async def delete_dev_integration_port(request: Request, port_id: str):
    _require_platform_settings(request)
    try:
        delete_integration_port(port_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Port not found: {port_id}") from None
    _log_audit_event(request, "dev.integration_ports.delete", "success", port_id)
    return {"status": "deleted", "port_id": port_id}


class IntegrationPortSamplePayload(BaseModel):
    port_id: str
    http_method: str
    url: str
    idempotency_key: str = ""
    payload: dict
    target_base_url_hint: Optional[str] = None


class IntegrationPortTestBody(BaseModel):
    dry_run: bool = True
    payload: Optional[dict] = None
    client_id: str = "client-demo"
    period_key: str = "2025-03"
    target_base_url: str = ""
    batch_id: str = "batch-001"
    journal_id: str = "journal-demo"
    user_id: str = "dev-test"


class IntegrationPortTestResultPayload(BaseModel):
    port_id: str
    dry_run: bool
    status: str
    message: str
    http_method: str = ""
    url: str = ""
    request_body: dict = Field(default_factory=dict)
    response_status: Optional[int] = None
    response_body: Any = None
    validation_errors: List[str] = Field(default_factory=list)
    idempotency_key: str = ""
    tested_at: str = ""


class IntegrationPortHealthItem(BaseModel):
    port_id: str
    last_test: Optional[IntegrationPortTestResultPayload] = None


def _test_context_from_body(body: IntegrationPortTestBody) -> HandoffTestContext:
    return HandoffTestContext(
        client_id=body.client_id,
        period_key=body.period_key,
        target_base_url=body.target_base_url.strip(),
        batch_id=body.batch_id,
        journal_id=body.journal_id,
        user_id=body.user_id,
    )


@app.get("/api/dev/integration-ports/health")
async def list_dev_integration_ports_health(request: Request):
    _require_platform_settings(request)
    store = list_test_health()
    items = [
        IntegrationPortHealthItem(
            port_id=pid,
            last_test=IntegrationPortTestResultPayload(**row) if row else None,
        )
        for pid, row in sorted(store.items())
    ]
    return {"items": items, "count": len(items)}


@app.get(
    "/api/dev/integration-ports/{port_id}/sample",
    response_model=IntegrationPortSamplePayload,
)
async def get_dev_integration_port_sample(
    request: Request,
    port_id: str,
    client_id: str = Query("client-demo"),
    period_key: str = Query("2025-03"),
    target_base_url: str = Query(""),
):
    _require_platform_settings(request)
    try:
        data = sample_response(
            port_id,
            HandoffTestContext(client_id=client_id, period_key=period_key, target_base_url=target_base_url),
        )
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Port not found: {port_id}") from None
    _log_audit_event(request, "dev.integration_ports.sample", "success", port_id)
    return IntegrationPortSamplePayload(**data)


@app.get(
    "/api/dev/integration-ports/{port_id}/health",
    response_model=IntegrationPortHealthItem,
)
async def get_dev_integration_port_health(request: Request, port_id: str):
    _require_platform_settings(request)
    if not get_integration_port(port_id):
        raise HTTPException(status_code=404, detail=f"Port not found: {port_id}")
    row = get_last_test_result(port_id)
    return IntegrationPortHealthItem(
        port_id=port_id,
        last_test=IntegrationPortTestResultPayload(**row) if row else None,
    )


@app.post(
    "/api/dev/integration-ports/{port_id}/test",
    response_model=IntegrationPortTestResultPayload,
)
async def test_dev_integration_port(
    request: Request, port_id: str, body: IntegrationPortTestBody
):
    _require_platform_settings(request)
    try:
        result = run_port_test(
            port_id,
            payload=body.payload,
            dry_run=body.dry_run,
            ctx=_test_context_from_body(body),
        )
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Port not found: {port_id}") from None
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    action = "dev.integration_ports.test.dry_run" if body.dry_run else "dev.integration_ports.test.send"
    _log_audit_event(request, action, result.status, port_id)
    return IntegrationPortTestResultPayload(**result.to_dict())


# --- Legal master (Temporal Master Pattern) ---


class LegalMasterEntryItem(BaseModel):
    id: str
    domain: str
    master_key: str
    label_ja: str
    value_numeric: Optional[float] = None
    value_text: Optional[str] = None
    jurisdiction: Optional[str] = None
    valid_from: str
    valid_to: Optional[str] = None
    source_law: Optional[str] = None
    attributes: Optional[Any] = None
    master_version_id: Optional[str] = None
    created_at: str = ""
    updated_at: str = ""


class LegalMasterWriteBody(BaseModel):
    domain: str = Field(..., min_length=1)
    master_key: str = Field(..., min_length=1)
    label_ja: str = Field(..., min_length=1)
    value_numeric: Optional[float] = None
    value_text: Optional[str] = None
    jurisdiction: Optional[str] = None
    valid_from: str = Field(..., min_length=1)
    valid_to: Optional[str] = None
    source_law: Optional[str] = None
    attributes: Optional[dict] = None
    master_version_id: Optional[str] = None


class LegalMasterListPayload(BaseModel):
    entry_count: int
    db_path: str
    domains: List[dict]
    entries: List[LegalMasterEntryItem]


class LegalMasterCsvExportPayload(BaseModel):
    entry_count: int
    csv_text: str


class LegalMasterCsvValidateBody(BaseModel):
    csv_text: str = Field(..., min_length=1)


class LegalMasterCsvValidatePayload(BaseModel):
    valid: bool
    errors: List[str] = Field(default_factory=list)
    row_count: int = 0


class LegalMasterCsvImportBody(BaseModel):
    csv_text: str = Field(..., min_length=1)
    mode: str = Field(default="merge", pattern="^(replace|merge)$")


class LegalMasterRatePayload(BaseModel):
    master_key: str
    as_of: str
    value: Any = None
    value_numeric: Optional[float] = None
    value_text: Optional[str] = None
    valid_from: str
    valid_to: Optional[str] = None
    master_version_id: Optional[str] = None
    jurisdiction: Optional[str] = None
    label_ja: Optional[str] = None


@app.get("/api/v1/legal-master/rates/consumption-tax", response_model=LegalMasterRatePayload)
async def get_consumption_tax_rate(
    request: Request,
    as_of: str = Query(..., description="基準日 YYYY-MM-DD"),
    jurisdiction: Optional[str] = Query(None),
    rate_type: str = Query("standard", pattern="^(standard|reduced)$"),
):
    """消費税率 — as_of 必須（temporal-master-pattern §3.1）。"""
    _require_authenticated(request)
    master_key = (
        "consumption_tax.reduced_rate"
        if rate_type == "reduced"
        else "consumption_tax.standard_rate"
    )
    row = lookup_legal_master_rate(master_key, as_of, jurisdiction=jurisdiction)
    if not row:
        raise HTTPException(status_code=404, detail=f"No rate for {master_key} at {as_of}")
    return LegalMasterRatePayload(
        master_key=row["master_key"],
        as_of=as_of,
        value=row.get("value"),
        value_numeric=row.get("value_numeric"),
        value_text=row.get("value_text"),
        valid_from=row["valid_from"],
        valid_to=row.get("valid_to"),
        master_version_id=row.get("master_version_id"),
        jurisdiction=row.get("jurisdiction"),
        label_ja=row.get("label_ja"),
    )


@app.get("/api/v1/legal-master/rates")
async def get_legal_master_rate(
    request: Request,
    master_key: str = Query(...),
    as_of: str = Query(...),
    jurisdiction: Optional[str] = Query(None),
):
    _require_authenticated(request)
    row = lookup_legal_master_rate(master_key, as_of, jurisdiction=jurisdiction)
    if not row:
        raise HTTPException(status_code=404, detail=f"No entry for {master_key} at {as_of}")
    return row


@app.get("/api/v1/legal-master/brackets/income-tax")
async def get_income_tax_brackets_api(request: Request, as_of: str = Query(...)):
    _require_authenticated(request)
    return {"as_of": as_of, "brackets": list_income_tax_brackets(as_of)}


@app.get("/api/dev/legal-master", response_model=LegalMasterListPayload)
async def list_dev_legal_master(
    request: Request,
    domain: Optional[str] = Query(None),
    as_of: Optional[str] = Query(None),
):
    _require_platform_settings(request)
    meta = legal_master_summary()
    entries = list_legal_master_entries(domain=domain, as_of=as_of)
    _log_audit_event(request, "dev.legal_master.list", "success", f"count={len(entries)}")
    return LegalMasterListPayload(
        entry_count=meta["entry_count"],
        db_path=meta["db_path"],
        domains=meta["domains"],
        entries=[LegalMasterEntryItem(**e) for e in entries],
    )


@app.get("/api/dev/legal-master/export", response_model=LegalMasterCsvExportPayload)
async def export_dev_legal_master(request: Request, domain: Optional[str] = Query(None)):
    _require_platform_settings(request)
    csv_text = export_legal_master_csv(domain=domain)
    _log_audit_event(request, "dev.legal_master.export", "success")
    return LegalMasterCsvExportPayload(entry_count=legal_master_summary()["entry_count"], csv_text=csv_text)


@app.post("/api/dev/legal-master/validate", response_model=LegalMasterCsvValidatePayload)
async def validate_dev_legal_master_csv(request: Request, body: LegalMasterCsvValidateBody):
    _require_platform_settings(request)
    errors, rows = validate_legal_master_csv(body.csv_text)
    return LegalMasterCsvValidatePayload(valid=not errors, errors=errors, row_count=len(rows))


@app.post("/api/dev/legal-master/import")
async def import_dev_legal_master_csv(request: Request, body: LegalMasterCsvImportBody):
    _require_platform_settings(request)
    try:
        result = import_legal_master_csv(body.csv_text, mode=body.mode)  # type: ignore[arg-type]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "dev.legal_master.import", "success", f"mode={body.mode}")
    return result


@app.post("/api/dev/legal-master/seed")
async def seed_dev_legal_master(request: Request):
    _require_platform_settings(request)
    try:
        result = seed_legal_master_from_file()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "dev.legal_master.seed", "success")
    return result


@app.post("/api/dev/legal-master", response_model=LegalMasterEntryItem, status_code=201)
async def create_dev_legal_master_entry(request: Request, body: LegalMasterWriteBody):
    _require_platform_settings(request)
    try:
        entry = create_legal_master_entry(body.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "dev.legal_master.create", "success", entry["master_key"])
    return LegalMasterEntryItem(**entry)


@app.put("/api/dev/legal-master/{entry_id}", response_model=LegalMasterEntryItem)
async def update_dev_legal_master_entry(
    request: Request, entry_id: str, body: LegalMasterWriteBody
):
    _require_platform_settings(request)
    try:
        entry = update_legal_master_entry(entry_id, body.model_dump())
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Entry not found: {entry_id}") from None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "dev.legal_master.update", "success", entry_id)
    return LegalMasterEntryItem(**entry)


@app.delete("/api/dev/legal-master/{entry_id}")
async def delete_dev_legal_master_entry(request: Request, entry_id: str):
    _require_platform_settings(request)
    try:
        delete_legal_master_entry(entry_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Entry not found: {entry_id}") from None
    _log_audit_event(request, "dev.legal_master.delete", "success", entry_id)
    return {"status": "deleted", "id": entry_id}


# --- Metric mappings (dev.metrics) ---


class MetricMappingItem(BaseModel):
    metric_key: str
    label_ja: str
    field_id: str
    account_code: str = ""
    account_name: str = ""
    slot_id: str = ""
    period_key: str = ""
    document_label: str = ""
    status: str = "planned"
    notes: str = ""


class MetricMappingWriteBody(BaseModel):
    metric_key: str = Field(..., min_length=1)
    label_ja: str = Field(..., min_length=1)
    field_id: str = Field(..., min_length=1)
    account_code: str = ""
    account_name: str = ""
    slot_id: str = ""
    period_key: str = ""
    document_label: str = ""
    status: str = "planned"
    notes: str = ""


class MetricMappingsListPayload(BaseModel):
    version: int
    mapping_count: int
    config_path: str
    mappings: List[MetricMappingItem]


class MetricMappingsExportPayload(BaseModel):
    version: int
    mapping_count: int
    yaml_text: str
    csv_text: str


class MetricMappingsValidateBody(BaseModel):
    yaml_text: Optional[str] = None
    csv_text: Optional[str] = None


class MetricMappingsImportBody(BaseModel):
    yaml_text: Optional[str] = None
    csv_text: Optional[str] = None
    mode: str = Field(default="merge", pattern="^(replace|merge)$")


@app.get("/api/metric-mappings", response_model=MetricMappingsListPayload)
async def list_metric_mappings_api(request: Request, status: Optional[str] = Query(None)):
    _require_authenticated(request)
    summary = metric_mappings_config_summary()
    rows = list_metric_mappings(status=status)  # type: ignore[arg-type]
    return MetricMappingsListPayload(
        version=int(summary["version"]),
        mapping_count=int(summary["mapping_count"]),
        config_path=str(summary["config_path"]),
        mappings=[MetricMappingItem(**m) for m in rows],
    )


@app.get("/api/dev/metric-mappings", response_model=MetricMappingsListPayload)
async def list_dev_metric_mappings(request: Request, status: Optional[str] = Query(None)):
    _require_platform_settings(request)
    summary = metric_mappings_config_summary()
    rows = list_metric_mappings(status=status)  # type: ignore[arg-type]
    _log_audit_event(request, "dev.metric_mappings.list", "success", f"count={len(rows)}")
    return MetricMappingsListPayload(
        version=int(summary["version"]),
        mapping_count=int(summary["mapping_count"]),
        config_path=str(summary["config_path"]),
        mappings=[MetricMappingItem(**m) for m in rows],
    )


@app.get("/api/dev/metric-mappings/export", response_model=MetricMappingsExportPayload)
async def export_dev_metric_mappings(request: Request):
    _require_platform_settings(request)
    summary = metric_mappings_config_summary()
    _log_audit_event(request, "dev.metric_mappings.export", "success")
    return MetricMappingsExportPayload(
        version=int(summary["version"]),
        mapping_count=int(summary["mapping_count"]),
        yaml_text=export_metric_mappings_yaml(),
        csv_text=export_metric_mappings_csv(),
    )


@app.post("/api/dev/metric-mappings/validate")
async def validate_dev_metric_mappings(request: Request, body: MetricMappingsValidateBody):
    _require_platform_settings(request)
    if body.yaml_text:
        errors, parsed = validate_metric_mappings_yaml(body.yaml_text)
        return {"valid": not errors, "errors": errors, "row_count": len(parsed["mappings"]) if parsed else 0}
    if body.csv_text:
        errors, rows = validate_metric_mappings_csv(body.csv_text)
        return {"valid": not errors, "errors": errors, "row_count": len(rows)}
    raise HTTPException(status_code=400, detail="yaml_text or csv_text required")


@app.post("/api/dev/metric-mappings/import")
async def import_dev_metric_mappings(request: Request, body: MetricMappingsImportBody):
    _require_platform_settings(request)
    try:
        if body.yaml_text:
            import_metric_mappings_yaml(body.yaml_text, mode=body.mode)  # type: ignore[arg-type]
        elif body.csv_text:
            import_metric_mappings_csv(body.csv_text, mode=body.mode)  # type: ignore[arg-type]
        else:
            raise HTTPException(status_code=400, detail="yaml_text or csv_text required")
        refresh_metric_index()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "dev.metric_mappings.import", "success", f"mode={body.mode}")
    return metric_mappings_config_summary()


@app.post("/api/dev/metric-mappings/reload")
async def reload_dev_metric_mappings(request: Request):
    _require_platform_settings(request)
    try:
        reload_metric_mappings_config()
        refresh_metric_index()
    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    _log_audit_event(request, "dev.metric_mappings.reload", "success")
    return metric_mappings_config_summary()


@app.post("/api/dev/metric-mappings", response_model=MetricMappingItem, status_code=201)
async def create_dev_metric_mapping(request: Request, body: MetricMappingWriteBody):
    _require_platform_settings(request)
    try:
        row = create_metric_mapping(body.model_dump())
        refresh_metric_index()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "dev.metric_mappings.create", "success", row["metric_key"])
    return MetricMappingItem(**row)


@app.get("/api/dev/metric-mappings/{metric_key}", response_model=MetricMappingItem)
async def get_dev_metric_mapping(request: Request, metric_key: str):
    _require_platform_settings(request)
    row = get_metric_mapping(metric_key)
    if not row:
        raise HTTPException(status_code=404, detail=f"Mapping not found: {metric_key}")
    return MetricMappingItem(**row)


@app.put("/api/dev/metric-mappings/{metric_key}", response_model=MetricMappingItem)
async def update_dev_metric_mapping(
    request: Request, metric_key: str, body: MetricMappingWriteBody
):
    _require_platform_settings(request)
    try:
        row = update_metric_mapping(metric_key, body.model_dump())
        refresh_metric_index()
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Mapping not found: {metric_key}") from None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "dev.metric_mappings.update", "success", metric_key)
    return MetricMappingItem(**row)


@app.delete("/api/dev/metric-mappings/{metric_key}")
async def delete_dev_metric_mapping(request: Request, metric_key: str):
    _require_platform_settings(request)
    try:
        delete_metric_mapping(metric_key)
        refresh_metric_index()
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Mapping not found: {metric_key}") from None
    _log_audit_event(request, "dev.metric_mappings.delete", "success", metric_key)
    return {"status": "deleted", "metric_key": metric_key}


@app.get("/api/platform/executive/dashboard")
async def get_platform_executive_dashboard(request: Request):
    """DocuGrid 経営者向け — 全テナント MRR/ARR/チャーン等。"""
    _require_platform_settings(request)
    payload = build_executive_dashboard(record_snapshot=True)
    _log_audit_event(request, "platform.executive.dashboard", "success")
    return payload


@app.get("/api/platform/executive/ma-goals")
async def get_platform_ma_goals(
    request: Request,
    target_arr_yen: int = 1_000_000_000,
    horizon_months: int = 60,
    annual_logo_churn: float = 0.05,
    avg_clients_per_firm: int | None = None,
    avg_clients_mode: str | None = None,
    partner_attach_rate: float = 0.5,
):
    """MA 目標逆算 — 10億円 ARR 達成に必要な事務所数・獲得ペース等。"""
    _require_platform_settings(request)
    if target_arr_yen < 1:
        raise HTTPException(status_code=400, detail="invalid_target_arr")
    if horizon_months < 1 or horizon_months > 240:
        raise HTTPException(status_code=400, detail="invalid_horizon_months")
    if annual_logo_churn < 0 or annual_logo_churn > 0.5:
        raise HTTPException(status_code=400, detail="invalid_churn")
    if partner_attach_rate < 0 or partner_attach_rate > 1:
        raise HTTPException(status_code=400, detail="invalid_partner_rate")
    if avg_clients_mode is not None and avg_clients_mode not in ("planning", "actual", "auto"):
        raise HTTPException(status_code=400, detail="invalid_avg_clients_mode")
    payload = build_ma_goals(
        target_arr_yen=target_arr_yen,
        horizon_months=horizon_months,
        annual_logo_churn=annual_logo_churn,
        avg_clients_per_firm=avg_clients_per_firm,
        avg_clients_mode=avg_clients_mode,
        partner_attach_rate=partner_attach_rate,
    )
    _log_audit_event(request, "platform.executive.ma_goals", "success")
    return payload


class MaAssumptionsBody(BaseModel):
    planning_avg_clients_per_firm: int | None = None
    avg_clients_mode: str | None = None


@app.put("/api/platform/executive/ma-assumptions")
async def put_platform_ma_assumptions(request: Request, body: MaAssumptionsBody):
    """MA 計画仮定（平均顧問先数・実績/仮定モード）を保存。"""
    _require_platform_settings(request)
    try:
        saved = save_ma_assumptions(
            planning_avg_clients_per_firm=body.planning_avg_clients_per_firm,
            avg_clients_mode=body.avg_clients_mode,
        )
    except ValueError as exc:
        if str(exc) == "invalid_avg_clients_mode":
            raise HTTPException(status_code=400, detail="invalid_avg_clients_mode") from exc
        raise
    _log_audit_event(request, "platform.executive.ma_assumptions", "success")
    return saved


@app.get("/api/platform/executive/firms/{firm_id}")
async def get_platform_executive_firm(request: Request, firm_id: str):
    _require_platform_settings(request)
    detail = build_firm_detail(firm_id.strip())
    if not detail:
        raise HTTPException(status_code=404, detail="firm_not_found")
    _log_audit_event(request, "platform.executive.firm", "success", firm_id)
    return detail


def _require_authenticated(request: Request) -> None:
    identity = resolve_identity(request)
    if not identity.email and not identity.role:
        raise HTTPException(status_code=401, detail="Authentication required")


class DriveStatusPayload(BaseModel):
    google_drive_connected: bool = False
    drive_root_folder_id: Optional[str] = None
    drive_credentials_configured: bool = False
    drive_mode: str = "unconfigured"
    service_account_email: Optional[str] = None


@app.get("/api/drive/status", response_model=DriveStatusPayload)
async def get_drive_status(request: Request):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    cfg = _load_system_config(ctx.firm_id)
    sa_email = get_drive_service_account_email(ctx.firm_id)
    return DriveStatusPayload(
        google_drive_connected=cfg.google_drive_connected,
        drive_root_folder_id=cfg.drive_root_folder_id,
        drive_credentials_configured=cfg.drive_credentials_configured,
        drive_mode=resolve_drive_mode(ctx.firm_id),
        service_account_email=sa_email,
    )


@app.post("/api/drive/test")
async def test_drive_connection(request: Request):
    _require_platform_settings(request)
    ctx = _auth_context(request)
    cfg = _load_system_config(ctx.firm_id)
    if not drive_credentials_configured(ctx.firm_id):
        raise HTTPException(
            status_code=400,
            detail="サービスアカウント JSON をアップロードしてください（Settings → 外部連携）",
        )
    if not cfg.drive_root_folder_id:
        raise HTTPException(
            status_code=400,
            detail="drive_root_folder_id を設定してください（共有ドライブ内フォルダの ID）",
        )
    try:
        svc = get_drive_service(ctx.firm_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Drive 接続に失敗しました: {exc}") from exc
    ping = svc.ping_root_folder(cfg.drive_root_folder_id)
    if not ping.get("ok"):
        raise HTTPException(status_code=400, detail=ping.get("error", "Drive ping failed"))
    probe = svc.ensure_folder_path(["TAXX", "_healthcheck"], cfg.drive_root_folder_id)
    _log_audit_event(request, "drive.test", "success", f"folder={probe}")
    return {
        "ok": True,
        "mode": "live",
        "root_folder_id": cfg.drive_root_folder_id,
        "root_folder_name": ping.get("folder_name"),
        "healthcheck_folder_id": probe,
    }


@app.post("/api/drive/credentials")
async def upload_drive_credentials(request: Request, file: UploadFile = File(...)):
    _require_platform_settings(request)
    ctx = _auth_context(request)
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty credentials file")
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise HTTPException(status_code=400, detail="Credentials must be valid JSON")
    if data.get("type") != "service_account":
        raise HTTPException(status_code=400, detail="Service account JSON required")
    if not (data.get("client_email") or "").strip():
        raise HTTPException(status_code=400, detail="client_email missing in credentials")
    save_drive_credentials(ctx.firm_id, data)
    invalidate_drive_service_cache(ctx.firm_id)
    _log_audit_event(request, "drive.credentials.put", "success")
    return {"ok": True, "service_account_email": data.get("client_email")}


@app.delete("/api/drive/credentials")
async def delete_drive_credentials(request: Request):
    _require_platform_settings(request)
    ctx = _auth_context(request)
    clear_drive_credentials(ctx.firm_id)
    invalidate_drive_service_cache(ctx.firm_id)
    _log_audit_event(request, "drive.credentials.delete", "success")
    return {"ok": True}


class MoneytreeStatusPayload(BaseModel):
    configured: bool
    mock_mode: bool
    connected: bool
    guest_label: Optional[str] = None
    connected_at: Optional[str] = None
    last_sync_at: Optional[str] = None
    accounts_count: int = 0
    environment: str = "staging"
    vault_url: Optional[str] = None
    client_id_scope: Optional[str] = None


class MoneytreeConnectPayload(BaseModel):
    mock: bool
    authorize_url: Optional[str] = None
    state: Optional[str] = None


class MoneytreeSyncPayload(BaseModel):
    accounts_synced: int
    transactions_synced: int
    synced_at: str


class MoneytreeFirmClientStatusItem(BaseModel):
    client_id: str
    connected: bool
    guest_label: Optional[str] = None
    connected_at: Optional[str] = None
    last_sync_at: Optional[str] = None
    accounts_count: int = 0


class MoneytreeFirmStatusPayload(BaseModel):
    clients: list[MoneytreeFirmClientStatusItem]


@app.get("/api/integrations/moneytree/firm-status", response_model=MoneytreeFirmStatusPayload)
async def get_moneytree_firm_status(request: Request):
    """事務所側: 顧問先ごとの連携状況（閲覧のみ。接続操作は顧問先ワークスペース）。"""
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    scope_map = _get_stakeholder_client_scope_map()
    client_ids = sorted(visible_client_ids(ctx, scope_map))
    rows = firm_clients_status(ctx.firm_id, client_ids)
    _log_audit_event(request, "moneytree.firm_status", "success", f"count={len(rows)}")
    return MoneytreeFirmStatusPayload(
        clients=[MoneytreeFirmClientStatusItem(**row) for row in rows],
    )


@app.get("/api/integrations/moneytree/status", response_model=MoneytreeStatusPayload)
async def get_moneytree_status(
    request: Request,
    client_id: str = Query(..., min_length=1),
):
    ctx = _require_moneytree_client(request, client_id)
    try:
        payload = moneytree_status_payload(ctx.firm_id, client_id)
    except ValueError as exc:
        if str(exc) == "client_id_required":
            raise HTTPException(status_code=400, detail="client_id_required") from exc
        raise
    _log_audit_event(request, "moneytree.status", "success", client_id)
    return MoneytreeStatusPayload(**payload)


@app.get("/api/integrations/moneytree/connect", response_model=MoneytreeConnectPayload)
async def get_moneytree_connect(
    request: Request,
    client_id: str = Query(..., min_length=1),
    return_path: Optional[str] = Query(None),
):
    ctx = _require_moneytree_client(request, client_id, write=True)
    if not is_moneytree_configured():
        raise HTTPException(status_code=503, detail="moneytree_not_configured")
    try:
        result = build_authorize_url(
            ctx.firm_id,
            client_id,
            return_path=(return_path or "").strip(),
        )
    except ValueError as exc:
        if str(exc) == "client_id_required":
            raise HTTPException(status_code=400, detail="client_id_required") from exc
        raise
    except RuntimeError as exc:
        if str(exc) == "moneytree_not_configured":
            raise HTTPException(status_code=503, detail="moneytree_not_configured") from exc
        raise
    _log_audit_event(request, "moneytree.connect", "success", client_id)
    return MoneytreeConnectPayload(**result)


@app.get("/api/integrations/moneytree/callback")
async def moneytree_oauth_callback(
    request: Request,
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
):
    return_path: str | None = None
    if error:
        return RedirectResponse(callback_redirect_url(False, error, return_path=return_path))
    if not code or not state:
        return RedirectResponse(callback_redirect_url(False, "missing_code_or_state"))
    try:
        _, _, return_path = handle_oauth_callback(code, state)
    except KeyError:
        return RedirectResponse(callback_redirect_url(False, "invalid_state"))
    except RuntimeError as exc:
        return RedirectResponse(callback_redirect_url(False, str(exc), return_path=return_path))
    _log_audit_event(request, "moneytree.callback", "success")
    return RedirectResponse(callback_redirect_url(True, return_path=return_path))


@app.post("/api/integrations/moneytree/mock-connect")
async def moneytree_mock_connect(
    request: Request,
    client_id: str = Query(..., min_length=1),
):
    ctx = _require_moneytree_client(request, client_id, write=True)
    if not is_mock_mode():
        raise HTTPException(status_code=403, detail="mock_mode_disabled")
    try:
        mock_connect(ctx.firm_id, client_id)
    except ValueError as exc:
        if str(exc) == "client_id_required":
            raise HTTPException(status_code=400, detail="client_id_required") from exc
        raise
    _log_audit_event(request, "moneytree.mock_connect", "success", client_id)
    return {"ok": True}


@app.post("/api/integrations/moneytree/sync", response_model=MoneytreeSyncPayload)
async def moneytree_sync(
    request: Request,
    client_id: str = Query(..., min_length=1),
):
    ctx = _require_moneytree_client(request, client_id, write=True)
    try:
        result = sync_moneytree_accounts(ctx.firm_id, client_id)
    except KeyError:
        raise HTTPException(status_code=400, detail="not_connected") from None
    _log_audit_event(
        request,
        "moneytree.sync",
        "success",
        f"client={client_id} accounts={result['accounts_synced']} txns={result['transactions_synced']}",
    )
    return MoneytreeSyncPayload(**result)


@app.get("/api/integrations/moneytree/accounts")
async def moneytree_accounts(
    request: Request,
    client_id: str = Query(..., min_length=1),
):
    ctx = _require_moneytree_client(request, client_id)
    rows = list_moneytree_accounts(ctx.firm_id, client_id)
    _log_audit_event(request, "moneytree.accounts", "success", f"client={client_id} count={len(rows)}")
    return {"accounts": rows}


@app.get("/api/integrations/moneytree/transactions")
async def moneytree_transactions(
    request: Request,
    client_id: str = Query(..., min_length=1),
    account_external_id: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    ctx = _require_moneytree_client(request, client_id)
    rows = list_moneytree_transactions(
        ctx.firm_id,
        client_id,
        account_external_id=account_external_id,
        limit=limit,
    )
    _log_audit_event(request, "moneytree.transactions", "success", f"client={client_id} count={len(rows)}")
    return {"transactions": rows}


@app.get("/api/integrations/moneytree/vault-url")
async def moneytree_vault_url(
    request: Request,
    client_id: str = Query(..., min_length=1),
):
    _require_moneytree_client(request, client_id, write=True)
    url = build_vault_url()
    if not url:
        raise HTTPException(status_code=503, detail="vault_url_unavailable")
    return {"vault_url": url}


@app.delete("/api/integrations/moneytree/disconnect")
async def moneytree_disconnect(
    request: Request,
    client_id: str = Query(..., min_length=1),
):
    ctx = _require_moneytree_client(request, client_id, write=True)
    disconnect_moneytree(ctx.firm_id, client_id)
    _log_audit_event(request, "moneytree.disconnect", "success", client_id)
    return {"ok": True}


@app.get("/api/client-master", response_model=ClientMasterPayload)
async def get_client_master(request: Request):
    # 全ロール（viewer 含む）が顧客名・関係グループを参照できる必要があるため client.view で許可。
    # 編集（PUT）は settings.manage のまま。
    role = _require_permission(request, "client.view")
    payload = _load_client_master()
    ctx = _auth_context(request)
    allowed = visible_client_ids(ctx, _get_stakeholder_client_scope_map())
    filtered_clients = filter_client_master_clients(payload.clients, ctx, _get_stakeholder_client_scope_map())
    filtered_groups = [
        g
        for g in payload.groups
        if any(cid in allowed for cid in g.clientIds)
    ]
    payload = ClientMasterPayload(
        clients=filtered_clients,
        groups=filtered_groups,
        updated_at=payload.updated_at,
    )
    _log_audit_event(request, "client_master.get", "success", f"clients={len(payload.clients)}")
    return payload


@app.put("/api/client-master", response_model=ClientMasterPayload)
async def update_client_master(request: Request, payload: ClientMasterPayload):
    role = _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    scope_map = _get_stakeholder_client_scope_map()
    for client in payload.clients:
        if get_client_firm_id(client.id) != ctx.firm_id:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot modify client {client.id!r} belonging to another firm",
            )
        authorize_client_access(ctx, client.id, scope_map)
    _validate_client_master(payload)
    merged = _merge_client_master_for_firm(ctx, payload)
    saved = _save_client_master(merged)
    client_count, _ = _firm_usage_counts(ctx.firm_id)
    try:
        sync_firm_billing_usage(ctx.firm_id, client_count)
    except Exception:
        pass
    _log_audit_event(request, "client_master.put", "success", f"clients={len(saved.clients)} groups={len(saved.groups)}")
    return saved


@app.get("/api/stakeholder-master", response_model=StakeholderMasterPayload)
async def get_stakeholder_master(request: Request):
    role = _require_permission(request, "settings.manage")
    _require_client_scope(request, role)
    roles = _get_stakeholder_role_map()
    scopes_raw = _get_stakeholder_client_scope_map()
    scopes_out = {k: sorted(v) for k, v in scopes_raw.items()}
    updated_at: str | None = None
    if STAKEHOLDER_MASTER_PATH.exists():
        try:
            raw = json.loads(STAKEHOLDER_MASTER_PATH.read_text(encoding="utf-8"))
            updated_at = raw.get("updated_at")
        except Exception:
            pass
    payload = StakeholderMasterPayload(
        roleByStakeholderId=roles,
        clientScopesByStakeholderId=scopes_out,
        updated_at=updated_at,
    )
    _log_audit_event(request, "stakeholder_master.get", "success", f"stakeholders={len(roles)}")
    return payload


@app.put("/api/stakeholder-master", response_model=StakeholderMasterPayload)
async def update_stakeholder_master(request: Request, payload: StakeholderMasterPayload):
    role = _require_permission(request, "settings.manage")
    _require_client_scope(request, role)
    saved = _save_stakeholder_master(payload)
    _log_audit_event(
        request,
        "stakeholder_master.put",
        "success",
        f"stakeholders={len(saved.roleByStakeholderId)}",
    )
    return saved


def _issue_session_token(
    *,
    request: Request,
    email: str,
    resolved_stakeholder_id: str,
    role: str,
    audit_action: str,
    firm_id: str,
    member_id: str,
) -> TokenResponse:
    token = create_access_token(
        sub=email,
        role=role,
        stid=resolved_stakeholder_id,
        firm_id=firm_id,
        member_id=member_id,
    )
    _init_audit_events_db()
    with sqlite3.connect(AUDIT_EVENTS_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO audit_events (
                created_at, stakeholder_id, user_email, role, client_id, path, action, result, detail, http_status, firm_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
            """,
            (
                datetime.utcnow().isoformat(),
                resolved_stakeholder_id,
                email,
                role,
                "",
                str(request.url.path),
                audit_action,
                "success",
                "",
                firm_id,
            ),
        )
    return TokenResponse(access_token=token, expires_in=get_jwt_exp_seconds())


def _auth_token_response(token: str, expires_in: int) -> Response:
    """Issue JSON + httpOnly session cookie when enabled."""
    body: dict = {"access_token": token, "token_type": "bearer", "expires_in": expires_in}
    resp = JSONResponse(content=body)
    if session_cookie_enabled():
        resp.set_cookie(
            key=SESSION_COOKIE_NAME,
            value=token,
            httponly=True,
            secure=session_cookie_secure(),
            samesite="lax",
            max_age=expires_in,
            path="/",
        )
        attach_csrf_cookie(resp, max_age=expires_in)
    return resp


def _client_ip(request: Request) -> str:
    forwarded = (request.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
    if forwarded:
        return forwarded
    if request.client:
        return request.client.host or ""
    return ""


def _login_with_email(
    *,
    request: Request,
    email: str,
    requested_stakeholder_id: str,
    audit_action: str,
) -> TokenResponse:
    member = resolve_member_for_login(
        email,
        requested_stakeholder_id,
        pick_allowed=login_stakeholder_pick_allowed(),
    )
    if not member:
        raise HTTPException(
            status_code=403,
            detail="This Google account is not registered for DocuGrid access",
        )
    role = _get_stakeholder_role_map().get(member.stakeholder_id) or member.firm_role
    if not role:
        raise HTTPException(status_code=400, detail="Unknown stakeholder")
    return _issue_session_token(
        request=request,
        email=email,
        resolved_stakeholder_id=member.stakeholder_id,
        role=role,
        audit_action=audit_action,
        firm_id=member.firm_id,
        member_id=member.id,
    )


@app.get("/api/auth/config", response_model=AuthConfigResponse)
async def auth_config() -> AuthConfigResponse:
    """Public auth UI config (client id is not secret)."""
    return AuthConfigResponse(
        google_client_id=get_google_oauth_client_id(),
        password_login_enabled=password_login_allowed(),
        session_cookie=session_cookie_enabled(),
        legacy_files=legacy_files_enabled(),
        csrf=csrf_protection_enabled(),
    )


@app.post("/api/auth/logout")
async def auth_logout() -> JSONResponse:
    resp = JSONResponse(content={"ok": True})
    resp.delete_cookie(SESSION_COOKIE_NAME, path="/")
    clear_csrf_cookie(resp)
    return resp


@app.post("/api/auth/google")
async def auth_google(body: GoogleLoginRequest, request: Request):
    if login_rate_limit_exceeded(_client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many login attempts")
    claims = verify_google_id_token(body.credential)
    if not claims.get("email_verified"):
        raise HTTPException(status_code=403, detail="Google email is not verified")
    email = str(claims.get("email") or "").strip()
    if not email:
        raise HTTPException(status_code=400, detail="Google account has no email")
    token_resp = _login_with_email(
        request=request,
        email=email,
        requested_stakeholder_id="",
        audit_action="auth.google",
    )
    return _auth_token_response(token_resp.access_token, token_resp.expires_in)


@app.post("/api/auth/login")
async def auth_login(body: LoginRequest, request: Request):
    if login_rate_limit_exceeded(_client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many login attempts")
    if not password_login_allowed():
        raise HTTPException(status_code=403, detail="Password login is disabled")
    expected = os.environ.get("DOCUGRID_LOGIN_PASSWORD", "password")
    if body.password != expected:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token_resp = _login_with_email(
        request=request,
        email=body.email,
        requested_stakeholder_id=body.stakeholder_id,
        audit_action="auth.login",
    )
    return _auth_token_response(token_resp.access_token, token_resp.expires_in)


@app.get("/api/firm-members", response_model=List[FirmMemberItem])
async def get_firm_members(request: Request):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    members = list_members_for_firm(ctx.firm_id)
    return [
        FirmMemberItem(
            id=m.id,
            email=m.email,
            stakeholder_id=m.stakeholder_id,
            firm_role=m.firm_role,
            persona_id=m.persona_id or resolve_persona_id(
                stakeholder_id=m.stakeholder_id,
                stored_persona_id=m.persona_id,
            ),
            status=m.status,
            display_name=m.display_name,
        )
        for m in members
    ]


@app.patch("/api/firm-members/{member_id}", response_model=FirmMemberItem)
async def patch_firm_member(request: Request, member_id: str, body: FirmMemberPatchBody):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    member = get_member_by_id(member_id)
    if not member or member.firm_id != ctx.firm_id:
        raise HTTPException(status_code=404, detail="Member not found")
    if body.status is not None:
        if body.status not in (MEMBER_STATUS_ACTIVE, MEMBER_STATUS_INACTIVE):
            raise HTTPException(status_code=400, detail="Invalid status")
        member = set_member_status(member_id, body.status)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    _log_audit_event(request, "firm_members.patch", "success", f"member={member_id} status={member.status}")
    return FirmMemberItem(
        id=member.id,
        email=member.email,
        stakeholder_id=member.stakeholder_id,
        firm_role=member.firm_role,
        persona_id=member.persona_id or resolve_persona_id(
            stakeholder_id=member.stakeholder_id,
            stored_persona_id=member.persona_id,
        ),
        status=member.status,
        display_name=member.display_name,
    )


@app.get("/api/role-permissions", response_model=RolePermissionsPayload)
async def get_role_permissions(request: Request):
    _require_platform_settings(request)
    payload = _role_permissions_payload_from_store()
    _log_audit_event(request, "role_permissions.get", "success")
    return payload


@app.put("/api/role-permissions", response_model=RolePermissionsPayload)
async def update_role_permissions(request: Request, payload: RolePermissionsPayload):
    _require_platform_settings(request)
    saved = _save_role_permissions(payload)
    _log_audit_event(request, "role_permissions.put", "success")
    return saved


def _screen_design_context(request: Request) -> tuple[str, str, str]:
    identity = resolve_identity(request)
    member = get_member_by_id(identity.member_id) or get_member_by_stakeholder_id(
        identity.stakeholder_id
    )
    pid = resolve_persona_id(
        stakeholder_id=identity.stakeholder_id,
        stored_persona_id=member.persona_id if member else None,
    )
    return pid, identity.firm_id or DEFAULT_FIRM_ID, identity.member_id or identity.stakeholder_id


@app.get("/api/screen-design/resolved")
async def get_screen_design_resolved(
    request: Request,
    persona_id: Optional[str] = Query(None),
):
    """Merged screen design (platform → firm → member) for the current user."""
    _require_permission(request, "client.view")
    pid, firm_id, member_id = _screen_design_context(request)
    target = (persona_id or pid).strip()
    return resolve_screen_design(persona_id=target, firm_id=firm_id, member_id=member_id)


@app.get("/api/screen-design/editor")
async def get_screen_design_editor(request: Request, persona_id: Optional[str] = Query(None)):
    """Editor payload: all layers + merge preview. Firm/platform need settings.manage."""
    _require_permission(request, "client.view")
    pid, firm_id, member_id = _screen_design_context(request)
    target = (persona_id or pid).strip()
    resolved = resolve_screen_design(persona_id=target, firm_id=firm_id, member_id=member_id)
    identity = resolve_identity(request)
    perms = _get_role_permissions().get(identity.role, set())
    return {
        "persona_id": target,
        "firm_id": firm_id,
        "member_id": member_id,
        "resolved": resolved,
        "platform": load_platform_design(),
        "firm": load_firm_design(firm_id),
        "member": load_member_design(firm_id, member_id),
        "can_edit_platform": "settings.platform" in perms,
        "can_edit_firm": "settings.manage" in perms,
        "can_edit_member": True,
    }


@app.put("/api/screen-design/platform")
async def put_screen_design_platform(request: Request, body: ScreenDesignSaveBody):
    _require_platform_settings(request)
    existing = load_platform_design()
    personas = dict(existing.get("personas") or {})
    personas.update(body.personas)
    saved = save_platform_design({"version": body.version, "personas": personas})
    _log_audit_event(request, "screen_design.platform.put", "success", f"personas={len(personas)}")
    return saved


@app.put("/api/screen-design/firm")
async def put_screen_design_firm(request: Request, body: ScreenDesignSaveBody):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    existing = load_firm_design(ctx.firm_id)
    personas = dict(existing.get("personas") or {})
    personas.update(body.personas)
    saved = save_firm_design(ctx.firm_id, {"version": body.version, "personas": personas})
    _log_audit_event(request, "screen_design.firm.put", "success", f"personas={len(personas)}")
    return saved


@app.put("/api/screen-design/member")
async def put_screen_design_member(request: Request, body: ScreenDesignSaveBody):
    ctx = _auth_context(request)
    existing = load_member_design(ctx.firm_id, ctx.member_id)
    personas = dict(existing.get("personas") or {})
    personas.update(body.personas)
    saved = save_member_design(
        ctx.firm_id,
        ctx.member_id,
        {"version": body.version, "personas": personas},
    )
    _log_audit_event(request, "screen_design.member.put", "success", f"personas={len(personas)}")
    return saved


@app.get("/api/auth/me", response_model=MeResponse)
async def auth_me(request: Request):
    identity = resolve_identity(request)
    perms = sorted(_get_role_permissions().get(identity.role, set()))
    ctx = build_auth_context(
        role=identity.role,
        email=identity.email,
        stakeholder_id=identity.stakeholder_id,
        firm_id=identity.firm_id,
        member_id=identity.member_id,
    )
    scope_map = _get_stakeholder_client_scope_map()
    fid = identity.firm_id or ""
    member = get_member_by_id(identity.member_id) or get_member_by_stakeholder_id(
        identity.stakeholder_id
    )
    pid = resolve_persona_id(
        stakeholder_id=identity.stakeholder_id,
        stored_persona_id=member.persona_id if member else None,
    )
    me = MeResponse(
        email=identity.email,
        role=identity.role,
        stakeholder_id=identity.stakeholder_id,
        firm_id=fid,
        firm_label=firm_label(fid),
        persona_id=pid,
        persona_label=persona_label(pid),
        permissions=perms,
        visible_client_ids=sorted(visible_client_ids(ctx, scope_map)),
    )
    resp = JSONResponse(content=me.model_dump())
    ensure_csrf_cookie_on_response(request, resp)
    return resp


@app.post("/api/auth/mcp-token", response_model=McpTokenResponse)
async def issue_mcp_token(request: Request):
    """Issue a short-lived JWT for DocuGrid MCP (Cursor / Claude Desktop). Same permissions as the current user."""
    identity = resolve_identity(request)
    actor_key = f"{identity.member_id}:{identity.email}"
    if mcp_token_rate_limit_exceeded(actor_key):
        _log_audit_event(request, "auth.mcp_token.issue", "denied", "rate_limit")
        raise HTTPException(status_code=429, detail="MCP token issuance rate limit exceeded")
    exp_seconds = get_mcp_jwt_exp_seconds()
    token = create_mcp_access_token(
        sub=identity.email,
        role=identity.role,
        stid=identity.stakeholder_id,
        firm_id=identity.firm_id,
        member_id=identity.member_id,
    )
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=exp_seconds)).isoformat()
    _log_audit_event(request, "auth.mcp_token.issue", "success", f"expires_in={exp_seconds}")
    return McpTokenResponse(
        access_token=token,
        expires_in=exp_seconds,
        expires_at=expires_at,
    )


@app.get("/api/audit-events", response_model=List[AuditEventItem])
async def list_audit_events(
    request: Request,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    from_ts: Optional[str] = None,
    to_ts: Optional[str] = None,
    client_id: Optional[str] = None,
    stakeholder_id: Optional[str] = None,
    action: Optional[str] = None,
    result: Optional[str] = Query(
        None,
        description="success, denied, or omit for all",
    ),
    path_contains: Optional[str] = None,
    http_status: Optional[int] = Query(None, ge=100, le=599),
):
    role = _require_permission(request, "settings.manage")
    _require_client_scope(request, role)
    ctx = _auth_context(request)
    _init_audit_events_db()
    clauses: list[str] = ["firm_id = ?"]
    params: list[object] = [ctx.firm_id]
    if http_status is not None:
        clauses.append("http_status = ?")
        params.append(http_status)
    if from_ts:
        clauses.append("created_at >= ?")
        params.append(from_ts)
    if to_ts:
        clauses.append("created_at <= ?")
        params.append(to_ts)
    if client_id:
        clauses.append("client_id = ?")
        params.append(client_id)
    if stakeholder_id:
        clauses.append("stakeholder_id = ?")
        params.append(stakeholder_id)
    if action:
        clauses.append("action LIKE ?")
        params.append(f"%{action}%")
    if result in ("success", "denied"):
        clauses.append("result = ?")
        params.append(result)
    if path_contains:
        clauses.append("path LIKE ?")
        params.append(f"%{path_contains}%")

    where_sql = " AND ".join(clauses)
    sql = f"""
        SELECT id, created_at, stakeholder_id, user_email, role, client_id, path, action, result, detail, http_status
        FROM audit_events
        WHERE {where_sql}
        ORDER BY id DESC
        LIMIT ? OFFSET ?
    """
    params.extend([limit, offset])
    with sqlite3.connect(AUDIT_EVENTS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(sql, params).fetchall()
    items = [
        AuditEventItem(
            id=int(row["id"]),
            created_at=str(row["created_at"]),
            stakeholder_id=row["stakeholder_id"],
            user_email=row["user_email"],
            role=row["role"],
            client_id=row["client_id"],
            path=str(row["path"]),
            action=str(row["action"]),
            result=str(row["result"]),
            detail=row["detail"],
            http_status=row["http_status"],
        )
        for row in rows
    ]
    _log_audit_event(request, "audit_events.list", "success", f"rows={len(items)}")
    return items


@app.exception_handler(HTTPException)
async def audit_aware_http_exception_handler(request: Request, exc: HTTPException):
    if exc.status_code in (401, 403):
        _init_audit_events_db()
        _log_audit_denial(request, exc.status_code, _format_http_detail(exc.detail))
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


def _require_legacy_files_api() -> None:
    if not legacy_files_enabled():
        raise HTTPException(
            status_code=410,
            detail="Legacy /files API is disabled. Upload PDFs via slot documents instead.",
        )


@app.get("/files", response_model=List[FileInfo])
async def list_files(request: Request):
    _require_legacy_files_api()
    role = _require_permission(request, "document.view")
    _require_client_scope(request, role)
    ctx = _auth_context(request)
    firm_dir = (STORAGE_DIR / ctx.firm_id).resolve()
    files: List[FileInfo] = []
    for file_path in sorted(firm_dir.glob("*.pdf")) if firm_dir.is_dir() else []:
        stat = file_path.stat()
        updated_at = datetime.fromtimestamp(stat.st_mtime).isoformat()
        encoded_name = urllib.parse.quote(file_path.name)
        files.append(
            FileInfo(
                id=file_path.stem,
                name=file_path.name,
                updated_at=updated_at,
                url=f"{str(request.base_url).rstrip('/')}/files/{encoded_name}",
            )
        )
    _log_audit_event(request, "files.list", "success", f"count={len(files)}")
    return files


@app.get("/files/{filename}")
async def get_file(filename: str, request: Request):
    _require_legacy_files_api()
    role = _require_permission(request, "document.view")
    _require_client_scope(request, role)
    ctx = _auth_context(request)
    firm_dir = (STORAGE_DIR / ctx.firm_id).resolve()
    decoded_name = urllib.parse.unquote(filename)
    file_path = (firm_dir / decoded_name).resolve()
    if not file_path.exists() or file_path.suffix.lower() != ".pdf":
        raise HTTPException(status_code=404, detail="File not found")
    if firm_dir not in file_path.parents:
        raise HTTPException(status_code=400, detail="Invalid file path")
    return FileResponse(file_path, media_type="application/pdf", filename=file_path.name)


@app.get("/api/audit-links/{version_id}", response_model=List[AuditLink])
async def list_audit_links(version_id: str, request: Request):
    # audit links are part of document review workflow
    # allow anyone who can view documents
    # role is required to avoid bypass from anonymous calls
    # this keeps backend and frontend permissions aligned
    role = _require_permission(request, "document.view")
    version_client_id = resolve_version_client_id(version_id)
    if not version_client_id:
        raise HTTPException(status_code=404, detail="Version not found")
    _require_client_access(request, role, version_client_id)
    with _get_db_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                link_id, created_at,
                left_side, left_page, left_x, left_y, left_file_name,
                left_file_hash,
                right_side, right_page, right_x, right_y, right_file_name,
                right_file_hash,
                created_by, comment
            FROM audit_links
            WHERE version_id = ?
            ORDER BY created_at ASC, link_id ASC
            """,
            (version_id,),
        ).fetchall()

    result = [
        AuditLink(
            id=row["link_id"],
            createdAt=row["created_at"],
            left=AuditPoint(
                side=row["left_side"],
                page=row["left_page"],
                x=row["left_x"],
                y=row["left_y"],
                fileName=row["left_file_name"],
                fileHash=row["left_file_hash"],
            ),
            right=AuditPoint(
                side=row["right_side"],
                page=row["right_page"],
                x=row["right_x"],
                y=row["right_y"],
                fileName=row["right_file_name"],
                fileHash=row["right_file_hash"],
            ),
            createdBy=row["created_by"],
            comment=row["comment"],
        )
        for row in rows
    ]
    _log_audit_event(request, "audit_links.list", "success", f"version={version_id} count={len(result)}")
    return result


@app.post("/api/audit-links/{version_id}", response_model=List[AuditLink])
async def save_audit_links(version_id: str, links: List[AuditLink], request: Request):
    role = _require_permission(request, "audit.link")
    version_client_id = resolve_version_client_id(version_id)
    if not version_client_id:
        raise HTTPException(status_code=404, detail="Version not found")
    _require_client_access(request, role, version_client_id)
    with _get_db_connection() as conn:
        conn.execute("DELETE FROM audit_links WHERE version_id = ?", (version_id,))
        conn.executemany(
            """
            INSERT INTO audit_links (
                version_id, link_id, created_at,
                left_side, left_page, left_x, left_y, left_file_name, left_file_hash,
                right_side, right_page, right_x, right_y, right_file_name, right_file_hash,
                created_by, comment
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    version_id,
                    link.id,
                    link.createdAt,
                    link.left.side,
                    link.left.page,
                    link.left.x,
                    link.left.y,
                    link.left.fileName,
                    link.left.fileHash,
                    link.right.side,
                    link.right.page,
                    link.right.x,
                    link.right.y,
                    link.right.fileName,
                    link.right.fileHash,
                    link.createdBy,
                    link.comment,
                )
                for link in links
            ],
        )
    _log_audit_event(request, "audit_links.save", "success", f"version={version_id} count={len(links)}")
    return links


@app.post("/api/audit/auto-link")
async def audit_auto_link(
    body: AutoLinkRequest,
    request: Request,
    background_tasks: BackgroundTasks,
):
    """証憑 PDF 内の数値を自動検索し、監査メタデータ付きスタンプを刻み込む。"""
    role = _require_permission(request, "audit.link")
    _require_client_scope(request, role)
    identity = resolve_identity(request)

    logical = None
    if body.version_id:
        version_client_id = resolve_version_client_id(body.version_id)
        if not version_client_id:
            raise HTTPException(status_code=404, detail="Version not found")
        _require_client_access(request, role, version_client_id)
        version_row = get_version(body.version_id)
        if version_row:
            logical = get_logical_by_id(version_row.logical_document_id)

    ocr_job_id: str | None = None
    if body.trigger_ocr and body.version_id and logical:
        ctx = _auth_context(request)
        job = create_ocr_job(
            firm_id=ctx.firm_id,
            client_id=logical.client_id,
            document_version_id=body.version_id,
            period_key=logical.period_key,
            slot_id=logical.slot_id,
            slot_label=logical.title,
        )
        ocr_job_id = job["id"]
        background_tasks.add_task(run_ocr_job, ocr_job_id)

    result = run_auto_vouch(
        pdf_file_path=body.pdf_file_path,
        version_id=body.version_id,
        target_value=body.target_value,
        user_id=body.user_id,
        field_id=body.field_id,
        match_strategy=body.match_strategy,
        context_hint=body.context_hint,
        dry_run=body.dry_run,
        create_version=body.create_version,
        queue_on_ocr=body.queue_on_ocr or body.trigger_ocr,
        stakeholder_id=identity.stakeholder_id,
        email=identity.email,
        ocr_job_id=ocr_job_id,
    )

    if result.status == "success" and result.new_version_id and logical:
        new_ver = get_version(result.new_version_id)
        if new_ver:
            _update_slot_current_version(
                client_id=logical.client_id,
                period_key=logical.period_key,
                slot_id=logical.slot_id,
                version=new_ver,
                slot_label=logical.title,
                uploaded_by=identity.stakeholder_id or identity.email or body.user_id,
            )

    action = "audit.auto_link.preview" if body.dry_run else "audit.auto_link"
    if result.status == "success":
        _log_audit_event(
            request,
            action,
            "success",
            f"field={body.field_id} matches={len(result.matched_coordinates)} stamp={result.stamp_id}",
        )
    else:
        _log_audit_event(
            request,
            action,
            "error",
            f"field={body.field_id} msg={result.message[:200]}",
        )

    response_body = result.to_response()
    if ocr_job_id and not response_body.get("ocr_job_id"):
        response_body["ocr_job_id"] = ocr_job_id
    return JSONResponse(status_code=result.http_status(), content=response_body)


@app.get("/api/audit/auto-link/fields")
async def list_auto_vouch_field_defs(request: Request):
    role = _require_permission(request, "audit.link")
    _require_client_scope(request, role)
    fields = list_auto_vouch_fields()
    _log_audit_event(request, "audit.auto_link.fields", "success", f"count={len(fields)}")
    return {"fields": fields}


@app.get("/api/audit/auto-link/stamps", response_model=List[AutoVouchStampItem])
async def list_auto_vouch_stamps(
    request: Request,
    source_pdf_path: str | None = Query(None),
    version_id: str | None = Query(None),
    field_id: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    role = _require_permission(request, "audit.link")
    _require_client_scope(request, role)
    if version_id:
        version_client_id = resolve_version_client_id(version_id)
        if not version_client_id:
            raise HTTPException(status_code=404, detail="Version not found")
        _require_client_access(request, role, version_client_id)
    rows = list_vouch_stamps(
        source_pdf_path=source_pdf_path,
        version_id=version_id,
        field_id=field_id,
        limit=limit,
    )
    _log_audit_event(request, "audit.auto_link.list", "success", f"rows={len(rows)}")
    return rows


@app.get("/api/audit/auto-link/stamps/{stamp_id}", response_model=AutoVouchStampItem)
async def get_auto_vouch_stamp(stamp_id: str, request: Request):
    role = _require_permission(request, "audit.link")
    _require_client_scope(request, role)
    row = get_vouch_stamp(stamp_id)
    if not row:
        raise HTTPException(status_code=404, detail="Stamp not found")
    _log_audit_event(request, "audit.auto_link.get", "success", f"stamp={stamp_id}")
    return row


@app.get("/api/audit/auto-link/stamps/{stamp_id}/file")
async def get_auto_vouch_stamp_file(stamp_id: str, request: Request):
    """スタンプ済み PDF を返す（プレビュー・ダウンロード用）。"""
    role = _require_permission(request, "audit.link")
    _require_client_scope(request, role)
    row = get_vouch_stamp(stamp_id)
    if not row:
        raise HTTPException(status_code=404, detail="Stamp not found")
    try:
        file_path = resolve_stamp_output_path(stamp_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "audit.auto_link.file", "success", f"stamp={stamp_id}")
    return FileResponse(
        file_path,
        media_type="application/pdf",
        filename=file_path.name,
    )


@app.get("/api/audit/auto-link/suggest")
async def suggest_auto_vouch_from_metric(
    request: Request,
    metric_key: str = Query(..., min_length=1),
    value_yen: int | None = Query(None),
    value_num: float | None = Query(None),
):
    """client_metrics の metric_key から Auto-Vouch パラメータを提案する。"""
    role = _require_permission(request, "audit.link")
    _require_client_scope(request, role)
    suggestion = suggest_from_metric(
        metric_key=metric_key,
        value_yen=value_yen,
        value_num=value_num,
    )
    if not suggestion:
        raise HTTPException(status_code=404, detail="No mapping for metric_key or missing value")
    _log_audit_event(
        request,
        "audit.auto_link.suggest",
        "success",
        f"metric={metric_key} field={suggestion.get('field_id')}",
    )
    return suggestion


class SlotDocumentItem(BaseModel):
    id: str
    client_id: str
    period_key: str
    slot_id: str
    slot_label: Optional[str] = None
    original_name: str
    page_count: Optional[int] = None
    content_sha256: str
    byte_size: int
    uploaded_by: Optional[str] = None
    uploaded_at: str
    logical_document_id: Optional[str] = None
    current_version_id: Optional[str] = None
    current_version_label: Optional[str] = None
    workflow_status: Optional[str] = None
    docugrid_document_id: Optional[str] = None
    logical_status: Optional[str] = None
    classify_metadata: Optional[dict] = None
    google_drive_file_id: Optional[str] = None
    version_count: Optional[int] = None
    normalize_result: Optional[dict] = None
    ocr_job_id: Optional[str] = None
    deleted_at: Optional[str] = None
    deleted_from_slot_id: Optional[str] = None
    deleted_from_slot_label: Optional[str] = None
    client_shared_at: Optional[str] = None
    client_shared_by: Optional[str] = None


class DocumentVersionItem(BaseModel):
    id: str
    logical_document_id: str
    version_label: str
    content_sha256: str
    byte_size: int
    page_count: Optional[int] = None
    original_name: str
    source: str
    parent_version_id: Optional[str] = None
    created_by_stakeholder_id: Optional[str] = None
    created_by_email: Optional[str] = None
    created_at: str


def _row_to_slot_item(row: sqlite3.Row) -> SlotDocumentItem:
    return SlotDocumentItem(
        id=row["id"],
        client_id=row["client_id"],
        period_key=row["period_key"],
        slot_id=row["slot_id"],
        slot_label=row["slot_label"],
        original_name=row["original_name"],
        page_count=row["page_count"],
        content_sha256=row["content_sha256"],
        byte_size=row["byte_size"],
        uploaded_by=row["uploaded_by"],
        uploaded_at=row["uploaded_at"],
        logical_document_id=row["logical_document_id"] if "logical_document_id" in row.keys() else None,
        current_version_id=row["current_version_id"] if "current_version_id" in row.keys() else None,
        current_version_label=None,
        workflow_status=None,
        docugrid_document_id=row["docugrid_document_id"] if "docugrid_document_id" in row.keys() else None,
        logical_status=None,
        google_drive_file_id=row["google_drive_file_id"] if "google_drive_file_id" in row.keys() else None,
        deleted_at=row["deleted_at"] if "deleted_at" in row.keys() else None,
        deleted_from_slot_id=row["deleted_from_slot_id"] if "deleted_from_slot_id" in row.keys() else None,
        deleted_from_slot_label=row["deleted_from_slot_label"] if "deleted_from_slot_label" in row.keys() else None,
        client_shared_at=row["client_shared_at"] if "client_shared_at" in row.keys() else None,
        client_shared_by=row["client_shared_by"] if "client_shared_by" in row.keys() else None,
    )


def _latest_workflow_status(client_id: str, period_key: str, slot_id: str) -> Optional[str]:
    _init_review_events_db()
    with sqlite3.connect(REVIEW_EVENTS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            """
            SELECT status FROM review_events
            WHERE client_id=? AND period_key=? AND slot_id=?
            ORDER BY created_at DESC, rowid DESC
            LIMIT 1
            """,
            (client_id, period_key, slot_id),
        ).fetchone()
    return row["status"] if row else None


def _enrich_slot_item(row: sqlite3.Row) -> SlotDocumentItem:
    item = _row_to_slot_item(row)
    if item.current_version_id:
        version = get_version(item.current_version_id)
        if version:
            item.current_version_label = version.version_label
            if version.metadata_json:
                try:
                    item.classify_metadata = json.loads(version.metadata_json)
                except json.JSONDecodeError:
                    item.classify_metadata = None
    item.workflow_status = _latest_workflow_status(
        row["client_id"],
        row["period_key"],
        row["deleted_from_slot_id"] if row["deleted_from_slot_id"] else row["slot_id"],
    )
    logical_id = row["logical_document_id"] if "logical_document_id" in row.keys() else None
    logical = get_logical_by_id(logical_id) if logical_id else get_logical_by_slot(
        row["client_id"], row["period_key"], row["slot_id"]
    )
    if logical:
        item.logical_status = logical.status
        item.version_count = count_versions(logical.id)
    return item


def _version_to_item(v) -> DocumentVersionItem:
    return DocumentVersionItem(
        id=v.id,
        logical_document_id=v.logical_document_id,
        version_label=v.version_label,
        content_sha256=v.content_sha256,
        byte_size=v.byte_size,
        page_count=v.page_count,
        original_name=v.original_name,
        source=v.source,
        parent_version_id=v.parent_version_id,
        created_by_stakeholder_id=v.created_by_stakeholder_id,
        created_by_email=v.created_by_email,
        created_at=v.created_at,
    )


class ReviewEventCreate(BaseModel):
    client_id: str
    period_key: str
    slot_id: str
    content_sha256: Optional[str] = None
    version_label: Optional[str] = None
    event_type: str
    status: Optional[str] = None
    action_title: Optional[str] = None
    reason: Optional[str] = None
    is_major: bool = False
    logical_document_id: Optional[str] = None
    document_version_id: Optional[str] = None
    detail: Optional[str] = None


class ReviewEventBatchCreate(BaseModel):
    events: List[ReviewEventCreate]


class ReviewEventItem(BaseModel):
    id: str
    client_id: str
    period_key: str
    slot_id: str
    content_sha256: Optional[str] = None
    version_label: Optional[str] = None
    event_type: str
    status: Optional[str] = None
    action_title: Optional[str] = None
    reason: Optional[str] = None
    actor_stakeholder_id: Optional[str] = None
    actor_email: Optional[str] = None
    actor_role: Optional[str] = None
    is_major: bool = False
    created_at: str
    logical_document_id: Optional[str] = None
    document_version_id: Optional[str] = None
    detail: Optional[str] = None


class ReviewTimelineItem(ReviewEventItem):
    slot_label: Optional[str] = None


def _row_to_review_event(row: sqlite3.Row) -> ReviewEventItem:
    keys = row.keys()
    return ReviewEventItem(
        id=row["id"],
        client_id=row["client_id"],
        period_key=row["period_key"],
        slot_id=row["slot_id"],
        content_sha256=row["content_sha256"],
        version_label=row["version_label"],
        event_type=row["event_type"],
        status=row["status"],
        action_title=row["action_title"],
        reason=row["reason"],
        actor_stakeholder_id=row["actor_stakeholder_id"],
        actor_email=row["actor_email"],
        actor_role=row["actor_role"],
        is_major=bool(row["is_major"]),
        created_at=row["created_at"],
        logical_document_id=row["logical_document_id"] if "logical_document_id" in keys else None,
        document_version_id=row["document_version_id"] if "document_version_id" in keys else None,
        detail=row["detail"] if "detail" in keys else None,
    )


def _append_review_event(
    *,
    client_id: str,
    period_key: str,
    slot_id: str,
    event_type: str,
    content_sha256: Optional[str] = None,
    version_label: Optional[str] = None,
    status: Optional[str] = None,
    action_title: Optional[str] = None,
    reason: Optional[str] = None,
    actor_stakeholder_id: Optional[str] = None,
    actor_email: Optional[str] = None,
    actor_role: Optional[str] = None,
    is_major: bool = False,
    logical_document_id: Optional[str] = None,
    document_version_id: Optional[str] = None,
    detail: Optional[str] = None,
) -> ReviewEventItem:
    """追記専用（append-only）の業務監査イベントを記録する。"""
    _init_review_events_db()
    event_id = uuid.uuid4().hex
    now = datetime.utcnow().isoformat()
    event_firm_id = get_client_firm_id(client_id)
    with sqlite3.connect(REVIEW_EVENTS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        conn.execute(
            """
            INSERT INTO review_events
                (id, client_id, period_key, slot_id, content_sha256, version_label,
                 event_type, status, action_title, reason,
                 actor_stakeholder_id, actor_email, actor_role, is_major, created_at,
                 logical_document_id, document_version_id, detail, firm_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                client_id,
                period_key,
                slot_id,
                content_sha256,
                version_label,
                event_type,
                status,
                action_title,
                reason,
                actor_stakeholder_id,
                actor_email,
                actor_role,
                1 if is_major else 0,
                now,
                logical_document_id,
                document_version_id,
                detail,
                event_firm_id,
            ),
        )
        row = conn.execute("SELECT * FROM review_events WHERE id=?", (event_id,)).fetchone()
    return _row_to_review_event(row)


@app.post("/api/slots", response_model=SlotDocumentItem)
async def upsert_slot_document(
    request: Request,
    background_tasks: BackgroundTasks,
    client_id: str = Form(...),
    period_key: str = Form(...),
    slot_id: str = Form(...),
    slot_label: Optional[str] = Form(None),
    classify_metadata: Optional[str] = Form(None),
    async_classify: Optional[str] = Form(None),
    file: UploadFile = File(...),
):
    role = _require_permission(request, "document.upload")
    _require_client_access(request, role, client_id)
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    try:
        doc = fitz.open("pdf", content)
        page_count = len(doc)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid PDF")
    sha = hashlib.sha256(content).hexdigest()
    identity = resolve_identity(request)
    uploaded_by = identity.stakeholder_id or identity.email or ""
    now = datetime.utcnow().isoformat()
    auto_share_with_client = _is_client_portal_role(identity.role)
    client_shared_at = now if auto_share_with_client else None
    client_shared_by = uploaded_by if auto_share_with_client else None
    title = slot_label or f"slot-{slot_id}"

    metadata_json: Optional[str] = None
    if classify_metadata:
        try:
            meta_obj = json.loads(classify_metadata)
            meta_obj = enrich_classify_metadata(
                meta_obj,
                client_id=client_id,
                period_key=period_key,
                slot_id=slot_id,
            )
            metadata_json = json.dumps(meta_obj, ensure_ascii=False)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="classify_metadata must be valid JSON")

    logical = ensure_logical_document(
        client_id=client_id,
        period_key=period_key,
        slot_id=slot_id,
        title=title,
    )
    if logical.current_version_id:
        set_logical_status(logical.id, "processing")
    parent_id = logical.current_version_id
    version = create_document_version(
        logical_id=logical.id,
        content=content,
        original_name=file.filename or "document.pdf",
        content_sha256=sha,
        source="client_upload",
        bump="upload",
        parent_version_id=parent_id,
        created_by_stakeholder_id=identity.stakeholder_id,
        created_by_email=identity.email,
        page_count=page_count,
        metadata_json=metadata_json,
    )

    client_firm = get_client_firm_id(client_id)
    _init_slot_documents_db()
    existing_drive_file_id: Optional[str] = None
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        prev_row = conn.execute(
            "SELECT id, google_drive_file_id FROM slot_documents WHERE client_id=? AND period_key=? AND slot_id=?",
            (client_id, period_key, slot_id),
        ).fetchone()
        if prev_row:
            existing_drive_file_id = prev_row["google_drive_file_id"]

    drive_cfg = _load_system_config(client_firm)
    drive_file_id = maybe_upload_slot_to_drive(
        firm_id=client_firm,
        drive_connected=drive_cfg.google_drive_connected,
        drive_root_folder_id=drive_cfg.drive_root_folder_id,
        client_id=client_id,
        period_key=period_key,
        slot_label=slot_label or title,
        content=content,
        filename=file.filename or "document.pdf",
        existing_file_id=existing_drive_file_id,
    )
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        prev = conn.execute(
            "SELECT id FROM slot_documents WHERE client_id=? AND period_key=? AND slot_id=?",
            (client_id, period_key, slot_id),
        ).fetchone()
        if prev:
            doc_id = prev["id"]
            conn.execute(
                """
                UPDATE slot_documents SET
                    slot_label=?, original_name=?, storage_key=?,
                    page_count=?, content_sha256=?, byte_size=?, uploaded_by=?, uploaded_at=?,
                    logical_document_id=?, current_version_id=?, firm_id=?, google_drive_file_id=?,
                    client_shared_at=?, client_shared_by=?
                WHERE id=?
                """,
                (
                    slot_label,
                    file.filename or "document.pdf",
                    version.storage_key,
                    page_count,
                    sha,
                    len(content),
                    uploaded_by,
                    now,
                    logical.id,
                    version.id,
                    client_firm,
                    drive_file_id,
                    client_shared_at,
                    client_shared_by,
                    doc_id,
                ),
            )
        else:
            doc_id = uuid.uuid4().hex
            conn.execute(
                """
                INSERT INTO slot_documents
                    (id, client_id, period_key, slot_id, slot_label, original_name, storage_key,
                     page_count, content_sha256, byte_size, uploaded_by, uploaded_at,
                     logical_document_id, current_version_id, firm_id, google_drive_file_id,
                     client_shared_at, client_shared_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    doc_id,
                    client_id,
                    period_key,
                    slot_id,
                    slot_label,
                    file.filename or "document.pdf",
                    version.storage_key,
                    page_count,
                    sha,
                    len(content),
                    uploaded_by,
                    now,
                    logical.id,
                    version.id,
                    client_firm,
                    drive_file_id,
                    client_shared_at,
                    client_shared_by,
                ),
            )
        row = conn.execute("SELECT * FROM slot_documents WHERE id=?", (doc_id,)).fetchone()
    item = _enrich_slot_item(row)
    _log_audit_event(
        request,
        "slot.upload",
        "success",
        f"client={client_id} period={period_key} slot={slot_id} ver={version.version_label}",
    )
    _append_review_event(
        client_id=client_id,
        period_key=period_key,
        slot_id=slot_id,
        event_type="upload",
        content_sha256=sha,
        version_label=version.version_label,
        status="draft",
        action_title=f"アップロード: {file.filename or 'document.pdf'}",
        actor_stakeholder_id=identity.stakeholder_id or None,
        actor_email=identity.email or None,
        actor_role=role,
        is_major=version.version_label == "v1.0.0",
        logical_document_id=logical.id,
        document_version_id=version.id,
    )
    if auto_share_with_client:
        _append_review_event(
            client_id=client_id,
            period_key=period_key,
            slot_id=slot_id,
            event_type="client_share",
            action_title="クライアントへ共有（自動）",
            reason=f"枠「{title}」· クライアント提出",
            actor_stakeholder_id=identity.stakeholder_id or None,
            actor_email=identity.email or None,
            actor_role=role,
            is_major=True,
            logical_document_id=logical.id,
            document_version_id=version.id,
            detail=f"doc_id={doc_id}; auto_share=1",
        )
    defer_normalize = async_classify is not None and async_classify.strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    if defer_normalize:
        job = create_ocr_job(
            firm_id=client_firm,
            client_id=client_id,
            document_version_id=version.id,
            period_key=period_key,
            slot_id=slot_id,
            slot_label=slot_label or title,
        )
        background_tasks.add_task(run_ocr_job, job["id"])
        item.ocr_job_id = job["id"]
        _log_audit_event(
            request,
            "ocr.job",
            "queued",
            f"job={job['id']} ver={version.id} source=slot.upload",
        )
    else:
        norm = ingest_from_slot_document(
            firm_id=client_firm,
            client_id=client_id,
            period_key=period_key,
            slot_id=slot_id,
            slot_label=slot_label or title,
            pdf_content=content,
            classify_metadata=json.loads(metadata_json) if metadata_json else None,
            updated_by=identity.email or uploaded_by,
            updated_by_id=identity.stakeholder_id,
        )
        if norm.applied or norm.metrics_applied:
            _log_audit_event(
                request,
                "ssot.normalize",
                "success",
                f"client={client_id} applied={len(norm.applied)} metrics={len(norm.metrics_applied)}",
            )
        item.normalize_result = ingest_result_for_response(norm)
        if norm.extraction_review:
            try:
                from services.ocr_job_service import update_version_metadata

                review = norm.extraction_review
                base_meta: dict = {}
                if metadata_json:
                    base_meta = json.loads(metadata_json)
                enriched = enrich_classify_metadata(
                    {
                        **base_meta,
                        "confidence": float(base_meta.get("confidence") or 1.0),
                        "engine": base_meta.get("engine") or "schema",
                        "extracted_profile": review.get("extracted_profile"),
                        "field_extractions": review.get("fields"),
                        "extraction_review_status": review.get("review_status"),
                        "schema_version": review.get("schema_version"),
                    },
                    client_id=client_id,
                    period_key=period_key,
                    slot_id=slot_id,
                )
                update_version_metadata(version.id, enriched)
                item.classify_metadata = enriched
            except Exception:
                pass
    return item


@app.get("/api/slots", response_model=List[SlotDocumentItem])
async def list_slot_documents(
    request: Request,
    client_id: str = Query(...),
    period_key: Optional[str] = Query(None),
    include_deleted: bool = Query(False),
):
    role = _require_permission(request, "document.view")
    _require_client_access(request, role, client_id)
    if include_deleted:
        _require_permission(request, "document.purge")
    _init_slot_documents_db()
    access_clause = _slot_access_sql_filters(request, include_deleted=include_deleted)
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        if period_key:
            rows = conn.execute(
                f"SELECT * FROM slot_documents WHERE client_id=? AND period_key=?{access_clause} ORDER BY slot_id",
                (client_id, period_key),
            ).fetchall()
        else:
            rows = conn.execute(
                f"SELECT * FROM slot_documents WHERE client_id=?{access_clause} ORDER BY period_key, slot_id",
                (client_id,),
            ).fetchall()
    return [_enrich_slot_item(r) for r in rows]


@app.get("/api/slots/{doc_id}/file")
async def get_slot_document_file(request: Request, doc_id: str):
    role = _require_permission(request, "document.view")
    _init_slot_documents_db()
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM slot_documents WHERE id=?", (doc_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    _require_client_access(request, role, row["client_id"])
    _deny_soft_deleted_row_unless_purge(request, row)
    _deny_client_slot_unless_shared(request, row)
    logical_id = row["logical_document_id"] if "logical_document_id" in row.keys() else None
    _deny_if_logical_purged(logical_id)
    ctx = _auth_context(request)
    row_firm = row["firm_id"] if "firm_id" in row.keys() and row["firm_id"] else None
    if row_firm:
        authorize_firm_resource(ctx, str(row_firm))
    path = resolve_storage_path(row["storage_key"])
    if not path.exists():
        drive_id = row["google_drive_file_id"] if "google_drive_file_id" in row.keys() else None
        if drive_id:
            cfg = _load_system_config(ctx.firm_id)
            if cfg.google_drive_connected:
                remote = fetch_slot_from_drive(ctx.firm_id, drive_id)
                if remote:
                    _log_audit_event(
                        request,
                        "slot.download",
                        "success",
                        f"id={doc_id} client={row['client_id']} source=drive",
                    )
                    return Response(
                        content=remote,
                        media_type="application/pdf",
                        headers={
                            "Content-Disposition": f'inline; filename="{row["original_name"]}"',
                        },
                    )
        raise HTTPException(status_code=404, detail="File missing")
    _log_audit_event(request, "slot.download", "success", f"id={doc_id} client={row['client_id']}")
    return FileResponse(str(path), media_type="application/pdf", filename=row["original_name"])


@app.delete("/api/slots/{doc_id}")
async def delete_slot_document(request: Request, doc_id: str, mode: str = "delete"):
    if mode == "purge":
        role = _require_permission(request, "document.purge")
    elif mode == "detach":
        role = _require_permission(request, "document.upload")
    else:
        role = _require_permission(request, "document.upload")
    _init_slot_documents_db()
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM slot_documents WHERE id=?", (doc_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        _require_client_access(request, role, row["client_id"])
        if mode == "detach":
            if row["deleted_at"] if "deleted_at" in row.keys() else None:
                raise HTTPException(status_code=409, detail="Cannot detach deleted document")
            unassigned_id = f"unassigned_{doc_id}"
            conn.execute(
                """
                UPDATE slot_documents
                SET slot_id=?, slot_label=COALESCE(slot_label, original_name)
                WHERE id=?
                """,
                (unassigned_id, doc_id),
            )
            _log_audit_event(
                request,
                "slot.detach",
                "success",
                f"doc_id={doc_id} slot={unassigned_id} period={row['period_key']}",
            )
            return {"ok": True, "mode": "detach", "slot_id": unassigned_id}

        identity = resolve_identity(request)
        logical_id = row["logical_document_id"] if "logical_document_id" in row.keys() else None
        origin_slot_id = (
            row["deleted_from_slot_id"]
            if row["deleted_from_slot_id"]
            else row["slot_id"]
        )
        slot_label = (
            (row["deleted_from_slot_label"] or row["slot_label"] or "").strip()
            if ("deleted_from_slot_label" in row.keys() and row["deleted_from_slot_label"])
            or ("slot_label" in row.keys() and row["slot_label"])
            else str(origin_slot_id)
        )

        if mode == "purge":
            _append_review_event(
                client_id=row["client_id"],
                period_key=row["period_key"],
                slot_id=origin_slot_id,
                event_type="document_delete",
                action_title="資料を完全削除",
                reason=f"枠「{slot_label}」",
                actor_stakeholder_id=identity.stakeholder_id,
                actor_email=identity.email,
                actor_role=identity.role,
                is_major=True,
                logical_document_id=logical_id,
                detail=f"slot_id={origin_slot_id}; period={row['period_key']}",
            )
            if logical_id:
                set_logical_status(logical_id, "deleted")
                redact_logical_document_filenames(logical_id)
            if "/versions/" not in str(row["storage_key"]):
                path = resolve_storage_path(row["storage_key"])
                try:
                    if path.exists():
                        path.unlink()
                except OSError:
                    pass
            conn.execute("DELETE FROM slot_documents WHERE id=?", (doc_id,))
            _log_audit_event(
                request,
                "slot.purge",
                "success",
                f"doc_id={doc_id} slot={origin_slot_id} period={row['period_key']}",
            )
            return {"ok": True, "mode": "purge"}

        # Soft delete (default) — 復元可能
        if row["deleted_at"] if "deleted_at" in row.keys() else None:
            raise HTTPException(status_code=409, detail="Already deleted")
        now = datetime.utcnow().isoformat()
        deleted_slot_id = f"deleted_{doc_id}"
        conn.execute(
            """
            UPDATE slot_documents
            SET slot_id=?,
                deleted_at=?,
                deleted_from_slot_id=?,
                deleted_from_slot_label=COALESCE(slot_label, original_name),
                client_shared_at=NULL,
                client_shared_by=NULL
            WHERE id=?
            """,
            (deleted_slot_id, now, row["slot_id"], doc_id),
        )
        if logical_id:
            set_logical_status(logical_id, "soft_deleted")
        _append_review_event(
            client_id=row["client_id"],
            period_key=row["period_key"],
            slot_id=row["slot_id"],
            event_type="document_soft_delete",
            action_title="資料を削除（復元可能）",
            reason=f"枠「{slot_label}」",
            actor_stakeholder_id=identity.stakeholder_id,
            actor_email=identity.email,
            actor_role=identity.role,
            is_major=True,
            logical_document_id=logical_id,
            detail=f"slot_id={row['slot_id']}; period={row['period_key']}; doc_id={doc_id}",
        )
    _log_audit_event(
        request,
        "slot.soft_delete",
        "success",
        f"doc_id={doc_id} slot={row['slot_id']} period={row['period_key']}",
    )
    return {"ok": True, "mode": "delete"}


@app.post("/api/slots/{doc_id}/restore")
async def restore_slot_document(request: Request, doc_id: str):
    role = _require_permission(request, "document.purge")
    _init_slot_documents_db()
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM slot_documents WHERE id=?", (doc_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        _require_client_access(request, role, row["client_id"])
        deleted_at = row["deleted_at"] if "deleted_at" in row.keys() else None
        if not deleted_at:
            raise HTTPException(status_code=409, detail="Document is not deleted")
        restore_slot_id = row["deleted_from_slot_id"] if "deleted_from_slot_id" in row.keys() else None
        if not restore_slot_id:
            raise HTTPException(status_code=409, detail="Restore origin missing")
        logical_id = row["logical_document_id"] if "logical_document_id" in row.keys() else None
        if logical_id and not is_logical_soft_deleted(logical_id):
            raise HTTPException(status_code=409, detail="Document cannot be restored")
        conflict = conn.execute(
            """
            SELECT id FROM slot_documents
            WHERE client_id=? AND period_key=? AND slot_id=? AND id<>?
              AND (deleted_at IS NULL OR deleted_at = '')
            """,
            (row["client_id"], row["period_key"], restore_slot_id, doc_id),
        ).fetchone()
        if conflict:
            raise HTTPException(status_code=409, detail="Slot already occupied")
        restore_label = row["deleted_from_slot_label"] if "deleted_from_slot_label" in row.keys() else None
        conn.execute(
            """
            UPDATE slot_documents
            SET slot_id=?,
                slot_label=COALESCE(?, slot_label),
                deleted_at=NULL,
                deleted_from_slot_id=NULL,
                deleted_from_slot_label=NULL
            WHERE id=?
            """,
            (restore_slot_id, restore_label, doc_id),
        )
        updated = conn.execute("SELECT * FROM slot_documents WHERE id=?", (doc_id,)).fetchone()
    if logical_id:
        try:
            restore_logical_document(logical_id)
        except ValueError as exc:
            if str(exc) == "not_soft_deleted":
                raise HTTPException(status_code=409, detail="Document cannot be restored")
            raise
    identity = resolve_identity(request)
    slot_label = (restore_label or restore_slot_id or "").strip() or restore_slot_id
    _append_review_event(
        client_id=row["client_id"],
        period_key=row["period_key"],
        slot_id=restore_slot_id,
        event_type="document_restore",
        action_title="資料を復元",
        reason=f"枠「{slot_label}」",
        actor_stakeholder_id=identity.stakeholder_id,
        actor_email=identity.email,
        actor_role=identity.role,
        is_major=True,
        logical_document_id=logical_id,
        detail=f"slot_id={restore_slot_id}; period={row['period_key']}; doc_id={doc_id}",
    )
    _log_audit_event(
        request,
        "slot.restore",
        "success",
        f"doc_id={doc_id} slot={restore_slot_id} period={row['period_key']}",
    )
    return {"ok": True, "item": _enrich_slot_item(updated)}


@app.post("/api/slots/{doc_id}/share-with-client")
async def share_slot_with_client(request: Request, doc_id: str):
    """事務所アップロード資料をクライアントポータルへ明示的に公開する。"""
    role = _require_permission(request, "document.upload")
    identity = resolve_identity(request)
    if _is_client_portal_role(identity.role):
        raise HTTPException(status_code=403, detail="Firm users only")
    _init_slot_documents_db()
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM slot_documents WHERE id=?", (doc_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        _require_client_access(request, role, row["client_id"])
        if row["deleted_at"] if "deleted_at" in row.keys() else None:
            raise HTTPException(status_code=409, detail="Cannot share deleted document")
        if row["client_shared_at"] if "client_shared_at" in row.keys() else None:
            return {"ok": True, "already_shared": True, "item": _enrich_slot_item(row)}
        now = datetime.utcnow().isoformat()
        shared_by = identity.stakeholder_id or identity.email or ""
        conn.execute(
            "UPDATE slot_documents SET client_shared_at=?, client_shared_by=? WHERE id=?",
            (now, shared_by, doc_id),
        )
        updated = conn.execute("SELECT * FROM slot_documents WHERE id=?", (doc_id,)).fetchone()
    slot_label = (
        (row["slot_label"] or "").strip()
        if "slot_label" in row.keys() and row["slot_label"]
        else str(row["slot_id"])
    )
    _append_review_event(
        client_id=row["client_id"],
        period_key=row["period_key"],
        slot_id=row["slot_id"],
        event_type="client_share",
        action_title="クライアントへ共有",
        reason=f"枠「{slot_label}」",
        actor_stakeholder_id=identity.stakeholder_id,
        actor_email=identity.email,
        actor_role=identity.role,
        is_major=True,
        logical_document_id=row["logical_document_id"] if "logical_document_id" in row.keys() else None,
        detail=f"doc_id={doc_id}; period={row['period_key']}",
    )
    _log_audit_event(request, "slot.client_share", "success", f"doc_id={doc_id} client={row['client_id']}")
    return {"ok": True, "item": _enrich_slot_item(updated)}


@app.post("/api/slots/{doc_id}/unshare-with-client")
async def unshare_slot_with_client(request: Request, doc_id: str):
    """クライアントポータルへの共有を解除する（事務所のみ）。"""
    role = _require_permission(request, "document.upload")
    identity = resolve_identity(request)
    if _is_client_portal_role(identity.role):
        raise HTTPException(status_code=403, detail="Firm users only")
    _init_slot_documents_db()
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM slot_documents WHERE id=?", (doc_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        _require_client_access(request, role, row["client_id"])
        if row["deleted_at"] if "deleted_at" in row.keys() else None:
            raise HTTPException(status_code=409, detail="Cannot unshare deleted document")
        if not (row["client_shared_at"] if "client_shared_at" in row.keys() else None):
            return {"ok": True, "already_unshared": True, "item": _enrich_slot_item(row)}
        conn.execute(
            "UPDATE slot_documents SET client_shared_at=NULL, client_shared_by=NULL WHERE id=?",
            (doc_id,),
        )
        updated = conn.execute("SELECT * FROM slot_documents WHERE id=?", (doc_id,)).fetchone()
    slot_label = (
        (row["slot_label"] or "").strip()
        if "slot_label" in row.keys() and row["slot_label"]
        else str(row["slot_id"])
    )
    _append_review_event(
        client_id=row["client_id"],
        period_key=row["period_key"],
        slot_id=row["slot_id"],
        event_type="client_unshare",
        action_title="クライアント共有を解除",
        reason=f"枠「{slot_label}」",
        actor_stakeholder_id=identity.stakeholder_id,
        actor_email=identity.email,
        actor_role=identity.role,
        is_major=True,
        logical_document_id=row["logical_document_id"] if "logical_document_id" in row.keys() else None,
        detail=f"doc_id={doc_id}; period={row['period_key']}",
    )
    _log_audit_event(request, "slot.client_unshare", "success", f"doc_id={doc_id} client={row['client_id']}")
    return {"ok": True, "item": _enrich_slot_item(updated)}


@app.patch("/api/slots/{doc_id}")
async def move_slot_document(request: Request, doc_id: str):
    role = _require_permission(request, "document.upload")
    body = await request.json()
    slot_id = str(body.get("slot_id") or "").strip()
    slot_label = str(body.get("slot_label") or "").strip() or None
    if not slot_id:
        raise HTTPException(status_code=400, detail="slot_id required")
    _init_slot_documents_db()
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM slot_documents WHERE id=?", (doc_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        _require_client_access(request, role, row["client_id"])
        conflict = conn.execute(
            """
            SELECT id FROM slot_documents
            WHERE client_id=? AND period_key=? AND slot_id=? AND id<>?
            """,
            (row["client_id"], row["period_key"], slot_id, doc_id),
        ).fetchone()
        if conflict:
            raise HTTPException(status_code=409, detail="Slot already occupied")
        conn.execute(
            """
            UPDATE slot_documents
            SET slot_id=?, slot_label=COALESCE(?, slot_label)
            WHERE id=?
            """,
            (slot_id, slot_label, doc_id),
        )
        updated = conn.execute("SELECT * FROM slot_documents WHERE id=?", (doc_id,)).fetchone()
    _log_audit_event(
        request,
        "slot.move",
        "success",
        f"id={doc_id} client={row['client_id']} slot={slot_id}",
    )
    return dict(updated)


def _update_slot_current_version(
    *,
    client_id: str,
    period_key: str,
    slot_id: str,
    version,
    slot_label: Optional[str],
    uploaded_by: str,
) -> None:
    """slot_documents の current ポインタを最新版に更新する。"""
    client_firm = get_client_firm_id(client_id)
    _init_slot_documents_db()
    now = datetime.utcnow().isoformat()
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        prev = conn.execute(
            "SELECT id FROM slot_documents WHERE client_id=? AND period_key=? AND slot_id=?",
            (client_id, period_key, slot_id),
        ).fetchone()
        if prev:
            conn.execute(
                """
                UPDATE slot_documents SET
                    slot_label=COALESCE(?, slot_label), original_name=?, storage_key=?,
                    page_count=?, content_sha256=?, byte_size=?, uploaded_by=?, uploaded_at=?,
                    logical_document_id=?, current_version_id=?, firm_id=?
                WHERE id=?
                """,
                (
                    slot_label,
                    version.original_name,
                    version.storage_key,
                    version.page_count,
                    version.content_sha256,
                    version.byte_size,
                    uploaded_by,
                    now,
                    version.logical_document_id,
                    version.id,
                    client_firm,
                    prev["id"],
                ),
            )
        else:
            conn.execute(
                """
                INSERT INTO slot_documents
                    (id, client_id, period_key, slot_id, slot_label, original_name, storage_key,
                     page_count, content_sha256, byte_size, uploaded_by, uploaded_at,
                     logical_document_id, current_version_id, firm_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    uuid.uuid4().hex,
                    client_id,
                    period_key,
                    slot_id,
                    slot_label,
                    version.original_name,
                    version.storage_key,
                    version.page_count,
                    version.content_sha256,
                    version.byte_size,
                    uploaded_by,
                    now,
                    version.logical_document_id,
                    version.id,
                    client_firm,
                ),
            )


@app.get("/api/logical-documents/versions", response_model=List[DocumentVersionItem])
async def list_logical_document_versions(
    request: Request,
    client_id: str = Query(...),
    period_key: str = Query(...),
    slot_id: str = Query(...),
):
    role = _require_permission(request, "document.view")
    _require_client_access(request, role, client_id)
    logical = get_logical_by_slot(client_id, period_key, slot_id)
    if not logical or logical.status == "deleted":
        return []
    return [_version_to_item(v) for v in list_versions(logical.id)]


@app.get("/api/document-versions/{version_id}/file")
async def get_document_version_file(request: Request, version_id: str):
    role = _require_permission(request, "document.view")
    version = get_version(version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    init_document_versions_db()
    from services.document_version_service import VERSIONS_DB_PATH

    with sqlite3.connect(VERSIONS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        lrow = conn.execute(
            "SELECT client_id FROM logical_documents WHERE id=?",
            (version.logical_document_id,),
        ).fetchone()
    if not lrow:
        raise HTTPException(status_code=404, detail="Logical document not found")
    _require_client_access(request, role, lrow["client_id"])
    _deny_if_logical_purged(version.logical_document_id)
    vfirm = resolve_version_firm_id(version_id)
    if vfirm:
        authorize_firm_resource(_auth_context(request), vfirm)
    path = version_file_path(version)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File missing")
    _log_audit_event(request, "version.download", "success", f"version={version_id}")
    return FileResponse(str(path), media_type="application/pdf", filename=version.original_name)


@app.delete("/api/document-versions/{version_id}")
async def delete_document_version_endpoint(request: Request, version_id: str):
    role = _require_permission(request, "document.upload")
    version = get_version(version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    logical = get_logical_by_id(version.logical_document_id)
    if not logical:
        raise HTTPException(status_code=404, detail="Logical document not found")
    _require_client_access(request, role, logical.client_id)
    _deny_if_logical_deleted(logical.id)
    ctx = _auth_context(request)
    authorize_firm_resource(ctx, logical.firm_id)

    try:
        logical_after, deleted, promoted = delete_document_version(version_id)
    except ValueError as exc:
        code = str(exc)
        if code == "logical_deleted":
            raise HTTPException(status_code=410, detail="Document deleted")
        raise HTTPException(status_code=404, detail="Version not found")

    _init_audit_links_db()
    with sqlite3.connect(AUDIT_LINKS_DB_PATH) as conn:
        conn.execute("DELETE FROM audit_links WHERE version_id=?", (version_id,))

    _init_slot_documents_db()
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        slot_row = conn.execute(
            """
            SELECT id FROM slot_documents
            WHERE client_id=? AND period_key=? AND slot_id=? AND current_version_id=?
            """,
            (logical.client_id, logical.period_key, logical.slot_id, version_id),
        ).fetchone()
        if slot_row:
            if promoted:
                conn.execute(
                    """
                    UPDATE slot_documents SET
                        storage_key=?, page_count=?, content_sha256=?, byte_size=?,
                        current_version_id=?, uploaded_at=?
                    WHERE id=?
                    """,
                    (
                        promoted.storage_key,
                        promoted.page_count,
                        promoted.content_sha256,
                        promoted.byte_size,
                        promoted.id,
                        datetime.utcnow().isoformat(),
                        slot_row["id"],
                    ),
                )
            else:
                conn.execute("DELETE FROM slot_documents WHERE id=?", (slot_row["id"],))

    identity = resolve_identity(request)
    slot_label = logical.title or logical.slot_id
    _append_review_event(
        client_id=logical.client_id,
        period_key=logical.period_key,
        slot_id=logical.slot_id,
        event_type="version_delete",
        version_label=deleted.version_label,
        action_title=f"版 {deleted.version_label} を削除",
        reason=f"枠「{slot_label}」",
        actor_stakeholder_id=identity.stakeholder_id,
        actor_email=identity.email,
        actor_role=identity.role,
        is_major=True,
        logical_document_id=logical.id,
        detail=f"version_label={deleted.version_label}; slot_id={logical.slot_id}; period={logical.period_key}",
    )
    _log_audit_event(
        request,
        "version.delete",
        "success",
        f"version_label={deleted.version_label} slot={logical.slot_id} period={logical.period_key}",
    )
    return {
        "ok": True,
        "deleted_version_id": version_id,
        "deleted_version_label": deleted.version_label,
        "current_version_id": logical_after.current_version_id,
        "remaining_versions": count_versions(logical.id),
    }


@app.post("/api/document-versions", response_model=DocumentVersionItem)
async def post_document_version(
    request: Request,
    client_id: str = Form(...),
    period_key: str = Form(...),
    slot_id: str = Form(...),
    slot_label: Optional[str] = Form(None),
    bump: str = Form("minor"),
    file: UploadFile = File(...),
):
    """編集・監査・承認時の immutable 新版スナップショットを作成する。"""
    role = _require_permission(request, "document.upload")
    _require_client_access(request, role, client_id)
    if bump not in ("minor", "major", "audit_start"):
        raise HTTPException(status_code=400, detail="bump must be minor, major, or audit_start")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    try:
        page_count = len(fitz.open("pdf", content))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid PDF")
    sha = hashlib.sha256(content).hexdigest()
    identity = resolve_identity(request)
    uploaded_by = identity.stakeholder_id or identity.email or ""
    title = slot_label or f"slot-{slot_id}"
    logical = ensure_logical_document(
        client_id=client_id,
        period_key=period_key,
        slot_id=slot_id,
        title=title,
    )
    source_map = {
        "minor": "annotation_export",
        "major": "firm_upload",
        "audit_start": "firm_upload",
    }
    version = create_document_version(
        logical_id=logical.id,
        content=content,
        original_name=file.filename or "document.pdf",
        content_sha256=sha,
        source=source_map.get(bump, "annotation_export"),
        bump=bump,  # type: ignore[arg-type]
        parent_version_id=logical.current_version_id,
        created_by_stakeholder_id=identity.stakeholder_id,
        created_by_email=identity.email,
        page_count=page_count,
    )
    if bump == "major":
        mark_approved(logical.id, version.id)
    _update_slot_current_version(
        client_id=client_id,
        period_key=period_key,
        slot_id=slot_id,
        version=version,
        slot_label=slot_label,
        uploaded_by=uploaded_by,
    )
    _log_audit_event(
        request,
        "version.create",
        "success",
        f"client={client_id} slot={slot_id} ver={version.version_label} bump={bump}",
    )
    return _version_to_item(version)


@app.post("/api/review-events", response_model=ReviewEventItem)
async def create_review_event(request: Request, payload: ReviewEventCreate):
    role = _require_permission(request, "document.view")
    _require_client_access(request, role, payload.client_id)
    # 差戻しは理由必須（監査要件）
    if payload.event_type == "remand" and not (payload.reason and payload.reason.strip()):
        raise HTTPException(status_code=400, detail="remand requires a reason")
    identity = resolve_identity(request)
    item = _append_review_event(
        client_id=payload.client_id,
        period_key=payload.period_key,
        slot_id=payload.slot_id,
        event_type=payload.event_type,
        content_sha256=payload.content_sha256,
        version_label=payload.version_label,
        status=payload.status,
        action_title=payload.action_title,
        reason=payload.reason,
        actor_stakeholder_id=identity.stakeholder_id or None,
        actor_email=identity.email or None,
        actor_role=role,
        is_major=payload.is_major,
        logical_document_id=payload.logical_document_id,
        document_version_id=payload.document_version_id,
        detail=payload.detail,
    )
    if payload.logical_document_id:
        if payload.event_type == "approve" and payload.document_version_id:
            mark_approved(payload.logical_document_id, payload.document_version_id)
        elif payload.event_type == "remand":
            mark_remanded(payload.logical_document_id)
    _log_audit_event(
        request,
        "review_event.create",
        "success",
        f"client={payload.client_id} slot={payload.slot_id} type={payload.event_type}",
    )
    return item


@app.get("/api/review-events", response_model=List[ReviewEventItem])
async def list_review_events(
    request: Request,
    client_id: str = Query(...),
    period_key: Optional[str] = Query(None),
    slot_id: Optional[str] = Query(None),
):
    role = _require_permission(request, "document.view")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    _init_review_events_db()
    clauses = ["client_id = ?", "firm_id = ?"]
    params: list[str] = [client_id, ctx.firm_id]
    if period_key:
        clauses.append("period_key = ?")
        params.append(period_key)
    if slot_id is not None:
        clauses.append("slot_id = ?")
        params.append(slot_id)
    where = " AND ".join(clauses)
    with sqlite3.connect(REVIEW_EVENTS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            f"SELECT * FROM review_events WHERE {where} ORDER BY created_at DESC, rowid DESC",
            params,
        ).fetchall()
    filtered = _filter_review_event_rows(request, rows)
    return [_row_to_review_event(r) for r in filtered]


def _query_review_events(
    client_id: str,
    period_key: Optional[str] = None,
    slot_id: Optional[str] = None,
    *,
    firm_id: Optional[str] = None,
) -> List[sqlite3.Row]:
    _init_review_events_db()
    clauses = ["client_id = ?"]
    params: list[str] = [client_id]
    if firm_id:
        clauses.append("firm_id = ?")
        params.append(firm_id)
    if period_key:
        clauses.append("period_key = ?")
        params.append(period_key)
    if slot_id is not None:
        clauses.append("slot_id = ?")
        params.append(slot_id)
    where = " AND ".join(clauses)
    with sqlite3.connect(REVIEW_EVENTS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        return conn.execute(
            f"SELECT * FROM review_events WHERE {where} ORDER BY created_at ASC, rowid ASC",
            params,
        ).fetchall()


def _lookup_slot_label(client_id: str, period_key: str, slot_id: str) -> Optional[str]:
    _init_slot_documents_db()
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            """
            SELECT slot_label FROM slot_documents
            WHERE client_id=? AND period_key=? AND slot_id=?
            """,
            (client_id, period_key, slot_id),
        ).fetchone()
    return row["slot_label"] if row else None


def _query_review_timeline(
    client_id: str,
    period_key: Optional[str] = None,
    limit: int = 50,
    *,
    firm_id: Optional[str] = None,
) -> List[sqlite3.Row]:
    _init_review_events_db()
    clauses = ["client_id = ?"]
    params: list[str | int] = [client_id]
    if firm_id:
        clauses.append("firm_id = ?")
        params.append(firm_id)
    if period_key:
        clauses.append("period_key = ?")
        params.append(period_key)
    where = " AND ".join(clauses)
    params.append(limit)
    with sqlite3.connect(REVIEW_EVENTS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        return conn.execute(
            f"SELECT * FROM review_events WHERE {where} ORDER BY created_at DESC, rowid DESC LIMIT ?",
            params,
        ).fetchall()


@app.post("/api/review-events/batch", response_model=List[ReviewEventItem])
async def create_review_events_batch(request: Request, payload: ReviewEventBatchCreate):
    role = _require_permission(request, "document.view")
    if not payload.events:
        raise HTTPException(status_code=400, detail="events must not be empty")
    if len(payload.events) > 100:
        raise HTTPException(status_code=400, detail="too many events (max 100)")
    client_ids = {e.client_id for e in payload.events}
    if len(client_ids) != 1:
        raise HTTPException(status_code=400, detail="all events must share client_id")
    client_id = next(iter(client_ids))
    _require_client_access(request, role, client_id)
    identity = resolve_identity(request)
    items: List[ReviewEventItem] = []
    for event in payload.events:
        if event.client_id != client_id:
            raise HTTPException(status_code=400, detail="client_id mismatch in batch")
        if event.event_type == "remand" and not (event.reason and event.reason.strip()):
            raise HTTPException(status_code=400, detail="remand requires a reason")
        item = _append_review_event(
            client_id=event.client_id,
            period_key=event.period_key,
            slot_id=event.slot_id,
            event_type=event.event_type,
            content_sha256=event.content_sha256,
            version_label=event.version_label,
            status=event.status,
            action_title=event.action_title,
            reason=event.reason,
            actor_stakeholder_id=identity.stakeholder_id or None,
            actor_email=identity.email or None,
            actor_role=role,
            is_major=event.is_major,
            logical_document_id=event.logical_document_id,
            document_version_id=event.document_version_id,
            detail=event.detail,
        )
        items.append(item)
    _log_audit_event(
        request,
        "review_event.batch",
        "success",
        f"client={client_id} count={len(items)}",
    )
    return items


@app.get("/api/review-events/timeline", response_model=List[ReviewTimelineItem])
async def get_review_timeline(
    request: Request,
    client_id: str = Query(...),
    period_key: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """顧問先（＋任意で期間）横断の監査イベントを新しい順に返す。"""
    role = _require_permission(request, "document.view")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    rows = _filter_review_event_rows(
        request,
        _query_review_timeline(client_id, period_key, limit, firm_id=ctx.firm_id),
    )
    label_cache: dict[tuple[str, str, str], Optional[str]] = {}
    items: List[ReviewTimelineItem] = []
    for row in rows:
        base = _row_to_review_event(row)
        cache_key = (row["client_id"], row["period_key"], row["slot_id"])
        if cache_key not in label_cache:
            label_cache[cache_key] = _lookup_slot_label(*cache_key)
        items.append(
            ReviewTimelineItem(
                **base.model_dump(),
                slot_label=label_cache[cache_key],
            )
        )
    _log_audit_event(
        request,
        "review_event.timeline",
        "success",
        f"client={client_id} period={period_key or 'all'} count={len(items)}",
    )
    return items


@app.get("/api/review-events/export")
async def export_review_events(
    request: Request,
    client_id: str = Query(...),
    period_key: Optional[str] = Query(None),
    slot_id: Optional[str] = Query(None),
    format: str = Query("csv", pattern="^(csv|json)$"),
):
    role = _require_permission(request, "audit.approve")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    rows = _filter_review_event_rows(
        request,
        _query_review_events(client_id, period_key, slot_id, firm_id=ctx.firm_id),
    )
    items = [_row_to_review_event(r) for r in rows]
    stamp = datetime.utcnow().strftime("%Y%m%dT%H%M%S")
    base_name = f"review-events_{client_id}_{period_key or 'all'}_{stamp}"

    if format == "json":
        payload = json.dumps([i.model_dump() for i in items], ensure_ascii=False, indent=2)
        return Response(
            content=payload,
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{base_name}.json"'},
        )

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "created_at",
            "event_type",
            "status",
            "action_title",
            "version_label",
            "client_id",
            "period_key",
            "slot_id",
            "actor_email",
            "actor_role",
            "reason",
            "detail",
            "document_version_id",
            "logical_document_id",
        ]
    )
    for item in items:
        writer.writerow(
            [
                item.created_at,
                item.event_type,
                item.status or "",
                item.action_title or "",
                item.version_label or "",
                item.client_id,
                item.period_key,
                item.slot_id,
                item.actor_email or "",
                item.actor_role or "",
                item.reason or "",
                item.detail or "",
                item.document_version_id or "",
                item.logical_document_id or "",
            ]
        )
    return Response(
        content="\ufeff" + buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{base_name}.csv"'},
    )


@app.post("/api/classify")
async def classify_document(
    request: Request,
    file: UploadFile = File(...),
    candidates: str = Form(...),
    client_id: Optional[str] = Form(None),
    period_key: Optional[str] = Form(None),
    slot_id: Optional[str] = Form(None),
):
    """OCR/テキスト抽出＋ルールベース分類で、候補スロットの推定を返す（自動振り分け v1）。"""
    role = _require_permission(request, "document.upload")
    if client_id:
        _require_client_access(request, role, client_id)
    else:
        _require_client_scope(request, role)

    try:
        parsed = json.loads(candidates)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="candidates must be valid JSON")
    if not isinstance(parsed, list) or not parsed:
        raise HTTPException(status_code=400, detail="candidates must be a non-empty list")
    norm_candidates = [
        {"id": str(c.get("id", c.get("label", ""))), "label": str(c.get("label", ""))}
        for c in parsed
        if isinstance(c, dict) and c.get("label")
    ]
    if not norm_candidates:
        raise HTTPException(status_code=400, detail="candidates require label")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    ctx = _auth_context(request)
    ai_gate: dict | None = None
    if client_id:
        ai_gate = check_ai_allowed(ctx.firm_id, client_id)
        if not ai_gate.get("allowed"):
            raise HTTPException(
                status_code=403,
                detail={
                    "code": ai_gate.get("code"),
                    "message": ai_gate.get("message"),
                    "clientUsage": ai_gate.get("clientUsage"),
                },
            )

    logical_for_classify = None
    if client_id and period_key and slot_id:
        logical_for_classify = get_logical_by_slot(client_id, period_key, slot_id)
        if logical_for_classify:
            set_logical_status(logical_for_classify.id, "processing")

    try:
        result = classify_pdf(content, file.filename, norm_candidates)
        cfg = _load_system_config(ctx.firm_id)
        excerpt = str(result.get("text_excerpt") or "")
        conf = float(result.get("confidence") or 0)
        if cfg.ocr_auto_extract_enabled and conf < 0.6:
            if cfg.ai_openai_enabled:
                api_key = get_openai_key(ctx.firm_id)
                if api_key:
                    boost = ai_classify_boost(
                        excerpt,
                        file.filename,
                        norm_candidates,
                        api_key,
                        cfg.ai_openai_model,
                    )
                    if boost and float(boost.get("confidence") or 0) > conf:
                        result["best"] = boost["best"]
                        result["confidence"] = boost["confidence"]
                        result["engine"] = "openai"
                        result["ai_reason"] = boost.get("reason")
                        conf = float(boost["confidence"])
            if conf < 0.6 and cfg.ai_gemini_enabled:
                gemini_key = get_gemini_key(ctx.firm_id)
                if gemini_key:
                    boost = gemini_classify_boost(
                        excerpt,
                        file.filename,
                        norm_candidates,
                        gemini_key,
                        cfg.ai_gemini_model,
                    )
                    if boost and float(boost.get("confidence") or 0) > conf:
                        result["best"] = boost["best"]
                        result["confidence"] = boost["confidence"]
                        result["engine"] = "gemini"
                        result["ai_reason"] = boost.get("reason")
        best = result.get("best") or {}
        openai_key = get_openai_key(ctx.firm_id)
        gemini_key = get_gemini_key(ctx.firm_id)
        result["capabilities"] = {
            "ocr_auto_extract_enabled": cfg.ocr_auto_extract_enabled,
            "ai_openai_enabled": cfg.ai_openai_enabled,
            "ai_gemini_enabled": cfg.ai_gemini_enabled,
            "ai_openai_key_configured": bool(openai_key),
            "ai_gemini_key_configured": bool(gemini_key),
        }
        if slot_id:
            full_text, _ = extract_text_from_pdf(content)
            if full_text and len(full_text.strip()) >= 8:
                from services.document_extraction_schema import extract_from_schema, has_extraction_schema

                if has_extraction_schema(slot_id):
                    schema_result = extract_from_schema(slot_id, full_text)
                    result["extracted_profile"] = schema_result.extracted_profile
                    result["extraction_review"] = schema_result.to_dict()
                else:
                    extracted = profile_fields_from_text(slot_id, full_text)
                    if extracted:
                        result["extracted_profile"] = extracted
        if client_id:
            excerpt_for_tokens = str(result.get("text_excerpt") or "")
            tokens = estimate_tokens_from_text(excerpt_for_tokens)
            if result.get("engine") in ("openai", "gemini"):
                usage = record_ai_usage(ctx.firm_id, client_id, tokens, feature="classify")
                result["aiUsage"] = usage.get("clientUsage")
            elif ai_gate and ai_gate.get("announce"):
                result["aiAnnouncement"] = ai_gate.get("message")
        _log_audit_event(
            request,
            "document.classify",
            "success",
            f"engine={result.get('engine')} best={best.get('label')} conf={result.get('confidence')}",
        )
        return result
    finally:
        if logical_for_classify and logical_for_classify.current_version_id:
            set_logical_status(logical_for_classify.id, "uploaded")


class ExtractionApplyBody(BaseModel):
    client_id: str
    period_key: str
    slot_id: str
    slot_label: Optional[str] = None
    fields: dict[str, str]


@app.post("/api/extraction/apply")
async def apply_extraction_fields(request: Request, body: ExtractionApplyBody):
    """人が確認・補完した抽出フィールドを client-master へ反映する。"""
    role = _require_permission(request, "document.upload")
    _require_client_access(request, role, body.client_id)
    if not body.fields:
        raise HTTPException(status_code=400, detail="fields must be non-empty")
    ctx = _auth_context(request)
    identity = resolve_identity(request)
    norm = ingest_from_confirmed_fields(
        firm_id=ctx.firm_id,
        client_id=body.client_id,
        period_key=body.period_key,
        slot_id=body.slot_id,
        slot_label=body.slot_label,
        fields=body.fields,
        updated_by=identity.email or None,
        updated_by_id=identity.stakeholder_id or None,
    )
    if norm.applied or norm.metrics_applied:
        _log_audit_event(
            request,
            "extraction.apply",
            "success",
            f"client={body.client_id} slot={body.slot_id} applied={len(norm.applied)}",
        )
    return ingest_result_for_response(norm)


class DocumentTemplateUpdateBody(BaseModel):
    templateName: str = "標準顧客納品用パッケージ"
    sortOrder: List[str] = []


@app.get("/api/document-templates")
async def get_document_templates(request: Request):
    """事務所の申告書類並び順テンプレートを返す。"""
    role = _require_permission(request, "document.view")
    _require_client_scope(request, role)
    ctx = _auth_context(request)
    payload = load_document_template(ctx.firm_id)
    _log_audit_event(request, "document_templates.get", "success")
    return payload


@app.put("/api/document-templates")
async def put_document_templates(request: Request, body: DocumentTemplateUpdateBody):
    """申告書類並び順テンプレートを更新（プラットフォーム設定権限）。"""
    _require_platform_settings(request)
    ctx = _auth_context(request)
    saved = save_document_template(
        ctx.firm_id,
        template_name=body.templateName,
        sort_order=body.sortOrder,
    )
    _log_audit_event(request, "document_templates.put", "success", saved.get("templateName", ""))
    return saved


class AuthoringTemplateCreateBody(BaseModel):
    title: str
    body: str
    description: str = ""
    category: str = "general"
    scope: str = "local"  # local | global


class AuthoringTemplateUpdateBody(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None


class AuthoringTemplateParseBody(BaseModel):
    body: str


class AuthoringTemplateRenderBody(BaseModel):
    client_id: str
    values: Optional[Dict[str, str]] = None


class AuthoringExportPdfBody(BaseModel):
    client_id: str
    title: str
    body: str


def _client_record_for_render(ctx: AuthContext, client_id: str) -> dict:
    master = _merge_client_master_for_firm(ctx, _load_client_master())
    for client in master.clients:
        if client.id == client_id:
            return client.model_dump()
    raise HTTPException(status_code=404, detail="Client not found")


@app.get("/api/authoring-templates")
async def get_authoring_templates(request: Request):
    _require_permission(request, "document.view")
    ctx = _auth_context(request)
    payload = list_all_for_firm(ctx.firm_id)
    _log_audit_event(request, "authoring_templates.list", "success")
    return payload


@app.get("/api/authoring-templates/{template_id}")
async def get_authoring_template(request: Request, template_id: str):
    _require_permission(request, "document.view")
    ctx = _auth_context(request)
    item = get_template_by_id(template_id, ctx.firm_id)
    if not item:
        raise HTTPException(status_code=404, detail="Template not found")
    return item


@app.post("/api/authoring-templates")
async def post_authoring_template(request: Request, body: AuthoringTemplateCreateBody):
    ctx = _auth_context(request)
    scope = (body.scope or "local").strip().lower()
    if scope == "global":
        _require_platform_settings(request)
        created = create_global_template(
            title=body.title.strip(),
            body=body.body,
            description=body.description.strip(),
            category=body.category.strip() or "general",
        )
    else:
        _require_permission(request, "settings.manage")
        created = create_local_template(
            ctx.firm_id,
            title=body.title.strip(),
            body=body.body,
            description=body.description.strip(),
            category=body.category.strip() or "general",
        )
    _log_audit_event(request, "authoring_templates.create", "success", created["id"])
    return created


@app.put("/api/authoring-templates/{template_id}")
async def put_authoring_template(
    request: Request, template_id: str, body: AuthoringTemplateUpdateBody
):
    ctx = _auth_context(request)
    existing = get_template_by_id(template_id, ctx.firm_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Template not found")
    if existing["scope"] == "global":
        _require_platform_settings(request)
    else:
        _require_permission(request, "settings.manage")
    updated = update_template(
        template_id,
        ctx.firm_id,
        title=body.title,
        body=body.body,
        description=body.description,
        category=body.category,
        is_platform="settings.platform" in _get_role_permissions().get(
            _auth_context(request).role, set()
        ),
    )
    if not updated:
        raise HTTPException(status_code=403, detail="Cannot update template")
    _log_audit_event(request, "authoring_templates.update", "success", template_id)
    return updated


@app.delete("/api/authoring-templates/{template_id}")
async def delete_authoring_template(request: Request, template_id: str):
    ctx = _auth_context(request)
    existing = get_template_by_id(template_id, ctx.firm_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Template not found")
    if existing["scope"] == "global":
        _require_platform_settings(request)
    else:
        _require_permission(request, "settings.manage")
    ok = delete_template(
        template_id,
        ctx.firm_id,
        is_platform="settings.platform" in _get_role_permissions().get(ctx.role, set()),
    )
    if not ok:
        raise HTTPException(status_code=403, detail="Cannot delete template")
    _log_audit_event(request, "authoring_templates.delete", "success", template_id)
    return {"ok": True}


@app.post("/api/authoring-templates/parse")
async def parse_authoring_template_body(request: Request, body: AuthoringTemplateParseBody):
    _require_permission(request, "settings.manage")
    variables = extract_variable_names(body.body)
    return {"variables": variables}


@app.post("/api/authoring-templates/{template_id}/render")
async def render_authoring_template(
    request: Request, template_id: str, body: AuthoringTemplateRenderBody
):
    role = _require_permission(request, "document.view")
    _require_client_access(request, role, body.client_id)
    ctx = _auth_context(request)
    template = get_template_by_id(template_id, ctx.firm_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    client = _client_record_for_render(ctx, body.client_id)
    resolved = merge_render_values(client, body.values or {})
    missing = missing_variables(template.get("variables") or [], resolved)
    rendered = render_template_body(template.get("body") or "", resolved)
    _log_audit_event(
        request,
        "authoring_templates.render",
        "success",
        f"template={template_id} client={body.client_id}",
    )
    return {
        "renderedBody": rendered,
        "resolvedValues": resolved,
        "missingVariables": missing,
        "templateId": template_id,
        "templateTitle": template.get("title"),
        "templateBody": template.get("body"),
        "targetSlotLabel": template.get("targetSlotLabel") or "",
    }


@app.post("/api/authoring-templates/export-pdf")
async def export_authoring_pdf(request: Request, body: AuthoringExportPdfBody):
    role = _require_permission(request, "document.upload")
    _require_client_access(request, role, body.client_id)
    if not (body.body or "").strip():
        raise HTTPException(status_code=400, detail="body required")
    safe_title = (body.title or "document").strip() or "document"
    pdf_bytes = text_to_pdf_bytes(body.body, title=safe_title)
    filename = f"{safe_title}.pdf".replace('"', "_")
    _log_audit_event(
        request,
        "authoring_templates.export_pdf",
        "success",
        f"client={body.client_id} title={safe_title}",
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": _attachment_content_disposition(filename)},
    )


class ReviewChecklistReturnAnchorBody(BaseModel):
    documentType: str = ""
    slotId: str = ""
    scheduleRef: str = ""
    keywords: List[str] = Field(default_factory=list)


class ReviewChecklistItemBody(BaseModel):
    id: Optional[str] = None
    label: str
    description: str = ""
    category: str = "一般"
    sortOrder: int = 0
    returnAnchor: Optional[ReviewChecklistReturnAnchorBody] = None
    alertRule: str = "presence_in_return"


class ReviewChecklistTemplateBody(BaseModel):
    title: str
    description: str = ""
    periodTypes: List[str] = Field(default_factory=lambda: ["year"])
    sections: Optional[List[Dict[str, object]]] = None
    items: List[ReviewChecklistItemBody] = Field(default_factory=list)


class ReviewChecklistChecksBody(BaseModel):
    client_id: str
    period_key: str
    template_id: Optional[str] = None
    checks: Dict[str, Dict[str, object]] = Field(default_factory=dict)
    header: Optional[Dict[str, str]] = None
    itemStates: Optional[Dict[str, Dict[str, object]]] = None
    workflowStatus: Optional[str] = None
    circulationMemo: Optional[str] = None


class ReviewChecklistCreateBody(BaseModel):
    title: str
    description: str = ""
    periodTypes: List[str] = Field(default_factory=lambda: ["year"])
    sourceTemplateId: Optional[str] = None
    sections: Optional[List[Dict[str, object]]] = None


class ReviewChecklistDefaultBody(BaseModel):
    template_id: str


class ReviewChecklistExportPdfBody(BaseModel):
    client_id: str
    period_key: str
    template_id: Optional[str] = None


@app.get("/api/review-checklists/templates")
async def list_review_checklist_templates_endpoint(request: Request):
    _require_permission(request, "document.view")
    ctx = _auth_context(request)
    payload = list_review_checklist_templates(ctx.firm_id)
    _log_audit_event(request, "review_checklist.templates.list", "success")
    return payload


@app.get("/api/review-checklists/templates/{template_id}")
async def get_review_checklist_template_by_id_endpoint(request: Request, template_id: str):
    _require_permission(request, "document.view")
    ctx = _auth_context(request)
    template = get_review_checklist_template(ctx.firm_id, template_id)
    _log_audit_event(request, "review_checklist.template.get", "success", template_id)
    return template


@app.post("/api/review-checklists/templates")
async def post_review_checklist_template_endpoint(request: Request, body: ReviewChecklistCreateBody):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    created = create_review_checklist_template(
        ctx.firm_id,
        title=body.title.strip(),
        description=body.description.strip(),
        period_types=body.periodTypes,
        sections=body.sections,
        source_template_id=body.sourceTemplateId,
    )
    _log_audit_event(request, "review_checklist.template.create", "success", created.get("id", ""))
    return created


@app.put("/api/review-checklists/templates/{template_id}")
async def put_review_checklist_template_by_id_endpoint(
    request: Request, template_id: str, body: ReviewChecklistTemplateBody
):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    payload = body.model_dump(exclude_none=True)
    try:
        saved = update_review_checklist_template(ctx.firm_id, template_id, payload)
    except PermissionError as exc:
        if str(exc) == "global_template_readonly":
            raise HTTPException(status_code=403, detail="global_template_readonly") from exc
        raise
    except KeyError as exc:
        if str(exc) == "template_not_found":
            raise HTTPException(status_code=404, detail="template_not_found") from exc
        raise
    _log_audit_event(request, "review_checklist.template.put", "success", template_id)
    return saved


@app.delete("/api/review-checklists/templates/{template_id}")
async def delete_review_checklist_template_endpoint(request: Request, template_id: str):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    try:
        ok = delete_review_checklist_template(ctx.firm_id, template_id)
    except PermissionError as exc:
        if str(exc) == "global_template_readonly":
            raise HTTPException(status_code=403, detail="global_template_readonly") from exc
        raise
    except ValueError as exc:
        if str(exc) == "cannot_delete_default":
            raise HTTPException(status_code=400, detail="cannot_delete_default") from exc
        raise
    if not ok:
        raise HTTPException(status_code=404, detail="template_not_found")
    _log_audit_event(request, "review_checklist.template.delete", "success", template_id)
    return {"ok": True}


@app.put("/api/review-checklists/templates/default")
async def put_review_checklist_default_template_endpoint(
    request: Request, body: ReviewChecklistDefaultBody
):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    try:
        payload = set_default_review_checklist_template(ctx.firm_id, body.template_id)
    except KeyError as exc:
        if str(exc) == "template_not_found":
            raise HTTPException(status_code=404, detail="template_not_found") from exc
        raise
    _log_audit_event(request, "review_checklist.template.default", "success", body.template_id)
    return payload


@app.get("/api/review-checklists/template")
async def get_review_checklist_template_endpoint(request: Request):
    _require_permission(request, "document.view")
    ctx = _auth_context(request)
    template = get_review_checklist_template(ctx.firm_id)
    _log_audit_event(request, "review_checklist.template.get", "success")
    return template


@app.put("/api/review-checklists/template")
async def put_review_checklist_template_endpoint(
    request: Request, body: ReviewChecklistTemplateBody
):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    payload = body.model_dump(exclude_none=True)
    if body.items:
        payload["items"] = [item.model_dump() for item in body.items]
    saved = save_review_checklist_template(ctx.firm_id, payload)
    _log_audit_event(request, "review_checklist.template.put", "success")
    return saved


@app.get("/api/review-checklists/prefill")
async def get_review_checklist_prefill_endpoint(
    request: Request,
    client_id: str,
    period_key: str,
):
    role = _require_permission(request, "document.view")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    client = _client_record_for_render(ctx, client_id)
    header = prefill_header(client, period_key)
    return {"header": header, "clientId": client_id, "periodKey": period_key}


@app.get("/api/review-checklists/instance")
async def get_review_checklist_instance_endpoint(
    request: Request,
    client_id: str,
    period_key: str,
    template_id: Optional[str] = None,
):
    role = _require_permission(request, "document.view")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    instance = get_instance(ctx.firm_id, client_id, period_key, template_id)
    tid = instance.get("templateId") or template_id
    template = get_review_checklist_template(ctx.firm_id, tid)
    return {"template": template, "instance": instance}


@app.put("/api/review-checklists/instance")
async def put_review_checklist_instance_endpoint(
    request: Request, body: ReviewChecklistChecksBody
):
    role, permissions = _require_any_permission(
        request, "document.annotate", "review_checklist.edit"
    )
    firm_workflow = "document.annotate" in permissions
    _require_client_access(request, role, body.client_id)
    ctx = _auth_context(request)
    try:
        if body.itemStates is not None or body.header is not None:
            instance = save_instance(
                ctx.firm_id,
                body.client_id,
                body.period_key,
                template_id=body.template_id,
                header=body.header,
                item_states=body.itemStates,
                workflow_status=body.workflowStatus if firm_workflow else None,
                circulation_memo=body.circulationMemo if firm_workflow else None,
                actor_email=ctx.email,
            )
        else:
            instance = save_instance_checks(
                ctx.firm_id,
                body.client_id,
                body.period_key,
                body.checks,
                template_id=body.template_id,
                actor_email=ctx.email,
            )
    except ValueError as exc:
        if str(exc) == "period_not_applicable":
            raise HTTPException(status_code=400, detail="period_not_applicable") from exc
        raise
    _log_audit_event(
        request,
        "review_checklist.instance.put",
        "success",
        f"client={body.client_id} period={body.period_key}",
    )
    return instance


@app.get("/api/review-checklists/alerts")
async def get_review_checklist_alerts_endpoint(
    request: Request,
    client_id: str,
    period_key: str,
    template_id: Optional[str] = None,
):
    role = _require_permission(request, "document.view")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    result = evaluate_alerts(ctx.firm_id, client_id, period_key, template_id)
    _log_audit_event(
        request,
        "review_checklist.alerts",
        "success",
        f"client={client_id} period={period_key} n={result['summary']['total']}",
    )
    return result


@app.post("/api/review-checklists/export-pdf")
async def post_review_checklist_export_pdf_endpoint(
    request: Request, body: ReviewChecklistExportPdfBody
):
    role = _require_permission(request, "document.view")
    _require_client_access(request, role, body.client_id)
    ctx = _auth_context(request)
    client = _client_record_for_render(ctx, body.client_id)
    pdf_bytes = export_checklist_pdf(
        ctx.firm_id,
        body.client_id,
        body.period_key,
        template_id=body.template_id,
        client_name=str(client.get("name") or ""),
    )
    safe_name = str(client.get("name") or body.client_id).replace('"', "_")
    filename = f"checklist-{safe_name}.pdf"
    _log_audit_event(
        request,
        "review_checklist.export_pdf",
        "success",
        f"client={body.client_id} period={body.period_key}",
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": _attachment_content_disposition(filename)},
    )


@app.post("/api/classify/batch")
async def classify_documents_batch(
    request: Request,
    files: List[UploadFile] = File(...),
    client_id: Optional[str] = Form(None),
):
    """複数 PDF を TaxDocumentType で一括分類（Vision LLM + ルール）。"""
    role = _require_permission(request, "document.upload")
    if client_id:
        _require_client_access(request, role, client_id)
    else:
        _require_client_scope(request, role)

    if not files:
        raise HTTPException(status_code=400, detail="files required")

    ctx = _auth_context(request)
    cfg = _load_system_config(ctx.firm_id)
    openai_key = get_openai_key(ctx.firm_id)
    gemini_key = get_gemini_key(ctx.firm_id)
    use_openai_vision = bool(cfg.ocr_auto_extract_enabled and cfg.ai_openai_enabled and openai_key)
    use_gemini_vision = bool(cfg.ocr_auto_extract_enabled and cfg.ai_gemini_enabled and gemini_key)
    use_vision = use_openai_vision or use_gemini_vision

    documents: List[dict] = []
    for upload in files:
        content = await upload.read()
        if not content:
            continue
        text, extract_engine = extract_text_from_pdf(content)
        excerpt = (text or "")[:400]

        if use_vision:
            result = classify_tax_document(
                content,
                upload.filename,
                text_excerpt=excerpt,
                openai_key=openai_key,
                openai_model=cfg.ai_openai_model,
                gemini_key=gemini_key,
                gemini_model=cfg.ai_gemini_model,
                use_openai_vision=use_openai_vision,
                use_gemini_vision=use_gemini_vision,
            )
        else:
            doc_type, conf, reason = infer_type_from_text(excerpt, upload.filename)
            result = {
                "identifiedType": doc_type,
                "confidence": conf,
                "reason": reason,
                "engine": extract_engine if extract_engine != "none" else "rules",
            }

        doc_type = str(result.get("identifiedType") or "UNKNOWN")
        documents.append(
            {
                "fileName": upload.filename or "document.pdf",
                "identifiedType": doc_type,
                "confidence": float(result.get("confidence") or 0),
                "reason": result.get("reason"),
                "engine": str(result.get("engine") or "none"),
                "slotId": slot_id_for_type(doc_type),
                "label": label_for_type(doc_type),
            }
        )

    template = load_document_template(ctx.firm_id)
    sort_order = template.get("sortOrder") or []
    documents.sort(
        key=lambda d: (
            sort_order.index(d["identifiedType"])
            if d["identifiedType"] in sort_order
            else len(sort_order) + (1 if d["identifiedType"] == "UNKNOWN" else 0)
        )
    )

    _log_audit_event(
        request,
        "document.classify_batch",
        "success",
        f"count={len(documents)} vision={use_vision}",
    )
    return {
        "documents": documents,
        "template": template,
        "capabilities": {
            "ocr_auto_extract_enabled": cfg.ocr_auto_extract_enabled,
            "ai_openai_enabled": cfg.ai_openai_enabled,
            "ai_gemini_enabled": cfg.ai_gemini_enabled,
            "ai_openai_key_configured": bool(openai_key),
            "ai_gemini_key_configured": bool(gemini_key),
            "vision_enabled": use_vision,
            "vision_openai": use_openai_vision,
            "vision_gemini": use_gemini_vision,
        },
    }


@app.get("/api/classify/pending")
async def list_classify_pending(
    request: Request,
    client_id: str = Query(...),
    period_key: str = Query(...),
):
    """要確認キュー一覧（メタデータのみ、ファイルは別 GET）。"""
    role = _require_permission(request, "document.view")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    items = list_pending_items(ctx.firm_id, client_id, period_key)
    _log_audit_event(request, "classify.pending.list", "success", f"count={len(items)}")
    return items


@app.post("/api/classify/pending")
async def create_classify_pending(
    request: Request,
    file: UploadFile = File(...),
    client_id: str = Form(...),
    period_key: str = Form(...),
    confidence: float = Form(0),
    engine: str = Form("none"),
    suggested_slot_id: Optional[str] = Form(None),
    classify_metadata: Optional[str] = Form(None),
    ranked: Optional[str] = Form(None),
):
    """要確認キューに PDF を追加。"""
    role = _require_permission(request, "document.upload")
    _require_client_access(request, role, client_id)
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    ctx = _auth_context(request)
    meta = None
    ranked_list = None
    if classify_metadata:
        try:
            meta = json.loads(classify_metadata)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="classify_metadata must be valid JSON")
    if ranked:
        try:
            ranked_list = json.loads(ranked)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="ranked must be valid JSON")
    item = create_pending_item(
        firm_id=ctx.firm_id,
        client_id=client_id,
        period_key=period_key,
        file_name=file.filename or "document.pdf",
        content=content,
        confidence=confidence,
        engine=engine,
        suggested_slot_id=suggested_slot_id,
        classify_metadata=meta,
        ranked=ranked_list if isinstance(ranked_list, list) else None,
        created_by=ctx.email,
    )
    _log_audit_event(request, "classify.pending.create", "success", f"id={item['id']}")
    return item


@app.get("/api/classify/pending/{item_id}/file")
async def get_classify_pending_file(request: Request, item_id: str):
    """要確認キュー項目の PDF バイナリ。"""
    role = _require_permission(request, "document.view")
    ctx = _auth_context(request)
    path = get_pending_file_path(ctx.firm_id, item_id)
    if not path:
        raise HTTPException(status_code=404, detail="Pending item not found")
    _log_audit_event(request, "classify.pending.file", "success", f"id={item_id}")
    return FileResponse(path, media_type="application/pdf", filename=path.name.split("_", 1)[-1])


@app.delete("/api/classify/pending/{item_id}")
async def delete_classify_pending(request: Request, item_id: str):
    """要確認キューから削除（確定・却下時）。"""
    role = _require_permission(request, "document.upload")
    ctx = _auth_context(request)
    from services.pending_classify_service import get_pending_item

    existing = get_pending_item(ctx.firm_id, item_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Pending item not found")
    _require_client_access(request, role, existing["client_id"])
    if not delete_pending_item(ctx.firm_id, item_id):
        raise HTTPException(status_code=404, detail="Pending item not found")
    _log_audit_event(request, "classify.pending.delete", "success", f"id={item_id}")
    return {"ok": True}


# --- 源泉徴収簿（P-W1）---
@app.get("/api/clients/{client_id}/payroll/employees", response_model=PayrollEmployeesPayload)
async def get_payroll_employees(request: Request, client_id: str):
    role = _require_permission(request, "client.view")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    employees = list_employees(ctx.firm_id, client_id, include_inactive=True)
    return {"employees": employees}


@app.put("/api/clients/{client_id}/payroll/employees", response_model=PayrollEmployeesPayload)
async def put_payroll_employees(request: Request, client_id: str, body: PayrollEmployeesPayload):
    role = _require_permission(request, "settings.manage")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    try:
        saved = replace_employees(
            ctx.firm_id,
            client_id,
            [e.model_dump() for e in body.employees],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "payroll.employees.save", "success", f"count={len(saved)}")
    return {"employees": saved}


@app.get("/api/clients/{client_id}/payroll/ledger", response_model=WithholdingLedgerPayload)
async def get_withholding_ledger(
    request: Request,
    client_id: str,
    year_month: Optional[str] = Query(None),
):
    role = _require_permission(request, "client.view")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    rows = list_ledger_rows(ctx.firm_id, client_id, year_month=year_month)
    summary = ledger_summary(ctx.firm_id, client_id, year_month) if year_month else None
    return {"rows": rows, "summary": summary}


@app.post("/api/clients/{client_id}/payroll/ledger", response_model=WithholdingLedgerRowItem)
async def post_withholding_ledger_row(
    request: Request,
    client_id: str,
    body: WithholdingLedgerRowItem,
):
    role = _require_permission(request, "settings.manage")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    payload = body.model_dump()
    payload["client_id"] = client_id
    try:
        row = upsert_ledger_row(ctx.firm_id, client_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "payroll.ledger.upsert", "success", f"id={row['id']}")
    return row


@app.delete("/api/clients/{client_id}/payroll/ledger/{row_id}")
async def delete_withholding_ledger_row(request: Request, client_id: str, row_id: str):
    role = _require_permission(request, "settings.manage")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    if not delete_ledger_row(ctx.firm_id, client_id, row_id):
        raise HTTPException(status_code=404, detail="Ledger row not found")
    _log_audit_event(request, "payroll.ledger.delete", "success", f"id={row_id}")
    return {"ok": True}


def _run_capture_item_analysis(
    firm_id: str,
    item_id: str,
    *,
    manual_hints: dict | None = None,
) -> dict:
    from services.capture_service import get_capture_item

    item = get_capture_item(firm_id, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Capture item not found")
    raw = get_capture_file_bytes(firm_id, item_id)
    if not raw:
        raise HTTPException(status_code=404, detail="Capture file not found")
    mime = get_capture_mime(firm_id, item_id) or "application/octet-stream"
    analysis = analyze_capture_content(
        content=raw,
        mime_type=mime,
        file_name=item["file_name"],
        category=item.get("category") or "general",
        client_id=item["client_id"],
        manual_hints=manual_hints,
    )
    updated = apply_capture_analysis(firm_id, item_id, analysis)
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to apply capture analysis")
    return updated


# --- キャプチャギャラリー（G1）---
@app.get("/api/capture/items")
async def list_capture_gallery(
    request: Request,
    client_id: str = Query(...),
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
):
    role = _require_permission(request, "document.view")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    items = list_capture_items(ctx.firm_id, client_id, status=status, category=category)
    return items


@app.post("/api/capture/items")
async def upload_capture_item(
    request: Request,
    file: UploadFile = File(...),
    client_id: str = Form(...),
    category: str = Form("general"),
    period_key: Optional[str] = Form(None),
    slot_id: Optional[str] = Form(None),
):
    role = _require_permission(request, "document.upload")
    _require_client_access(request, role, client_id)
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    ctx = _auth_context(request)
    try:
        item = create_capture_item(
            firm_id=ctx.firm_id,
            client_id=client_id,
            file_name=file.filename or "capture.jpg",
            content=content,
            content_type=file.content_type,
            category=category,
            period_key=period_key,
            slot_id=slot_id,
            created_by=ctx.email,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    # OCR・監査はアップロード時には走らせない（手動解析 or 数字入力トリガー）
    item = get_capture_item(ctx.firm_id, item["id"]) or item
    _log_audit_event(request, "capture.upload", "success", f"id={item['id']}")
    return item


@app.get("/api/capture/items/{item_id}/file")
async def get_capture_item_file(request: Request, item_id: str):
    role = _require_permission(request, "document.view")
    ctx = _auth_context(request)
    from services.capture_service import get_capture_item

    item = get_capture_item(ctx.firm_id, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Capture item not found")
    _require_client_access(request, role, item["client_id"])
    path = get_capture_file_path(ctx.firm_id, item_id)
    if not path:
        raise HTTPException(status_code=404, detail="File not found")
    mime = get_capture_mime(ctx.firm_id, item_id) or "application/octet-stream"
    _log_audit_event(request, "capture.file", "success", f"id={item_id}")
    return FileResponse(path, media_type=mime, filename=item["file_name"])


@app.patch("/api/capture/items/{item_id}")
async def patch_capture_item(request: Request, item_id: str, body: CaptureItemPatchBody):
    role = _require_permission(request, "document.upload")
    ctx = _auth_context(request)
    from services.capture_service import get_capture_item

    existing = get_capture_item(ctx.firm_id, item_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Capture item not found")
    _require_client_access(request, role, existing["client_id"])
    try:
        updated = update_capture_item(
            ctx.firm_id,
            item_id,
            status=body.status,
            title=body.title,
            audit_message=body.audit_message,
            pinned=body.pinned,
            category=body.category,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "capture.patch", "success", f"id={item_id}")
    return updated


@app.post("/api/capture/items/{item_id}/analyze")
async def analyze_capture_gallery_item(
    request: Request,
    item_id: str,
    body: CaptureAnalyzeBody | None = None,
):
    """キャプチャ資料の OCR・監査を再実行。手入力ヒントで OCR なしでも試算可能。"""
    role = _require_permission(request, "document.upload")
    ctx = _auth_context(request)
    from services.capture_service import get_capture_item

    existing = get_capture_item(ctx.firm_id, item_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Capture item not found")
    _require_client_access(request, role, existing["client_id"])
    hints = body.model_dump(exclude_none=True) if body else None
    updated = _run_capture_item_analysis(ctx.firm_id, item_id, manual_hints=hints or None)
    _log_audit_event(request, "capture.analyze", "success", f"id={item_id}")
    return updated


@app.post("/api/capture/items/{item_id}/reaudit")
async def reaudit_capture_gallery_item(
    request: Request,
    item_id: str,
    body: CaptureReauditBody,
):
    """手入力の数字を metadata に反映して監査結果を再計算。"""
    role = _require_permission(request, "document.upload")
    ctx = _auth_context(request)
    from services.capture_service import get_capture_item, update_capture_item

    item = get_capture_item(ctx.firm_id, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Capture item not found")
    _require_client_access(request, role, item["client_id"])
    metadata = item.get("metadata") or {}
    overrides = body.model_dump(exclude_none=True)
    if not overrides:
        raise HTTPException(status_code=400, detail="No overrides provided")
    result = reaudit_capture_metadata(
        metadata=metadata,
        category=item.get("category") or "general",
        client_id=item["client_id"],
        overrides=overrides,
    )
    updated = update_capture_item(
        ctx.firm_id,
        item_id,
        status=result["status"],
        audit_message=result.get("audit_message"),
        pinned=result.get("pinned"),
        metadata=result["metadata"],
    )
    _log_audit_event(request, "capture.reaudit", "success", f"id={item_id}")
    return updated


@app.post("/api/capture/items/{item_id}/route")
async def route_capture_to_matrix(request: Request, item_id: str, body: CaptureRouteBody):
    """キャプチャを PDF 化してマトリクススロットへ振り分け。"""
    role = _require_permission(request, "document.upload")
    ctx = _auth_context(request)
    item = get_capture_item(ctx.firm_id, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Capture item not found")
    _require_client_access(request, role, item["client_id"])

    period_key = body.period_key or item.get("period_key")
    slot_id = body.slot_id or item.get("slot_id")
    if not period_key or not slot_id:
        raise HTTPException(
            status_code=400,
            detail="period_key and slot_id are required (or set by analysis)",
        )
    slot_label = body.slot_label or item.get("title") or f"slot-{slot_id}"

    try:
        pdf_bytes, pdf_name, _ = load_capture_as_pdf(ctx.firm_id, item_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        doc = fitz.open("pdf", pdf_bytes)
        page_count = len(doc)
        doc.close()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid PDF after conversion") from exc

    sha = hashlib.sha256(pdf_bytes).hexdigest()
    identity = resolve_identity(request)
    uploaded_by = identity.stakeholder_id or identity.email or ""
    now = datetime.utcnow().isoformat()
    classify_meta = (item.get("metadata") or {}).get("classify")
    metadata_json = None
    if classify_meta and isinstance(classify_meta, dict):
        enriched = enrich_classify_metadata(
            classify_meta,
            client_id=item["client_id"],
            period_key=period_key,
            slot_id=slot_id,
        )
        metadata_json = json.dumps(enriched, ensure_ascii=False)

    logical = ensure_logical_document(
        client_id=item["client_id"],
        period_key=period_key,
        slot_id=slot_id,
        title=slot_label,
    )
    if logical.current_version_id:
        set_logical_status(logical.id, "processing")
    version = create_document_version(
        logical_id=logical.id,
        content=pdf_bytes,
        original_name=pdf_name,
        content_sha256=sha,
        source="capture_route",
        bump="upload",
        parent_version_id=logical.current_version_id,
        created_by_stakeholder_id=identity.stakeholder_id,
        created_by_email=identity.email,
        page_count=page_count,
        metadata_json=metadata_json,
    )

    client_firm = get_client_firm_id(item["client_id"])
    _init_slot_documents_db()
    existing_drive_file_id: Optional[str] = None
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        prev_row = conn.execute(
            "SELECT id, google_drive_file_id FROM slot_documents WHERE client_id=? AND period_key=? AND slot_id=?",
            (item["client_id"], period_key, slot_id),
        ).fetchone()
        if prev_row:
            existing_drive_file_id = prev_row["google_drive_file_id"]

    drive_cfg = _load_system_config(client_firm)
    drive_file_id = maybe_upload_slot_to_drive(
        firm_id=client_firm,
        drive_connected=drive_cfg.google_drive_connected,
        drive_root_folder_id=drive_cfg.drive_root_folder_id,
        client_id=item["client_id"],
        period_key=period_key,
        slot_label=slot_label,
        content=pdf_bytes,
        filename=pdf_name,
        existing_file_id=existing_drive_file_id,
    )
    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        prev = conn.execute(
            "SELECT id FROM slot_documents WHERE client_id=? AND period_key=? AND slot_id=?",
            (item["client_id"], period_key, slot_id),
        ).fetchone()
        if prev:
            doc_id = prev["id"]
            conn.execute(
                """
                UPDATE slot_documents SET
                    slot_label=?, original_name=?, storage_key=?,
                    page_count=?, content_sha256=?, byte_size=?, uploaded_by=?, uploaded_at=?,
                    logical_document_id=?, current_version_id=?, firm_id=?, google_drive_file_id=?
                WHERE id=?
                """,
                (
                    slot_label,
                    pdf_name,
                    version.storage_key,
                    page_count,
                    sha,
                    len(pdf_bytes),
                    uploaded_by,
                    now,
                    logical.id,
                    version.id,
                    client_firm,
                    drive_file_id,
                    doc_id,
                ),
            )
        else:
            doc_id = uuid.uuid4().hex
            conn.execute(
                """
                INSERT INTO slot_documents
                    (id, client_id, period_key, slot_id, slot_label, original_name, storage_key,
                     page_count, content_sha256, byte_size, uploaded_by, uploaded_at,
                     logical_document_id, current_version_id, firm_id, google_drive_file_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    doc_id,
                    item["client_id"],
                    period_key,
                    slot_id,
                    slot_label,
                    pdf_name,
                    version.storage_key,
                    page_count,
                    sha,
                    len(pdf_bytes),
                    uploaded_by,
                    now,
                    logical.id,
                    version.id,
                    client_firm,
                    drive_file_id,
                ),
            )
        row = conn.execute("SELECT * FROM slot_documents WHERE id=?", (doc_id,)).fetchone()

    update_capture_item(
        ctx.firm_id,
        item_id,
        status="confirmed",
        pinned=False,
        period_key=period_key,
        slot_id=slot_id,
    )
    slot_item = _enrich_slot_item(row)
    norm = ingest_from_slot_document(
        firm_id=client_firm,
        client_id=item["client_id"],
        period_key=period_key,
        slot_id=slot_id,
        slot_label=slot_label,
        pdf_content=pdf_bytes,
        classify_metadata=classify_meta if isinstance(classify_meta, dict) else None,
        updated_by=identity.email or uploaded_by,
        updated_by_id=identity.stakeholder_id,
    )
    if norm.applied or norm.metrics_applied:
        _log_audit_event(
            request,
            "ssot.normalize",
            "success",
            f"client={item['client_id']} applied={len(norm.applied)} metrics={len(norm.metrics_applied)}",
        )
    slot_item.normalize_result = ingest_result_for_response(norm)
    _log_audit_event(
        request,
        "capture.route",
        "success",
        f"id={item_id} period={period_key} slot={slot_id}",
    )
    return {"capture": get_capture_item(ctx.firm_id, item_id), "slot": slot_item}


@app.post("/api/capture/items/{item_id}/apply-payroll")
async def apply_capture_to_payroll(
    request: Request,
    item_id: str,
    body: CaptureApplyPayrollBody,
):
    """まるふ OCR 結果を源泉徴収簿（従業員マスタ）へ反映。"""
    role = _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    item = get_capture_item(ctx.firm_id, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Capture item not found")
    _require_client_access(request, role, item["client_id"])

    parsed = build_marufu_parsed_from_capture(item)
    if not parsed.get("dependent_count") and not parsed.get("life_insurance_yen"):
        raw = get_capture_file_bytes(ctx.firm_id, item_id)
        if raw:
            from services.marufu_parser import parse_marufu_text
            from services.capture_analyzer import extract_text_from_capture

            mime = get_capture_mime(ctx.firm_id, item_id) or "application/octet-stream"
            text, _ = extract_text_from_capture(raw, mime)
            ocr_parsed = parse_marufu_text(text)
            for key, val in ocr_parsed.items():
                if parsed.get(key) in (None, False, "", []):
                    parsed[key] = val

    try:
        result = apply_marufu_to_payroll(
            ctx.firm_id,
            item["client_id"],
            parsed,
            employee_id=body.employee_id,
            capture_item_id=item_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    update_capture_item(
        ctx.firm_id,
        item_id,
        status="confirmed",
        pinned=False,
        audit_message="源泉徴収簿（従業員マスタ）へ反映済み",
    )
    _log_audit_event(request, "capture.apply_payroll", "success", f"id={item_id}")
    return {
        "capture": get_capture_item(ctx.firm_id, item_id),
        **result,
    }


@app.post("/api/invoice/verify")
async def verify_invoice_number(request: Request, body: InvoiceVerifyBody):
    """適格請求書登録番号の形式・チェックデジット・公表照合。"""
    role = _require_permission(request, "document.view")
    _require_client_scope(request, role)
    result = verify_invoice_registration(body.registration_number)
    _log_audit_event(
        request,
        "invoice.verify",
        "success",
        f"reg={result.get('normalized')} status={result.get('registration_status')}",
    )
    return result


@app.get("/api/clients/{client_id}/payroll/marufu")
async def get_marufu_submissions(request: Request, client_id: str):
    role = _require_permission(request, "client.view")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    return {"submissions": list_marufu_submissions(ctx.firm_id, client_id)}


@app.post("/api/clients/{client_id}/payroll/year-end/run")
async def post_year_end_adjustment_run(
    request: Request,
    client_id: str,
    body: YearEndRunBody,
):
    """年末調整を一括試算（源泉徴収簿 + まるふ控除を統合）。"""
    role = _require_permission(request, "settings.manage")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    try:
        run = run_year_end_adjustment(
            ctx.firm_id,
            client_id,
            tax_year=body.tax_year,
            settlement_month=body.settlement_month,
            created_by=ctx.email,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "payroll.year_end.run", "success", f"year={body.tax_year}")
    return run


@app.get("/api/clients/{client_id}/payroll/year-end/runs")
async def get_year_end_adjustment_runs(request: Request, client_id: str):
    role = _require_permission(request, "client.view")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    return {"runs": list_year_end_runs(ctx.firm_id, client_id)}


@app.get("/api/clients/{client_id}/payroll/year-end/runs/{run_id}")
async def get_year_end_adjustment_run(request: Request, client_id: str, run_id: str):
    role = _require_permission(request, "client.view")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    run = get_year_end_run(ctx.firm_id, run_id)
    if not run or run["client_id"] != client_id:
        raise HTTPException(status_code=404, detail="Year-end run not found")
    return run


@app.post("/api/clients/{client_id}/payroll/year-end/runs/{run_id}/apply")
async def apply_year_end_adjustment_run(request: Request, client_id: str, run_id: str):
    """過不足額を精算月の給与台帳へ反映。"""
    role = _require_permission(request, "settings.manage")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    try:
        out = apply_year_end_settlement(ctx.firm_id, client_id, run_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "payroll.year_end.apply", "success", f"id={run_id}")
    return out


@app.post("/api/clients/{client_id}/payroll/santei/apply")
async def apply_santei_grades(request: Request, client_id: str, body: SanteiRunBody):
    """4・5・6月給与から算定基礎届等級を試算して従業員マスタへ反映。"""
    role = _require_permission(request, "settings.manage")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    result = compute_and_apply_santei_grades(ctx.firm_id, client_id, tax_year=body.tax_year)
    _log_audit_event(request, "payroll.santei.apply", "success", f"year={body.tax_year}")
    return result


@app.get("/api/clients/{client_id}/payroll/santei/preview")
async def preview_santei_grades(
    request: Request,
    client_id: str,
    tax_year: int = Query(...),
):
    """算定基礎届の等級試算プレビュー（反映なし）。"""
    role = _require_permission(request, "client.view")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    from services.social_insurance_santei import compute_client_santei

    employees = list_employees(ctx.firm_id, client_id)
    rows = list_ledger_rows(ctx.firm_id, client_id)
    return compute_client_santei(employees, rows, tax_year=tax_year)


# --- クライアント指標 SSOT（CHARTS）---
@app.get("/api/clients/{client_id}/metrics/charts")
async def get_client_charts_metrics(request: Request, client_id: str):
    role = _require_permission(request, "client.view")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    from services.client_metrics_service import build_charts_payload

    master = _load_client_master()
    client_row = next((c for c in master.clients if c.id == client_id), None)
    base_yen = 48_000_000
    if client_row and client_row.profile:
        raw = client_row.profile.get("profit_taxable_income", "")
        if raw:
            digits = "".join(ch for ch in str(raw) if ch.isdigit())
            if digits:
                base_yen = int(digits)
    return build_charts_payload(ctx.firm_id, client_id, seed_base_yen=base_yen)


@app.put("/api/clients/{client_id}/metrics/facts")
async def upsert_client_metric_fact(
    request: Request,
    client_id: str,
    body: ClientMetricUpsertBody,
):
    role = _require_permission(request, "settings.manage")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    from services.client_metrics_service import upsert_metric_fact

    fact = upsert_metric_fact(
        ctx.firm_id,
        client_id,
        metric_key=body.metric_key,
        period_key=body.period_key,
        value_yen=body.value_yen,
        value_num=body.value_num,
        source_type="manual",
    )
    _log_audit_event(
        request,
        "metrics.upsert",
        "success",
        f"key={body.metric_key}:{body.period_key}",
    )
    return fact


# --- コミュニケーション SSOT（COMMS）---
@app.get("/api/clients/{client_id}/comms/threads")
async def get_client_comm_threads(request: Request, client_id: str):
    role = _require_permission(request, "client.view")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    from services.client_comms_service import list_comm_threads, seed_client_comms_if_empty

    master = _load_client_master()
    client_row = next((c for c in master.clients if c.id == client_id), None)
    contact = "経理担当"
    if client_row and client_row.profile:
        contact = client_row.profile.get("accounting_contact_name") or contact
    seed_client_comms_if_empty(ctx.firm_id, client_id, contact_name=contact)
    return {"threads": list_comm_threads(ctx.firm_id, client_id)}


@app.put("/api/clients/{client_id}/comms/threads")
async def upsert_client_comm_thread(
    request: Request,
    client_id: str,
    body: ClientCommThreadBody,
):
    role = _require_permission(request, "settings.manage")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    from services.client_comms_service import upsert_comm_thread

    thread = upsert_comm_thread(
        ctx.firm_id,
        client_id,
        body.model_dump(),
    )
    _log_audit_event(request, "comms.upsert", "success", f"id={thread['id']}")
    return thread


@app.delete("/api/clients/{client_id}/comms/threads/{thread_id}")
async def delete_client_comm_thread(request: Request, client_id: str, thread_id: str):
    role = _require_permission(request, "settings.manage")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    from services.client_comms_service import delete_comm_thread

    if not delete_comm_thread(ctx.firm_id, client_id, thread_id):
        raise HTTPException(status_code=404, detail="thread-not-found")
    _log_audit_event(request, "comms.delete", "success", f"id={thread_id}")
    return {"ok": True}


@app.get("/api/clients/{client_id}/metrics/valuation")
async def get_client_valuation_metrics(request: Request, client_id: str):
    role = _require_permission(request, "client.view")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    from services.client_metrics_service import build_valuation_payload

    master = _load_client_master()
    client_row = next((c for c in master.clients if c.id == client_id), None)
    profile = client_row.profile if client_row else {}
    return build_valuation_payload(ctx.firm_id, client_id, profile)


# --- シミュレーションオーバーレイ（正規 metrics とは別ストア）---
@app.get("/api/clients/{client_id}/simulation/{panel_key}")
async def get_client_simulation_overlay(request: Request, client_id: str, panel_key: str):
    role = _require_permission(request, "client.view")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    from services.client_simulation_service import get_simulation_overlay

    try:
        row = get_simulation_overlay(ctx.firm_id, client_id, panel_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not row or row.get("payload") is None:
        return {"client_id": client_id, "panel_key": panel_key, "payload": None}
    return row


@app.put("/api/clients/{client_id}/simulation/{panel_key}")
async def upsert_client_simulation_overlay(
    request: Request,
    client_id: str,
    panel_key: str,
    body: ClientSimulationBody,
):
    role = _require_permission(request, "settings.manage")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    from services.client_simulation_service import upsert_simulation_overlay

    try:
        row = upsert_simulation_overlay(ctx.firm_id, client_id, panel_key, body.payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "simulation.upsert", "success", f"panel={panel_key}")
    return row


@app.delete("/api/clients/{client_id}/simulation/{panel_key}")
async def delete_client_simulation_overlay(request: Request, client_id: str, panel_key: str):
    role = _require_permission(request, "settings.manage")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    from services.client_simulation_service import delete_simulation_overlay

    try:
        delete_simulation_overlay(ctx.firm_id, client_id, panel_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "simulation.delete", "success", f"panel={panel_key}")
    return {"ok": True}


@app.get("/api/clients/{client_id}/records")
async def get_client_records(
    request: Request,
    client_id: str,
    domain: str | None = Query(None),
):
    role = _require_permission(request, "client.view")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    from services.client_records_service import list_record_items, seed_records_from_profile

    master = _load_client_master()
    client_row = next((c for c in master.clients if c.id == client_id), None)
    profile = client_row.profile if client_row else {}
    seed_records_from_profile(ctx.firm_id, client_id, profile)
    items = list_record_items(ctx.firm_id, client_id, domain=domain)
    return {"items": items}


@app.put("/api/clients/{client_id}/records")
async def upsert_client_record(request: Request, client_id: str, body: ClientRecordItemBody):
    role = _require_permission(request, "settings.manage")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    from services.client_records_service import upsert_record_item

    item = upsert_record_item(ctx.firm_id, client_id, body.model_dump())
    _log_audit_event(request, "records.upsert", "success", f"id={item['id']}")
    return item


@app.delete("/api/clients/{client_id}/records/{item_id}")
async def delete_client_record(request: Request, client_id: str, item_id: str):
    role = _require_permission(request, "settings.manage")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    from services.client_records_service import delete_record_item

    if not delete_record_item(ctx.firm_id, item_id):
        raise HTTPException(status_code=404, detail="Record not found")
    return {"ok": True}


@app.get("/api/clients/{client_id}/calendar/events")
async def get_client_calendar_events(request: Request, client_id: str):
    role = _require_permission(request, "client.view")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    from services.client_calendar_service import list_calendar_events

    return {"events": list_calendar_events(ctx.firm_id, client_id)}


@app.put("/api/clients/{client_id}/calendar/events")
async def upsert_client_calendar_event(
    request: Request,
    client_id: str,
    body: ClientCalendarEventBody,
):
    role = _require_permission(request, "settings.manage")
    _require_client_access(request, role, client_id)
    ctx = _auth_context(request)
    from services.client_calendar_service import upsert_calendar_event

    event = upsert_calendar_event(ctx.firm_id, client_id, body.model_dump())
    _log_audit_event(request, "calendar.upsert", "success", f"id={event['id']}")
    return event


@app.delete("/api/capture/items/{item_id}")
async def delete_capture_gallery_item(request: Request, item_id: str):
    role = _require_permission(request, "document.upload")
    ctx = _auth_context(request)
    from services.capture_service import get_capture_item

    existing = get_capture_item(ctx.firm_id, item_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Capture item not found")
    _require_client_access(request, role, existing["client_id"])
    if not delete_capture_item(ctx.firm_id, item_id):
        raise HTTPException(status_code=404, detail="Capture item not found")
    _log_audit_event(request, "capture.delete", "success", f"id={item_id}")
    return {"ok": True}


@app.get("/api/document-catalog/fields")
async def get_document_catalog_fields(
    request: Request,
    category_id: Optional[str] = Query(None),
):
    role = _require_permission(request, "document.view")
    _require_client_scope(request, role)
    if category_id:
        spec = list_catalog_field_defs(category_id)
        if not spec:
            raise HTTPException(status_code=404, detail="Unknown category_id")
        return spec
    return {"categories": list_all_catalog_field_defs()}


@app.get("/api/document-catalog")
async def get_document_catalog(
    request: Request,
    category_id: str = Query(...),
    period_key: Optional[str] = Query(None),
    sort: str = Query("client_name"),
    order: str = Query("asc", pattern="^(asc|desc)$"),
    metadata_status: Optional[str] = Query(None, description="Filter by ExtractedDocumentMeta status"),
    client_id: Optional[str] = Query(None, description="Comma-separated client ids"),
):
    role = _require_permission(request, "document.view")
    ctx = _auth_context(request)
    scope_map = _get_stakeholder_client_scope_map()
    allowed = visible_client_ids(ctx, scope_map)
    if client_id:
        requested = [c.strip() for c in client_id.split(",") if c.strip()]
        client_ids = [c for c in requested if c in allowed]
    else:
        client_ids = sorted(allowed)

    spec = list_catalog_field_defs(category_id)
    if not spec:
        raise HTTPException(status_code=404, detail="Unknown category_id")
    pk = period_key or spec["default_period_key"]

    try:
        payload = build_catalog_rows(
            ctx.firm_id,
            client_ids,
            category_id,
            pk,
            sort=sort,
            order=order,
            metadata_status=metadata_status,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    _log_audit_event(
        request,
        "document.catalog",
        "success",
        f"category={category_id} period={pk} sort={sort}",
    )
    return payload


class OcrJobCreateBody(BaseModel):
    client_id: str
    document_version_id: str
    period_key: Optional[str] = None
    slot_id: Optional[str] = None
    slot_label: Optional[str] = None


@app.post("/api/ocr/jobs")
async def post_ocr_job(
    request: Request,
    body: OcrJobCreateBody,
    background_tasks: BackgroundTasks,
):
    """資料版に対する非同期 OCR / 分類ジョブを起動する。"""
    role = _require_permission(request, "document.upload")
    _require_client_access(request, role, body.client_id)
    ctx = _auth_context(request)
    version = get_version(body.document_version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Document version not found")
    job = create_ocr_job(
        firm_id=ctx.firm_id,
        client_id=body.client_id,
        document_version_id=body.document_version_id,
        period_key=body.period_key,
        slot_id=body.slot_id,
        slot_label=body.slot_label,
    )
    background_tasks.add_task(run_ocr_job, job["id"])
    _log_audit_event(
        request,
        "ocr.job",
        "queued",
        f"job={job['id']} ver={body.document_version_id}",
    )
    return job


@app.get("/api/ocr/jobs/{job_id}")
async def get_ocr_job_status(request: Request, job_id: str, client_id: str = Query(...)):
    role = _require_permission(request, "document.view")
    _require_client_access(request, role, client_id)
    job = get_ocr_job(job_id)
    if not job or job["client_id"] != client_id:
        raise HTTPException(status_code=404, detail="OCR job not found")
    return job


@app.get("/api/document-status")
async def get_document_status(
    request: Request,
    client_id: str = Query(...),
    period_key: Optional[str] = Query(None),
):
    """必要書類マスタと保存済み資料を突き合わせ、不足状況を返す（不足資料エンジン v1）。

    - period_key 指定: その期間の単一ステータス（未アップロードでも必須一覧から不足を算出）。
    - 未指定: アップロード実績のある全期間のサマリ + 合計不足点数。
    """
    role = _require_permission(request, "document.view")
    _require_client_access(request, role, client_id)
    _init_slot_documents_db()
    logical_status = slot_status_map(client_id, period_key)
    access_clause = _slot_access_sql_filters(request)

    def approved_slots(pk: str) -> set[str]:
        return {sid for sid, st in logical_status.get(pk, {}).items() if st == "approved"}

    def _active_slot_ids(rows: list[sqlite3.Row]) -> set[str]:
        out: set[str] = set()
        for r in rows:
            sid = str(r["slot_id"])
            if sid.startswith("unassigned_") or sid.startswith("deleted_"):
                continue
            out.add(sid)
        return out

    with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        if period_key:
            rows = conn.execute(
                f"SELECT slot_id FROM slot_documents WHERE client_id=? AND period_key=?{access_clause}",
                (client_id, period_key),
            ).fetchall()
            filled = _active_slot_ids(rows)
            return compute_period_status(period_key, filled, approved_slots(period_key))
        rows = conn.execute(
            f"SELECT period_key, slot_id FROM slot_documents WHERE client_id=?{access_clause}",
            (client_id,),
        ).fetchall()

    by_period: Dict[str, set] = {}
    for r in rows:
        sid = str(r["slot_id"])
        if sid.startswith("unassigned_") or sid.startswith("deleted_"):
            continue
        by_period.setdefault(r["period_key"], set()).add(sid)

    periods = [
        compute_period_status(pk, ids, approved_slots(pk))
        for pk, ids in by_period.items()
    ]
    periods.sort(key=lambda p: p["period_key"])
    missing_total = sum(len(p["missing"]) for p in periods)
    pending_approval_total = sum(len(p.get("pending_approval") or []) for p in periods)
    incomplete = [p for p in periods if not p["complete"]]
    return {
        "client_id": client_id,
        "periods": periods,
        "missing_total": missing_total,
        "pending_approval_total": pending_approval_total,
        "incomplete_count": len(incomplete),
        "started_count": len(periods),
    }


@app.get("/api/firm-tasks", response_model=FirmTasksResponse)
async def get_firm_tasks(request: Request):
    """Aggregate missing / pending-approval tasks across visible clients (firm-scoped)."""
    role = _require_permission(request, "dashboard.view")
    ctx = _auth_context(request)
    scope_map = _get_stakeholder_client_scope_map()
    client_ids = sorted(visible_client_ids(ctx, scope_map))
    _init_slot_documents_db()

    assignee_index = build_client_assignee_index(ctx.firm_id)
    member_client_index = build_member_client_index(ctx.firm_id)
    member_names: dict[str, str] = {}
    for member in list_members_for_firm(ctx.firm_id):
        if member.status != MEMBER_STATUS_ACTIVE:
            continue
        label = (member.display_name or member.email or member.stakeholder_id or member.id).strip()
        member_names[member.stakeholder_id] = label
        member_names[member.id] = label

    def _assignees_for_client(client_id: str) -> List[FirmTaskAssignee]:
        pairs = assignee_index.get(client_id, [])
        out: List[FirmTaskAssignee] = []
        for member_id, assignment_role in pairs:
            out.append(
                FirmTaskAssignee(
                    member_id=member_id,
                    display_name=member_names.get(member_id, member_id),
                    assignment_role=assignment_role,
                )
            )
        return out

    def _primary_assignee_id(client_id: str) -> str | None:
        pairs = assignee_index.get(client_id, [])
        if not pairs:
            return None
        return pairs[0][0]

    items: List[FirmTaskItem] = []
    client_summaries: List[FirmClientTaskSummary] = []
    client_task_totals: dict[str, tuple[int, int]] = {}
    missing_total = 0
    pending_total = 0
    unassigned_missing = 0
    unassigned_pending = 0

    for cid in client_ids:
        logical_status = slot_status_map(cid, None)
        with sqlite3.connect(SLOT_DOCS_DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT period_key, slot_id FROM slot_documents WHERE client_id=?",
                (cid,),
            ).fetchall()
        by_period: Dict[str, set] = {}
        for row in rows:
            by_period.setdefault(str(row["period_key"]), set()).add(str(row["slot_id"]))

        client_missing = 0
        client_pending = 0
        incomplete_periods = 0
        client_assignees = _assignees_for_client(cid)
        primary_id = _primary_assignee_id(cid)

        for pk in sorted(by_period.keys()):
            filled = by_period[pk]
            approved = {sid for sid, st in logical_status.get(pk, {}).items() if st == "approved"}
            status = compute_period_status(pk, filled, approved)
            missing = status.get("missing") or []
            pending = status.get("pending_approval") or []
            client_missing += len(missing)
            client_pending += len(pending)
            if not status.get("complete"):
                incomplete_periods += 1
            for label in missing:
                if not client_assignees:
                    unassigned_missing += 1
                items.append(
                    FirmTaskItem(
                        client_id=cid,
                        period_key=pk,
                        slot_label=str(label),
                        kind="missing",
                        assignees=client_assignees,
                        primary_assignee_id=primary_id,
                    )
                )
            for label in pending:
                if not client_assignees:
                    unassigned_pending += 1
                items.append(
                    FirmTaskItem(
                        client_id=cid,
                        period_key=pk,
                        slot_label=str(label),
                        kind="pending_approval",
                        assignees=client_assignees,
                        primary_assignee_id=primary_id,
                    )
                )

        missing_total += client_missing
        pending_total += client_pending
        client_task_totals[cid] = (client_missing, client_pending)
        if client_missing or client_pending:
            client_summaries.append(
                FirmClientTaskSummary(
                    client_id=cid,
                    missing_total=client_missing,
                    pending_approval_total=client_pending,
                    incomplete_period_count=incomplete_periods,
                    assignees=client_assignees,
                )
            )

    role_map = _get_stakeholder_role_map()
    staff_summaries: List[FirmStaffTaskSummary] = []
    for member_id in sorted(member_client_index.keys()):
        if role_map.get(member_id) == "client_uploader":
            continue
        assigned = member_client_index.get(member_id, set())
        staff_missing = 0
        staff_pending = 0
        open_clients = 0
        for cid in assigned:
            if cid not in client_ids:
                continue
            m, p = client_task_totals.get(cid, (0, 0))
            staff_missing += m
            staff_pending += p
            if m or p:
                open_clients += 1
        visible_assigned = [c for c in assigned if c in client_ids]
        if not visible_assigned:
            continue
        staff_summaries.append(
            FirmStaffTaskSummary(
                member_id=member_id,
                display_name=member_names.get(member_id, member_id),
                missing_total=staff_missing,
                pending_approval_total=staff_pending,
                open_client_count=open_clients,
                assigned_client_count=len(visible_assigned),
                assigned_client_ids=sorted(visible_assigned),
            )
        )
    staff_summaries.sort(
        key=lambda row: row.missing_total + row.pending_approval_total,
        reverse=True,
    )

    _log_audit_event(
        request,
        "firm_tasks.list",
        "success",
        f"clients={len(client_ids)} items={len(items)} staff={len(staff_summaries)}",
    )
    return FirmTasksResponse(
        firm_id=ctx.firm_id,
        missing_total=missing_total,
        pending_approval_total=pending_total,
        client_count=len(client_ids),
        clients=client_summaries,
        items=items,
        staff=staff_summaries,
        unassigned_missing_total=unassigned_missing,
        unassigned_pending_total=unassigned_pending,
    )


def _firm_usage_counts(firm_id: str) -> tuple[int, int]:
    master = _load_client_master()
    client_count = sum(1 for c in master.clients if get_client_firm_id(c.id) == firm_id)
    seat_count = sum(1 for m in list_members_for_firm(firm_id) if m.status == MEMBER_STATUS_ACTIVE)
    return client_count, seat_count


@app.get("/api/billing/status")
async def get_billing_status_endpoint(request: Request):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    client_count, seat_count = _firm_usage_counts(ctx.firm_id)
    from services.stripe_connect_service import get_partner, partner_commission_active

    ai_summary = get_firm_ai_summary(ctx.firm_id)
    partner_info = partner_commission_active(ctx.firm_id)
    referral_partner = None
    from services.stripe_billing_service import load_billing_record

    billing_rec = load_billing_record(ctx.firm_id)
    if billing_rec.get("referralPartnerId"):
        p = get_partner(str(billing_rec["referralPartnerId"]))
        if p:
            referral_partner = {"id": p["id"], "name": p.get("name"), "onboardingComplete": p.get("onboardingComplete")}
    payload = get_billing_status(
        ctx.firm_id,
        client_count=client_count,
        seat_count=seat_count,
        ai_summary=ai_summary,
        partner=partner_info or referral_partner,
    )
    _log_audit_event(request, "billing.status", "success")
    return payload


@app.post("/api/billing/sync-usage")
async def post_billing_sync_usage_endpoint(request: Request):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    client_count, _ = _firm_usage_counts(ctx.firm_id)
    result = sync_firm_billing_usage(ctx.firm_id, client_count)
    _log_audit_event(request, "billing.sync_usage", "success")
    return result


@app.get("/api/billing/ai-usage")
async def get_billing_ai_usage_endpoint(request: Request, client_id: str | None = None):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    if client_id:
        from services.ai_usage_service import get_client_usage

        return get_client_usage(ctx.firm_id, client_id)
    master = _load_client_master()
    client_ids = [c.id for c in master.clients if get_client_firm_id(c.id) == ctx.firm_id]
    return {"summary": get_firm_ai_summary(ctx.firm_id), "clients": list_client_usages(ctx.firm_id, client_ids)}


@app.post("/api/billing/ai/paygo")
async def post_billing_ai_paygo_endpoint(request: Request):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    result = enable_paygo(ctx.firm_id)
    _log_audit_event(request, "billing.ai.paygo", "success")
    return result


@app.post("/api/billing/ai/topup")
async def post_billing_ai_topup_endpoint(request: Request, body: BillingAiTopupBody):
    _require_permission(request, "settings.manage")
    if not is_stripe_configured():
        raise HTTPException(status_code=503, detail="stripe_not_configured")
    ctx = _auth_context(request)
    packs = max(1, min(body.packs, 100))
    base = frontend_base_url()
    try:
        url = create_ai_topup_checkout(
            ctx.firm_id,
            packs=packs,
            email=ctx.email,
            success_url=f"{base}/settings?tab=billing&topup=success",
            cancel_url=f"{base}/settings?tab=billing&topup=cancel",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "billing.ai.topup", "success", f"packs={packs}")
    return {"url": url}


@app.get("/api/billing/partners")
async def get_billing_partners_endpoint(request: Request):
    _require_platform(request)
    return {"partners": list_partners()}


@app.post("/api/billing/partners")
async def post_billing_partners_endpoint(request: Request, body: BillingPartnerCreateBody):
    _require_platform(request)
    partner = create_partner(
        name=body.name,
        email=body.email,
        commission_percent=body.commission_percent,
    )
    _log_audit_event(request, "billing.partner.create", "success", partner["id"])
    return partner


@app.post("/api/billing/partners/{partner_id}/onboard")
async def post_billing_partner_onboard_endpoint(request: Request, partner_id: str):
    _require_platform(request)
    if not is_stripe_configured():
        raise HTTPException(status_code=503, detail="stripe_not_configured")
    try:
        url = create_onboarding_link(partner_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="partner_not_found") from exc
    _log_audit_event(request, "billing.partner.onboard", "success", partner_id)
    return {"url": url}


@app.post("/api/billing/partners/attach")
async def post_billing_partner_attach_endpoint(request: Request, body: BillingPartnerAttachBody):
    _require_permission(request, "settings.manage")
    ctx = _auth_context(request)
    try:
        record = attach_partner_to_firm(ctx.firm_id, body.partner_id, contract_years=body.contract_years)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="partner_not_found") from exc
    except ValueError as exc:
        if str(exc) == "invalid_contract_years":
            raise HTTPException(status_code=400, detail="invalid_contract_years") from exc
        raise
    _log_audit_event(request, "billing.partner.attach", "success", body.partner_id)
    return record


@app.post("/api/billing/checkout")
async def post_billing_checkout_endpoint(request: Request, body: BillingCheckoutBody):
    _require_permission(request, "settings.manage")
    if not is_stripe_configured():
        raise HTTPException(status_code=503, detail="stripe_not_configured")
    ctx = _auth_context(request)
    plan_id = body.plan_id.strip().lower()
    base = frontend_base_url()
    try:
        url = create_checkout_session(
            ctx.firm_id,
            plan_id,
            email=ctx.email,
            firm_label=ctx.firm_id,
            success_url=f"{base}/settings?tab=billing&checkout=success",
            cancel_url=f"{base}/settings?tab=billing&checkout=cancel",
        )
    except ValueError as exc:
        if str(exc) == "plan_price_not_configured":
            raise HTTPException(status_code=400, detail="plan_price_not_configured") from exc
        raise
    except RuntimeError as exc:
        if str(exc) == "stripe_not_configured":
            raise HTTPException(status_code=503, detail="stripe_not_configured") from exc
        raise
    _log_audit_event(request, "billing.checkout", "success", plan_id)
    return {"url": url}


@app.post("/api/billing/portal")
async def post_billing_portal_endpoint(request: Request, body: BillingPortalBody):
    _require_permission(request, "settings.manage")
    if not is_stripe_configured():
        raise HTTPException(status_code=503, detail="stripe_not_configured")
    ctx = _auth_context(request)
    return_path = body.return_path if body.return_path.startswith("/") else "/settings?tab=billing"
    base = frontend_base_url()
    try:
        url = create_portal_session(ctx.firm_id, return_url=f"{base}{return_path}")
    except ValueError as exc:
        if str(exc) == "no_stripe_customer":
            raise HTTPException(status_code=400, detail="no_stripe_customer") from exc
        raise
    _log_audit_event(request, "billing.portal", "success")
    return {"url": url}


@app.post("/api/billing/webhook")
async def post_billing_webhook_endpoint(request: Request):
    payload = await request.body()
    signature = request.headers.get("Stripe-Signature")
    try:
        result = handle_webhook(payload, signature)
    except RuntimeError as exc:
        code = str(exc)
        if code in ("stripe_not_configured", "webhook_secret_missing"):
            raise HTTPException(status_code=503, detail=code) from exc
        raise
    except ValueError as exc:
        if str(exc) == "invalid_webhook_signature":
            raise HTTPException(status_code=400, detail="invalid_webhook_signature") from exc
        raise
    _log_audit_event(request, "billing.webhook", "success", str(result.get("type", "")))
    return result


@app.on_event("startup")
async def on_startup() -> None:
    for warning in validate_auth_config():
        logging.getLogger("docugrid.auth").warning(warning)
    _init_audit_links_db()
    _init_audit_events_db()
    init_auto_vouch_db()
    init_auto_vouch_queue_db()
    _init_slot_documents_db()
    _init_review_events_db()
    init_document_versions_db()
    init_client_assignments_db()
    init_ai_usage_db()
    init_platform_metrics_db()
    init_firm_members_db()
    bootstrap_member_directory_example()
    bootstrap_firm_members()
    bootstrap_screen_design_examples()
    migrate_legacy_settings_if_needed()
    _migrate_firm_id_backfill()
    migrate_logical_firm_id_backfill()

# --- 1. PDF情報取得 ---
@app.post("/api/pdf/info")
async def get_pdf_info(request: Request, file: UploadFile = File(...)):
    role = _require_permission(request, "document.upload")
    _require_client_scope(request, role)
    try:
        content = await file.read()
        doc = fitz.open("pdf", content)
        _log_audit_event(request, "pdf.info", "success", f"pages={len(doc)}")
        return {"page_count": len(doc), "pageCount": len(doc)}
    except Exception as e:
        return JSONResponse(status_code=500, content={"message": str(e)})

# --- 2. 編集・描画 (大幅強化) ---
@app.post("/api/highlight")
async def highlight_pdf(
    request: Request,
    file: UploadFile = File(...),
    page: int = Form(...),
    # 0.0〜1.0の正規化座標 (画面上の比率) で受け取る
    x: float = Form(...),
    y: float = Form(...),
    w: float = Form(...),
    h: float = Form(...),
    type: str = Form("marker"),  # marker, box, line, check, eraser
    # marker / eraser のフリーハンド: [{ "x": 0..1, "y": 0..1 }, ...] の JSON 配列
    path_json: Optional[str] = Form(None),
    # "1" / "true" のとき PDF に加えレンダー PNG を JSON で返し、クライアントの2往復を1回にまとめる
    include_render: Optional[str] = Form(None),
):
    role = _require_permission(request, "document.annotate")
    _require_client_scope(request, role)
    try:
        content = await file.read()
        doc = fitz.open("pdf", content)
        
        if 0 <= page < len(doc):
            p = doc[page]
            page_w = p.rect.width
            page_h = p.rect.height
            
            # 比率を実際のPDF座標に変換
            abs_x = x * page_w
            abs_y = y * page_h
            abs_w = w * page_w
            abs_h = h * page_h
            
            rect = fitz.Rect(abs_x, abs_y, abs_x + abs_w, abs_y + abs_h)
            stroke_path = parse_norm_path_json(path_json)

            if type == "box":
                p.draw_rect(rect, color=(1, 0, 0), width=3)
            elif type == "marker":
                if stroke_path:
                    draw_freehand_marker(p, stroke_path)
                else:
                    annot = p.add_highlight_annot(rect)
                    annot.set_colors(stroke=(1, 1, 0))
                    annot.update()
            elif type == "line":
                # 左上から右下へ線を引く
                p.draw_line((abs_x, abs_y), (abs_x + abs_w, abs_y + abs_h), color=(0, 0, 1), width=3)
            elif type == "check":
                # チェックマークを描画 (2本の線で構成)
                p.draw_line(
                    (abs_x, abs_y + abs_h * 0.6),
                    (abs_x + abs_w * 0.4, abs_y + abs_h),
                    color=(0, 0.8, 0),
                    width=4,
                )
                p.draw_line(
                    (abs_x + abs_w * 0.4, abs_y + abs_h),
                    (abs_x + abs_w, abs_y),
                    color=(0, 0.8, 0),
                    width=4,
                )
            elif type == "eraser":
                erase_rect = path_bbox_rect(p, stroke_path) if stroke_path else rect
                delete_annots_intersecting(p, erase_rect)
                if stroke_path:
                    draw_freehand_eraser(p, stroke_path)
                else:
                    erase_region(p, rect)

        output_buffer = io.BytesIO()
        doc.save(output_buffer)
        output_buffer.seek(0)
        pdf_bytes = output_buffer.getvalue()
        _log_audit_event(request, "pdf.highlight", "success", f"page={page} type={type}")

        want_render = include_render and str(include_render).lower() in ("1", "true", "yes", "on")
        if want_render:
            preview_b64 = ""
            doc_r = None
            try:
                doc_r = fitz.open(stream=pdf_bytes, filetype="pdf")
                if 0 <= page < len(doc_r):
                    pr = doc_r[page]
                    pix = pr.get_pixmap(matrix=fitz.Matrix(2.0, 2.0))
                    preview_b64 = base64.b64encode(pix.tobytes("png")).decode("utf-8")
            except Exception as render_err:
                print(f"Highlight include_render preview: {render_err}")
            finally:
                if doc_r is not None:
                    doc_r.close()
            return JSONResponse(
                content={
                    "pdf_base64": base64.b64encode(pdf_bytes).decode("utf-8"),
                    "preview_png_base64": preview_b64,
                }
            )

        return Response(content=pdf_bytes, media_type="application/pdf")

    except Exception as e:
        print(f"Highlight Error: {str(e)}")
        return JSONResponse(status_code=500, content={"message": str(e)})

# --- 3. ページ並べ替え ---
@app.post("/api/edit/reorder")
async def reorder_pdf(
    request: Request,
    file: UploadFile = File(...),
    order: str = Form(...)
):
    role = _require_permission(request, "document.annotate")
    _require_client_scope(request, role)
    try:
        content = await file.read()
        doc = fitz.open("pdf", content)
        try:
            page_indices = [int(x.strip()) for x in order.split(",") if x.strip()]
        except ValueError:
            return JSONResponse(status_code=400, content={"message": "Invalid order format"})

        max_page = len(doc) - 1
        valid_indices = [idx for idx in page_indices if 0 <= idx <= max_page]
        if not valid_indices:
            return JSONResponse(status_code=400, content={"message": "No valid pages to reorder"})

        doc.select(valid_indices)
        output_buffer = io.BytesIO()
        doc.save(output_buffer)
        output_buffer.seek(0)
        _log_audit_event(request, "pdf.reorder", "success", f"order={order}")
        return Response(content=output_buffer.getvalue(), media_type="application/pdf")

    except Exception as e:
        return JSONResponse(status_code=500, content={"message": str(e)})

# --- 4. サムネイル取得 ---
@app.post("/api/pdf/thumbnails")
async def get_pdf_thumbnails(request: Request, file: UploadFile = File(...)):
    role = _require_permission(request, "document.view")
    _require_client_scope(request, role)
    try:
        content = await file.read()
        doc = fitz.open("pdf", content)
        thumbnails = []
        for page in doc:
            pix = page.get_pixmap(matrix=fitz.Matrix(0.3, 0.3)) 
            img_data = pix.tobytes("png")
            b64_str = base64.b64encode(img_data).decode("utf-8")
            thumbnails.append(f"data:image/png;base64,{b64_str}")
        _log_audit_event(request, "pdf.thumbnails", "success", f"count={len(thumbnails)}")
        return JSONResponse(content={"thumbnails": thumbnails})
    except Exception as e:
        return JSONResponse(status_code=500, content={"message": str(e)})

# --- 5. PDF結合（OrderPayload + ファイル ID 対応） ---
@app.post("/api/edit/merge-ordered")
async def merge_pdfs_ordered(
    request: Request,
    order: str = Form(..., description="JSON string of OrderPayload (camelCase)"),
    file_ids: str = Form(..., description='JSON array of file ids, same order as "files" parts'),
    files: List[UploadFile] = File(...),
):
    """
    multipart/form-data:
    - `order`: OrderPayload の JSON 文字列（version, orderedPages, highlightsByPage など）
    - `file_ids`: `["file-uuid-1","file-uuid-2"]` 形式（`files` と同じ長さ・順序）
    - `files`: 各 file_id に対応する PDF バイナリ（フィールド名はすべて `files`）
    """
    role = _require_permission(request, "document.upload")
    _require_client_scope(request, role)
    try:
        payload = OrderPayload.model_validate_json(order)
        ids = json.loads(file_ids)
        if not isinstance(ids, list) or not all(isinstance(x, str) for x in ids):
            raise HTTPException(status_code=400, detail="file_ids must be a JSON array of strings")
        if len(ids) != len(files):
            raise HTTPException(status_code=400, detail="file_ids and files length mismatch")
        file_bytes_by_id: dict[str, bytes] = {}
        for fid, uf in zip(ids, files):
            file_bytes_by_id[fid] = await uf.read()
        merged_bytes = merge_pdf_bytes_from_order_payload(file_bytes_by_id, payload)
        hl = payload.highlights_by_page
        hl_note = f" highlight_batches={len(hl)}" if hl else ""
        _log_audit_event(
            request,
            "pdf.merge_ordered",
            "success",
            f"ordered_pages={len(payload.ordered_pages)}{hl_note}",
        )
        return Response(content=merged_bytes, media_type="application/pdf")
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse(status_code=500, content={"message": str(e)})


@app.post("/api/edit/merge")
async def merge_pdfs(request: Request, files: List[UploadFile] = File(...)):
    role = _require_permission(request, "document.upload")
    _require_client_scope(request, role)
    try:
        merged_doc = fitz.open()
        for file in files:
            content = await file.read()
            doc = fitz.open("pdf", content)
            merged_doc.insert_pdf(doc)
        output_buffer = io.BytesIO()
        merged_doc.save(output_buffer)
        output_buffer.seek(0)
        _log_audit_event(request, "pdf.merge", "success", f"files={len(files)}")
        return Response(content=output_buffer.getvalue(), media_type="application/pdf")
    except Exception as e:
        return JSONResponse(status_code=500, content={"message": str(e)})

# --- 6. ページ画像レンダリング (NEW!) ---
# 編集用に高画質(matrix=2.0)で1ページだけ取得する
@app.post("/api/pdf/render")
async def render_pdf_page(
    request: Request,
    file: UploadFile = File(...),
    page: int = Form(...)
):
    role = _require_permission(request, "document.view")
    _require_client_scope(request, role)
    try:
        content = await file.read()
        doc = fitz.open("pdf", content)
        if 0 <= page < len(doc):
            p = doc[page]
            pix = p.get_pixmap(matrix=fitz.Matrix(2.0, 2.0))
            img_data = pix.tobytes("png")
            _log_audit_event(request, "pdf.render", "success", f"page={page}")
            return Response(content=img_data, media_type="image/png")
        else:
            return JSONResponse(status_code=400, content={"message": "Page out of range"})
    except Exception as e:
        return JSONResponse(status_code=500, content={"message": str(e)})


# --- DocuGrid ワークスペース永続化 ---
@app.post("/api/docugrid/save")
async def docugrid_save(request: Request, body: DocugridSaveRequest):
    role = _require_permission(request, "document.annotate")
    if not (body.client_id and body.period_key and body.slot_id):
        raise HTTPException(
            status_code=400,
            detail="client_id, period_key, and slot_id are required",
        )
    _require_client_access(request, role, body.client_id)
    ctx = _auth_context(request)
    try:
        out = save_workspace(
            body,
            client_id=body.client_id,
            firm_id=ctx.firm_id,
        )
        doc_id = out.get("documentId")
        if doc_id:
            _link_docugrid_to_slot(body.client_id, body.period_key, body.slot_id, str(doc_id))
        _log_audit_event(
            request,
            "docugrid.save",
            "success",
            f"documentId={doc_id} client={body.client_id} slot={body.slot_id}",
        )
        return out
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse(status_code=500, content={"message": str(e)})


@app.get("/api/docugrid/load/{document_id}")
async def docugrid_load(request: Request, document_id: str):
    role = _require_permission(request, "document.view")
    workspace_client_id = resolve_docugrid_client_id(document_id)
    if not workspace_client_id:
        raise HTTPException(status_code=404, detail="Workspace not linked to a client slot")
    _require_client_access(request, role, workspace_client_id)
    try:
        data = load_workspace(document_id)
        _log_audit_event(request, "docugrid.load", "success", f"documentId={document_id}")
        return data
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse(status_code=500, content={"message": str(e)})
