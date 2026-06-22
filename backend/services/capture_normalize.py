"""キャプチャ（ステージング）→ ドメイン SSOT への正規化ヘルパ。

キャプチャ metadata は確定前のステージング。給与ドメインへは apply-payroll 経由のみ反映する。
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from services.marufu_parser import payroll_patch_from_marufu


def build_marufu_parsed_from_capture(item: dict) -> Dict[str, Any]:
    """キャプチャ item からまるふ正規化 dict を組み立てる（SSOT 反映前の統合ビュー）。"""
    meta = item.get("metadata") or {}
    hints = meta.get("manual_hints") or {}
    marufu = dict(meta.get("marufu_parsed") or {})
    deduction = meta.get("deduction_audit") or {}

    if hints.get("dependent_count") is not None:
        marufu["dependent_count"] = int(hints["dependent_count"])
    if hints.get("life_insurance_yen") is not None:
        marufu["life_insurance_yen"] = int(hints["life_insurance_yen"])
    elif hints.get("proof_yen") is not None:
        marufu["life_insurance_yen"] = int(hints["proof_yen"])
    elif deduction.get("proof_yen") is not None:
        marufu["life_insurance_yen"] = int(deduction["proof_yen"])
    if hints.get("spouse_deduction") is not None:
        marufu["spouse_deduction"] = bool(hints["spouse_deduction"])

    if not marufu.get("doc_type"):
        marufu["doc_type"] = "marufu_dependents"
    return marufu


def extract_payroll_patch_from_capture(item: dict) -> Dict[str, Any]:
    """キャプチャ item から給与マスタ更新用パッチを抽出（正規化前のマッピング）。"""
    return payroll_patch_from_marufu(build_marufu_parsed_from_capture(item))


def normalized_deduction_amounts(item: dict) -> Dict[str, Optional[int]]:
    """証明額・申告額の正規化ビュー（手入力優先）。"""
    meta = item.get("metadata") or {}
    hints = meta.get("manual_hints") or {}
    deduction = meta.get("deduction_audit") or {}
    proof = hints.get("proof_yen")
    if proof is None:
        proof = deduction.get("proof_yen")
    declared = hints.get("declared_yen")
    if declared is None:
        declared = deduction.get("declared_yen")
    return {
        "proof_yen": int(proof) if proof is not None else None,
        "declared_yen": int(declared) if declared is not None else None,
    }
