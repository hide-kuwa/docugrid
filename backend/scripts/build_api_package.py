#!/usr/bin/env python3
"""Build api package modules from api/application.py and thin main.py."""

from __future__ import annotations

import re
import textwrap
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
APP_PATH = BACKEND / "api" / "application.py"
MAIN_PATH = BACKEND / "main.py"
API = BACKEND / "api"


def read_app_lines() -> list[str]:
    return APP_PATH.read_text(encoding="utf-8").splitlines()


def slice_lines(lines: list[str], start: int, end: int) -> str:
    return "\n".join(lines[start - 1 : end]) + "\n"


def extract_schema_blocks(lines: list[str]) -> str:
    out: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if re.match(r"^class \w+\(BaseModel\)", line):
            block: list[str] = []
            while i < len(lines):
                nxt = lines[i]
                if block and (
                    re.match(r"^class \w+", nxt)
                    or re.match(r"^def _", nxt)
                    or nxt.startswith("@app.")
                ):
                    break
                block.append(nxt)
                i += 1
            out.extend(block)
            out.append("")
            continue
        i += 1
    return "\n".join(out)


def remove_ranges(lines: list[str], ranges: list[tuple[int, int]]) -> list[str]:
    drop = set()
    for start, end in sorted(ranges, reverse=True):
        for n in range(start, end + 1):
            drop.add(n)
    return [line for i, line in enumerate(lines, start=1) if i not in drop]


def main() -> int:
    lines = read_app_lines()

    # --- constants.py: paths + RBAC + billing constants ---
    constants_body = slice_lines(lines, 491, 600) + slice_lines(lines, 676, 694)
    (API / "constants.py").write_text(
        textwrap.dedent(
            '''\
            """Storage paths, RBAC defaults, billing constants."""

            from __future__ import annotations

            from pathlib import Path

            '''
        )
        + constants_body,
        encoding="utf-8",
    )

    # --- deps.py: permissions, authz, audit (602-675, 697-1001) ---
    deps_body = slice_lines(lines, 602, 675) + slice_lines(lines, 697, 1001)
    deps_header = textwrap.dedent(
        '''\
        """AuthZ dependencies, stakeholder maps, audit helpers."""

        from __future__ import annotations

        import json
        import sqlite3
        import urllib.parse
        from datetime import datetime
        from pathlib import Path
        from typing import Optional

        import fitz
        from fastapi import HTTPException, Request, UploadFile

        from docugrid_auth import is_production, peek_identity_for_audit, resolve_identity
        from services.client_assignments import (
            backfill_assignments_from_legacy,
            init_client_assignments_db,
            load_assignment_scope_map,
        )
        from services.document_version_service import is_logical_deleted, is_logical_purged
        from services.tenancy import (
            AuthContext,
            authorize_client_access,
            authorize_client_permission,
            authorize_client_scope_header,
            authorize_firm_resource,
            build_auth_context,
        )
        from services.upload_limits import enforce_upload_size
        from docugrid_auth import STAKEHOLDER_ROLE_BY_ID

        from api.constants import (
            AUDIT_EVENTS_DB_PATH,
            BILLING_ACTIVE_STATUSES,
            BILLING_BLOCKED_PERMISSIONS,
            DEFAULT_ROLE_PERMISSIONS,
            DEFAULT_STAKEHOLDER_CLIENT_SCOPES,
            KNOWN_APP_PERMISSIONS,
            ROLE_PERMISSIONS_PATH,
            STAKEHOLDER_MASTER_PATH,
            _role_permissions_cache,
            _stakeholder_maps_cache,
        )
        from api.persistence import init_audit_events_db

        '''
    )
    (API / "deps.py").write_text(deps_header + deps_body, encoding="utf-8")

    # --- schemas.py ---
    schema_header = textwrap.dedent(
        '''\
        """API request/response Pydantic models."""

        from __future__ import annotations

        from typing import List, Optional

        from pydantic import BaseModel, Field

        from docugrid_auth import MCP_JWT_AUDIENCE

        '''
    )
    (API / "schemas.py").write_text(schema_header + extract_schema_blocks(lines), encoding="utf-8")

    # --- persistence.py (1460-1657) ---
    persist_header = textwrap.dedent(
        '''\
        """SQLite schema bootstrap."""

        from __future__ import annotations

        import sqlite3
        from typing import Optional

        from api.constants import (
            AUDIT_EVENTS_DB_PATH,
            AUDIT_LINKS_DB_PATH,
            REVIEW_EVENTS_DB_PATH,
            SLOT_DOCS_DB_PATH,
        )

        '''
    )
    (API / "persistence.py").write_text(persist_header + slice_lines(lines, 1460, 1657), encoding="utf-8")

    # --- master_store.py (1659-1959) ---
    master_header = textwrap.dedent(
        '''\
        """Master JSON stores."""

        from __future__ import annotations

        import json
        from datetime import datetime, timezone
        from typing import Optional

        from fastapi import HTTPException

        from api.constants import (
            CLIENT_MASTER_PATH,
            ROLE_PERMISSIONS_PATH,
            STAKEHOLDER_MASTER_PATH,
            SYSTEM_CONFIG_PATH,
            _role_permissions_cache,
        )
        from api.deps import _invalidate_role_permissions_cache
        from api.schemas import (
            ClientMasterClient,
            ClientMasterGroup,
            ClientMasterRelation,
            ClientMasterPayload,
            RolePermissionsPayload,
            StakeholderMasterPayload,
            SystemConfigPayload,
            SystemConfigUpdateBody,
        )
        from services.firm_settings import (
            configured_flags,
            get_gemini_key,
            get_openai_key,
            load_system_config_raw,
            save_system_config_raw,
            update_secrets,
        )
        from services.tenancy import AuthContext, get_client_firm_id

        '''
    )
    (API / "master_store.py").write_text(master_header + slice_lines(lines, 1659, 1959), encoding="utf-8")

    # --- session.py (3658-3819) ---
    session_header = textwrap.dedent(
        '''\
        """Login session helpers."""

        from __future__ import annotations

        import sqlite3
        from datetime import datetime

        from fastapi import HTTPException, Request
        from fastapi.responses import JSONResponse, Response

        from docugrid_auth import (
            SESSION_COOKIE_NAME,
            attach_csrf_cookie,
            create_access_token,
            get_jwt_exp_seconds,
            session_cookie_enabled,
            session_cookie_secure,
        )
        from api.constants import AUDIT_EVENTS_DB_PATH
        from api.deps import _get_stakeholder_role_map
        from api.persistence import init_audit_events_db
        from api.schemas import TokenResponse
        from services.firm_members import resolve_member_for_login
        from services.login_stakeholder import login_stakeholder_pick_allowed

        '''
    )
    (API / "session.py").write_text(session_header + slice_lines(lines, 3658, 3725) + slice_lines(lines, 3753, 3819), encoding="utf-8")

    # --- billing_access.py (3726-3752) ---
    billing_header = textwrap.dedent(
        '''\
        """Firm billing owner authorization."""

        from __future__ import annotations

        from fastapi import HTTPException, Request

        from api.deps import _auth_context
        from services.firm_members import get_member_by_id
        from services.firm_onboarding import is_billing_owner_role
        from services.super_admin import is_super_admin_email
        from services.tenancy import AuthContext

        '''
    )
    (API / "billing_access.py").write_text(billing_header + slice_lines(lines, 3726, 3752), encoding="utf-8")

    # --- Strip application.py ---
    stripped = remove_ranges(
        lines,
        [
            (16, 31),
            (491, 600),
            (602, 675),
            (676, 694),
            (697, 1001),
            (1460, 1959),
            (3658, 3725),
            (3726, 3752),
            (3753, 3819),
        ],
    )

    # Remove all Pydantic model classes (now in api/schemas.py)
    cleaned: list[str] = []
    i = 0
    while i < len(stripped):
        line = stripped[i]
        if re.match(r"^class \w+\(BaseModel\)", line):
            i += 1
            while i < len(stripped):
                nxt = stripped[i]
                if re.match(r"^class \w+", nxt) or re.match(r"^def _", nxt) or nxt.startswith("@app."):
                    break
                i += 1
            continue
        cleaned.append(line)
        i += 1

    import_block = textwrap.dedent(
        '''\
        from api.constants import *  # noqa: F403
        from api.deps import *  # noqa: F403
        from api.persistence import *  # noqa: F403
        from api.master_store import *  # noqa: F403
        from api.session import *  # noqa: F403
        from api.billing_access import *  # noqa: F403
        from api import schemas

        '''
    )

    # Remove old env loader from cleaned start if still present
    while cleaned and (cleaned[0].startswith("def _load_local_env") or cleaned[0].strip() == "_load_local_env()"):
        cleaned.pop(0)

    # Insert imports after initial stdlib/third-party imports - find first blank after typing import
    insert_at = 0
    for idx, line in enumerate(cleaned):
        if line.startswith("from services.") or line.startswith("from docugrid_auth"):
            insert_at = idx
    # after last service import block
    for idx in range(len(cleaned) - 1, -1, -1):
        if cleaned[idx].startswith("from ") or cleaned[idx].startswith("import "):
            insert_at = idx + 1
            break

    final_lines = cleaned[:insert_at] + ["", import_block.strip(), ""] + cleaned[insert_at:]

    # Replace schema references - routes use bare class names; add schema imports
    schema_import = "from api.schemas import *  # noqa: F403\n"
    if schema_import.strip() not in "\n".join(final_lines):
        final_lines.insert(insert_at + 2, schema_import)

    APP_PATH.write_text("\n".join(final_lines) + "\n", encoding="utf-8")

    # --- thin main.py ---
    MAIN_PATH.write_text(
        textwrap.dedent(
            '''\
            """DocuGrid API entrypoint (uvicorn main:app)."""

            from api.env import load_local_env

            load_local_env()

            from api.application import app  # noqa: F401

            # Test / legacy imports (keep stable paths).
            from api.application import (  # noqa: F401
                AUDIT_EVENTS_DB_PATH,
                DEFAULT_STAKEHOLDER_CLIENT_SCOPES,
                _get_role_permissions,
                _init_audit_events_db,
                _init_review_events_db,
                _init_slot_documents_db,
                _invalidate_role_permissions_cache,
                _invalidate_stakeholder_maps_cache,
                _migrate_firm_id_backfill,
                _role_permissions_cache,
            )

            __all__ = ["app"]
            '''
        ),
        encoding="utf-8",
    )

    (API / "__init__.py").write_text(
        '"""DocuGrid API package."""\n\nfrom api.application import app\n\n__all__ = ["app"]\n',
        encoding="utf-8",
    )

    print("Refactor complete. Run pytest.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
