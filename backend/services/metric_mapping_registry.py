"""指標マップ — metric_key ↔ 科目 / field_id / スロット。

docs/no-code-config-vision.md C6
"""

from __future__ import annotations

import csv
import io
import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal, TypedDict

_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "metric_mappings.yaml"

_HEADER = (
    "# metric_key ↔ 勘定科目 / Auto-Vouch field / 資料スロット\n"
    "# docs/no-code-config-vision.md C6\n"
)

ImportMode = Literal["replace", "merge"]
MappingStatus = Literal["active", "planned", "deprecated"]

METRIC_KEY_RE = __import__("re").compile(r"^[a-z][a-z0-9._-]*$")
STATUSES = frozenset({"active", "planned", "deprecated"})

CSV_COLUMNS = [
    "metric_key",
    "label_ja",
    "field_id",
    "account_code",
    "account_name",
    "slot_id",
    "period_key",
    "document_label",
    "status",
    "notes",
]

_MAPPING_FIELD_ORDER = CSV_COLUMNS


class MetricMapping(TypedDict, total=False):
    metric_key: str
    label_ja: str
    field_id: str
    account_code: str
    account_name: str
    slot_id: str
    period_key: str
    document_label: str
    status: MappingStatus
    notes: str


class MetricMappingsConfig(TypedDict):
    version: int
    mappings: list[MetricMapping]


def config_path() -> Path:
    return _CONFIG_PATH


def _parse_yaml(text: str) -> dict[str, Any]:
    try:
        import yaml  # type: ignore
    except ImportError as exc:
        raise RuntimeError("PyYAML is required") from exc
    data = yaml.safe_load(text)
    if data is None:
        return {"version": 1, "mappings": []}
    if not isinstance(data, dict):
        raise ValueError("metric_mappings root must be a mapping")
    return data


def _dump_yaml(data: dict[str, Any]) -> str:
    import yaml  # type: ignore

    body = yaml.dump(
        data,
        allow_unicode=True,
        default_flow_style=False,
        sort_keys=False,
        width=120,
    )
    return _HEADER + body


def _validate_metric_key(metric_key: str, *, prefix: str = "") -> list[str]:
    label = f"{prefix}metric_key" if prefix else "metric_key"
    if not metric_key:
        return [f"{label}: required"]
    if not METRIC_KEY_RE.match(metric_key):
        return [f"{label}: invalid format `{metric_key}`"]
    return []


def _validate_mapping_item(item: dict[str, Any], *, index: int | None = None) -> list[str]:
    prefix = f"mappings[{index}] " if index is not None else ""
    errors: list[str] = []
    metric_key = str(item.get("metric_key") or "").strip()
    errors.extend(_validate_metric_key(metric_key, prefix=prefix))
    if not str(item.get("label_ja") or "").strip():
        errors.append(f"{prefix}label_ja: required")
    if not str(item.get("field_id") or "").strip():
        errors.append(f"{prefix}field_id: required")
    status = item.get("status") or "planned"
    if status not in STATUSES:
        errors.append(f"{prefix}status: must be one of {sorted(STATUSES)}")
    return errors


def validate_config_data(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    mappings_raw = data.get("mappings")
    if mappings_raw is None:
        return ["mappings: required"]
    if not isinstance(mappings_raw, list):
        return ["mappings: must be a list"]
    seen: set[str] = set()
    for idx, item in enumerate(mappings_raw):
        if not isinstance(item, dict):
            errors.append(f"mappings[{idx}]: must be a mapping")
            continue
        errors.extend(_validate_mapping_item(item, index=idx))
        mk = str(item.get("metric_key") or "").strip()
        if mk:
            if mk in seen:
                errors.append(f"mappings[{idx}]: duplicate metric_key `{mk}`")
            seen.add(mk)
    return errors


def _normalize_mapping(item: dict[str, Any], metric_key: str) -> MetricMapping:
    return MetricMapping(
        metric_key=metric_key,
        label_ja=str(item.get("label_ja") or metric_key),
        field_id=str(item.get("field_id") or ""),
        account_code=str(item.get("account_code") or ""),
        account_name=str(item.get("account_name") or ""),
        slot_id=str(item.get("slot_id") or ""),
        period_key=str(item.get("period_key") or ""),
        document_label=str(item.get("document_label") or ""),
        status=item.get("status") or "planned",  # type: ignore[typeddict-item]
        notes=str(item.get("notes") or ""),
    )


def _parse_config_data(data: dict[str, Any]) -> MetricMappingsConfig:
    version = int(data.get("version", 1))
    mappings: list[MetricMapping] = []
    for item in data.get("mappings") or []:
        if not isinstance(item, dict):
            raise ValueError("each mapping must be a mapping")
        metric_key = str(item.get("metric_key") or "").strip()
        mappings.append(_normalize_mapping(item, metric_key))
    return {"version": version, "mappings": mappings}


@lru_cache(maxsize=1)
def load_metric_mappings_config() -> MetricMappingsConfig:
    path = config_path()
    if not path.is_file():
        raise FileNotFoundError(f"Metric mappings config not found: {path}")
    raw = path.read_text(encoding="utf-8")
    data = _parse_yaml(raw)
    errors = validate_config_data(data)
    if errors:
        raise ValueError("; ".join(errors))
    return _parse_config_data(data)


def _mapping_to_raw_dict(m: MetricMapping) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key in _MAPPING_FIELD_ORDER:
        val = m.get(key)  # type: ignore[literal-required]
        if val is None or val == "":
            continue
        out[key] = val
    if "status" not in out:
        out["status"] = "planned"
    return out


def _config_to_raw_dict(cfg: MetricMappingsConfig) -> dict[str, Any]:
    return {
        "version": cfg["version"],
        "mappings": [_mapping_to_raw_dict(m) for m in cfg["mappings"]],
    }


def save_metric_mappings_config(cfg: MetricMappingsConfig) -> MetricMappingsConfig:
    errors = validate_config_data(_config_to_raw_dict(cfg))
    if errors:
        raise ValueError("; ".join(errors))
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(_dump_yaml(_config_to_raw_dict(cfg)), encoding="utf-8")
    load_metric_mappings_config.cache_clear()
    return load_metric_mappings_config()


def reload_metric_mappings_config() -> MetricMappingsConfig:
    load_metric_mappings_config.cache_clear()
    return load_metric_mappings_config()


def list_mappings(*, status: MappingStatus | None = None) -> list[MetricMapping]:
    cfg = load_metric_mappings_config()
    rows = cfg["mappings"]
    if status is None:
        return list(rows)
    return [m for m in rows if m.get("status") == status]


def get_mapping(metric_key: str) -> MetricMapping | None:
    for m in list_mappings():
        if m.get("metric_key") == metric_key:
            return m
    return None


def create_mapping(body: dict[str, Any]) -> MetricMapping:
    errors = _validate_mapping_item(body)
    if errors:
        raise ValueError("; ".join(errors))
    metric_key = str(body["metric_key"]).strip()
    cfg = load_metric_mappings_config()
    if get_mapping(metric_key):
        raise ValueError(f"metric_key already exists: {metric_key}")
    mapping = _normalize_mapping(body, metric_key)
    cfg["mappings"].append(mapping)
    save_metric_mappings_config(cfg)
    saved = get_mapping(metric_key)
    assert saved is not None
    return saved


def update_mapping(metric_key: str, body: dict[str, Any]) -> MetricMapping:
    if body.get("metric_key") and str(body["metric_key"]).strip() != metric_key:
        raise ValueError("metric_key in body cannot differ from URL")
    body = {**body, "metric_key": metric_key}
    errors = _validate_mapping_item(body)
    if errors:
        raise ValueError("; ".join(errors))
    cfg = load_metric_mappings_config()
    idx = next((i for i, m in enumerate(cfg["mappings"]) if m["metric_key"] == metric_key), None)
    if idx is None:
        raise KeyError(f"Mapping not found: {metric_key}")
    cfg["mappings"][idx] = _normalize_mapping(body, metric_key)
    save_metric_mappings_config(cfg)
    saved = get_mapping(metric_key)
    assert saved is not None
    return saved


def delete_mapping(metric_key: str) -> None:
    cfg = load_metric_mappings_config()
    next_rows = [m for m in cfg["mappings"] if m["metric_key"] != metric_key]
    if len(next_rows) == len(cfg["mappings"]):
        raise KeyError(f"Mapping not found: {metric_key}")
    save_metric_mappings_config({"version": cfg["version"], "mappings": next_rows})


def export_yaml_text() -> str:
    return _dump_yaml(_config_to_raw_dict(load_metric_mappings_config()))


def validate_yaml_text(text: str) -> tuple[list[str], MetricMappingsConfig | None]:
    try:
        data = _parse_yaml(text)
    except Exception as exc:  # noqa: BLE001
        return [f"YAML parse error: {exc}"], None
    errors = validate_config_data(data)
    if errors:
        return errors, None
    return [], _parse_config_data(data)


def import_yaml_text(text: str, *, mode: ImportMode = "replace") -> MetricMappingsConfig:
    errors, parsed = validate_yaml_text(text)
    if errors or parsed is None:
        raise ValueError("; ".join(errors) if errors else "invalid YAML")
    if mode == "replace":
        return save_metric_mappings_config(parsed)
    current = load_metric_mappings_config()
    merged: dict[str, MetricMapping] = {m["metric_key"]: m for m in current["mappings"]}
    for m in parsed["mappings"]:
        merged[m["metric_key"]] = m
    return save_metric_mappings_config(
        {"version": parsed["version"], "mappings": list(merged.values())}
    )


def validate_csv_text(text: str) -> tuple[list[str], list[dict[str, Any]]]:
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return ["CSV header missing"], []
    rows: list[dict[str, Any]] = []
    errors: list[str] = []
    for idx, item in enumerate(reader, start=2):
        body = {k: (item.get(k) or "").strip() for k in CSV_COLUMNS}
        row_errors = _validate_mapping_item(body, index=idx)
        errors.extend(row_errors)
        if not row_errors:
            rows.append(body)
    return errors, rows


def import_csv_text(text: str, *, mode: ImportMode = "merge") -> dict[str, Any]:
    errors, rows = validate_csv_text(text)
    if errors:
        raise ValueError("; ".join(errors))
    normalized = [_normalize_mapping(r, r["metric_key"]) for r in rows]
    if mode == "replace":
        save_metric_mappings_config({"version": 1, "mappings": normalized})
    else:
        current = load_metric_mappings_config()
        merged = {m["metric_key"]: m for m in current["mappings"]}
        for m in normalized:
            merged[m["metric_key"]] = m
        save_metric_mappings_config(
            {"version": current["version"], "mappings": list(merged.values())}
        )
    return {"imported": len(rows), "total": len(list_mappings())}


def export_csv_text() -> str:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=CSV_COLUMNS, lineterminator="\n")
    writer.writeheader()
    for m in list_mappings():
        writer.writerow({k: m.get(k) or "" for k in CSV_COLUMNS})  # type: ignore[literal-required]
    return buf.getvalue()


def config_summary() -> dict[str, Any]:
    cfg = load_metric_mappings_config()
    path = config_path()
    return {
        "version": cfg["version"],
        "mapping_count": len(cfg["mappings"]),
        "config_path": str(path),
    }


def document_ref_for_metric(metric_key: str) -> dict[str, str]:
    m = get_mapping(metric_key)
    if not m:
        return {}
    ref: dict[str, str] = {}
    if m.get("period_key"):
        ref["period_key"] = str(m["period_key"])
    if m.get("slot_id"):
        ref["slot_id"] = str(m["slot_id"])
    if m.get("document_label"):
        ref["label"] = str(m["document_label"])
    return ref
