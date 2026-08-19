"""ZIP 内パスから顧問先・期間を推定（ルールベース・無料）。"""

from __future__ import annotations

import re
from typing import Any, Optional

from services.migration_aliases import load_aliases, match_alias
from services.tenancy import get_client_firm_id

DEFAULT_YEAR_LABELS = ["R8", "R7", "R6", "R5", "R4", "OLD"]

_PERM_HINTS = ("永続", "perm", "基本", "マスタ")
_MONTH_RE = re.compile(r"(?:^|[^0-9])(0?[1-9]|1[0-2])月")
_R_LABEL_RE = re.compile(r"R\s*(\d+)", re.IGNORECASE)
_REIWA_RE = re.compile(r"令和\s*(\d+)")


def clients_for_firm(firm_id: str) -> list[dict[str, Any]]:
    from services.client_master_store import load_raw

    clients = load_raw().get("clients") or []
    return [
        c
        for c in clients
        if isinstance(c, dict) and get_client_firm_id(str(c.get("id") or "")) == firm_id
    ]


def _client_names(client: dict[str, Any]) -> list[str]:
    names: list[str] = []
    for key in ("name", "shortName", "id"):
        val = client.get(key)
        if isinstance(val, str) and val.strip():
            names.append(val.strip())
    profile = client.get("profile")
    if isinstance(profile, dict):
        for key in ("companyName", "representativeName"):
            val = profile.get(key)
            if isinstance(val, str) and val.strip():
                names.append(val.strip())
    return names


def parse_period_from_path(path: str) -> tuple[Optional[str], float]:
    text = path or ""
    upper = text.upper()
    if any(h in text for h in _PERM_HINTS):
        return "perm", 0.85
    for i, label in enumerate(DEFAULT_YEAR_LABELS):
        if label in upper:
            return f"year:{i + 1}", 0.8
    m = _REIWA_RE.search(text)
    if m:
        label = f"R{int(m.group(1))}"
        if label in DEFAULT_YEAR_LABELS:
            return f"year:{DEFAULT_YEAR_LABELS.index(label) + 1}", 0.75
    m = _R_LABEL_RE.search(upper)
    if m:
        label = f"R{int(m.group(1))}"
        if label in DEFAULT_YEAR_LABELS:
            return f"year:{DEFAULT_YEAR_LABELS.index(label) + 1}", 0.75
    month_match = _MONTH_RE.search(text)
    if month_match:
        month = int(month_match.group(1))
        return f"month:{month}", 0.65
    return None, 0.0


def match_client_from_path(
    path: str,
    firm_id: str,
    clients: Optional[list[dict[str, Any]]] = None,
) -> tuple[Optional[str], float]:
    segments = [s for s in (path or "").replace("\\", "/").split("/") if s.strip()]
    if not segments:
        return None, 0.0
    aliases = load_aliases(firm_id)
    for seg in segments:
        hit = match_alias(firm_id, seg) or aliases.get(seg.strip())
        if hit:
            return hit, 0.95
    pool = clients if clients is not None else clients_for_firm(firm_id)
    best_id: Optional[str] = None
    best_score = 0.0
    for client in pool:
        cid = str(client.get("id") or "")
        if not cid:
            continue
        for name in _client_names(client):
            for seg in segments:
                if name == seg:
                    score = 1.0
                elif name in seg or seg in name:
                    score = min(0.9, len(name) / max(len(seg), 1))
                else:
                    continue
                if score > best_score:
                    best_score = score
                    best_id = cid
    if best_id and best_score >= 0.5:
        return best_id, round(best_score, 3)
    return None, 0.0
