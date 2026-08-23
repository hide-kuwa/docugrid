"""TAXX Tools — 公開（未認証）税額計算 API。

方針（セキュリティ）:
- このルーターは **認証を要求しない** 公開エンドポイント群。
- 返すのは国税庁等が公表する **グローバルな法定値のみ**（法人税率・給与所得控除・
  源泉徴収税額表など）。firm_id／テナント固有データには一切触れない。
- 破壊的操作は無し。GET のみ（CSRF ミドルウェアの対象外）。
- 計算ロジックは既存サービス（services.*）を再利用し、認証版と同じ結果を返す。
"""

from __future__ import annotations

from fastapi import APIRouter

from api.router_imports import *  # noqa: F403
from api.schemas import *  # noqa: F403
from services.executive_comp_service import optimize_executive_comp

router = APIRouter(prefix="/api/public/tools", tags=["taxx-tools"])


# 公開ツールのカタログ（フロントのランディングと整合させる）。
_TOOLS_CATALOG = [
    {
        "id": "corporate-tax",
        "title": "法人税率チェッカー",
        "summary": "課税所得と事業年度から法人税額を試算。軽減税率・標準税率の内訳も表示。",
        "category": "法人税",
        "source_url": "https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5759.htm",
    },
    {
        "id": "employment-income",
        "title": "給与所得控除チェッカー",
        "summary": "給与収入から給与所得控除額と給与所得を自動計算。",
        "category": "所得税",
        "source_url": "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shoto/1410.htm",
    },
    {
        "id": "withholding",
        "title": "源泉徴収税額表ビューア",
        "summary": "月額表に基づく源泉所得税額（甲欄・乙欄）を試算。表全体も確認可能。",
        "category": "源泉所得税",
        "source_url": "https://www.nta.go.jp/publication/pamph/gensen/zeigakuhyo2026/01.htm",
    },
    # executive-comp は /tools/executive-comp に独立配置（カタログ非掲載）。
    {
        "id": "local-tax",
        "title": "法人地方税シミュレーター",
        "summary": "課税所得・資本金・従業員数から、法人税、地方法人税、法人住民税、事業税、特別法人事業税をまとめて試算。",
        "category": "地方税（法人）",
        "source_url": "https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/ichiran.html",
    },
    {
        "id": "consumption-taxable",
        "title": "消費税 課税事業者判定",
        "summary": "基準期間・特定期間・インボイス等から課税事業者かをフローチャートで簡易判定。",
        "category": "消費税",
        "source_url": "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6501.htm",
    },
    {
        "id": "association-health",
        "title": "協会けんぽ 保険料額表",
        "summary": "都道府県別の健康・介護・支援金・厚生年金の料率と、報酬月額から等級・保険料額を試算。",
        "category": "社会保険",
        "source_url": "https://www.kyoukaikenpo.or.jp/g3/cat330/sb3150/",
    },
]


@router.get("/catalog")
def list_public_tools() -> dict:
    """公開ツール一覧（フロントのランディング表示用）。"""
    return {"tools": _TOOLS_CATALOG}


# --- 法人税率 -------------------------------------------------------------


@router.get("/corporate-tax/table", response_model=CorporateTaxRatePayload)
def public_corporate_tax_table() -> CorporateTaxRatePayload:
    """法人税率マスタ（行列）全体。出典・適用日つき。"""
    reload_corporate_tax_table()
    return CorporateTaxRatePayload(table=get_corporate_tax_table())


@router.get("/corporate-tax/calc", response_model=CorporateTaxCalcPayload)
def public_corporate_tax_calc(
    taxable_income: int = Query(..., ge=0, description="課税所得金額（1,000円未満切捨後）"),
    fiscal_year_start: str = Query(..., description="事業年度開始日 YYYY-MM-DD"),
    small_business: bool = Query(True, description="資本金1億円以下の中小法人など（軽減税率対象）"),
    excluded_business: bool = Query(False, description="適用除外事業者（軽減税率不可）"),
) -> CorporateTaxCalcPayload:
    """普通法人の法人税額を計算する。"""
    try:
        result = compute_corporate_tax(
            taxable_income,
            fiscal_year_start,
            small_business=small_business,
            excluded_business=excluded_business,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return CorporateTaxCalcPayload(**result)


# --- 給与所得控除 ---------------------------------------------------------


@router.get("/employment-income")
def public_employment_income(
    salary_revenue: int = Query(..., ge=0, description="給与収入（円）"),
    as_of: Optional[str] = Query(None, description="基準日 YYYY-MM-DD（未指定なら最新）"),
) -> dict:
    """給与収入から給与所得控除額と給与所得を計算する。"""
    try:
        return calc_employment_income(salary_revenue, as_of=as_of)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/employment-income/table")
def public_employment_income_table(
    as_of: Optional[str] = Query(None, description="基準日 YYYY-MM-DD（未指定なら最新）"),
) -> dict:
    """給与所得控除の速算表（時点で有効な版）。出典・適用日つき。"""
    reload_ref_tables()
    table = get_ref_table("employment_income_deduction")
    version = ref_table_effective_version("employment_income_deduction", as_of)
    if not table or not version:
        raise HTTPException(status_code=404, detail="給与所得控除マスタが登録されていません")
    return {
        "label_ja": table.get("label_ja"),
        "source_law": table.get("source_law"),
        "source_url": table.get("source_url"),
        "notes": table.get("notes", []),
        "valid_from": version.get("valid_from"),
        "valid_to": version.get("valid_to"),
        "label": version.get("label"),
        "columns": version.get("columns", []),
        "rows": version.get("rows", []),
    }


# --- 源泉徴収税額表（月額表） --------------------------------------------


@router.get("/withholding/table", response_model=WithholdingMonthlyPayload)
def public_withholding_table(as_of: Optional[str] = Query(None)) -> WithholdingMonthlyPayload:
    """月額表の一覧＋（時点で有効な）表全体。"""
    reload_withholding_tables()
    tables = [WithholdingTableSummary(**t) for t in list_withholding_tables()]
    return WithholdingMonthlyPayload(tables=tables, table=get_withholding_monthly_table(as_of))


@router.get("/withholding/calc", response_model=WithholdingLookupPayload)
def public_withholding_calc(
    salary: int = Query(..., ge=0, description="その月の社会保険料等控除後の給与等の金額（円）"),
    dependents: int = Query(0, ge=0, description="扶養親族等の数（甲欄のみ）"),
    kind: str = Query("kou", pattern="^(kou|otsu)$"),
    as_of: Optional[str] = Query(None, description="基準日 YYYY-MM-DD（未指定なら最新）"),
) -> WithholdingLookupPayload:
    """月額表に基づく源泉徴収税額を計算する。"""
    try:
        result = lookup_withholding_monthly(salary, dependents, kind, as_of=as_of)  # type: ignore[arg-type]
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return WithholdingLookupPayload(**result)


# --- 役員報酬 最適化シミュレーター ---------------------------------------


@router.get("/executive-comp/optimize")
def public_executive_comp_optimize(
    pretax_profit: int = Query(..., ge=0, description="役員報酬控除前の会社利益（年額・円）"),
    fiscal_year_start: str = Query(..., description="事業年度開始日 YYYY-MM-DD"),
    executive_age: int = Query(..., ge=18, le=99, description="役員の年齢"),
    small_business: bool = Query(True, description="資本金1億円以下の中小法人など"),
    prefecture_code: str = Query("13", description="協会けんぽ支部コード（東京=13）"),
    health_rate: Optional[float] = Query(
        None, gt=0, le=0.3, description="健康保険料率の上書き（未指定なら都道府県マスタ）"
    ),
    monthly_step: int = Query(100000, ge=10000, description="役員報酬の探索刻み（月額・円）"),
    include_social: bool = Query(True, description="社会保険料を含めて計算する"),
    current_monthly: Optional[int] = Query(
        None, ge=0, description="いま設定している役員報酬（月額・円）。最適との差額計算に使う"
    ),
    as_of: Optional[str] = Query(None, description="個人課税の基準日 YYYY-MM-DD（未指定なら事業年度開始日）"),
) -> dict:
    """役員報酬を振って合計負担が最小（合計手取り最大）となる点を探索する。"""
    try:
        return optimize_executive_comp(
            pretax_profit,
            fiscal_year_start,
            executive_age=executive_age,
            small_business=small_business,
            prefecture_code=prefecture_code,
            health_rate=health_rate,
            monthly_step=monthly_step,
            include_social=include_social,
            current_monthly=current_monthly,
            as_of=as_of,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# --- 法人地方税シミュレーター ----------------------------------------------------


@router.get("/local-tax/calc")
def public_local_tax_calc(
    taxable_income: int = Query(..., ge=0, description="課税所得（円）"),
    fiscal_year_start: str = Query(..., description="事業年度開始日 YYYY-MM-DD"),
    small_business: bool = Query(True, description="資本金1億円以下の中小法人など"),
    capital: int = Query(10_000_000, ge=0, description="資本金等の額（円）"),
    employees: int = Query(30, ge=0, description="従業員数"),
    jurisdiction: str = Query("tokyo_23", description="法人住民税の区分（tokyo_23 / tokyo_muni）"),
    use_excess_rate: bool = Query(False, description="超過税率を適用する"),
) -> dict:
    """法人税＋地方法人税＋法人住民税＋事業税＋特別法人事業税を公開 tools 用に試算する。"""
    try:
        return calc_corporate_local_taxes(
            taxable_income,
            fiscal_year_start,
            small_business=small_business,
            capital=capital,
            employees=employees,
            jurisdiction=jurisdiction,
            use_excess_rate=use_excess_rate,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def _public_ref_table(table_id: str, as_of: Optional[str]) -> dict:
    table = get_ref_table(table_id)
    version = ref_table_effective_version(table_id, as_of)
    if not table or not version:
        raise HTTPException(status_code=404, detail=f"ref table not found: {table_id}")
    return {
        "id": table.get("id"),
        "label_ja": table.get("label_ja"),
        "source_law": table.get("source_law"),
        "source_url": table.get("source_url"),
        "notes": table.get("notes", []),
        "valid_from": version.get("valid_from"),
        "valid_to": version.get("valid_to"),
        "label": version.get("label"),
        "columns": version.get("columns", []),
        "rows": version.get("rows", []),
    }


@router.get("/local-tax/tables")
def public_local_tax_tables(
    as_of: Optional[str] = Query(None, description="基準日 YYYY-MM-DD。未指定なら最新"),
) -> dict:
    """法人地方税シミュレーターで使う地方税マスタ表を返す。"""
    reload_ref_tables()
    return {
        "resident_levy": _public_ref_table("corporate_resident_levy", as_of),
        "percapita": _public_ref_table("corporate_resident_percapita", as_of),
        "enterprise": _public_ref_table("corporate_enterprise_tax", as_of),
    }


# --- 協会けんぽ 保険料額表 -----------------------------------------------


@router.get("/association-health/prefectures")
def public_association_health_prefectures(
    as_of: Optional[str] = Query(None, description="基準日 YYYY-MM-DD（未指定なら最新）"),
) -> dict:
    reload_ref_tables()
    version = ref_table_effective_version("association_health_rates", as_of)
    return {
        "prefectures": list_association_health_prefectures(as_of=as_of),
        "valid_from": version.get("valid_from") if version else None,
        "label": version.get("label") if version else None,
    }


@router.get("/association-health/rates")
def public_association_health_rates(
    as_of: Optional[str] = Query(None, description="基準日 YYYY-MM-DD（未指定なら最新）"),
) -> dict:
    """都道府県別料率表（時点で有効な版）。"""
    reload_ref_tables()
    table = get_ref_table("association_health_rates")
    version = ref_table_effective_version("association_health_rates", as_of)
    if not table or not version:
        raise HTTPException(status_code=404, detail="協会けんぽ料率マスタが登録されていません")
    return {
        "label_ja": table.get("label_ja"),
        "source_law": table.get("source_law"),
        "source_url": table.get("source_url"),
        "notes": table.get("notes", []),
        "valid_from": version.get("valid_from"),
        "valid_to": version.get("valid_to"),
        "label": version.get("label"),
        "columns": version.get("columns", []),
        "rows": version.get("rows", []),
    }


@router.get("/association-health/grades")
def public_association_health_grades(
    as_of: Optional[str] = Query(None, description="基準日 YYYY-MM-DD（未指定なら最新）"),
) -> dict:
    """標準報酬月額等級表（全国共通）。"""
    reload_ref_tables()
    table = get_ref_table("social_insurance_standard_grades")
    version = ref_table_effective_version("social_insurance_standard_grades", as_of)
    if not table or not version:
        raise HTTPException(status_code=404, detail="標準報酬月額等級表が登録されていません")
    return {
        "label_ja": table.get("label_ja"),
        "source_law": table.get("source_law"),
        "source_url": table.get("source_url"),
        "notes": table.get("notes", []),
        "valid_from": version.get("valid_from"),
        "valid_to": version.get("valid_to"),
        "label": version.get("label"),
        "columns": version.get("columns", []),
        "rows": version.get("rows", []),
    }


@router.get("/association-health/amount-table")
def public_association_health_amount_table(
    prefecture_code: str = Query("13", description="協会けんぽ支部コード（東京=13）"),
    as_of: Optional[str] = Query(None, description="基準日 YYYY-MM-DD（未指定なら最新）"),
) -> dict:
    """PDF相当の保険料額一覧（全等級・全額／折半額）。"""
    try:
        return build_association_health_amount_table(prefecture_code, as_of=as_of)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/association-health/calc")
def public_association_health_calc(
    remuneration_monthly: int = Query(..., ge=0, description="報酬月額（円）"),
    prefecture_code: str = Query("13", description="協会けんぽ支部コード（東京=13）"),
    care_applicable: bool = Query(False, description="介護保険第2号被保険者に該当するか"),
    as_of: Optional[str] = Query(None, description="基準日 YYYY-MM-DD（未指定なら最新）"),
) -> dict:
    try:
        return calc_association_health_premium(
            remuneration_monthly,
            prefecture_code=prefecture_code,
            care_applicable=care_applicable,
            as_of=as_of,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
