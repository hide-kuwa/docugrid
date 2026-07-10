#!/usr/bin/env python3
"""Fix router module imports after split."""

from pathlib import Path

ROUTERS_DIR = Path(__file__).resolve().parent.parent / "api" / "routers"

HEADER = '''\
from api.router_imports import *  # noqa: F403
from api.constants import *  # noqa: F403
from api.deps import *  # noqa: F403
from api.persistence import *  # noqa: F403
from api.master_store import *  # noqa: F403
from api.session import *  # noqa: F403
from api.billing_access import *  # noqa: F403
from api.schemas import *  # noqa: F403
from api.route_helpers import *  # noqa: F403
'''

OLD = """from api.router_imports import *  # noqa: F403
from api.route_helpers import *  # noqa: F403
"""


def main() -> None:
    for path in ROUTERS_DIR.glob("*.py"):
        if path.name == "__init__.py":
            continue
        text = path.read_text(encoding="utf-8")
        if OLD in text:
            path.write_text(text.replace(OLD, HEADER), encoding="utf-8")
            print("fixed", path.name)


if __name__ == "__main__":
    main()
