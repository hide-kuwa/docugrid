"""税務書類様式カタログ — YAML 正本の読み込み・検証・永続化。

開発コンソール /dev/form-catalog から編集。ページ単位 AI 分類の参照知識。
"""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal, TypedDict

_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "form_catalog.yaml"

_HEADER = (
    "# 税務書類様式カタログ — AI 分類参照正本\n"
    "# 編集: 開発コンソール /dev/form-catalog\n"
)

FormRole = Literal["body", "skip"]
ImportMode = Literal["replace", "merge"]

FORM_ID_RE = re.compile(r"^[a-z][a-z0-9._-]*$")
ROLES = frozenset({"body", "skip"})
REGIONS = frozenset({"any", "top", "top_right", "header", "body", "footer"})

_FORM_FIELD_ORDER = (
    "form_id",
    "label_ja",
    "role",
    "maps_to",
    "anchors",
    "must_not",
    "page_scan",
    "filename_hints",
    "notes",
)


class FormCatalogEntry(TypedDict, total=False):
    form_id: str
    label_ja: str
    role: FormRole
    maps_to: dict[str, Any]
    anchors: list[dict[str, Any]]
    must_not: list[str]
    page_scan: dict[str, Any]
    filename_hints: list[str]
    notes: str


class FormCatalogConfig(TypedDict):
    version: int
    defaults: dict[str, Any]
    forms: list[FormCatalogEntry]


def config_path() -> Path:
    return _CONFIG_PATH


def _parse_yaml(text: str) -> dict[str, Any]:
    try:
        import yaml  # type: ignore
    except ImportError as exc:
        raise RuntimeError("PyYAML is required. Install with: pip install PyYAML") from exc
    data = yaml.safe_load(text)
    if data is None:
        return {"version": 1, "defaults": {"max_scan_pages": 25}, "forms": []}
    if not isinstance(data, dict):
        raise ValueError("form_catalog root must be a mapping")
    return data


def _dump_yaml(data: dict[str, Any]) -> str:
    try:
        import yaml  # type: ignore
    except ImportError as exc:
        raise RuntimeError("PyYAML is required") from exc
    body = yaml.dump(
        data,
        allow_unicode=True,
        default_flow_style=False,
        sort_keys=False,
        width=120,
    )
    return _HEADER + body


def _validate_form_id(form_id: str, *, prefix: str = "") -> list[str]:
    label = f"{prefix}form_id" if prefix else "form_id"
    if not form_id:
        return [f"{label}: required"]
    if not FORM_ID_RE.match(form_id):
        return [f"{label}: invalid format `{form_id}`"]
    return []


def _validate_form_fields(item: dict[str, Any], *, index: int | None = None) -> list[str]:
    prefix = f"forms[{index}] " if index is not None else ""
    errors: list[str] = []
    form_id = str(item.get("form_id") or "").strip()
    errors.extend(_validate_form_id(form_id, prefix=prefix))
    if not str(item.get("label_ja") or "").strip():
        errors.append(f"{prefix}label_ja: required")
    role = item.get("role") or "body"
    if role not in ROLES:
        errors.append(f"{prefix}role: must be one of {sorted(ROLES)}")
    anchors = item.get("anchors")
    if anchors is not None:
        if not isinstance(anchors, list):
            errors.append(f"{prefix}anchors: must be a list")
        else:
            for ai, anchor in enumerate(anchors):
                if not isinstance(anchor, dict):
                    errors.append(f"{prefix}anchors[{ai}]: must be a mapping")
                    continue
                region = anchor.get("region") or "any"
                if region not in REGIONS:
                    errors.append(f"{prefix}anchors[{ai}].region: invalid `{region}`")
                any_of = anchor.get("any_of")
                if not any_of or not isinstance(any_of, list):
                    errors.append(f"{prefix}anchors[{ai}].any_of: required non-empty list")
    return errors


def validate_config_data(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    try:
        version = int(data.get("version", 1))
    except (TypeError, ValueError):
        errors.append("version: must be an integer")
    if version < 1:
        errors.append("version: must be >= 1")
    forms_raw = data.get("forms")
    if forms_raw is None:
        errors.append("forms: required")
        return errors
    if not isinstance(forms_raw, list):
        errors.append("forms: must be a list")
        return errors
    seen: set[str] = set()
    for idx, item in enumerate(forms_raw):
        if not isinstance(item, dict):
            errors.append(f"forms[{idx}]: must be a mapping")
            continue
        errors.extend(_validate_form_fields(item, index=idx))
        fid = str(item.get("form_id") or "").strip()
        if fid:
            if fid in seen:
                errors.append(f"forms[{idx}]: duplicate form_id `{fid}`")
            seen.add(fid)
    return errors


def validate_yaml_text(text: str) -> tuple[list[str], FormCatalogConfig | None]:
    try:
        data = _parse_yaml(text)
    except ValueError as exc:
        return [str(exc)], None
    except Exception as exc:  # noqa: BLE001
        return [f"YAML parse error: {exc}"], None
    errors = validate_config_data(data)
    if errors:
        return errors, None
    return [], _parse_config_data(data)


def _normalize_form(item: dict[str, Any], form_id: str) -> FormCatalogEntry:
    maps_to = item.get("maps_to") if isinstance(item.get("maps_to"), dict) else {}
    anchors = item.get("anchors") if isinstance(item.get("anchors"), list) else []
    must_not = item.get("must_not") if isinstance(item.get("must_not"), list) else []
    page_scan = item.get("page_scan") if isinstance(item.get("page_scan"), dict) else {}
    filename_hints = item.get("filename_hints") if isinstance(item.get("filename_hints"), list) else []
    return FormCatalogEntry(
        form_id=form_id,
        label_ja=str(item.get("label_ja") or form_id),
        role=item.get("role") or "body",  # type: ignore[typeddict-item]
        maps_to=maps_to,
        anchors=anchors,
        must_not=[str(x) for x in must_not],
        page_scan=page_scan,
        filename_hints=[str(x) for x in filename_hints],
        notes=str(item.get("notes") or ""),
    )


def _parse_config_data(data: dict[str, Any]) -> FormCatalogConfig:
    version = int(data.get("version", 1))
    defaults = data.get("defaults") if isinstance(data.get("defaults"), dict) else {}
    if "max_scan_pages" not in defaults:
        defaults = {**defaults, "max_scan_pages": 25}
    forms_raw = data.get("forms") or []
    forms: list[FormCatalogEntry] = []
    for item in forms_raw:
        if not isinstance(item, dict):
            raise ValueError("each form entry must be a mapping")
        form_id = str(item.get("form_id") or "").strip()
        forms.append(_normalize_form(item, form_id))
    return {"version": version, "defaults": defaults, "forms": forms}


@lru_cache(maxsize=1)
def load_form_catalog_config() -> FormCatalogConfig:
    path = config_path()
    if not path.is_file():
        raise FileNotFoundError(f"Form catalog not found: {path}")
    raw = path.read_text(encoding="utf-8")
    data = _parse_yaml(raw)
    errors = validate_config_data(data)
    if errors:
        raise ValueError("; ".join(errors))
    return _parse_config_data(data)


def reload_form_catalog_config() -> FormCatalogConfig:
    load_form_catalog_config.cache_clear()
    return load_form_catalog_config()


def _form_to_raw_dict(form: FormCatalogEntry) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key in _FORM_FIELD_ORDER:
        val = form.get(key)  # type: ignore[literal-required]
        if val is None or val == "" or val == [] or val == {}:
            continue
        out[key] = val
    if "role" not in out:
        out["role"] = "body"
    return out


def _config_to_raw_dict(cfg: FormCatalogConfig) -> dict[str, Any]:
    return {
        "version": cfg["version"],
        "defaults": cfg.get("defaults") or {"max_scan_pages": 25},
        "forms": [_form_to_raw_dict(f) for f in cfg["forms"]],
    }


def save_form_catalog_config(cfg: FormCatalogConfig) -> FormCatalogConfig:
    errors = validate_config_data(_config_to_raw_dict(cfg))
    if errors:
        raise ValueError("; ".join(errors))
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(_dump_yaml(_config_to_raw_dict(cfg)), encoding="utf-8")
    load_form_catalog_config.cache_clear()
    return load_form_catalog_config()


def export_yaml_text() -> str:
    return _dump_yaml(_config_to_raw_dict(load_form_catalog_config()))


def config_summary() -> dict[str, Any]:
    cfg = load_form_catalog_config()
    return {
        "version": cfg["version"],
        "form_count": len(cfg["forms"]),
        "config_path": str(config_path()),
        "max_scan_pages": int((cfg.get("defaults") or {}).get("max_scan_pages") or 25),
    }


def list_forms() -> list[dict[str, Any]]:
    return [dict(f) for f in load_form_catalog_config()["forms"]]


def get_form(form_id: str) -> FormCatalogEntry | None:
    fid = form_id.strip()
    for form in load_form_catalog_config()["forms"]:
        if form.get("form_id") == fid:
            return form
    return None


def create_form(entry: FormCatalogEntry) -> FormCatalogEntry:
    cfg = load_form_catalog_config()
    fid = str(entry.get("form_id") or "").strip()
    if get_form(fid):
        raise ValueError(f"form_id already exists: {fid}")
    cfg["forms"].append(_normalize_form(dict(entry), fid))
    save_form_catalog_config(cfg)
    result = get_form(fid)
    if not result:
        raise RuntimeError("create failed")
    return result


def update_form(form_id: str, entry: FormCatalogEntry) -> FormCatalogEntry:
    cfg = load_form_catalog_config()
    fid = form_id.strip()
    new_id = str(entry.get("form_id") or fid).strip()
    found = False
    updated: FormCatalogEntry | None = None
    for idx, form in enumerate(cfg["forms"]):
        if form.get("form_id") != fid:
            continue
        if new_id != fid and get_form(new_id):
            raise ValueError(f"form_id already exists: {new_id}")
        updated = _normalize_form(dict(entry), new_id)
        cfg["forms"][idx] = updated
        found = True
        break
    if not found:
        raise ValueError(f"form not found: {fid}")
    save_form_catalog_config(cfg)
    return updated  # type: ignore[return-value]


def delete_form(form_id: str) -> None:
    cfg = load_form_catalog_config()
    fid = form_id.strip()
    next_forms = [f for f in cfg["forms"] if f.get("form_id") != fid]
    if len(next_forms) == len(cfg["forms"]):
        raise ValueError(f"form not found: {fid}")
    cfg["forms"] = next_forms
    save_form_catalog_config(cfg)


def reorder_forms(form_ids: list[str]) -> FormCatalogConfig:
    """form_ids の順序で forms を並べ替えて保存する。

    指定に含まれない既存 form は元の相対順のまま末尾へ寄せる（欠落しても消さない）。
    未知の form_id は無視する。
    """
    cfg = load_form_catalog_config()
    by_id = {f["form_id"]: f for f in cfg["forms"]}
    ordered: list[FormCatalogEntry] = []
    seen: set[str] = set()
    for fid in form_ids:
        key = str(fid).strip()
        if key in by_id and key not in seen:
            ordered.append(by_id[key])
            seen.add(key)
    for form in cfg["forms"]:
        if form["form_id"] not in seen:
            ordered.append(form)
    cfg["forms"] = ordered
    return save_form_catalog_config(cfg)


def import_yaml_text(text: str, *, mode: ImportMode = "merge") -> FormCatalogConfig:
    errors, parsed = validate_yaml_text(text)
    if errors or parsed is None:
        raise ValueError("; ".join(errors) or "invalid yaml")
    if mode == "replace":
        return save_form_catalog_config(parsed)
    current = load_form_catalog_config()
    by_id = {f["form_id"]: f for f in current["forms"]}
    for form in parsed["forms"]:
        by_id[form["form_id"]] = form
    merged: FormCatalogConfig = {
        "version": parsed["version"],
        "defaults": parsed.get("defaults") or current.get("defaults") or {},
        "forms": list(by_id.values()),
    }
    return save_form_catalog_config(merged)


def build_vision_prompt_snippet(forms: list[FormCatalogEntry], *, max_forms: int = 5) -> str:
    """Vision / LLM プロンプトに注入する様式ヒント（RAG-lite）。"""
    lines = [
        "以下の様式定義に従い、各ページの書類種別を判定してください。",
        "表紙や送付状は skip 様式として扱い、本体様式の開始ページ番号を特定してください。",
        "",
    ]
    for form in forms[:max_forms]:
        fid = form.get("form_id") or ""
        label = form.get("label_ja") or fid
        lines.append(f"### {fid} — {label}")
        role = form.get("role") or "body"
        if role == "skip":
            lines.append("- 役割: 表紙・送付状など（パッケージ本体ではない）")
        maps = form.get("maps_to") or {}
        if maps.get("tax_type"):
            lines.append(f"- tax_type: {maps.get('tax_type')}")
        for anchor in form.get("anchors") or []:
            region = anchor.get("region") or "any"
            any_of = anchor.get("any_of") or []
            if any_of:
                region_hint = {
                    "top_right": "ページ右上付近",
                    "header": "ヘッダー付近",
                    "any": "ページ内",
                }.get(str(region), str(region))
                lines.append(f"- {region_hint}に次の語句: {', '.join(str(x) for x in any_of)}")
        must_not = form.get("must_not") or []
        if must_not:
            lines.append(f"- 含まれていたら除外: {', '.join(str(x) for x in must_not)}")
        lines.append("")
    return "\n".join(lines).strip()
