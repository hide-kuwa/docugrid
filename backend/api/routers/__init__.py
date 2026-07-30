from fastapi import FastAPI
from api.routers.ai_prompts import router as ai_prompts_router
from api.routers.core import router as core_router
from api.routers.dev_form_catalog import router as dev_form_catalog_router
from api.routers.legal_master import router as legal_master_router
from api.routers.taxx_tools import router as taxx_tools_router
from api.routers.metric_mappings import router as metric_mappings_router
from api.routers.integrations import router as integrations_router
from api.routers.auth import router as auth_router
from api.routers.firm import router as firm_router
from api.routers.audit import router as audit_router
from api.routers.slots import router as slots_router
from api.routers.review_events import router as review_events_router
from api.routers.documents import router as documents_router
from api.routers.payroll import router as payroll_router
from api.routers.capture import router as capture_router
from api.routers.client_data import router as client_data_router
from api.routers.billing import router as billing_router
from api.routers.pdf import router as pdf_router


def register_routers(app: FastAPI) -> None:
    app.include_router(ai_prompts_router)
    app.include_router(core_router)
    app.include_router(dev_form_catalog_router)
    app.include_router(legal_master_router)
    app.include_router(taxx_tools_router)
    app.include_router(metric_mappings_router)
    app.include_router(integrations_router)
    app.include_router(auth_router)
    app.include_router(firm_router)
    app.include_router(audit_router)
    app.include_router(slots_router)
    app.include_router(review_events_router)
    app.include_router(documents_router)
    app.include_router(payroll_router)
    app.include_router(capture_router)
    app.include_router(client_data_router)
    app.include_router(billing_router)
    app.include_router(pdf_router)
