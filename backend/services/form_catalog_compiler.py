"""参考資料の注釈 → 様式カタログ + AI プロンプトへのコンパイル。"""

from __future__ import annotations

import re
import unicodedata
from collections import defaultdict
from typing import Any

from services.form_catalog import (
    FormCatalogEntry,
    build_vision_prompt_snippet,
    load_form_catalog_config,
    save_form_catalog_config,
)
from services.form_catalog_samples import SampleRecord, all_annotations
from services.tax_document_types import LABELS_JA, LABEL_TO_TYPE

# 事務所スタッフ向けプリセット（表示名 → 内部 ID）
FORM_PRESETS: list[dict[str, Any]] = [
    {
        "form_id": "cover",
        "form_name": "表紙・送付状",
        "slot_label": None,
        "tax_type": None,
        "is_cover": True,
    },
    {
        "form_id": "corp_tax_beppyo_1",
        "form_name": "別表一（一）法人税の明細書",
        "slot_label": "法人税申告書",
        "tax_type": "CORP_TAX_RETURN",
        "is_cover": False,
    },
    {
        "form_id": "corp_tax_beppyo_4",
        "form_name": "別表四 所得の金額の計算に関する明細書",
        "slot_label": "法人税申告書",
        "tax_type": "CORP_TAX_RETURN",
        "is_cover": False,
    },
    {
        "form_id": "corp_tax_beppyo_5_1",
        "form_name": "別表五（一）利益積立金額及び資本金等の額の計算書",
        "slot_label": "法人税申告書",
        "tax_type": "CORP_TAX_RETURN",
        "is_cover": False,
    },
    {
        "form_id": "account_details",
        "form_name": "勘定科目内訳明細書",
        "slot_label": "勘定科目内訳明細書",
        "tax_type": "ACCOUNT_DETAILS",
        "is_cover": False,
    },
    {
        "form_id": "corp_summary",
        "form_name": "法人事業概況説明書",
        "slot_label": "法人事業概況説明書",
        "tax_type": "CORP_SUMMARY",
        "is_cover": False,
    },
    {
        "form_id": "consumption_tax",
        "form_name": "消費税及び地方消費税の申告書",
        "slot_label": "消費税申告書",
        "tax_type": "CONSUMPTION_TAX",
        "is_cover": False,
    },
    {
        "form_id": "trial_balance",
        "form_name": "試算表・決算報告書",
        "slot_label": "決算報告書",
        "tax_type": "TRIAL_BALANCE",
        "is_cover": False,
    },
    {
        "form_id": "tax_proxy",
        "form_name": "税務代理権限証書",
        "slot_label": "税務代理権限証書",
        "tax_type": "TAX_PROXY",
        "is_cover": False,
    },
]

_PRESET_BY_NAME = {p["form_name"]: p for p in FORM_PRESETS}
_PRESET_BY_ID = {p["form_id"]: p for p in FORM_PRESETS}

_REGION_LABELS = {
    "top_right": "ページ右上",
    "header": "ページ上部",
    "body": "本文",
    "any": "ページ内",
}


def list_form_presets() -> list[dict[str, Any]]:
    return [dict(p) for p in FORM_PRESETS]


def slot_label_options() -> list[dict[str, str]]:
    return [
        {"slot_label": label, "tax_type": tax_type}
        for tax_type, label in LABELS_JA.items()
        if tax_type != "UNKNOWN"
    ]


def _slugify(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name)
    ascii_name = ascii_name.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "_", ascii_name.lower()).strip("_")
    if slug:
        return f"learned_{slug[:48]}"
    return f"learned_{abs(hash(name)) % 10_000_000:07d}"


def resolve_preset(form_name: str, form_id: str | None = None) -> dict[str, Any] | None:
    if form_id and form_id in _PRESET_BY_ID:
        return _PRESET_BY_ID[form_id]
    return _PRESET_BY_NAME.get(form_name.strip())


def _group_key(ann: dict[str, Any]) -> str:
    preset = resolve_preset(str(ann.get("form_name") or ""), ann.get("form_id"))
    if preset:
        return str(preset["form_id"])
    fid = ann.get("form_id")
    if fid:
        return str(fid)
    return _slugify(str(ann.get("form_name") or "unknown"))


def _merge_phrases(existing: list[str], new: list[str]) -> list[str]:
    out = list(existing)
    seen = {x for x in out}
    for phrase in new:
        p = phrase.strip()
        if p and p not in seen:
            seen.add(p)
            out.append(p)
    return out


def _merge_anchor_lists(
    existing: list[dict[str, Any]] | None,
    compiled: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    by_region: dict[str, list[str]] = defaultdict(list)
    for anchor in existing or []:
        region = str(anchor.get("region") or "any")
        by_region[region] = _merge_phrases(by_region[region], list(anchor.get("any_of") or []))
    for anchor in compiled:
        region = str(anchor.get("region") or "any")
        by_region[region] = _merge_phrases(by_region[region], list(anchor.get("any_of") or []))
    out: list[dict[str, Any]] = []
    for region in ("top_right", "header", "any", "body"):
        phrases = by_region.get(region) or []
        if phrases:
            out.append({"region": region, "any_of": phrases[:12]})
    return out


def _merge_compiled_form(
    existing: FormCatalogEntry | None,
    compiled: FormCatalogEntry,
) -> FormCatalogEntry:
    if not existing:
        return compiled
    merged = dict(existing)
    merged["label_ja"] = compiled.get("label_ja") or existing.get("label_ja")
    merged["role"] = compiled.get("role") or existing.get("role")
    merged["maps_to"] = {**(existing.get("maps_to") or {}), **(compiled.get("maps_to") or {})}
    merged["anchors"] = _merge_anchor_lists(existing.get("anchors"), compiled.get("anchors") or [])
    merged["must_not"] = _merge_phrases(
        list(existing.get("must_not") or []),
        list(compiled.get("must_not") or []),
    )[:10]
    merged["filename_hints"] = _merge_phrases(
        list(existing.get("filename_hints") or []),
        list(compiled.get("filename_hints") or []),
    )
    merged["page_scan"] = {**(existing.get("page_scan") or {}), **(compiled.get("page_scan") or {})}
    note = str(compiled.get("notes") or "").strip()
    if note:
        merged["notes"] = note
    return merged  # type: ignore[return-value]


def compile_catalog_from_samples(*, merge: bool = True) -> dict[str, Any]:
    """全参考資料の注釈を様式カタログ YAML に反映。"""
    pairs = all_annotations()
    if not pairs:
        raise ValueError("参考資料のページ注釈がありません。PDF を登録して「このページは別表一」などを保存してください。")

    grouped: dict[str, list[tuple[SampleRecord, dict[str, Any]]]] = defaultdict(list)
    for sample, ann in pairs:
        grouped[_group_key(dict(ann))].append((sample, dict(ann)))

    compiled: list[FormCatalogEntry] = []
    learning_notes: list[str] = []

    for form_id, items in grouped.items():
        first_ann = items[0][1]
        preset = resolve_preset(str(first_ann.get("form_name") or ""), form_id)
        form_name = str(first_ann.get("form_name") or form_id)
        is_cover = bool(first_ann.get("is_cover")) or bool(preset and preset.get("is_cover"))

        slot_label = first_ann.get("slot_label") or (preset or {}).get("slot_label")
        tax_type = first_ann.get("tax_type") or (preset or {}).get("tax_type")

        if not tax_type and slot_label:
            tax_type = LABEL_TO_TYPE.get(str(slot_label))

        region_phrases: dict[str, list[str]] = defaultdict(list)
        exclude: list[str] = []
        sources: list[str] = []

        for sample, ann in items:
            fname = sample.get("original_filename") or "document.pdf"
            sources.append(f"{fname} p.{ann.get('page')}")
            for marker in ann.get("markers") or []:
                region = str(marker.get("region") or "any")
                phrase = str(marker.get("phrase") or "").strip()
                if phrase:
                    region_phrases[region] = _merge_phrases(region_phrases[region], [phrase])
            exclude = _merge_phrases(exclude, list(ann.get("exclude_phrases") or []))

        anchors = []
        for region in ("top_right", "header", "any", "body"):
            phrases = region_phrases.get(region) or []
            if phrases:
                anchors.append({"region": region, "any_of": phrases[:12]})
        if not anchors:
            continue

        fid = str(preset["form_id"]) if preset else form_id
        entry = FormCatalogEntry(
            form_id=fid,
            label_ja=form_name,
            role="skip" if is_cover else "body",
            maps_to={
                "tax_type": tax_type if not is_cover else None,
                "slot_label": slot_label if not is_cover else None,
            },
            anchors=anchors,
            must_not=exclude[:10],
            page_scan={
                "skip_in_package": is_cover,
                "continuation": not is_cover,
            },
            filename_hints=[],
            notes=f"参考資料から学習: {', '.join(sources[:8])}",
        )
        compiled.append(entry)
        learning_notes.append(f"{form_name} ← {len(sources)} ページ")

    if not compiled:
        raise ValueError("有効な識別フレーズがありません。各ページに「この文言」を1つ以上登録してください。")

    cfg = load_form_catalog_config()
    if merge:
        by_id = {f["form_id"]: f for f in cfg["forms"]}
        for entry in compiled:
            prev = by_id.get(entry["form_id"])
            by_id[entry["form_id"]] = _merge_compiled_form(prev, entry)
        cfg["forms"] = list(by_id.values())
    else:
        cfg["forms"] = compiled

    save_form_catalog_config(cfg)
    prompt = build_learning_vision_prompt()

    return {
        "forms_updated": len(compiled),
        "form_ids": [e["form_id"] for e in compiled],
        "learning_summary": learning_notes,
        "prompt_preview": prompt,
    }


def build_learning_vision_prompt(*, max_forms: int = 10) -> str:
    """参考資料の注釈を含む Vision / OCR 用プロンプト（実例ベース）。"""
    cfg = load_form_catalog_config()
    base = build_vision_prompt_snippet(cfg["forms"], max_forms=max_forms)

    pairs = all_annotations()
    if not pairs:
        return base

    lines = [
        "",
        "## 事務所が登録した実資料の例（この文言・位置で識別）",
        "以下は実際に運用している PDF から抽出した識別ポイントです。同じ様式は同じ語句・位置の組み合わせで判定してください。",
        "",
    ]

    by_form: dict[str, list[tuple[SampleRecord, dict[str, Any]]]] = defaultdict(list)
    for sample, ann in pairs:
        by_form[_group_key(dict(ann))].append((sample, dict(ann)))

    for form_id, items in list(by_form.items())[:max_forms]:
        ann0 = items[0][1]
        form_name = str(ann0.get("form_name") or form_id)
        lines.append(f"### {form_name}")
        for sample, ann in items[:4]:
            fname = sample.get("original_filename") or "document.pdf"
            page = ann.get("page")
            lines.append(f"- 参考: {fname} {page}ページ目")
            for marker in ann.get("markers") or []:
                region = _REGION_LABELS.get(str(marker.get("region") or "any"), "ページ内")
                phrase = str(marker.get("phrase") or "").strip()
                note = str(marker.get("note") or "").strip()
                if phrase:
                    hint = f"  → {region}に「{phrase}」"
                    if note:
                        hint += f"（{note}）"
                    lines.append(hint)
            exclude = ann.get("exclude_phrases") or []
            if exclude:
                lines.append(f"  → 含まれていたら別様式: {', '.join(str(x) for x in exclude[:5])}")
        lines.append("")

    example_block = "\n".join(lines).strip()
    if base:
        return f"{base}\n\n{example_block}".strip()
    return example_block
