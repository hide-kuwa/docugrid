"""事務所ごとのフォルダ名 → 顧問先エイリアス + PROLEXT 由来の全社共有（書類種別のみ）。"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from services.tax_document_types import label_for_type

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
GLOBAL_ALIASES_PATH = STORAGE_DIR / "migration_global_aliases.json"

# 1社目 PROLEXT税理士法人 — env で firm_id を上書き可
DEFAULT_GLOBAL_LEARNING_FIRM_ID = "firm_prolext"

_DOC_SEGMENT_HINTS = (
    "請求",
    "源泉",
    "納付",
    "決算",
    "試算",
    "契約",
    "登記",
    "給与",
    "社保",
    "固定資産",
    "内訳",
    "申告",
    "法人税",
    "消費税",
    "相談",
    "領収",
    "仕訳",
    "勘定",
    "残高",
    "明細",
    "保険",
    "不動産",
)


def _now() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


def global_learning_firm_ids() -> set[str]:
    raw = os.environ.get("MIGRATION_GLOBAL_LEARNING_FIRM_IDS", "").strip()
    ids: set[str] = set()
    if raw:
        for part in raw.split(","):
            fid = part.strip()
            if fid:
                ids.add(fid)
    single = os.environ.get("MIGRATION_GLOBAL_LEARNING_FIRM_ID", "").strip()
    if single:
        ids.add(single)
    if not ids:
        ids.add(DEFAULT_GLOBAL_LEARNING_FIRM_ID)
    return ids


def is_global_learning_contributor(firm_id: str) -> bool:
    return (firm_id or "").strip() in global_learning_firm_ids()


def _aliases_path(firm_id: str) -> Path:
    return STORAGE_DIR / "firms" / firm_id / "migration_aliases.json"


def load_aliases(firm_id: str) -> dict[str, str]:
    path = _aliases_path(firm_id)
    if not path.exists():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    aliases = raw.get("aliases") if isinstance(raw, dict) else raw
    if not isinstance(aliases, dict):
        return {}
    out: dict[str, str] = {}
    for key, val in aliases.items():
        if isinstance(key, str) and isinstance(val, str) and key.strip() and val.strip():
            out[key.strip()] = val.strip()
    return out


def save_aliases(firm_id: str, aliases: dict[str, str]) -> dict[str, str]:
    path = _aliases_path(firm_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    cleaned = {k.strip(): v.strip() for k, v in aliases.items() if k.strip() and v.strip()}
    path.write_text(
        json.dumps({"aliases": cleaned}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return cleaned


def learn_alias(firm_id: str, folder_token: str, client_id: str) -> None:
    token = (folder_token or "").strip()
    cid = (client_id or "").strip()
    if not token or not cid or len(token) < 2:
        return
    aliases = load_aliases(firm_id)
    if aliases.get(token) == cid:
        return
    aliases[token] = cid
    save_aliases(firm_id, aliases)


def match_alias(firm_id: str, segment: str) -> Optional[str]:
    token = (segment or "").strip()
    if not token:
        return None
    return load_aliases(firm_id).get(token)


def _load_global_raw() -> dict[str, Any]:
    if not GLOBAL_ALIASES_PATH.exists():
        return {"folderToSlot": {}, "updatedAt": None, "contributorFirmIds": []}
    try:
        raw = json.loads(GLOBAL_ALIASES_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {"folderToSlot": {}, "updatedAt": None, "contributorFirmIds": []}
    if not isinstance(raw, dict):
        return {"folderToSlot": {}, "updatedAt": None, "contributorFirmIds": []}
    folder = raw.get("folderToSlot")
    if not isinstance(folder, dict):
        folder = {}
    contributors = raw.get("contributorFirmIds")
    if not isinstance(contributors, list):
        contributors = []
    return {
        "folderToSlot": folder,
        "updatedAt": raw.get("updatedAt"),
        "contributorFirmIds": contributors,
    }


def load_global_folder_slots() -> dict[str, dict[str, str]]:
    raw = _load_global_raw()
    folder = raw.get("folderToSlot") or {}
    out: dict[str, dict[str, str]] = {}
    for key, val in folder.items():
        if not isinstance(key, str) or not isinstance(val, dict):
            continue
        slot_id = str(val.get("slotId") or "").strip()
        doc_type = str(val.get("identifiedType") or "").strip()
        if key.strip() and slot_id:
            out[key.strip()] = {
                "slotId": slot_id,
                "identifiedType": doc_type or "",
            }
    return out


def global_alias_count() -> int:
    return len(load_global_folder_slots())


def segment_contributes_globally(segment: str, identified_type: str) -> bool:
    """顧問先名ではなく書類カテゴリっぽいフォルダ名だけ全社プールへ。"""
    s = (segment or "").strip()
    if len(s) < 2:
        return False
    label = label_for_type(identified_type or "UNKNOWN")
    if label and label != "不明" and (label in s or s in label):
        return True
    return any(hint in s for hint in _DOC_SEGMENT_HINTS)


def learn_global_folder_slot(
    firm_id: str,
    folder_token: str,
    slot_id: str,
    identified_type: str,
) -> bool:
    """PROLEXT 等の contributor だけが全社共有プールを更新（書類種別のみ）。"""
    if not is_global_learning_contributor(firm_id):
        return False
    token = (folder_token or "").strip()
    slot = (slot_id or "").strip()
    doc_type = (identified_type or "").strip()
    if not token or not slot or not segment_contributes_globally(token, doc_type):
        return False

    raw = _load_global_raw()
    folder = dict(raw.get("folderToSlot") or {})
    folder[token] = {
        "slotId": slot,
        "identifiedType": doc_type,
        "updatedAt": _now(),
        "sourceFirmId": firm_id,
    }
    contributors = list(raw.get("contributorFirmIds") or [])
    if firm_id not in contributors:
        contributors.append(firm_id)
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    GLOBAL_ALIASES_PATH.write_text(
        json.dumps(
            {
                "folderToSlot": folder,
                "updatedAt": _now(),
                "contributorFirmIds": contributors,
                "policy": "doc_type_only_no_client_ids",
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    return True


def match_global_folder_slot(segment: str) -> Optional[dict[str, str]]:
    token = (segment or "").strip()
    if not token:
        return None
    hit = load_global_folder_slots().get(token)
    return dict(hit) if hit else None


def global_slot_hint_from_path(source_path: str) -> Optional[dict[str, Any]]:
    segments = [s for s in (source_path or "").replace("\\", "/").split("/") if s.strip()]
    best: Optional[dict[str, Any]] = None
    for seg in segments:
        hit = match_global_folder_slot(seg)
        if hit:
            best = {
                "slotId": hit["slotId"],
                "identifiedType": hit.get("identifiedType") or "",
                "segment": seg,
                "confidence": 0.88,
                "engine": "global_alias",
                "reason": f"global:{seg}",
            }
    return best


def learn_from_migration_path(
    firm_id: str,
    source_path: str,
    client_id: str,
    slot_id: str,
    identified_type: str,
) -> dict[str, int]:
    segments = [s for s in (source_path or "").replace("\\", "/").split("/") if s.strip()]
    firm_learned = 0
    global_learned = 0
    for seg in segments[:-1]:
        learn_alias(firm_id, seg, client_id)
        firm_learned += 1
        if learn_global_folder_slot(firm_id, seg, slot_id, identified_type):
            global_learned += 1
    return {"firmAliases": firm_learned, "globalSlots": global_learned}


def learning_scope_payload(firm_id: str) -> dict[str, Any]:
    contributor_ids = sorted(global_learning_firm_ids())
    is_contributor = is_global_learning_contributor(firm_id)
    return {
        "scope": "firm_local_plus_global_doc_types",
        "firmLocal": True,
        "globalDocTypePool": True,
        "globalContributorFirmIds": contributor_ids,
        "isGlobalContributor": is_contributor,
        "globalAliasCount": global_alias_count(),
        "note": (
            "顧問先の紐づけは事務所内のみ。"
            + (
                "この事務所の確定は、書類種別フォルダ名を全税理士事務所が参照できます。"
                if is_contributor
                else "PROLEXT 等 contributor の書類種別エイリアスを全事務所が参照します。"
            )
        ),
    }
