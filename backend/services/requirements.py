"""必要書類マスタと充足判定（P4 不足資料エンジン v1）。

期種別（perm / year / month）ごとに必須書類を定義する。スロット ID は
各期種別の必須リスト内のインデックス（"0".."n-1"）に対応する。
将来は法人形態 × 税目 × 期間でマスタを拡張する想定。
"""

from __future__ import annotations

from typing import Dict, List, Optional, Set

# 期種別 → 必須書類ラベル（フロントのスロット定義と一致させる）。
REQUIREMENTS: Dict[str, List[str]] = {
    "perm": ["定款", "履歴事項全部証明書", "株主名簿", "設立届出書"],
    "year": [
        "税務代理権限証書",
        "法人税申告書",
        "勘定科目内訳明細書",
        "法人事業概況説明書",
        "決算報告書",
        "総勘定元帳",
        "消費税申告書",
    ],
    "month": ["月次試算表", "通帳コピー", "請求書綴り", "給与台帳"],
}


def period_type(period_key: str) -> str:
    """period_key（"perm" / "year:1" / "month:3"）から期種別を返す。"""
    if not period_key or period_key == "perm":
        return "perm"
    return period_key.split(":", 1)[0]


def required_labels(period_key: str) -> List[str]:
    return REQUIREMENTS.get(period_type(period_key), [])


def compute_period_status(
    period_key: str,
    filled_slot_ids: Set[str],
    approved_slot_ids: Optional[Set[str]] = None,
) -> Dict[str, object]:
    """指定期間の充足状況を返す。filled_slot_ids は保存済みスロット ID の集合。"""
    required = required_labels(period_key)
    approved = approved_slot_ids or set()
    missing = [required[i] for i in range(len(required)) if str(i) not in filled_slot_ids]
    filled_count = sum(1 for i in range(len(required)) if str(i) in filled_slot_ids)
    approved_count = sum(1 for i in range(len(required)) if str(i) in approved)
    pending_approval = [
        required[i]
        for i in range(len(required))
        if str(i) in filled_slot_ids and str(i) not in approved
    ]
    return {
        "period_key": period_key,
        "period_type": period_type(period_key),
        "required_count": len(required),
        "filled_count": filled_count,
        "approved_count": approved_count,
        "missing": missing,
        "pending_approval": pending_approval,
        "complete": len(missing) == 0 and len(required) > 0,
        "approved_complete": len(missing) == 0 and len(pending_approval) == 0 and len(required) > 0,
    }
