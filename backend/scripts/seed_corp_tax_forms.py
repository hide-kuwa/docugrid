"""法人税申告書パッケージの主要様式を書類マスタ(form_catalog)へ投入する。

正式名称の出典: 国税庁「法人税等各種別表関係（令和7年4月1日以後終了事業年度等分）」
https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/shinkoku/itiran2025/01.htm

冪等: 既存 form_id はスキップし、上書きしない。開発コンソール「書類マスタ」で後から編集可能。

実行:
    cd backend && PYTHONPATH=. python scripts/seed_corp_tax_forms.py
"""

from __future__ import annotations

from services import form_catalog as fc

CORP = "CORP_TAX_RETURN"
SLOT = "法人税申告書"


def _beppyo(
    form_id: str,
    label: str,
    beppyo_anchors: list[str],
    name_anchors: list[str],
    *,
    required: bool = False,
    category: str = "corp_tax",
) -> dict:
    return {
        "form_id": form_id,
        "label_ja": label,
        "role": "body",
        "maps_to": {
            "tax_type": CORP,
            "slot_label": SLOT,
            "category": category,
            "required": required or None,
        },
        "anchors": [
            {"region": "top_right", "any_of": beppyo_anchors},
            {"region": "any", "any_of": name_anchors},
        ],
        "must_not": [],
        "page_scan": {"continuation": True},
        "filename_hints": beppyo_anchors,
        "notes": "",
    }


SEED_FORMS: list[dict] = [
    _beppyo(
        "etax_receipt",
        "受信通知（e-Tax）",
        ["受信通知"],
        ["受信通知", "メール詳細", "受付番号", "納付区分番号通知"],
        required=True,
        category="common",
    ),
    _beppyo(
        "tax_payment_summary",
        "納付税額一覧表",
        ["納付税額一覧表"],
        ["納付税額一覧表", "納付すべき税額", "納付税額"],
    ),
    _beppyo(
        "corp_tax_beppyo_2",
        "別表二 同族会社等の判定に関する明細書",
        ["別表二", "別表２", "別表2"],
        ["同族会社等の判定", "同族会社"],
        required=True,
    ),
    _beppyo(
        "corp_tax_beppyo_3_1",
        "別表三（一）特定同族会社の留保金額に対する税額の計算に関する明細書",
        ["別表三", "別表３", "別表3", "別表三（一）", "別表3(1)"],
        ["特定同族会社の留保金額", "留保金額に対する税額"],
    ),
    _beppyo(
        "corp_tax_beppyo_5_2",
        "別表五（二）租税公課の納付状況等に関する明細書",
        ["別表五", "別表５", "別表5", "別表五（二）", "別表5(2)"],
        ["租税公課の納付状況", "納税充当金"],
        required=True,
    ),
    _beppyo(
        "corp_tax_beppyo_6_1",
        "別表六（一）所得税額の控除に関する明細書",
        ["別表六", "別表６", "別表6", "別表六（一）", "別表6(1)"],
        ["所得税額の控除"],
    ),
    _beppyo(
        "corp_tax_beppyo_7_1",
        "別表七（一）欠損金の損金算入等に関する明細書",
        ["別表七", "別表７", "別表7", "別表七（一）", "別表7(1)"],
        ["欠損金の損金算入", "欠損金額", "繰越欠損金"],
    ),
    _beppyo(
        "corp_tax_beppyo_8_1",
        "別表八（一）受取配当等の益金不算入に関する明細書",
        ["別表八", "別表８", "別表8", "別表八（一）", "別表8(1)"],
        ["受取配当等の益金不算入", "受取配当"],
    ),
    _beppyo(
        "corp_tax_beppyo_11_1",
        "別表十一（一）個別評価金銭債権に係る貸倒引当金の損金算入に関する明細書",
        ["別表十一", "別表11", "別表十一（一）", "別表11(1)"],
        ["個別評価金銭債権", "貸倒引当金"],
    ),
    _beppyo(
        "corp_tax_beppyo_11_1_2",
        "別表十一（一の二）一括評価金銭債権に係る貸倒引当金の損金算入に関する明細書",
        ["別表十一（一の二）", "別表11(1の2)"],
        ["一括評価金銭債権", "貸倒引当金"],
    ),
    _beppyo(
        "corp_tax_beppyo_14_2",
        "別表十四（二）寄附金の損金算入に関する明細書",
        ["別表十四", "別表14", "別表十四（二）", "別表14(2)"],
        ["寄附金の損金算入", "寄附金"],
    ),
    _beppyo(
        "corp_tax_beppyo_15",
        "別表十五 交際費等の損金算入に関する明細書",
        ["別表十五", "別表15"],
        ["交際費等の損金算入", "交際費"],
    ),
    _beppyo(
        "corp_tax_beppyo_16_1",
        "別表十六（一）旧定額法又は定額法による減価償却資産の償却額の計算に関する明細書",
        ["別表十六", "別表16", "別表十六（一）", "別表16(1)"],
        ["定額法による減価償却", "減価償却資産の償却額"],
    ),
    _beppyo(
        "corp_tax_beppyo_16_2",
        "別表十六（二）旧定率法又は定率法による減価償却資産の償却額の計算に関する明細書",
        ["別表十六（二）", "別表16(2)"],
        ["定率法による減価償却", "減価償却資産の償却額"],
    ),
    _beppyo(
        "corp_tax_beppyo_16_7",
        "別表十六（七）少額減価償却資産の取得価額の損金算入の特例に関する明細書",
        ["別表十六（七）", "別表16(7)"],
        ["少額減価償却資産"],
    ),
    _beppyo(
        "corp_tax_beppyo_16_8",
        "別表十六（八）一括償却資産の損金算入に関する明細書",
        ["別表十六（八）", "別表16(8)"],
        ["一括償却資産"],
    ),
]


def main() -> None:
    existing = {f.get("form_id") for f in fc.list_forms()}
    added: list[str] = []
    skipped: list[str] = []
    for entry in SEED_FORMS:
        fid = entry["form_id"]
        if fid in existing:
            skipped.append(fid)
            continue
        fc.create_form(entry)  # type: ignore[arg-type]
        added.append(fid)
    print(f"added {len(added)}: {', '.join(added) or '-'}")
    print(f"skipped {len(skipped)} (already present): {', '.join(skipped) or '-'}")
    print(f"total forms now: {len(fc.list_forms())}")


if __name__ == "__main__":
    main()
