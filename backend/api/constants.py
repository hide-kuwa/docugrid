"""Storage paths, RBAC defaults, billing constants."""

from __future__ import annotations

from pathlib import Path

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

BILLING_ACTIVE_STATUSES = frozenset({"active", "trialing"})
# When subscription is not active (none/past_due/unpaid/incomplete/canceled...), block
# "product usage" permissions so the user must go to the billing screen.
BILLING_BLOCKED_PERMISSIONS = frozenset(
    {
        "client.view",
        "client.edit",
        "document.view",
        "document.upload",
        "document.purge",
        "document.annotate",
        "document.comment",
        "audit.link",
        "audit.approve",
        "review_checklist.edit",
        "alert.view",
        "alert.manage",
    }
)

__all__ = [
    "AUDIT_EVENTS_DB_PATH",
    "AUDIT_LINKS_DB_PATH",
    "BILLING_ACTIVE_STATUSES",
    "BILLING_BLOCKED_PERMISSIONS",
    "CLIENT_MASTER_PATH",
    "KNOWN_APP_PERMISSIONS",
    "REVIEW_EVENTS_DB_PATH",
    "ROLE_PERMISSIONS_PATH",
    "SLOT_DOCS_DB_PATH",
    "SLOT_FILES_DIR",
    "STAKEHOLDER_MASTER_PATH",
    "STORAGE_DIR",
    "SYSTEM_CONFIG_PATH",
    "_role_permissions_cache",
    "_stakeholder_maps_cache",
]
