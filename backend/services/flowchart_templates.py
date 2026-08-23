"""判定フローひな形（Global / Local）。文書ひな形と同じ2層。"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, List, Optional

from services.firm_settings import STORAGE_DIR, _load_json, _write_json

PLATFORM_DIR = STORAGE_DIR / "platform"
GLOBAL_PATH = PLATFORM_DIR / "global_flowchart_templates.json"

_DOC_CTAX = {"period_key": "year:1", "slot_id": "tax_return_consumption", "label": "消費税申告書"}
_DOC_CTAX_BASE = {"period_key": "year:2", "slot_id": "tax_return_consumption", "label": "基準期間の消費税申告書"}
_DOC_FIN = {"period_key": "year:1", "slot_id": "financial_report", "label": "決算報告書"}
_DOC_PAY = {"period_key": "month:1", "slot_id": "payroll_ledger", "label": "給与台帳"}
_DOC_ART = {"period_key": "perm", "slot_id": "articles_of_incorporation", "label": "定款"}
_DOC_REG = {"period_key": "perm", "slot_id": "corporate_registry", "label": "履歴事項全部証明書"}

CONSUMPTION_TAXABLE_DEFINITION: dict[str, Any] = {
    "combine": "any",
    "bindings": [
        {"input_id": "client_name", "source": "master", "field": "name", "transform": "text"},
        {
            "input_id": "entity_type",
            "source": "profile",
            "field": "entity_major",
            "transform": "entity_type",
        },
        {"input_id": "initial_capital", "source": "profile", "field": "capital", "transform": "yen"},
        {
            "input_id": "is_invoice_registered",
            "source": "profile",
            "field": "invoice_registration_application",
            "transform": "truthy",
        },
        {
            "input_id": "has_voluntary_election",
            "source": "profile",
            "field": "consumption_tax_election_notice",
            "transform": "truthy",
        },
        {
            "input_id": "base_period_sales",
            "source": "metric",
            "metric_key": "annual.consumption_taxable",
            "pick": "oldest",
            "transform": "yen",
        },
        {
            "input_id": "specified_period_sales",
            "source": "metric",
            "metric_key": "monthly.revenue",
            "pick": "sum_m01_m06",
            "transform": "yen",
        },
        {"input_id": "specified_period_salaries", "source": "const", "value": 0, "transform": "yen"},
        {"input_id": "is_special_new_corporate", "source": "const", "value": False, "transform": "bool"},
        {
            "input_id": "has_high_value_asset_restriction",
            "source": "const",
            "value": False,
            "transform": "bool",
        },
        {"input_id": "has_taxable_inheritance", "source": "const", "value": False, "transform": "bool"},
    ],
    "nodes": [
        {
            "id": "invoice_registered",
            "label": "インボイス登録",
            "rule": "適格請求書発行事業者として登録している",
            "kind": "flag",
            "when": {"input": "is_invoice_registered", "eq": True},
            "match_inputs": {"is_invoice_registered": True},
            "facts": [{"input_id": "is_invoice_registered", "label": "インボイス登録", "kind": "flag"}],
            "documents": [_DOC_CTAX],
        },
        {
            "id": "voluntary_election",
            "label": "課税事業者選択届出",
            "rule": "課税事業者選択届出書を提出している",
            "kind": "flag",
            "when": {"input": "has_voluntary_election", "eq": True},
            "match_inputs": {"has_voluntary_election": True},
            "facts": [{"input_id": "has_voluntary_election", "label": "選択届出", "kind": "flag"}],
            "documents": [_DOC_CTAX],
        },
        {
            "id": "base_period_sales_exceeded",
            "label": "基準期間の課税売上高",
            "rule": "基準期間の課税売上高が 1,000 万円を超える",
            "kind": "threshold",
            "when": {"input": "base_period_sales", "op": ">", "value": 10_000_000},
            "match_inputs": {"base_period_sales": 10_000_001},
            "facts": [
                {
                    "input_id": "base_period_sales",
                    "label": "基準期間の課税売上高",
                    "kind": "yen",
                    "threshold": 10_000_000,
                    "comparison": ">",
                }
            ],
            "documents": [_DOC_CTAX_BASE],
        },
        {
            "id": "specified_period_sales_and_salaries_exceeded",
            "label": "特定期間（売上かつ給与）",
            "rule": "特定期間の課税売上高と給与等支払額がともに 1,000 万円を超える",
            "kind": "threshold",
            "when": {
                "all": [
                    {"input": "specified_period_sales", "op": ">", "value": 10_000_000},
                    {"input": "specified_period_salaries", "op": ">", "value": 10_000_000},
                ]
            },
            "match_inputs": {
                "specified_period_sales": 10_000_001,
                "specified_period_salaries": 10_000_001,
            },
            "facts": [
                {
                    "input_id": "specified_period_sales",
                    "label": "特定期間の課税売上高",
                    "kind": "yen",
                    "threshold": 10_000_000,
                    "comparison": ">",
                },
                {
                    "input_id": "specified_period_salaries",
                    "label": "特定期間の給与等支払額",
                    "kind": "yen",
                    "threshold": 10_000_000,
                    "comparison": ">",
                },
            ],
            "documents": [_DOC_FIN, _DOC_PAY],
        },
        {
            "id": "new_corporate_capital",
            "label": "新設法人の資本金",
            "rule": "法人かつ設立時資本金が 1,000 万円以上",
            "kind": "threshold",
            "when": {
                "all": [
                    {"input": "entity_type", "eq": "corporate"},
                    {"input": "initial_capital", "op": ">=", "value": 10_000_000},
                ]
            },
            "match_inputs": {"entity_type": "corporate", "initial_capital": 10_000_000},
            "facts": [
                {"input_id": "entity_type", "label": "事業者区分", "kind": "text"},
                {
                    "input_id": "initial_capital",
                    "label": "設立時資本金",
                    "kind": "yen",
                    "threshold": 10_000_000,
                    "comparison": ">=",
                },
            ],
            "documents": [_DOC_ART, _DOC_REG],
        },
        {
            "id": "special_new_corporate",
            "label": "特定新規設立法人",
            "rule": "特定新規設立法人（親会社の基準期間売上 5 億円超など）に該当する",
            "kind": "flag",
            "when": {"input": "is_special_new_corporate", "eq": True},
            "match_inputs": {"is_special_new_corporate": True},
            "facts": [{"input_id": "is_special_new_corporate", "label": "特定新規設立法人", "kind": "flag"}],
            "documents": [_DOC_ART],
        },
        {
            "id": "high_value_asset_restriction",
            "label": "高額特定資産の制限",
            "rule": "高額特定資産の取得による免税移行制限期間中",
            "kind": "flag",
            "when": {"input": "has_high_value_asset_restriction", "eq": True},
            "match_inputs": {"has_high_value_asset_restriction": True},
            "facts": [
                {
                    "input_id": "has_high_value_asset_restriction",
                    "label": "高額特定資産の制限期間",
                    "kind": "flag",
                }
            ],
            "documents": [_DOC_FIN],
        },
        {
            "id": "taxable_inheritance",
            "label": "事業承継・合併等",
            "rule": "課税事業者からの事業承継・合併等に該当する",
            "kind": "flag",
            "when": {"input": "has_taxable_inheritance", "eq": True},
            "match_inputs": {"has_taxable_inheritance": True},
            "facts": [{"input_id": "has_taxable_inheritance", "label": "事業承継・合併等", "kind": "flag"}],
            "documents": [_DOC_ART],
        },
    ],
    "outcomes": {
        "true": {"label": "課税事業者", "message": "消費税課税事業者に該当します。"},
        "false": {"label": "免税（見込み）", "message": "消費税課税事業者に該当しません。"},
    },
}

BLANK_DEFINITION: dict[str, Any] = {
    "combine": "any",
    "bindings": [
        {"input_id": "client_name", "source": "master", "field": "name", "transform": "text"},
        {"input_id": "flag1", "source": "const", "value": False, "transform": "bool"},
    ],
    "nodes": [
        {
            "id": "flag1",
            "label": "条件1",
            "rule": "マスタや指標の項目を bindings で結びます",
            "kind": "flag",
            "when": {"input": "flag1", "eq": True},
            "match_inputs": {"flag1": True},
            "facts": [{"input_id": "flag1", "label": "条件1", "kind": "flag"}],
            "documents": [],
        }
    ],
    "outcomes": {
        "true": {"label": "該当", "message": "該当します。"},
        "false": {"label": "非該当", "message": "該当しません。"},
    },
}

# 簡易課税の事業区分（国税庁フローチャートの要約）。回答は手入力フラグ。
BUSINESS_CATEGORY_DEFINITION: dict[str, Any] = {
    "mode": "tree",
    "start": "goods_transfer",
    "combine": "tree",
    "bindings": [
        {"input_id": "client_name", "source": "master", "field": "name", "transform": "text"},
        {"input_id": "is_goods_transfer", "source": "const", "value": None, "transform": "bool"},
        {"input_id": "is_purchased_goods", "source": "const", "value": None, "transform": "bool"},
        {"input_id": "is_modified", "source": "const", "value": None, "transform": "bool"},
        {"input_id": "is_buyer_business", "source": "const", "value": None, "transform": "bool"},
        {"input_id": "is_agro_forestry_fishery", "source": "const", "value": None, "transform": "bool"},
        {"input_id": "is_fixed_asset_transfer", "source": "const", "value": None, "transform": "bool"},
        {"input_id": "is_manufacturing_etc", "source": "const", "value": None, "transform": "bool"},
        {"input_id": "is_service_etc", "source": "const", "value": None, "transform": "bool"},
        {"input_id": "is_real_estate_rental", "source": "const", "value": None, "transform": "bool"},
    ],
    "nodes": [
        {
            "id": "goods_transfer",
            "label": "商品の譲渡か",
            "rule": "棚卸資産としての商品の譲渡か",
            "kind": "decision",
            "when": {"input": "is_goods_transfer", "eq": True},
            "yes": "purchased_goods",
            "no": "fixed_asset",
            "match_yes": {"is_goods_transfer": True},
            "match_no": {"is_goods_transfer": False},
            "facts": [{"input_id": "is_goods_transfer", "label": "商品の譲渡", "kind": "flag"}],
            "documents": [],
            "layout": {"x": 40, "y": 40, "w": 160, "h": 56},
        },
        {
            "id": "purchased_goods",
            "label": "他の者から購入した商品か",
            "rule": "仕入れた商品か（自己生産は NO）",
            "kind": "decision",
            "when": {"input": "is_purchased_goods", "eq": True},
            "yes": "modified",
            "no": "agro_own",
            "match_yes": {"is_purchased_goods": True},
            "match_no": {"is_purchased_goods": False},
            "facts": [{"input_id": "is_purchased_goods", "label": "購入商品", "kind": "flag"}],
            "documents": [],
            "layout": {"x": 260, "y": 40, "w": 200, "h": 56},
        },
        {
            "id": "modified",
            "label": "購入した商品の性質又は形状を変更したか",
            "rule": "加工・製造に当たるか",
            "kind": "decision",
            "when": {"input": "is_modified", "eq": True},
            "yes": "agro_purchased",
            "no": "buyer_business",
            "match_yes": {"is_modified": True},
            "match_no": {"is_modified": False},
            "facts": [{"input_id": "is_modified", "label": "性質・形状の変更", "kind": "flag"}],
            "documents": [],
            "layout": {"x": 520, "y": 20, "w": 220, "h": 64},
        },
        {
            "id": "buyer_business",
            "label": "販売先は事業者か",
            "rule": "卸売（事業者向け）か小売（消費者向け）か",
            "kind": "decision",
            "when": {"input": "is_buyer_business", "eq": True},
            "yes": "outcome:type1",
            "no": "outcome:type2",
            "match_yes": {"is_buyer_business": True},
            "match_no": {"is_buyer_business": False},
            "facts": [{"input_id": "is_buyer_business", "label": "販売先が事業者", "kind": "flag"}],
            "documents": [],
            "layout": {"x": 800, "y": 20, "w": 160, "h": 56},
        },
        {
            "id": "agro_purchased",
            "label": "農業・林業・漁業か",
            "rule": "購入後に加工した農林水産業に該当するか",
            "kind": "decision",
            "when": {"input": "is_agro_forestry_fishery", "eq": True},
            "yes": "outcome:type2",
            "no": "outcome:type3",
            "match_yes": {"is_agro_forestry_fishery": True},
            "match_no": {"is_agro_forestry_fishery": False},
            "facts": [{"input_id": "is_agro_forestry_fishery", "label": "農林水産業", "kind": "flag"}],
            "documents": [],
            "layout": {"x": 800, "y": 120, "w": 160, "h": 56},
        },
        {
            "id": "agro_own",
            "label": "農業・林業・漁業か",
            "rule": "自己生産の農林水産物の譲渡か",
            "kind": "decision",
            "when": {"input": "is_agro_forestry_fishery", "eq": True},
            "yes": "outcome:type2",
            "no": "outcome:type3",
            "match_yes": {"is_agro_forestry_fishery": True},
            "match_no": {"is_agro_forestry_fishery": False},
            "facts": [{"input_id": "is_agro_forestry_fishery", "label": "農林水産業", "kind": "flag"}],
            "documents": [],
            "layout": {"x": 520, "y": 140, "w": 160, "h": 56},
        },
        {
            "id": "fixed_asset",
            "label": "事業の用に供していた固定資産等の譲渡か",
            "rule": "固定資産等の譲渡は第4種",
            "kind": "decision",
            "when": {"input": "is_fixed_asset_transfer", "eq": True},
            "yes": "outcome:type4",
            "no": "manufacturing_etc",
            "match_yes": {"is_fixed_asset_transfer": True},
            "match_no": {"is_fixed_asset_transfer": False},
            "facts": [{"input_id": "is_fixed_asset_transfer", "label": "固定資産等の譲渡", "kind": "flag"}],
            "documents": [],
            "layout": {"x": 260, "y": 220, "w": 240, "h": 64},
        },
        {
            "id": "manufacturing_etc",
            "label": "製造・建設・鉱業・電気ガス水道等か",
            "rule": "日本標準産業分類の農業・林業・漁業・鉱業・建設・製造・電気ガス水道等",
            "kind": "decision",
            "when": {"input": "is_manufacturing_etc", "eq": True},
            "yes": "outcome:type3",
            "no": "service_etc",
            "match_yes": {"is_manufacturing_etc": True},
            "match_no": {"is_manufacturing_etc": False},
            "facts": [{"input_id": "is_manufacturing_etc", "label": "製造等", "kind": "flag"}],
            "documents": [],
            "layout": {"x": 560, "y": 250, "w": 240, "h": 72},
        },
        {
            "id": "service_etc",
            "label": "運輸・飲食・宿泊・医療・教育等のサービスか",
            "rule": "金融・保険・情報通信・運輸・飲食店・宿泊・教育・医療・サービス業など",
            "kind": "decision",
            "when": {"input": "is_service_etc", "eq": True},
            "yes": "outcome:type5",
            "no": "real_estate",
            "match_yes": {"is_service_etc": True},
            "match_no": {"is_service_etc": False},
            "facts": [{"input_id": "is_service_etc", "label": "サービス等", "kind": "flag"}],
            "documents": [],
            "layout": {"x": 560, "y": 360, "w": 260, "h": 72},
        },
        {
            "id": "real_estate",
            "label": "不動産業（賃貸）か",
            "rule": "不動産の貸付けは第6種。該当しなければ第4種",
            "kind": "decision",
            "when": {"input": "is_real_estate_rental", "eq": True},
            "yes": "outcome:type6",
            "no": "outcome:type4",
            "match_yes": {"is_real_estate_rental": True},
            "match_no": {"is_real_estate_rental": False},
            "facts": [{"input_id": "is_real_estate_rental", "label": "不動産賃貸", "kind": "flag"}],
            "documents": [],
            "layout": {"x": 560, "y": 470, "w": 200, "h": 56},
        },
    ],
    "outcomes": {
        "type1": {"label": "第1種事業", "message": "卸売業", "order": 1},
        "type2": {"label": "第2種事業", "message": "小売業（農林水産含む）", "order": 2},
        "type3": {"label": "第3種事業", "message": "製造業等", "order": 3},
        "type5": {"label": "第5種事業", "message": "サービス業等", "order": 4},
        "type6": {"label": "第6種事業", "message": "不動産業（賃貸）", "order": 5},
        "type4": {"label": "第4種事業", "message": "その他", "order": 6},
        "true": {"label": "区分確定", "message": "事業区分が決まりました。"},
        "false": {"label": "未確定", "message": "まだ回答が足りません。フローに沿って YES / NO を選んでください。"},
    },
}

DEFAULT_GLOBAL_TEMPLATES: List[dict] = [
    {
        "id": "global-consumption-taxable",
        "scope": "global",
        "title": "消費税 課税事業者判定",
        "description": "基準期間・特定期間・インボイス等。顧問先マスタと課税売上指標から自動で数字を引きます。",
        "category": "consumption_tax",
        "family_id": "consumption-taxable",
        "valid_from": "2023-10-01",
        "valid_to": None,
        "law_label": "令和5年10月1日以後（インボイス制度）",
        "version": "1.0.0",
        "definition": CONSUMPTION_TAXABLE_DEFINITION,
    },
    {
        "id": "global-business-category",
        "scope": "global",
        "title": "消費税 簡易課税・事業区分",
        "description": "第1種〜第6種事業の区分フロー（国税庁の事業区分フローチャートに沿った社内判定）。",
        "category": "consumption_tax",
        "family_id": "business-category",
        "valid_from": "2019-10-01",
        "valid_to": None,
        "law_label": "簡易課税の事業区分（軽減税率導入後）",
        "version": "1.0.0",
        "definition": BUSINESS_CATEGORY_DEFINITION,
    },
]

_LAW_DEFAULTS = {
    "global-consumption-taxable": {
        "family_id": "consumption-taxable",
        "valid_from": "2023-10-01",
        "valid_to": None,
        "law_label": "令和5年10月1日以後（インボイス制度）",
    },
    "global-business-category": {
        "family_id": "business-category",
        "valid_from": "2019-10-01",
        "valid_to": None,
        "law_label": "簡易課税の事業区分（軽減税率導入後）",
    },
}


def _norm_date(raw: Any) -> Optional[str]:
    text = str(raw or "").strip()[:10]
    if not text:
        return None
    try:
        date.fromisoformat(text)
    except ValueError:
        return None
    return text


def today_iso() -> str:
    return date.today().isoformat()


def format_law_range(valid_from: Optional[str], valid_to: Optional[str]) -> str:
    start = valid_from or "開始未設定"
    end = valid_to or "終期なし"
    return f"{start} 〜 {end}"


def template_covers(template: dict, as_of: str) -> bool:
    as_of_date = _norm_date(as_of) or today_iso()
    valid_from = _norm_date(template.get("valid_from")) or "0001-01-01"
    valid_to = _norm_date(template.get("valid_to"))
    if valid_from > as_of_date:
        return False
    if valid_to and valid_to < as_of_date:
        return False
    return True


def _now() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


def _firm_local_path(firm_id: str) -> Path:
    fid = (firm_id or "").strip() or "firm_default"
    return STORAGE_DIR / "firms" / fid / "local_flowchart_templates.json"


def _enrich(raw: dict, *, firm_id: Optional[str] = None) -> dict:
    definition = raw.get("definition") if isinstance(raw.get("definition"), dict) else dict(BLANK_DEFINITION)
    scope = raw.get("scope") or ("local" if firm_id else "global")
    tid = str(raw.get("id") or uuid.uuid4().hex)
    defaults = _LAW_DEFAULTS.get(tid, {})
    family_id = str(raw.get("family_id") or defaults.get("family_id") or tid).strip() or tid
    valid_from = _norm_date(raw.get("valid_from")) or _norm_date(defaults.get("valid_from"))
    if "valid_to" in raw:
        valid_to = _norm_date(raw.get("valid_to"))
    else:
        valid_to = _norm_date(defaults.get("valid_to"))
    law_label = str(raw.get("law_label") or defaults.get("law_label") or "").strip()
    return {
        "id": tid,
        "scope": scope,
        "title": str(raw.get("title") or "無題の判定フロー"),
        "description": str(raw.get("description") or ""),
        "category": str(raw.get("category") or "general"),
        "family_id": family_id,
        "valid_from": valid_from,
        "valid_to": valid_to,
        "law_label": law_label,
        "law_range": format_law_range(valid_from, valid_to),
        "version": str(raw.get("version") or "1.0.0"),
        "definition": definition,
        "updatedAt": raw.get("updatedAt") or _now(),
        **({"firmId": firm_id} if firm_id else {}),
    }


def _load_global_raw() -> List[dict]:
    if GLOBAL_PATH.exists():
        data = _load_json(GLOBAL_PATH)
        items = data.get("templates") if isinstance(data, dict) else None
        if isinstance(items, list) and items:
            known = {str(t.get("id") or "") for t in items}
            out = list(items)
            changed = False
            for default in DEFAULT_GLOBAL_TEMPLATES:
                if default["id"] not in known:
                    out.append(dict(default))
                    changed = True
            if changed:
                _save_global_raw(out)
            return out
    PLATFORM_DIR.mkdir(parents=True, exist_ok=True)
    _save_global_raw(DEFAULT_GLOBAL_TEMPLATES)
    return [dict(t) for t in DEFAULT_GLOBAL_TEMPLATES]


def _save_global_raw(templates: List[dict]) -> None:
    PLATFORM_DIR.mkdir(parents=True, exist_ok=True)
    _write_json(GLOBAL_PATH, {"templates": templates, "updatedAt": _now()})


def _load_local_raw(firm_id: str) -> List[dict]:
    path = _firm_local_path(firm_id)
    if not path.exists():
        return []
    data = _load_json(path)
    items = data.get("templates") if isinstance(data, dict) else None
    return items if isinstance(items, list) else []


def _save_local_raw(firm_id: str, templates: List[dict]) -> None:
    path = _firm_local_path(firm_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    _write_json(path, {"templates": templates, "updatedAt": _now()})


def list_all_for_firm(firm_id: str) -> dict[str, list[dict]]:
    global_items = [_enrich(t) for t in _load_global_raw()]
    local_items = [_enrich(t, firm_id=firm_id) for t in _load_local_raw(firm_id)]
    return {"global": global_items, "local": local_items}


def _all_templates(firm_id: str) -> list[dict]:
    bags = list_all_for_firm(firm_id)
    return bags["global"] + bags["local"]


def get_template_by_id(template_id: str, firm_id: str) -> Optional[dict]:
    tid = (template_id or "").strip()
    for item in _all_templates(firm_id):
        if item["id"] == tid:
            return item
    return None


def resolve_template(
    firm_id: str,
    *,
    template_id: str | None = None,
    family_id: str | None = None,
    as_of: str | None = None,
) -> Optional[dict]:
    """判定基準日 as_of に有効な税法版を返す。同じ family のうち valid_from が最も新しいもの。"""
    as_of_date = _norm_date(as_of) or today_iso()
    items = _all_templates(firm_id)
    fid = (family_id or "").strip()
    if not fid and template_id:
        seed = get_template_by_id(template_id, firm_id)
        if not seed:
            return None
        fid = str(seed.get("family_id") or seed["id"])
    if not fid:
        return None
    covered = [
        t
        for t in items
        if str(t.get("family_id") or t.get("id")) == fid and template_covers(t, as_of_date)
    ]
    if not covered:
        return None
    covered.sort(
        key=lambda t: (str(t.get("valid_from") or ""), 1 if t.get("scope") == "local" else 0),
        reverse=True,
    )
    return covered[0]


def create_local_template(
    firm_id: str,
    *,
    title: str,
    description: str = "",
    category: str = "general",
    definition: dict | None = None,
    family_id: str = "",
    valid_from: str | None = None,
    valid_to: str | None = None,
    law_label: str = "",
) -> dict:
    items = _load_local_raw(firm_id)
    created = _enrich(
        {
            "id": f"local-{uuid.uuid4().hex[:12]}",
            "scope": "local",
            "title": title,
            "description": description,
            "category": category,
            "family_id": family_id.strip() or None,
            "valid_from": _norm_date(valid_from) or today_iso(),
            "valid_to": _norm_date(valid_to),
            "law_label": law_label.strip(),
            "definition": definition or dict(BLANK_DEFINITION),
            "updatedAt": _now(),
        },
        firm_id=firm_id,
    )
    items.append(created)
    _save_local_raw(firm_id, items)
    return created


def update_template(
    template_id: str,
    firm_id: str,
    *,
    title: str | None = None,
    description: str | None = None,
    category: str | None = None,
    definition: dict | None = None,
    family_id: str | None = None,
    valid_from: str | None = None,
    valid_to: str | None = None,
    law_label: str | None = None,
    is_platform: bool = False,
) -> Optional[dict]:
    existing = get_template_by_id(template_id, firm_id)
    if not existing:
        return None
    if existing["scope"] == "global":
        if not is_platform:
            return None
        items = _load_global_raw()
        save = _save_global_raw
        bag_firm = None
    else:
        items = _load_local_raw(firm_id)
        save = lambda rows: _save_local_raw(firm_id, rows)
        bag_firm = firm_id
    for i, raw in enumerate(items):
        if str(raw.get("id")) != template_id:
            continue
        patched = dict(raw)
        if title is not None:
            patched["title"] = title
        if description is not None:
            patched["description"] = description
        if category is not None:
            patched["category"] = category
        if definition is not None:
            patched["definition"] = definition
        if family_id is not None:
            patched["family_id"] = family_id.strip() or patched.get("id")
        if valid_from is not None:
            patched["valid_from"] = _norm_date(valid_from) or patched.get("valid_from")
        if valid_to is not None:
            patched["valid_to"] = _norm_date(valid_to)
        if law_label is not None:
            patched["law_label"] = law_label.strip()
        patched["updatedAt"] = _now()
        items[i] = patched
        save(items)
        return _enrich(patched, firm_id=bag_firm)
    return None


def delete_template(template_id: str, firm_id: str, *, is_platform: bool = False) -> bool:
    existing = get_template_by_id(template_id, firm_id)
    if not existing:
        return False
    if existing["scope"] == "global":
        if not is_platform:
            return False
        items = [t for t in _load_global_raw() if str(t.get("id")) != template_id]
        _save_global_raw(items)
        return True
    items = [t for t in _load_local_raw(firm_id) if str(t.get("id")) != template_id]
    _save_local_raw(firm_id, items)
    return True
