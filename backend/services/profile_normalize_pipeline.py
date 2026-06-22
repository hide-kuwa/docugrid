"""取り込み → 正規化 → client-master / metrics 反映パイプライン（D1）。"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from services.client_master_store import append_history_entry, find_client, update_client_record
from services.client_profile_fields import CLIENT_PROFILE_FIELD_IDS
from services.client_metrics_service import get_metric_fact, upsert_metric_fact
from services.client_records_service import upsert_record_item
from services.profile_extractors import extract_profile_fields

MIN_FIELD_CONFIDENCE = 0.55

PERM_SLOTS = frozenset(
    {
        "corporate_registry",
        "articles_of_incorporation",
        "shareholder_registry",
        "establishment_notice",
    }
)
YEAR_SLOTS = frozenset(
    {
        "tax_return_corporate",
        "tax_return_consumption",
        "financial_report",
        "ledger",
    }
)

SOURCE_BASE_RANK: dict[str, int] = {
    "manual": 100,
    "ocr": 50,
    "import": 40,
    "master": 30,
}


@dataclass
class IngestContext:
    firm_id: str
    client_id: str
    source_type: str = "ocr"
    slot_id: Optional[str] = None
    period_key: Optional[str] = None
    slot_label: Optional[str] = None
    text: Optional[str] = None
    text_engine: Optional[str] = None
    document_confidence: Optional[float] = None
    extracted_fields: Optional[Dict[str, str]] = None
    updated_by: Optional[str] = None
    updated_by_id: Optional[str] = None


@dataclass
class FieldChange:
    field_id: str
    value: str
    previous_value: str
    confidence: float


@dataclass
class SkippedField:
    field_id: str
    reason: str
    incoming_value: Optional[str] = None


@dataclass
class ConflictField:
    field_id: str
    existing_value: str
    incoming_value: str
    existing_source: str


@dataclass
class NormalizeResult:
    applied: List[FieldChange] = field(default_factory=list)
    skipped: List[SkippedField] = field(default_factory=list)
    conflicts: List[ConflictField] = field(default_factory=list)
    metrics_applied: List[dict] = field(default_factory=list)
    tax_alerts_created: List[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "applied": [
                {
                    "field_id": c.field_id,
                    "value": c.value,
                    "previous_value": c.previous_value,
                    "confidence": c.confidence,
                }
                for c in self.applied
            ],
            "skipped": [
                {
                    "field_id": s.field_id,
                    "reason": s.reason,
                    "incoming_value": s.incoming_value,
                }
                for s in self.skipped
            ],
            "conflicts": [
                {
                    "field_id": c.field_id,
                    "existing_value": c.existing_value,
                    "incoming_value": c.incoming_value,
                    "existing_source": c.existing_source,
                }
                for c in self.conflicts
            ],
            "metrics_applied": self.metrics_applied,
            "tax_alerts_created": self.tax_alerts_created,
        }


def _cleanse_value(field_id: str, value: str) -> str:
    v = value.strip()
    v = re.sub(r"\s+", " ", v)
    if field_id == "corporate_number":
        digits = re.sub(r"\D", "", v)
        if len(digits) == 13:
            return digits
    return v


def _slot_tier_bonus(slot_id: Optional[str]) -> int:
    if not slot_id:
        return 0
    if slot_id in PERM_SLOTS:
        return 30
    if slot_id in YEAR_SLOTS:
        return 20
    return 10


def _source_rank(source: str, slot_id: Optional[str]) -> int:
    base = SOURCE_BASE_RANK.get(source, 0)
    if source == "ocr":
        base += _slot_tier_bonus(slot_id)
    return base


def _parse_yen(value: str) -> Optional[int]:
    digits = re.sub(r"[^\d]", "", value)
    if not digits:
        return None
    return int(digits)


def _fiscal_label_from_period(period_key: Optional[str]) -> str:
    if period_key == "year:0":
        return "R5"
    if period_key == "year:1":
        return "R6"
    if period_key == "year:2":
        return "R7"
    return "R7"


def _collect_incoming(ctx: IngestContext) -> Dict[str, tuple[str, float]]:
    if ctx.extracted_fields:
        return {k: (v, 0.9) for k, v in ctx.extracted_fields.items() if v}
    if ctx.text and ctx.slot_id:
        return extract_profile_fields(ctx.slot_id, ctx.text)
    return {}


def normalize_client_profile(ctx: IngestContext) -> NormalizeResult:
    result = NormalizeResult()
    client = find_client(ctx.client_id)
    if not client:
        result.skipped.append(SkippedField("_client", "client not found"))
        return result

    incoming_raw = _collect_incoming(ctx)
    if not incoming_raw:
        result.skipped.append(SkippedField("_document", "no extractable fields"))
        return result

    profile: dict[str, str] = dict(client.get("profile") or {})
    meta: dict[str, dict[str, str]] = dict(client.get("profileMeta") or {})
    doc_label = ctx.slot_label or ctx.slot_id or "document"

    pending_profile: dict[str, str] = {}
    pending_meta: dict[str, dict[str, str]] = {}
    pending_history: list[tuple[str, str, str]] = []
    pending_name: Optional[str] = None

    for field_id, (raw_value, confidence) in incoming_raw.items():
        if field_id.startswith("_metric_"):
            continue
        if field_id not in CLIENT_PROFILE_FIELD_IDS:
            result.skipped.append(
                SkippedField(field_id, "unknown field", raw_value),
            )
            continue
        if confidence < MIN_FIELD_CONFIDENCE:
            result.skipped.append(
                SkippedField(field_id, "low confidence", raw_value),
            )
            continue

        value = _cleanse_value(field_id, raw_value)
        if not value:
            result.skipped.append(SkippedField(field_id, "empty after cleanse"))
            continue

        existing = (profile.get(field_id) or "").strip()
        existing_meta = meta.get(field_id) or {}
        existing_source = existing_meta.get("source") or "master"
        incoming_rank = _source_rank(ctx.source_type, ctx.slot_id)
        existing_rank = _source_rank(existing_source, ctx.slot_id)

        if existing_source == "manual" and existing:
            result.skipped.append(
                SkippedField(field_id, "manual value protected", value),
            )
            continue

        if existing and existing != value:
            if existing_rank >= incoming_rank:
                result.conflicts.append(
                    ConflictField(
                        field_id=field_id,
                        existing_value=existing,
                        incoming_value=value,
                        existing_source=existing_source,
                    ),
                )
                alert_id = _create_conflict_alert(
                    ctx.firm_id,
                    ctx.client_id,
                    field_id,
                    existing,
                    value,
                    doc_label,
                )
                if alert_id:
                    result.tax_alerts_created.append(alert_id)
                continue

        if existing == value:
            result.skipped.append(SkippedField(field_id, "unchanged", value))
            continue

        previous = existing
        pending_profile[field_id] = value
        pending_meta[field_id] = {
            "source": ctx.source_type,
            "sourceDocumentLabel": doc_label,
            "sourceSlotId": ctx.slot_id or "",
            "sourcePeriodKey": ctx.period_key or "",
            "updatedAt": "",
            "updatedBy": ctx.updated_by or "system",
        }
        if ctx.updated_by_id:
            pending_meta[field_id]["updatedById"] = ctx.updated_by_id
        pending_history.append((field_id, value, previous))
        result.applied.append(
            FieldChange(
                field_id=field_id,
                value=value,
                previous_value=previous,
                confidence=confidence,
            ),
        )

        if field_id == "customer_name" and not (client.get("name") or "").strip():
            pending_name = value

    metrics = _apply_metrics_from_ingest(ctx, incoming_raw, result)
    result.metrics_applied = metrics

    if pending_profile:
        def mutator(c: dict[str, Any]) -> None:
            prof = c.setdefault("profile", {})
            met = c.setdefault("profileMeta", {})
            for fid, val in pending_profile.items():
                prof[fid] = val
                met[fid] = pending_meta[fid]
            for fid, val, prev in pending_history:
                append_history_entry(
                    c,
                    fid,
                    value=val,
                    previous_value=prev,
                    source=ctx.source_type,
                    updated_by=ctx.updated_by,
                    updated_by_id=ctx.updated_by_id,
                )
            if pending_name:
                append_history_entry(
                    c,
                    "_name",
                    value=pending_name,
                    previous_value=c.get("name") or "",
                    source=ctx.source_type,
                    updated_by=ctx.updated_by,
                    updated_by_id=ctx.updated_by_id,
                )
                c["name"] = pending_name

        update_client_record(ctx.client_id, mutator)
        val_synced = _sync_valuation_metrics_from_profile(ctx, pending_profile)
        for fact in val_synced:
            if fact not in result.metrics_applied:
                result.metrics_applied.append(fact)

    return result


def _parse_int_shares(value: str) -> Optional[int]:
    digits = re.sub(r"[^\d]", "", value)
    if not digits:
        return None
    return int(digits)


PROFILE_VALUATION_MAP: dict[str, tuple[str, str]] = {
    "issued_shares": ("valuation.issued_shares", "shares"),
    "capital": ("valuation.capital_yen", "yen"),
    "profit_taxable_income": ("valuation.annual_profit_yen", "yen"),
}


def _sync_valuation_metrics_from_profile(
    ctx: IngestContext,
    pending_profile: dict[str, str],
) -> List[dict]:
    applied: List[dict] = []
    ref = f"profile:{ctx.slot_id}" if ctx.slot_id else "profile:normalize"
    for field_id, raw in pending_profile.items():
        spec = PROFILE_VALUATION_MAP.get(field_id)
        if not spec:
            continue
        metric_key, kind = spec
        if kind == "yen":
            num = _parse_yen(raw)
            if num is None:
                continue
            fact = _upsert_metric_ocr(
                ctx.firm_id,
                ctx.client_id,
                metric_key=metric_key,
                period_key="current",
                value_yen=num,
                source_ref=ref,
            )
        else:
            num = _parse_int_shares(raw)
            if num is None:
                continue
            existing = get_metric_fact(ctx.firm_id, ctx.client_id, metric_key, "current")
            if existing and existing.get("source_type") == "manual":
                continue
            fact = upsert_metric_fact(
                ctx.firm_id,
                ctx.client_id,
                metric_key=metric_key,
                period_key="current",
                value_yen=num,
                source_type="ocr",
                source_ref=ref,
            )
        if fact:
            applied.append(fact)
    return applied


def _month_metric_key(period_key: Optional[str]) -> str:
    if period_key and period_key.startswith("month:"):
        try:
            n = int(period_key.split(":")[1])
            return f"M{(max(0, n) % 12) + 1:02d}"
        except ValueError:
            pass
    return "M01"


def _upsert_metric_ocr(
    firm_id: str,
    client_id: str,
    *,
    metric_key: str,
    period_key: str,
    value_yen: int,
    source_ref: Optional[str],
) -> Optional[dict]:
    existing = get_metric_fact(firm_id, client_id, metric_key, period_key)
    if existing and existing.get("source_type") == "manual":
        return None
    return upsert_metric_fact(
        firm_id,
        client_id,
        metric_key=metric_key,
        period_key=period_key,
        value_yen=value_yen,
        source_type="ocr",
        source_ref=source_ref,
    )


def _apply_metrics_from_ingest(
    ctx: IngestContext,
    incoming: Dict[str, tuple[str, float]],
    result: NormalizeResult,
) -> List[dict]:
    applied: List[dict] = []
    ref = f"{ctx.period_key}:{ctx.slot_id}" if ctx.period_key and ctx.slot_id else ctx.slot_id
    fiscal = _fiscal_label_from_period(ctx.period_key)
    month_key = _month_metric_key(ctx.period_key)

    metric_specs = (
        ("_metric_annual_revenue", "annual.revenue", fiscal),
        ("_metric_annual_profit", "annual.profit", fiscal),
        ("_metric_monthly_revenue", "monthly.revenue", month_key),
        ("_metric_consumption_taxable", "annual.consumption_taxable", fiscal),
    )
    for src_key, metric_key, period_label in metric_specs:
        raw = incoming.get(src_key)
        if not raw:
            continue
        value, confidence = raw
        if confidence < MIN_FIELD_CONFIDENCE:
            continue
        yen = _parse_yen(value)
        if yen is None:
            continue
        fact = _upsert_metric_ocr(
            ctx.firm_id,
            ctx.client_id,
            metric_key=metric_key,
            period_key=period_label,
            value_yen=yen,
            source_ref=ref,
        )
        if fact:
            applied.append(fact)

    if ctx.slot_id == "tax_return_corporate":
        raw = incoming.get("profit_taxable_income")
        if raw:
            value, confidence = raw
            if confidence >= MIN_FIELD_CONFIDENCE:
                yen = _parse_yen(value)
                if yen is not None:
                    fact = _upsert_metric_ocr(
                        ctx.firm_id,
                        ctx.client_id,
                        metric_key="annual.profit",
                        period_key=fiscal,
                        value_yen=yen,
                        source_ref=ref,
                    )
                    if fact and fact not in applied:
                        applied.append(fact)

    valuation_specs = (
        ("_metric_net_assets", "valuation.net_assets_yen"),
    )
    for src_key, metric_key in valuation_specs:
        raw = incoming.get(src_key)
        if not raw:
            continue
        value, confidence = raw
        if confidence < MIN_FIELD_CONFIDENCE:
            continue
        yen = _parse_yen(value)
        if yen is None:
            continue
        fact = _upsert_metric_ocr(
            ctx.firm_id,
            ctx.client_id,
            metric_key=metric_key,
            period_key="current",
            value_yen=yen,
            source_ref=ref,
        )
        if fact:
            applied.append(fact)
    return applied


def _create_conflict_alert(
    firm_id: str,
    client_id: str,
    field_id: str,
    existing: str,
    incoming: str,
    doc_label: str,
) -> Optional[str]:
    try:
        item = upsert_record_item(
            firm_id,
            client_id,
            {
                "id": uuid.uuid4().hex,
                "domain": "tax_alert",
                "title": f"正規化の矛盾: {field_id}",
                "body": (
                    f"「{doc_label}」から「{incoming}」が抽出されましたが、"
                    f"正規値「{existing}」と一致しません。確認してください。"
                ),
                "meta": {
                    "severity": "warning",
                    "field_id": field_id,
                    "kind": "normalize_conflict",
                },
                "source_type": "normalize",
            },
        )
        return item.get("id")
    except Exception:
        return None
