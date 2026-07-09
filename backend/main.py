"""DocuGrid API entrypoint (uvicorn main:app)."""

from api.env import load_local_env

load_local_env()

from api.application import app  # noqa: F401

# Test / legacy imports (keep stable `from main import ...` paths).
from api.constants import (  # noqa: F401
    AUDIT_EVENTS_DB_PATH,
    CLIENT_MASTER_PATH,
    DEFAULT_STAKEHOLDER_CLIENT_SCOPES,
    ROLE_PERMISSIONS_PATH,
    STAKEHOLDER_MASTER_PATH,
    _role_permissions_cache,
)
from api.deps import (  # noqa: F401
    _get_role_permissions,
    _invalidate_role_permissions_cache,
    _invalidate_stakeholder_maps_cache,
)
from api.persistence import (  # noqa: F401
    _init_audit_events_db,
    _init_review_events_db,
    _init_slot_documents_db,
    _migrate_firm_id_backfill,
)

# Symbols tests monkeypatch via `main.*` (re-export from application).
from api.application import (  # noqa: F401
    create_checkout_session,
    is_stripe_configured,
    run_auto_vouch,
    verify_google_id_token,
)

__all__ = ["app"]
