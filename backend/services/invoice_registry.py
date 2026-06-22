"""適格請求書発行事業者登録番号（T+13桁）の検証（E4 原型）。"""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Optional
from urllib import error, request

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
INVOICE_CACHE_PATH = STORAGE_DIR / "invoice_registry_cache.json"

_T_PATTERN = re.compile(r"T\s*(\d{13})")


def normalize_registration_number(raw: str) -> Optional[str]:
    if not raw:
        return None
    s = raw.upper().strip().replace(" ", "").replace("　", "").replace("-", "")
    if s.startswith("T") and len(s) == 14 and s[1:].isdigit():
        return s
    m = _T_PATTERN.search(s)
    if m:
        return f"T{m.group(1)}"
    return None


def validate_checksum(reg_no: str) -> bool:
    """法人番号系 mod9 チェックデジット（T 以降 13 桁の先頭が検査用数字）。"""
    normalized = normalize_registration_number(reg_no)
    if not normalized:
        return False
    digits = normalized[1:]
    check = int(digits[0])
    base = digits[1:]
    if len(base) != 12:
        return False
    total = 0
    for i, ch in enumerate(reversed(base)):
        n = i + 1
        p = int(ch)
        q = 1 if n % 2 == 1 else 2
        total += p * q
    remainder = total % 9
    expected = 9 if remainder == 0 else 9 - remainder
    return check == expected


def _load_cache() -> Dict[str, dict]:
    if INVOICE_CACHE_PATH.exists():
        try:
            raw = json.loads(INVOICE_CACHE_PATH.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                return raw
        except Exception:
            pass
    return {}


def ensure_invoice_cache_seed() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    if INVOICE_CACHE_PATH.exists():
        return
    seed = {
        "T8326405515335": {
            "name": "デモ株式会社（チェックデジット検証済）",
            "status": "active",
            "address": "東京都千代田区",
            "updated_at": datetime.utcnow().isoformat(),
            "source": "seed",
        },
        "T1234567890123": {
            "name": "サンプル商店（失効デモ）",
            "status": "revoked",
            "address": "大阪府大阪市",
            "updated_at": datetime.utcnow().isoformat(),
            "source": "seed",
        },
    }
    INVOICE_CACHE_PATH.write_text(
        json.dumps(seed, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _save_cache_entry(reg_no: str, entry: dict) -> None:
    cache = _load_cache()
    cache[reg_no] = entry
    INVOICE_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    INVOICE_CACHE_PATH.write_text(
        json.dumps(cache, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _lookup_cache(reg_no: str) -> Optional[dict]:
    return _load_cache().get(reg_no)


def _fetch_nta_public(reg_no: str) -> Optional[dict]:
    """国税庁公表サイトの HTML を簡易パース（失敗時 None）。"""
    url = (
        "https://www.invoice-kohyo.nta.go.jp/regno-search/detail"
        f"?selRegNo={reg_no[1:]}"
    )
    try:
        req = request.Request(
            url,
            headers={"User-Agent": "TAXX-DocuGrid/1.0 (invoice-verify)"},
        )
        with request.urlopen(req, timeout=8) as resp:
            html = resp.read().decode("utf-8", errors="replace")
    except (error.URLError, error.HTTPError, TimeoutError, OSError):
        return None

    if "登録情報が存在しません" in html or "該当するデータがありません" in html:
        return {
            "name": None,
            "status": "not_found",
            "address": None,
            "source": "nta_web",
            "updated_at": datetime.utcnow().isoformat(),
        }

    name = None
    address = None
    status = "active"
    if "取消" in html or "失効" in html:
        status = "revoked"
    name_m = re.search(r"氏名又は名称[^<]*</th>\s*<td[^>]*>([^<]+)", html)
    if name_m:
        name = name_m.group(1).strip()
    addr_m = re.search(r"所在地[^<]*</th>\s*<td[^>]*>([^<]+)", html)
    if addr_m:
        address = addr_m.group(1).strip()
    if not name and "登録事業者" not in html:
        return None

    return {
        "name": name or "（公表サイトで確認）",
        "status": status,
        "address": address,
        "source": "nta_web",
        "updated_at": datetime.utcnow().isoformat(),
    }


def extract_registration_number(text: str) -> Optional[str]:
    m = _T_PATTERN.search(text or "")
    if not m:
        return None
    return f"T{m.group(1)}"


def verify_invoice_registration(
    reg_no: str,
    *,
    allow_online: bool = True,
    cache_max_age_hours: int = 168,
) -> Dict[str, Any]:
    """フォーマット・チェックデジット・公表キャッシュ/オンライン照合。"""
    ensure_invoice_cache_seed()
    normalized = normalize_registration_number(reg_no)
    if not normalized:
        return {
            "registration_number": reg_no,
            "normalized": None,
            "format_valid": False,
            "checksum_valid": False,
            "registration_status": "invalid_format",
            "issuer_name": None,
            "issues": ["登録番号の形式が不正です（T + 13桁）。"],
            "suggestions": [],
        }

    checksum_ok = validate_checksum(normalized)
    issues: list[str] = []
    suggestions: list[str] = []
    if not checksum_ok:
        suggestions.append(
            "チェックデジットが一致しません。番号の誤記入がないかご確認ください。"
        )

    cached = _lookup_cache(normalized)
    use_online = allow_online
    if cached and cached.get("updated_at"):
        try:
            updated = datetime.fromisoformat(str(cached["updated_at"]))
            if datetime.utcnow() - updated < timedelta(hours=cache_max_age_hours):
                use_online = False
        except ValueError:
            pass

    registry = cached
    if use_online and checksum_ok:
        online = _fetch_nta_public(normalized)
        if online:
            registry = {**online, "registration_number": normalized}
            _save_cache_entry(normalized, registry)

    reg_status = "unknown"
    issuer_name = None
    if registry:
        reg_status = str(registry.get("status") or "active")
        issuer_name = registry.get("name")
    elif checksum_ok:
        reg_status = "not_in_cache"
        suggestions.append("公表サイトで手動確認してください（キャッシュ未登録）。")

    if reg_status == "revoked":
        issues.append(f"登録番号 {normalized} は失効・取消の可能性があります。")
    elif reg_status == "not_found":
        issues.append(f"登録番号 {normalized} は公表サイトに見つかりませんでした。")
    elif reg_status == "active" and issuer_name:
        suggestions.append(f"適格請求書発行事業者: {issuer_name}")

    overall = "ok"
    if issues:
        overall = "needs_review"
    elif not checksum_ok:
        overall = "needs_review"
    elif reg_status in ("not_in_cache", "unknown"):
        overall = "needs_review"

    return {
        "registration_number": normalized,
        "normalized": normalized,
        "format_valid": True,
        "checksum_valid": checksum_ok,
        "registration_status": reg_status,
        "issuer_name": issuer_name,
        "registry": registry,
        "issues": issues,
        "suggestions": suggestions,
        "status": overall,
    }


def audit_expense_invoice(text: str) -> Dict[str, Any]:
    """経費レシート OCR テキストからインボイス番号を検証。"""
    reg_no = extract_registration_number(text)
    if not reg_no:
        return {
            "registration_number": None,
            "status": "needs_review",
            "issues": ["適格請求書登録番号（T+13桁）が見つかりません。"],
            "suggestions": ["インボイス対応領収書か、登録番号の記載を確認してください。"],
        }
    result = verify_invoice_registration(reg_no)
    return {
        "registration_number": result.get("normalized"),
        "format_valid": result.get("format_valid"),
        "checksum_valid": result.get("checksum_valid"),
        "registration_status": result.get("registration_status"),
        "issuer_name": result.get("issuer_name"),
        "issues": result.get("issues", []),
        "suggestions": result.get("suggestions", []),
        "status": result.get("status", "ok"),
    }
