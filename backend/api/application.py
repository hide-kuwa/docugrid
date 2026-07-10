"""DocuGrid FastAPI application factory."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from docugrid_auth import csrf_validation_failed, get_cors_origins, validate_auth_config

from api.constants import *  # noqa: F403
from api.deps import *  # noqa: F403
from api.persistence import *  # noqa: F403
from api.router_imports import *  # noqa: F403
from api.routers import register_routers

# Re-export for tests (monkeypatch via api.application.*).
from services.auto_vouching import run_auto_vouch  # noqa: F401
from services.google_oauth import verify_google_id_token  # noqa: F401
from services.stripe_billing_service import (  # noqa: F401
    create_checkout_session,
    is_stripe_configured,
)

app = FastAPI()


@app.middleware("http")
async def csrf_middleware(request: Request, call_next):
    if csrf_validation_failed(request):
        return JSONResponse(status_code=403, content={"detail": "CSRF validation failed"})
    response = await call_next(request)
    return response


@app.on_event("startup")
def startup_init_db() -> None:
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
    # validate_auth_config() raises RuntimeError on fatal production misconfiguration.
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
    from services.firm_onboarding import init_firm_onboarding_db

    init_firm_onboarding_db()
    bootstrap_member_directory_example()
    bootstrap_firm_members()
    bootstrap_screen_design_examples()
    migrate_legacy_settings_if_needed()
    _migrate_firm_id_backfill()
    migrate_logical_firm_id_backfill()


@app.exception_handler(HTTPException)
async def audit_aware_http_exception_handler(request: Request, exc: HTTPException):
    if exc.status_code in (401, 403):
        _init_audit_events_db()
        _log_audit_denial(request, exc.status_code, _format_http_detail(exc.detail))
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


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


register_routers(app)
