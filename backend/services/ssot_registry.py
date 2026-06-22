"""SSOT ドメイン定義 — 正規化ストアの単一レジストリ。

docs/ssot-normalization.md と同期すること。
"""

from __future__ import annotations

from typing import TypedDict


class SsotDomain(TypedDict):
    id: str
    label: str
    storage: str
    service: str


SSOT_DOMAINS: list[SsotDomain] = [
    {
        "id": "client_master",
        "label": "顧客マスタ",
        "storage": "storage/client_master.json",
        "service": "main._load_client_master",
    },
    {
        "id": "payroll",
        "label": "給与・源泉",
        "storage": "storage/payroll_ledger.db",
        "service": "payroll_ledger_service",
    },
    {
        "id": "capture",
        "label": "キャプチャ（ステージング）",
        "storage": "storage/capture_items.db",
        "service": "capture_service",
    },
    {
        "id": "metrics",
        "label": "ダッシュボード・株価評価指標",
        "storage": "storage/client_metrics.db",
        "service": "client_metrics_service",
    },
    {
        "id": "records",
        "label": "調査・特殊事項・アラート",
        "storage": "storage/client_records.db",
        "service": "client_records_service",
    },
    {
        "id": "calendar",
        "label": "経費突合カレンダー",
        "storage": "storage/client_calendar.db",
        "service": "client_calendar_service",
    },
    {
        "id": "comms",
        "label": "コミュニケーション",
        "storage": "storage/client_comms.db",
        "service": "client_comms_service",
    },
    {
        "id": "simulation",
        "label": "シミュレーションオーバーレイ",
        "storage": "storage/client_simulation.db",
        "service": "client_simulation_service",
    },
    {
        "id": "documents",
        "label": "資料スロット",
        "storage": "storage/slot_documents.db",
        "service": "main._init_slot_documents_db",
    },
]


def domain_by_id(domain_id: str) -> SsotDomain | None:
    for d in SSOT_DOMAINS:
        if d["id"] == domain_id:
            return d
    return None
