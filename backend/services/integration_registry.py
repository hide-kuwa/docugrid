"""連携ポートカタログ — YAML 正本の読み込み・検証・永続化。

docs/integration-port-catalog.md
docs/no-code-config-vision.md
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal, TypedDict

_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "integration_ports.yaml"

_HEADER = (
    "# 連携ポートカタログ — ランタイム正本\n"
    "# ドキュメント: docs/integration-port-catalog.md, docs/no-code-config-vision.md\n"
)

ManualPolicy = Literal["ssot_only", "staging_only", "forbidden"]
PortDirection = Literal["ingress", "egress"]
PortStatus = Literal["active", "planned", "deprecated"]
ImportMode = Literal["replace", "merge"]

PORT_ID_RE = re.compile(r"^[a-z][a-z0-9._-]*$")
MANUAL_POLICIES = frozenset({"ssot_only", "staging_only", "forbidden"})
DIRECTIONS = frozenset({"ingress", "egress"})
STATUSES = frozenset({"active", "planned", "deprecated"})

_PORT_FIELD_ORDER = (
    "port_id",
    "label_ja",
    "ssot_owner",
    "ssot_owner_label",
    "manual_policy",
    "manual_policy_label",
    "direction",
    "source",
    "target",
    "api_method",
    "api_path",
    "idempotency_key_template",
    "status",
    "notes",
)


class IntegrationPort(TypedDict, total=False):
    port_id: str
    label_ja: str
    ssot_owner: str
    ssot_owner_label: str
    manual_policy: ManualPolicy
    manual_policy_label: str
    direction: PortDirection
    source: str
    target: str
    api_method: str
    api_path: str
    idempotency_key_template: str
    status: PortStatus
    notes: str


class IntegrationPortsConfig(TypedDict):
    version: int
    ports: list[IntegrationPort]


def config_path() -> Path:
    return _CONFIG_PATH


def _parse_yaml(text: str) -> dict[str, Any]:
    try:
        import yaml  # type: ignore
    except ImportError as exc:
        raise RuntimeError(
            "PyYAML is required to load integration_ports.yaml. "
            "Install with: pip install PyYAML"
        ) from exc
    data = yaml.safe_load(text)
    if data is None:
        return {"version": 1, "ports": []}
    if not isinstance(data, dict):
        raise ValueError("integration_ports config root must be a mapping")
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


def _expand_api_fields(item: dict[str, Any]) -> dict[str, Any]:
    out = dict(item)
    api = out.pop("api", None)
    if isinstance(api, dict):
        if not out.get("api_method") and api.get("method"):
            out["api_method"] = api["method"]
        if not out.get("api_path") and api.get("path"):
            out["api_path"] = api["path"]
    return out


def _validate_port_id(port_id: str, *, prefix: str = "") -> list[str]:
    label = f"{prefix}port_id" if prefix else "port_id"
    if not port_id:
        return [f"{label}: required"]
    if not PORT_ID_RE.match(port_id):
        return [f"{label}: invalid format `{port_id}` (use lowercase a-z, digits, . _ -)"]
    return []


def _validate_port_fields(item: dict[str, Any], *, index: int | None = None) -> list[str]:
    prefix = f"ports[{index}] " if index is not None else ""
    errors: list[str] = []
    port_id = str(item.get("port_id") or "").strip()
    errors.extend(_validate_port_id(port_id, prefix=prefix))
    label_ja = str(item.get("label_ja") or "").strip()
    if not label_ja:
        errors.append(f"{prefix}label_ja: required")
    manual_policy = item.get("manual_policy")
    if manual_policy is not None and manual_policy not in MANUAL_POLICIES:
        errors.append(f"{prefix}manual_policy: must be one of {sorted(MANUAL_POLICIES)}")
    direction = item.get("direction")
    if direction is not None and direction not in DIRECTIONS:
        errors.append(f"{prefix}direction: must be one of {sorted(DIRECTIONS)}")
    status = item.get("status") or "planned"
    if status not in STATUSES:
        errors.append(f"{prefix}status: must be one of {sorted(STATUSES)}")
    return errors


def validate_config_data(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    try:
        version = int(data.get("version", 1))
    except (TypeError, ValueError):
        errors.append("version: must be an integer")
        version = 1
    if version < 1:
        errors.append("version: must be >= 1")
    ports_raw = data.get("ports")
    if ports_raw is None:
        errors.append("ports: required")
        return errors
    if not isinstance(ports_raw, list):
        errors.append("ports: must be a list")
        return errors
    seen: set[str] = set()
    for idx, item in enumerate(ports_raw):
        if not isinstance(item, dict):
            errors.append(f"ports[{idx}]: must be a mapping")
            continue
        expanded = _expand_api_fields(item)
        errors.extend(_validate_port_fields(expanded, index=idx))
        port_id = str(expanded.get("port_id") or "").strip()
        if port_id:
            if port_id in seen:
                errors.append(f"ports[{idx}]: duplicate port_id `{port_id}`")
            seen.add(port_id)
    return errors


def validate_yaml_text(text: str) -> tuple[list[str], IntegrationPortsConfig | None]:
    try:
        data = _parse_yaml(text)
    except ValueError as exc:
        return [str(exc)], None
    except Exception as exc:  # noqa: BLE001 — yaml.YAMLError etc.
        return [f"YAML parse error: {exc}"], None
    errors = validate_config_data(data)
    if errors:
        return errors, None
    return [], _parse_config_data(data)


def _parse_config_data(data: dict[str, Any]) -> IntegrationPortsConfig:
    version = int(data.get("version", 1))
    ports_raw = data.get("ports") or []
    ports: list[IntegrationPort] = []
    for item in ports_raw:
        if not isinstance(item, dict):
            raise ValueError("each port entry must be a mapping")
        expanded = _expand_api_fields(item)
        port_id = str(expanded.get("port_id") or "").strip()
        ports.append(_normalize_port(expanded, port_id))
    return {"version": version, "ports": ports}


@lru_cache(maxsize=1)
def load_integration_ports_config() -> IntegrationPortsConfig:
    path = config_path()
    if not path.is_file():
        raise FileNotFoundError(f"Integration ports config not found: {path}")
    raw = path.read_text(encoding="utf-8")
    data = _parse_yaml(raw)
    errors = validate_config_data(data)
    if errors:
        raise ValueError("; ".join(errors))
    return _parse_config_data(data)


def _normalize_port(item: dict[str, Any], port_id: str) -> IntegrationPort:
    return IntegrationPort(
        port_id=port_id,
        label_ja=str(item.get("label_ja") or port_id),
        ssot_owner=str(item.get("ssot_owner") or ""),
        ssot_owner_label=str(item.get("ssot_owner_label") or item.get("ssot_owner") or ""),
        manual_policy=item.get("manual_policy"),  # type: ignore[typeddict-item]
        manual_policy_label=str(item.get("manual_policy_label") or ""),
        direction=item.get("direction"),  # type: ignore[typeddict-item]
        source=str(item.get("source") or ""),
        target=str(item.get("target") or ""),
        api_method=str(item.get("api_method") or ""),
        api_path=str(item.get("api_path") or ""),
        idempotency_key_template=str(item.get("idempotency_key_template") or ""),
        status=item.get("status") or "planned",  # type: ignore[typeddict-item]
        notes=str(item.get("notes") or ""),
    )


def _port_to_raw_dict(port: IntegrationPort) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key in _PORT_FIELD_ORDER:
        val = port.get(key)  # type: ignore[literal-required]
        if val is None or val == "":
            continue
        out[key] = val
    if "status" not in out:
        out["status"] = "planned"
    return out


def _config_to_raw_dict(cfg: IntegrationPortsConfig) -> dict[str, Any]:
    return {
        "version": cfg["version"],
        "ports": [_port_to_raw_dict(p) for p in cfg["ports"]],
    }


def save_integration_ports_config(cfg: IntegrationPortsConfig) -> IntegrationPortsConfig:
    errors = validate_config_data(_config_to_raw_dict(cfg))
    if errors:
        raise ValueError("; ".join(errors))
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(_dump_yaml(_config_to_raw_dict(cfg)), encoding="utf-8")
    load_integration_ports_config.cache_clear()
    return load_integration_ports_config()


def export_yaml_text() -> str:
    cfg = load_integration_ports_config()
    return _dump_yaml(_config_to_raw_dict(cfg))


def import_yaml_text(text: str, *, mode: ImportMode = "replace") -> IntegrationPortsConfig:
    errors, parsed = validate_yaml_text(text)
    if errors or parsed is None:
        raise ValueError("; ".join(errors) if errors else "invalid YAML")
    if mode == "replace":
        return save_integration_ports_config(parsed)
    current = load_integration_ports_config()
    merged_by_id: dict[str, IntegrationPort] = {p["port_id"]: p for p in current["ports"]}
    for port in parsed["ports"]:
        merged_by_id[port["port_id"]] = port
    merged: IntegrationPortsConfig = {
        "version": parsed["version"],
        "ports": list(merged_by_id.values()),
    }
    return save_integration_ports_config(merged)


def list_ports(*, status: PortStatus | None = None) -> list[IntegrationPort]:
    cfg = load_integration_ports_config()
    ports = cfg["ports"]
    if status is None:
        return list(ports)
    return [p for p in ports if p.get("status") == status]


def get_port(port_id: str) -> IntegrationPort | None:
    for port in list_ports():
        if port.get("port_id") == port_id:
            return port
    return None


def create_port(body: dict[str, Any]) -> IntegrationPort:
    expanded = _expand_api_fields(body)
    port_id = str(expanded.get("port_id") or "").strip()
    field_errors = _validate_port_fields(expanded)
    if field_errors:
        raise ValueError("; ".join(field_errors))
    cfg = load_integration_ports_config()
    if get_port(port_id):
        raise ValueError(f"port_id already exists: {port_id}")
    port = _normalize_port(expanded, port_id)
    cfg["ports"].append(port)
    save_integration_ports_config(cfg)
    saved = get_port(port_id)
    assert saved is not None
    return saved


def update_port(port_id: str, body: dict[str, Any]) -> IntegrationPort:
    expanded = _expand_api_fields(body)
    if expanded.get("port_id") and str(expanded["port_id"]).strip() != port_id:
        raise ValueError("port_id in body cannot differ from URL")
    expanded["port_id"] = port_id
    field_errors = _validate_port_fields(expanded)
    if field_errors:
        raise ValueError("; ".join(field_errors))
    cfg = load_integration_ports_config()
    idx = next((i for i, p in enumerate(cfg["ports"]) if p["port_id"] == port_id), None)
    if idx is None:
        raise KeyError(f"Port not found: {port_id}")
    cfg["ports"][idx] = _normalize_port(expanded, port_id)
    save_integration_ports_config(cfg)
    saved = get_port(port_id)
    assert saved is not None
    return saved


def delete_port(port_id: str) -> None:
    cfg = load_integration_ports_config()
    next_ports = [p for p in cfg["ports"] if p["port_id"] != port_id]
    if len(next_ports) == len(cfg["ports"]):
        raise KeyError(f"Port not found: {port_id}")
    save_integration_ports_config({"version": cfg["version"], "ports": next_ports})


def reload_integration_ports_config() -> IntegrationPortsConfig:
    load_integration_ports_config.cache_clear()
    return load_integration_ports_config()


def config_summary() -> dict[str, Any]:
    cfg = load_integration_ports_config()
    path = config_path()
    mtime = path.stat().st_mtime if path.is_file() else None
    return {
        "version": cfg["version"],
        "port_count": len(cfg["ports"]),
        "config_path": str(path),
        "config_mtime": mtime,
    }


def ports_as_json() -> str:
    return json.dumps(load_integration_ports_config(), ensure_ascii=False, indent=2)
