#!/usr/bin/env python3
"""Split api/application.py into api/routers/* and slim application.py."""

from __future__ import annotations

import re
import textwrap
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
APP_PATH = BACKEND / "api" / "application.py"
ROUTERS_DIR = BACKEND / "api" / "routers"

ROUTERS: list[tuple[int, int, str]] = [
    (470, 738, "core"),
    (739, 1080, "dev_form_catalog"),
    (1081, 1228, "legal_master"),
    (1229, 1431, "metric_mappings"),
    (1432, 1770, "integrations"),
    (1771, 2087, "auth"),
    (2088, 2326, "firm"),
    (2327, 2654, "audit"),
    (2831, 3770, "slots"),
    (3771, 4061, "review_events"),
    (4062, 4850, "documents"),
    (4851, 4945, "payroll"),
    (4946, 5443, "capture"),
    (5444, 6016, "client_data"),
    (6017, 6282, "billing"),
    (6283, 6584, "pdf"),
]

HELPER_RANGES: list[tuple[int, int]] = [
    (2655, 2828),
    (3504, 3573),
    (3839, 3904),
]

TIMELINE_CLASS_RANGE = (2742, 2743)


def read_lines() -> list[str]:
    return APP_PATH.read_text(encoding="utf-8").splitlines()


def slice_lines(lines: list[str], start: int, end: int) -> str:
    return "\n".join(lines[start - 1 : end]) + "\n"


def transform_routes(body: str) -> str:
    return re.sub(r"@app\.", "@router.", body)


def router_file(name: str, body: str) -> str:
    header = textwrap.dedent(
        f'''\
        """DocuGrid API — {name} routes."""

        from __future__ import annotations

        from fastapi import APIRouter

        from api.router_imports import *  # noqa: F403
        from api.constants import *  # noqa: F403
        from api.deps import *  # noqa: F403
        from api.persistence import *  # noqa: F403
        from api.master_store import *  # noqa: F403
        from api.session import *  # noqa: F403
        from api.billing_access import *  # noqa: F403
        from api.schemas import *  # noqa: F403
        from api.route_helpers import *  # noqa: F403

        router = APIRouter()

        '''
    )
    return header + transform_routes(body)


def main() -> int:
    lines = read_lines()
    total = len(lines)

    # --- router_imports.py (service imports, lines 1-400) ---
    imports_body = slice_lines(lines, 1, 400)
    (BACKEND / "api" / "router_imports.py").write_text(
        '"""Shared imports for API route modules (extracted from application.py)."""\n\n'
        + imports_body,
        encoding="utf-8",
    )

    # --- route_helpers.py ---
    helper_parts: list[str] = []
    for start, end in HELPER_RANGES:
        helper_parts.append(slice_lines(lines, start, end).rstrip())
    helpers = (
        '"""Shared route helpers (slots, review events)."""\n\n'
        "from __future__ import annotations\n\n"
        "from api.router_imports import *  # noqa: F403\n\n"
        + "\n\n".join(helper_parts)
        + "\n"
    )
    (BACKEND / "api" / "route_helpers.py").write_text(helpers, encoding="utf-8")

    # --- ReviewTimelineItem → schemas.py ---
    schemas_path = BACKEND / "api" / "schemas.py"
    schemas_text = schemas_path.read_text(encoding="utf-8")
    if "class ReviewTimelineItem" not in schemas_text:
        timeline_class = slice_lines(lines, *TIMELINE_CLASS_RANGE).strip()
        marker = "class ReviewEventItem(BaseModel):"
        idx = schemas_text.find(marker)
        if idx == -1:
            raise RuntimeError("ReviewEventItem not found in schemas.py")
        insert_at = schemas_text.find("\n\n", idx)
        schemas_text = (
            schemas_text[: insert_at + 2]
            + timeline_class
            + "\n\n"
            + schemas_text[insert_at + 2 :]
        )
        schemas_path.write_text(schemas_text, encoding="utf-8")

    # --- router modules ---
    ROUTERS_DIR.mkdir(parents=True, exist_ok=True)
    router_names: list[str] = []
    for start, end, name in ROUTERS:
        if end > total:
            raise RuntimeError(f"{name}: end line {end} > file length {total}")
        body = slice_lines(lines, start, end)
        out = ROUTERS_DIR / f"{name}.py"
        out.write_text(router_file(name, body), encoding="utf-8")
        router_names.append(name)

    # --- routers/__init__.py ---
    register_lines = ["from fastapi import FastAPI\n"]
    for name in router_names:
        register_lines.append(f"from api.routers.{name} import router as {name}_router\n")
    register_lines.append("\n\n")
    register_lines.append("def register_routers(app: FastAPI) -> None:\n")
    for name in router_names:
        register_lines.append(f"    app.include_router({name}_router)\n")
    (ROUTERS_DIR / "__init__.py").write_text("".join(register_lines), encoding="utf-8")

    # --- slim application.py ---
    startup_body = slice_lines(lines, 422, 449).replace("def _startup_init_db", "def startup_init_db")
    cors_body = slice_lines(lines, 451, 467)

    app_py = textwrap.dedent(
        '''\
        """DocuGrid FastAPI application factory."""

        from __future__ import annotations

        from fastapi import FastAPI, Request
        from fastapi.middleware.cors import CORSMiddleware
        from fastapi.responses import JSONResponse

        from docugrid_auth import csrf_validation_failed, get_cors_origins

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


        '''
    )
    app_py += startup_body + "\n\n"
    app_py += cors_body + "\n\n"
    app_py += "register_routers(app)\n"

    APP_PATH.write_text(app_py, encoding="utf-8")
    print(f"Split {total} lines into {len(router_names)} routers + route_helpers + slim application.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
