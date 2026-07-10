"""Analyze application.py routes for router split."""
from __future__ import annotations

import re
from collections import Counter
from pathlib import Path

APP = Path(__file__).resolve().parent.parent / "api" / "application.py"


def bucket(path: str) -> str:
    if path.startswith("/api/dev/integration-ports"):
        return "dev_integration_ports"
    if path.startswith("/api/dev/form-catalog"):
        return "dev_form_catalog"
    if path.startswith("/api/dev/legal-master") or path.startswith("/api/v1/legal-master"):
        return "legal_master"
    if "metric-mapping" in path:
        return "metric_mappings"
    if path.startswith("/api/platform"):
        return "platform"
    if path.startswith("/api/drive"):
        return "drive"
    if "moneytree" in path:
        return "moneytree"
    if "client-master" in path or "stakeholder-master" in path:
        return "master_data"
    if path.startswith("/api/auth"):
        return "auth"
    if path.startswith("/api/firm-members") or path.startswith("/api/firm/"):
        return "firm"
    if path.startswith("/api/role-permissions") or path.startswith("/api/screen-design"):
        return "firm"
    if path.startswith("/api/audit"):
        return "audit"
    if path.startswith("/files"):
        return "legacy_files"
    if path.startswith("/api/slots"):
        return "slots"
    if path.startswith("/api/review-events"):
        return "review_events"
    if "document-version" in path or path.startswith("/api/document-versions"):
        return "document_versions"
    if path.startswith("/api/classify"):
        return "classify"
    if path.startswith("/api/billing"):
        return "billing"
    if path.startswith("/api/docugrid"):
        return "docugrid"
    if "payroll" in path or "marufu" in path or "withholding" in path:
        return "payroll"
    if "capture" in path:
        return "capture"
    if path.startswith("/api/client-metrics") or path.startswith("/api/metrics"):
        return "charts"
    if path.startswith("/api/comms"):
        return "comms"
    if path.startswith("/api/sim"):
        return "sim_overlay"
    if path.startswith("/api/thumbnails") or path.startswith("/api/render") or path.startswith("/api/pdf"):
        return "pdf_ops"
    if path.startswith("/api/highlight") or path.startswith("/api/reorder") or path.startswith("/api/merge"):
        return "pdf_ops"
    if path.startswith("/api/system-config"):
        return "system"
    if path in ("/", "/health"):
        return "core"
    return "other"


def main() -> None:
    lines = APP.read_text(encoding="utf-8").splitlines()
    routes: list[tuple[int, str]] = []
    for i, line in enumerate(lines, 1):
        if re.match(r"@app\.(get|post|put|patch|delete)", line):
            chunk = "\n".join(lines[i - 1 : i + 3])
            m = re.search(r'["\'](/[^"\']+)["\']', chunk)
            path = m.group(1) if m else "?"
            routes.append((i, path))
    print(f"total routes: {len(routes)}")
    c = Counter(bucket(p) for _, p in routes)
    for k, v in sorted(c.items(), key=lambda x: -x[1]):
        print(f"{v:3} {k}")
    others = [(ln, p) for ln, p in routes if bucket(p) == "other"]
    print(f"\nother ({len(others)}):")
    for ln, p in others:
        print(f"  L{ln}: {p}")


if __name__ == "__main__":
    main()
