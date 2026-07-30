"""DocuGrid API — legal_master routes."""

from __future__ import annotations

from fastapi import APIRouter

from api.router_imports import *  # noqa: F403
from api.constants import *  # noqa: F403
from api.deps import *  # noqa: F403
from api.persistence import *  # noqa: F403
from api.master_store import *  # noqa: F403
from api.session import *  # noqa: F403
from api.billing_access import *  # noqa: F403
from api.schemas import *  # noqa: F403
from api.route_helpers import *  # noqa: F403

router = APIRouter()


def _require_authenticated(request: Request) -> None:
    identity = resolve_identity(request)
    if not identity.email and not identity.role:
        raise HTTPException(status_code=401, detail="Authentication required")


# --- Legal master (Temporal Master Pattern) ---


@router.get("/api/v1/legal-master/rates/consumption-tax", response_model=LegalMasterRatePayload)
async def get_consumption_tax_rate(
    request: Request,
    as_of: str = Query(..., description="基準日 YYYY-MM-DD"),
    jurisdiction: Optional[str] = Query(None),
    rate_type: str = Query("standard", pattern="^(standard|reduced)$"),
):
    """消費税率 — as_of 必須（temporal-master-pattern §3.1）。"""
    _require_authenticated(request)
    master_key = (
        "consumption_tax.reduced_rate"
        if rate_type == "reduced"
        else "consumption_tax.standard_rate"
    )
    row = lookup_legal_master_rate(master_key, as_of, jurisdiction=jurisdiction)
    if not row:
        raise HTTPException(status_code=404, detail=f"No rate for {master_key} at {as_of}")
    return LegalMasterRatePayload(
        master_key=row["master_key"],
        as_of=as_of,
        value=row.get("value"),
        value_numeric=row.get("value_numeric"),
        value_text=row.get("value_text"),
        valid_from=row["valid_from"],
        valid_to=row.get("valid_to"),
        master_version_id=row.get("master_version_id"),
        jurisdiction=row.get("jurisdiction"),
        label_ja=row.get("label_ja"),
    )


@router.get("/api/v1/legal-master/rates")
async def get_legal_master_rate(
    request: Request,
    master_key: str = Query(...),
    as_of: str = Query(...),
    jurisdiction: Optional[str] = Query(None),
):
    _require_authenticated(request)
    row = lookup_legal_master_rate(master_key, as_of, jurisdiction=jurisdiction)
    if not row:
        raise HTTPException(status_code=404, detail=f"No entry for {master_key} at {as_of}")
    return row


@router.get("/api/v1/legal-master/brackets/income-tax")
async def get_income_tax_brackets_api(request: Request, as_of: str = Query(...)):
    _require_authenticated(request)
    return {"as_of": as_of, "brackets": list_income_tax_brackets(as_of)}


@router.get("/api/dev/legal-master", response_model=LegalMasterListPayload)
async def list_dev_legal_master(
    request: Request,
    domain: Optional[str] = Query(None),
    as_of: Optional[str] = Query(None),
):
    _require_platform_settings(request)
    meta = legal_master_summary()
    entries = list_legal_master_entries(domain=domain, as_of=as_of)
    _log_audit_event(request, "dev.legal_master.list", "success", f"count={len(entries)}")
    return LegalMasterListPayload(
        entry_count=meta["entry_count"],
        db_path=meta["db_path"],
        domains=meta["domains"],
        entries=[LegalMasterEntryItem(**e) for e in entries],
    )


@router.get("/api/dev/legal-master/export", response_model=LegalMasterCsvExportPayload)
async def export_dev_legal_master(request: Request, domain: Optional[str] = Query(None)):
    _require_platform_settings(request)
    csv_text = export_legal_master_csv(domain=domain)
    _log_audit_event(request, "dev.legal_master.export", "success")
    return LegalMasterCsvExportPayload(entry_count=legal_master_summary()["entry_count"], csv_text=csv_text)


@router.post("/api/dev/legal-master/validate", response_model=LegalMasterCsvValidatePayload)
async def validate_dev_legal_master_csv(request: Request, body: LegalMasterCsvValidateBody):
    _require_platform_settings(request)
    errors, rows = validate_legal_master_csv(body.csv_text)
    return LegalMasterCsvValidatePayload(valid=not errors, errors=errors, row_count=len(rows))


@router.post("/api/dev/legal-master/import")
async def import_dev_legal_master_csv(request: Request, body: LegalMasterCsvImportBody):
    _require_platform_settings(request)
    try:
        result = import_legal_master_csv(body.csv_text, mode=body.mode)  # type: ignore[arg-type]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "dev.legal_master.import", "success", f"mode={body.mode}")
    return result


@router.post("/api/dev/legal-master/nta-preview", response_model=LegalMasterNtaPreviewPayload)
async def preview_dev_legal_master_nta(request: Request, body: LegalMasterNtaPreviewBody):
    """国税庁ページ（nta.go.jp）または貼付テキストから草案を生成（保存はしない）。"""
    _require_platform_settings(request)
    try:
        result = preview_legal_master_nta_import(
            template=body.template,  # type: ignore[arg-type]
            url=body.url,
            text=body.text,
            valid_from=body.valid_from,
            valid_to=body.valid_to,
            source_law=body.source_law,
            jurisdiction=body.jurisdiction,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=502, detail=f"国税庁ページの取得に失敗しました: {exc}") from exc
    _log_audit_event(
        request,
        "dev.legal_master.nta_preview",
        "success",
        f"template={body.template} source={result['source']} entries={len(result['entries'])}",
    )
    return LegalMasterNtaPreviewPayload(
        template=result["template"],
        source=result["source"],
        entries=[LegalMasterWriteBody(**e) for e in result["entries"]],
        csv_text=result["csv_text"],
        warnings=result["warnings"],
    )


# --- Withholding tax table (源泉徴収税額表・月額表) ---


@router.get("/api/dev/withholding-tax/monthly", response_model=WithholdingMonthlyPayload)
async def get_dev_withholding_monthly(request: Request, as_of: Optional[str] = Query(None)):
    """月額表の一覧＋（時点で有効な）表全体を返す（開発コンソール表示用）。"""
    _require_platform_settings(request)
    reload_withholding_tables()
    tables = [WithholdingTableSummary(**t) for t in list_withholding_tables()]
    table = get_withholding_monthly_table(as_of)
    _log_audit_event(request, "dev.withholding_tax.list", "success", f"count={len(tables)}")
    return WithholdingMonthlyPayload(tables=tables, table=table)


@router.get("/api/v1/withholding-tax/monthly", response_model=WithholdingLookupPayload)
async def calc_withholding_monthly(
    request: Request,
    salary: int = Query(..., ge=0, description="その月の社会保険料等控除後の給与等の金額（円）"),
    dependents: int = Query(0, ge=0, description="扶養親族等の数（甲欄のみ）"),
    kind: str = Query("kou", pattern="^(kou|otsu)$"),
    as_of: Optional[str] = Query(None, description="基準日 YYYY-MM-DD（未指定なら最新）"),
):
    """月額表に基づく源泉徴収税額を計算する。"""
    _require_authenticated(request)
    try:
        result = lookup_withholding_monthly(salary, dependents, kind, as_of=as_of)  # type: ignore[arg-type]
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return WithholdingLookupPayload(**result)


# --- Corporate tax rate (法人税の税率) ---


@router.get("/api/dev/corporate-tax/rate", response_model=CorporateTaxRatePayload)
async def get_dev_corporate_tax_rate(request: Request):
    """法人税率マスタ（行列）全体を返す（開発コンソール表示用）。"""
    _require_platform_settings(request)
    reload_corporate_tax_table()
    table = get_corporate_tax_table()
    _log_audit_event(request, "dev.corporate_tax.get", "success")
    return CorporateTaxRatePayload(table=table)


@router.get("/api/v1/corporate-tax/calc", response_model=CorporateTaxCalcPayload)
async def calc_corporate_tax(
    request: Request,
    taxable_income: int = Query(..., ge=0, description="課税所得金額（1,000円未満切捨後）"),
    fiscal_year_start: str = Query(..., description="事業年度開始日 YYYY-MM-DD"),
    small_business: bool = Query(True, description="資本金1億円以下の中小法人など（軽減税率対象）"),
    excluded_business: bool = Query(False, description="適用除外事業者（軽減税率不可）"),
):
    """普通法人の法人税額を計算する（別表一の税額計算に相当）。"""
    _require_authenticated(request)
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


# --- Reference tables (表形式マスタ) ---


@router.get("/api/dev/ref-tables", response_model=RefTableListPayload)
async def list_dev_ref_tables(request: Request):
    _require_platform_settings(request)
    reload_ref_tables()
    tables = [RefTableSummary(**t) for t in list_ref_tables()]
    _log_audit_event(request, "dev.ref_tables.list", "success", f"count={len(tables)}")
    return RefTableListPayload(tables=tables)


@router.get("/api/dev/ref-tables/{table_id}", response_model=RefTableDetailPayload)
async def get_dev_ref_table(request: Request, table_id: str):
    _require_platform_settings(request)
    reload_ref_tables()
    table = get_ref_table(table_id)
    if not table:
        raise HTTPException(status_code=404, detail=f"Table not found: {table_id}")
    return RefTableDetailPayload(table=table)


@router.put("/api/dev/ref-tables/{table_id}/rows")
async def upsert_dev_ref_table_row(request: Request, table_id: str, body: RefTableRowUpsertBody):
    """参照テーブルの行を追加／更新する（都道府県料率などのノーコード追加用）。"""
    _require_platform_settings(request)
    try:
        table = upsert_ref_table_row(
            table_id,
            valid_from=body.valid_from,
            row=body.row,
            match_key=body.match_key,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(
        request,
        "dev.ref_tables.upsert_row",
        "success",
        f"{table_id}:{body.match_key}={body.row.get(body.match_key)}",
    )
    return {"ok": True, "table": table}


@router.get("/api/v1/association-health/prefectures")
async def list_association_health_prefectures_api(
    request: Request,
    as_of: Optional[str] = Query(None),
):
    _require_authenticated(request)
    return {"prefectures": list_association_health_prefectures(as_of=as_of)}


@router.get("/api/v1/association-health/calc")
async def calc_association_health_api(
    request: Request,
    remuneration_monthly: int = Query(..., ge=0, description="報酬月額（円）"),
    prefecture_code: str = Query("13", description="協会けんぽ支部コード（東京=13）"),
    care_applicable: bool = Query(False, description="介護保険第2号被保険者に該当するか"),
    as_of: Optional[str] = Query(None),
):
    _require_authenticated(request)
    try:
        return calc_association_health_premium(
            remuneration_monthly,
            prefecture_code=prefecture_code,
            care_applicable=care_applicable,
            as_of=as_of,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/api/v1/association-health/amount-table")
async def association_health_amount_table_api(
    request: Request,
    prefecture_code: str = Query("13", description="協会けんぽ支部コード（東京=13）"),
    as_of: Optional[str] = Query(None),
):
    _require_authenticated(request)
    try:
        return build_association_health_amount_table(prefecture_code, as_of=as_of)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/api/v1/employment-insurance/calc")
async def calc_employment_insurance_api(
    request: Request,
    wage: int = Query(..., ge=0),
    business: str = Query("一般の事業"),
    as_of: Optional[str] = Query(None),
):
    _require_authenticated(request)
    try:
        return calc_employment_insurance(wage, business, as_of=as_of)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/api/v1/social-insurance/cap")
async def clip_social_insurance_basis_api(
    request: Request,
    amount: int = Query(..., ge=0),
    insurance: str = Query("厚生年金"),
    basis: str = Query("標準報酬月額"),
    as_of: Optional[str] = Query(None),
):
    _require_authenticated(request)
    try:
        return clip_social_insurance_basis(amount, insurance, basis, as_of=as_of)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/api/v1/deductions/basic")
async def lookup_basic_deduction_api(
    request: Request,
    total_income: int = Query(..., ge=0),
    as_of: Optional[str] = Query(None),
    non_resident: bool = Query(False),
):
    _require_authenticated(request)
    try:
        return lookup_basic_deduction(total_income, as_of=as_of, non_resident=non_resident)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/api/v1/deductions/spouse")
async def lookup_spouse_deduction_api(
    request: Request,
    spouse_income: int = Query(..., ge=0),
    taxpayer_income: int = Query(..., ge=0),
    spouse_elderly: bool = Query(False),
    as_of: Optional[str] = Query(None),
):
    _require_authenticated(request)
    try:
        return lookup_spouse_deduction(
            spouse_income, taxpayer_income, spouse_elderly=spouse_elderly, as_of=as_of
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/api/v1/corporate-resident/percapita")
async def lookup_corporate_percapita_api(
    request: Request,
    capital: int = Query(..., ge=0),
    employees: int = Query(..., ge=0),
    as_of: Optional[str] = Query(None),
):
    _require_authenticated(request)
    try:
        return lookup_corporate_percapita(capital, employees, as_of=as_of)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/api/v1/corporate-local/calc")
async def calc_corporate_local_taxes_api(
    request: Request,
    taxable_income: int = Query(..., ge=0, description="課税所得（円）"),
    fiscal_year_start: str = Query(..., description="事業年度開始日 YYYY-MM-DD"),
    small_business: bool = Query(True),
    capital: int = Query(10_000_000, ge=0, description="資本金等の額（円）"),
    employees: int = Query(30, ge=0, description="従業者数"),
    jurisdiction: str = Query("tokyo_23", description="法人税割の区分（tokyo_23 / tokyo_muni）"),
    use_excess_rate: bool = Query(False, description="超過税率を適用するか"),
):
    """均等割・法人税割・事業税・特別法人事業税・地方法人税をまとめて試算（事業所税は対象外）。"""
    _require_authenticated(request)
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


@router.post("/api/v1/consumption-tax/simplified/calc")
async def calc_simplified_consumption_api(request: Request, body: SimplifiedConsumptionCalcBody):
    _require_authenticated(request)
    try:
        return calc_simplified_consumption(
            body.tax_by_type,
            unclassified_tax=body.unclassified_tax,
            unclassified_types=body.unclassified_types,
            as_of=body.as_of,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/api/v1/corporate-tax/defense-surtax")
async def calc_defense_surtax_api(request: Request, body: DefenseSurtaxCalcBody):
    _require_authenticated(request)
    try:
        return calc_defense_surtax(body.corporate_tax_amount, body.as_of)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/api/v1/employment-income/deduction")
async def calc_employment_income_api(
    request: Request,
    salary_revenue: int = Query(..., ge=0),
    as_of: Optional[str] = Query(None),
):
    _require_authenticated(request)
    try:
        return calc_employment_income(salary_revenue, as_of=as_of)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/api/v1/resident-tax/individual")
async def calc_individual_resident_tax_api(
    request: Request,
    taxable_income: int = Query(..., ge=0),
    as_of: str = Query(...),
    jurisdiction_code: Optional[str] = Query(None),
    designated_city: bool = Query(False),
    include_forest_tax: bool = Query(True),
):
    _require_authenticated(request)
    try:
        return calc_individual_resident_tax(
            taxable_income,
            as_of,
            jurisdiction_code=jurisdiction_code,
            designated_city=designated_city,
            include_forest_tax=include_forest_tax,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/api/v1/minimum-wage/check")
async def check_minimum_wage_api(
    request: Request,
    monthly_base_salary: int = Query(..., ge=0),
    monthly_scheduled_hours: float = Query(..., gt=0),
    prefecture: str = Query(...),
    as_of: Optional[str] = Query(None),
):
    _require_authenticated(request)
    try:
        return check_minimum_wage(
            monthly_base_salary, monthly_scheduled_hours, prefecture, as_of=as_of
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/api/dev/legal-master/seed")
async def seed_dev_legal_master(request: Request):
    _require_platform_settings(request)
    try:
        result = seed_legal_master_from_file()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "dev.legal_master.seed", "success")
    return result


@router.post("/api/dev/legal-master", response_model=LegalMasterEntryItem, status_code=201)
async def create_dev_legal_master_entry(request: Request, body: LegalMasterWriteBody):
    _require_platform_settings(request)
    try:
        entry = create_legal_master_entry(body.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "dev.legal_master.create", "success", entry["master_key"])
    return LegalMasterEntryItem(**entry)


@router.put("/api/dev/legal-master/{entry_id}", response_model=LegalMasterEntryItem)
async def update_dev_legal_master_entry(
    request: Request, entry_id: str, body: LegalMasterWriteBody
):
    _require_platform_settings(request)
    try:
        entry = update_legal_master_entry(entry_id, body.model_dump())
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Entry not found: {entry_id}") from None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _log_audit_event(request, "dev.legal_master.update", "success", entry_id)
    return LegalMasterEntryItem(**entry)


@router.delete("/api/dev/legal-master/{entry_id}")
async def delete_dev_legal_master_entry(request: Request, entry_id: str):
    _require_platform_settings(request)
    try:
        delete_legal_master_entry(entry_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Entry not found: {entry_id}") from None
    _log_audit_event(request, "dev.legal_master.delete", "success", entry_id)
    return {"status": "deleted", "id": entry_id}


