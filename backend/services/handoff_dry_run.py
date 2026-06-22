"""連携ポートのサンプル payload・dry-run 検証・テスト送信。

docs/no-code-config-vision.md C4
docs/integration-port-catalog.md I4
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urljoin

from services.integration_registry import IntegrationPort, get_port

_STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
_HEALTH_PATH = _STORAGE_DIR / "integration_port_tests.json"

TestStatus = Literal["simulated", "validated", "sent", "error"]


@dataclass
class HandoffTestContext:
    client_id: str = "client-demo"
    period_key: str = "2025-03"
    firm_id: str = "firm-demo"
    member_id: str = "member-demo"
    batch_id: str = "batch-001"
    journal_id: str = "journal-demo"
    target_base_url: str = ""
    user_id: str = "dev-test"


@dataclass
class PortTestResult:
    port_id: str
    dry_run: bool
    status: TestStatus
    message: str
    http_method: str = ""
    url: str = ""
    request_body: dict[str, Any] = field(default_factory=dict)
    response_status: int | None = None
    response_body: Any = None
    validation_errors: list[str] = field(default_factory=list)
    idempotency_key: str = ""
    tested_at: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "port_id": self.port_id,
            "dry_run": self.dry_run,
            "status": self.status,
            "message": self.message,
            "http_method": self.http_method,
            "url": self.url,
            "request_body": self.request_body,
            "response_status": self.response_status,
            "response_body": self.response_body,
            "validation_errors": self.validation_errors,
            "idempotency_key": self.idempotency_key,
            "tested_at": self.tested_at,
        }


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def render_idempotency_key(template: str, ctx: HandoffTestContext) -> str:
    if not template:
        return ""
    mapping = {
        "client_id": ctx.client_id,
        "period_key": ctx.period_key,
        "firm_id": ctx.firm_id,
        "member_id": ctx.member_id,
        "batch_id": ctx.batch_id,
        "journal_id": ctx.journal_id,
    }
    out = template
    for key, value in mapping.items():
        out = out.replace(f"{{{key}}}", value)
    return out


def _default_target_base_url() -> str:
    return (os.environ.get("TAX_ACCOUNTING_BASE_URL") or "").strip().rstrip("/")


def build_sample_payload(port_id: str, port: IntegrationPort, ctx: HandoffTestContext) -> dict[str, Any]:
    idem = render_idempotency_key(port.get("idempotency_key_template") or "", ctx)
    base = {
        "client_id": ctx.client_id,
        "period_key": ctx.period_key,
    }
    if idem:
        base["idempotency_key"] = idem

    if port_id == "docugrid.metrics.monthly_revenue.projection":
        return {
            **base,
            "source": {
                "system": "tax-accounting",
                "port_id": port_id,
                "reference": "trial-balance",
            },
            "metrics": [
                {
                    "metric_key": "monthly.revenue",
                    "value_yen": 500000,
                    "source": "tax-accounting:trial-balance",
                }
            ],
        }

    if port_id == "tax-accounting.journals.ingress":
        return {
            **base,
            "source": {
                "system": "docugrid",
                "slot_id": "ledger",
                "version_id": "ver-demo-001",
            },
            "journals": [
                {
                    "entry_date": f"{ctx.period_key}-15",
                    "description": "handoff dry-run sample",
                    "lines": [
                        {"account_code": "4110", "debit": 10000, "credit": 0},
                        {"account_code": "1110", "debit": 0, "credit": 10000},
                    ],
                }
            ],
        }

    if port_id == "tax-accounting.journals.import":
        return {
            **base,
            "format": "local-csv",
            "file_name": "journals_sample.csv",
            "note": "CSV は同じ ingress API の別トランスポート（実装予定）",
        }

    if port_id == "docugrid.audit.auto_vouch":
        return {
            "version_id": "ver-demo-001",
            "target_value": 500000,
            "user_id": ctx.user_id,
            "field_id": "revenue",
            "match_strategy": "best",
            "dry_run": True,
        }

    if port_id == "docugrid.payroll.ledger_row":
        return {
            **base,
            "employee_id": "emp-001",
            "gross_pay_yen": 350000,
            "withholding_yen": 12000,
            "note": "給与台帳行のサンプル（実 API スキーマは payroll サービスに準拠）",
        }

    if port_id == "docugrid.payroll.marufu_apply":
        return {
            **base,
            "capture_id": "capture-demo-001",
            "confirm": False,
            "note": "キャプチャ確定前のステージング経路",
        }

    if port_id == "docugrid.slots.monthly_trial_balance":
        return {
            **base,
            "slot_id": "monthly_trial_balance",
            "label": "試算表 PDF（dry-run 用メタのみ）",
        }

    if port_id == "docugrid.documents.version_ref":
        return {
            "journal_id": ctx.journal_id,
            "client_id": ctx.client_id,
            "period_key": ctx.period_key,
        }

    if port_id == "legal.consumption_tax.standard":
        return {
            "rate_type": "standard",
            "as_of": f"{ctx.period_key}-01",
        }

    if port_id == "docugrid.metrics.monthly_revenue.ocr":
        return {
            **base,
            "metric_key": "monthly.revenue",
            "value_yen": 480000,
            "source": "ocr:monthly_trial_balance",
        }

    return {
        **base,
        "source": {"system": port.get("ssot_owner") or "docugrid", "port_id": port_id},
        "note": f"Generic sample for {port_id}",
    }


def validate_payload(port_id: str, port: IntegrationPort, payload: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if not isinstance(payload, dict):
        return ["payload must be a JSON object"]

    if port_id in {
        "docugrid.metrics.monthly_revenue.projection",
        "docugrid.metrics.monthly_revenue.ocr",
    }:
        metrics = payload.get("metrics")
        if port_id.endswith(".projection"):
            if not isinstance(metrics, list) or not metrics:
                errors.append("metrics: required non-empty array")
            else:
                for i, row in enumerate(metrics):
                    if not isinstance(row, dict):
                        errors.append(f"metrics[{i}]: must be object")
                        continue
                    if not row.get("metric_key"):
                        errors.append(f"metrics[{i}].metric_key: required")
                    if row.get("value_yen") is None:
                        errors.append(f"metrics[{i}].value_yen: required")
        else:
            if not payload.get("metric_key"):
                errors.append("metric_key: required")
            if payload.get("value_yen") is None:
                errors.append("value_yen: required")

    elif port_id == "tax-accounting.journals.ingress":
        source = payload.get("source")
        if not isinstance(source, dict):
            errors.append("source: required object")
        elif source.get("system") != "docugrid":
            errors.append("source.system: expected docugrid")
        journals = payload.get("journals")
        if not isinstance(journals, list) or not journals:
            errors.append("journals: required non-empty array")

    elif port_id == "docugrid.audit.auto_vouch":
        if payload.get("target_value") is None:
            errors.append("target_value: required")
        if not payload.get("field_id"):
            errors.append("field_id: required")
        if not payload.get("version_id") and not payload.get("pdf_file_path"):
            errors.append("version_id or pdf_file_path: one required")

    elif port_id == "docugrid.slots.monthly_trial_balance":
        for key in ("client_id", "period_key", "slot_id"):
            if not payload.get(key):
                errors.append(f"{key}: required")

    api_path = port.get("api_path") or ""
    if api_path.startswith("/api/") and port.get("api_method") in ("POST", "PUT", "PATCH"):
        if port.get("idempotency_key_template") and not payload.get("idempotency_key"):
            errors.append("idempotency_key: recommended when template is set")

    return errors


def _resolve_url(port: IntegrationPort, ctx: HandoffTestContext) -> tuple[str, str]:
    method = (port.get("api_method") or "GET").upper()
    api_path = port.get("api_path") or ""
    if method == "INTERNAL":
        return method, api_path
    if api_path.startswith("http://") or api_path.startswith("https://"):
        return method, api_path
    base = (ctx.target_base_url or _default_target_base_url()).rstrip("/")
    if not base:
        return method, api_path
    if not api_path.startswith("/"):
        api_path = f"/{api_path}"
    return method, urljoin(f"{base}/", api_path.lstrip("/"))


def _is_external_port(port: IntegrationPort) -> bool:
    owner = (port.get("ssot_owner") or "").lower()
    api_path = port.get("api_path") or ""
    if owner in {"tax-accounting", "legal-master"}:
        return True
    if api_path.startswith("/api/v1/"):
        return True
    if api_path.startswith("/import/"):
        return True
    return False


def run_port_test(
    port_id: str,
    *,
    payload: dict[str, Any] | None = None,
    dry_run: bool = True,
    ctx: HandoffTestContext | None = None,
) -> PortTestResult:
    port = get_port(port_id)
    if not port:
        raise KeyError(f"Port not found: {port_id}")

    context = ctx or HandoffTestContext()
    body = dict(payload or build_sample_payload(port_id, port, context))
    idem = render_idempotency_key(port.get("idempotency_key_template") or "", context)
    if idem and not body.get("idempotency_key"):
        body["idempotency_key"] = idem

    validation_errors = validate_payload(port_id, port, body)
    method, url = _resolve_url(port, context)
    tested_at = _now_iso()

    if validation_errors:
        result = PortTestResult(
            port_id=port_id,
            dry_run=dry_run,
            status="error",
            message="Payload validation failed",
            http_method=method,
            url=url,
            request_body=body,
            validation_errors=validation_errors,
            idempotency_key=str(body.get("idempotency_key") or ""),
            tested_at=tested_at,
        )
        record_test_result(port_id, result)
        return result

    if dry_run or method == "INTERNAL":
        result = PortTestResult(
            port_id=port_id,
            dry_run=True,
            status="simulated" if _is_external_port(port) or method == "INTERNAL" else "validated",
            message=_dry_run_message(port, method),
            http_method=method,
            url=url,
            request_body=body,
            idempotency_key=str(body.get("idempotency_key") or ""),
            tested_at=tested_at,
        )
        record_test_result(port_id, result)
        return result

    if not context.target_base_url and not _default_target_base_url():
        result = PortTestResult(
            port_id=port_id,
            dry_run=False,
            status="error",
            message="target_base_url required for live send (or set TAX_ACCOUNTING_BASE_URL)",
            http_method=method,
            url=url,
            request_body=body,
            idempotency_key=str(body.get("idempotency_key") or ""),
            tested_at=tested_at,
        )
        record_test_result(port_id, result)
        return result

    try:
        import requests  # type: ignore
    except ImportError as exc:
        raise RuntimeError("requests is required for live handoff test send") from exc

    headers = {"Content-Type": "application/json", "X-Docugrid-Handoff-Test": "1"}
    try:
        resp = requests.request(
            method,
            url,
            json=body,
            headers=headers,
            timeout=15,
        )
        try:
            resp_body: Any = resp.json()
        except Exception:  # noqa: BLE001
            resp_body = resp.text[:2000]
        ok = 200 <= resp.status_code < 300
        result = PortTestResult(
            port_id=port_id,
            dry_run=False,
            status="sent" if ok else "error",
            message=f"HTTP {resp.status_code}",
            http_method=method,
            url=url,
            request_body=body,
            response_status=resp.status_code,
            response_body=resp_body,
            idempotency_key=str(body.get("idempotency_key") or ""),
            tested_at=tested_at,
        )
    except Exception as exc:  # noqa: BLE001
        result = PortTestResult(
            port_id=port_id,
            dry_run=False,
            status="error",
            message=str(exc),
            http_method=method,
            url=url,
            request_body=body,
            idempotency_key=str(body.get("idempotency_key") or ""),
            tested_at=tested_at,
        )

    record_test_result(port_id, result)
    return result


def _dry_run_message(port: IntegrationPort, method: str) -> str:
    if method == "INTERNAL":
        return "Internal route — payload validated; no HTTP dispatch"
    if _is_external_port(port):
        return "Dry-run — request composed; not sent to external system"
    return "Dry-run — payload validated against port contract"


def _load_health_store() -> dict[str, Any]:
    if not _HEALTH_PATH.is_file():
        return {}
    try:
        data = json.loads(_HEALTH_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def record_test_result(port_id: str, result: PortTestResult) -> None:
    store = _load_health_store()
    store[port_id] = result.to_dict()
    _STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    _HEALTH_PATH.write_text(json.dumps(store, ensure_ascii=False, indent=2), encoding="utf-8")


def get_last_test_result(port_id: str) -> dict[str, Any] | None:
    return _load_health_store().get(port_id)


def list_test_health() -> dict[str, dict[str, Any]]:
    return _load_health_store()


def sample_response(port_id: str, ctx: HandoffTestContext | None = None) -> dict[str, Any]:
    port = get_port(port_id)
    if not port:
        raise KeyError(f"Port not found: {port_id}")
    context = ctx or HandoffTestContext()
    payload = build_sample_payload(port_id, port, context)
    method, url = _resolve_url(port, context)
    return {
        "port_id": port_id,
        "http_method": method,
        "url": url,
        "idempotency_key": payload.get("idempotency_key") or render_idempotency_key(
            port.get("idempotency_key_template") or "", context
        ),
        "payload": payload,
        "target_base_url_hint": context.target_base_url or _default_target_base_url() or None,
    }
