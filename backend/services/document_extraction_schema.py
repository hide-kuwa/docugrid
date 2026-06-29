"""書類種別ごとの抽出スキーマ — 定款・謄本などからマスタ項目を構造化抽出する。"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Tuple

SCHEMA_DIR = Path(__file__).resolve().parent.parent / "data" / "extraction_schemas"

FieldStatus = Literal["extracted", "missing", "low_confidence"]
ReviewStatus = Literal["complete", "needs_review"]

Extracted = Dict[str, Tuple[str, float]]


@dataclass
class FieldExtraction:
    field_id: str
    label: str
    value: Optional[str]
    confidence: float
    status: FieldStatus
    target: str
    required: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "field_id": self.field_id,
            "label": self.label,
            "value": self.value,
            "confidence": round(self.confidence, 3),
            "status": self.status,
            "target": self.target,
            "required": self.required,
        }


@dataclass
class DocumentExtractionResult:
    slot_id: str
    document_label: str
    schema_version: int
    fields: List[FieldExtraction] = field(default_factory=list)
    review_status: ReviewStatus = "complete"

    @property
    def extracted_profile(self) -> dict[str, str]:
        return {
            f.field_id: f.value
            for f in self.fields
            if f.value and f.status == "extracted"
        }

    @property
    def extracted_with_confidence(self) -> Extracted:
        return {
            f.field_id: (f.value, f.confidence)
            for f in self.fields
            if f.value and f.status == "extracted"
        }

    def to_dict(self) -> dict[str, Any]:
        return {
            "slot_id": self.slot_id,
            "document_label": self.document_label,
            "schema_version": self.schema_version,
            "review_status": self.review_status,
            "fields": [f.to_dict() for f in self.fields],
            "extracted_profile": self.extracted_profile,
        }


@lru_cache(maxsize=16)
def _load_schema_raw(slot_id: str) -> Optional[dict[str, Any]]:
    path = SCHEMA_DIR / f"{slot_id}.json"
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def list_schema_slot_ids() -> List[str]:
    if not SCHEMA_DIR.is_dir():
        return []
    return sorted(p.stem for p in SCHEMA_DIR.glob("*.json"))


def has_extraction_schema(slot_id: str) -> bool:
    return _load_schema_raw(slot_id) is not None


def _postprocess(value: str, kind: Optional[str]) -> str:
    val = value.strip()
    if kind == "representative_name":
        val = re.sub(r"[\s　].*$", "", val)
    return val


def _cleanse_company_name(value: str) -> str:
    val = value.strip()
    val = re.sub(r"^(株式会社|有限会社|合同会社)\s*", "", val)
    val = re.sub(r"\s*(株式会社|有限会社|合同会社)$", "", val)
    return val.strip() or value.strip()


def _parse_yen(raw: str) -> Optional[str]:
    digits = re.sub(r"[^\d]", "", raw)
    if not digits:
        return None
    return f"{int(digits):,}円"


def _run_pattern(pattern_def: dict[str, Any], text: str) -> Optional[Tuple[str, float]]:
    ptype = pattern_def.get("type", "label_value")
    pattern = str(pattern_def.get("pattern", ""))
    confidence = float(pattern_def.get("confidence", 0.8))
    if not pattern:
        return None

    if ptype == "regex":
        m = re.search(pattern, text)
        if not m:
            return None
        group = int(pattern_def.get("group", 1))
        try:
            val = m.group(group).strip()
        except IndexError:
            return None
        if not val:
            return None
        post = pattern_def.get("postprocess")
        if post:
            val = _postprocess(val, str(post))
        return val, confidence

    if ptype == "yen":
        m = re.search(pattern, text)
        if not m:
            return None
        parsed = _parse_yen(m.group(1))
        if not parsed:
            return None
        return parsed, confidence

    # label_value
    m = re.search(pattern, text)
    if not m:
        return None
    val = m.group(1).strip()
    if not val:
        return None
    post = pattern_def.get("postprocess")
    if post:
        val = _postprocess(val, str(post))
    return val, confidence


def _resolve_field_status(
    value: Optional[str],
    confidence: float,
    *,
    required: bool,
    confidence_min: float,
) -> FieldStatus:
    if not value:
        return "missing"
    if confidence < confidence_min:
        return "low_confidence"
    return "extracted"


def extract_from_schema(slot_id: str, text: str) -> DocumentExtractionResult:
    """スキーマに従いフィールド単位で抽出し、未読取項目も含めて返す。"""
    schema = _load_schema_raw(slot_id)
    if not schema:
        return DocumentExtractionResult(
            slot_id=slot_id,
            document_label=slot_id,
            schema_version=0,
            fields=[],
            review_status="complete",
        )

    if not text or len(text.strip()) < 8:
        fields = [
            FieldExtraction(
                field_id=str(fdef["id"]),
                label=str(fdef.get("label", fdef["id"])),
                value=None,
                confidence=0.0,
                status="missing",
                target=str(fdef.get("target", schema.get("target_default", "client-master"))),
                required=bool(fdef.get("required", False)),
            )
            for fdef in schema.get("fields", [])
        ]
        return DocumentExtractionResult(
            slot_id=slot_id,
            document_label=str(schema.get("document_label", slot_id)),
            schema_version=int(schema.get("schema_version", 1)),
            fields=fields,
            review_status="needs_review",
        )

    target_default = str(schema.get("target_default", "client-master"))
    field_results: List[FieldExtraction] = []
    needs_review = False

    for fdef in schema.get("fields", []):
        field_id = str(fdef["id"])
        label = str(fdef.get("label", field_id))
        required = bool(fdef.get("required", False))
        confidence_min = float(fdef.get("confidence_min", 0.55))
        target = str(fdef.get("target", target_default))
        cleanse = fdef.get("cleanse")

        best_value: Optional[str] = None
        best_conf = 0.0
        for pdef in fdef.get("patterns", []):
            hit = _run_pattern(pdef, text)
            if hit and hit[1] >= best_conf:
                best_value, best_conf = hit

        if best_value and cleanse == "company_name":
            best_value = _cleanse_company_name(best_value)

        status = _resolve_field_status(
            best_value,
            best_conf,
            required=required,
            confidence_min=confidence_min,
        )
        if status != "extracted":
            needs_review = True
        if required and status == "missing":
            needs_review = True

        field_results.append(
            FieldExtraction(
                field_id=field_id,
                label=label,
                value=best_value,
                confidence=best_conf,
                status=status,
                target=target,
                required=required,
            ),
        )

    return DocumentExtractionResult(
        slot_id=slot_id,
        document_label=str(schema.get("document_label", slot_id)),
        schema_version=int(schema.get("schema_version", 1)),
        fields=field_results,
        review_status="needs_review" if needs_review else "complete",
    )
