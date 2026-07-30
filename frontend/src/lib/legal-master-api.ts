import { API_BASE } from "@/config/api";
import { authFetch } from "@/lib/api-auth";

export type LegalMasterEntry = {
  id: string;
  domain: string;
  master_key: string;
  label_ja: string;
  value_numeric: number | null;
  value_text: string | null;
  jurisdiction: string | null;
  valid_from: string;
  valid_to: string | null;
  source_law: string | null;
  attributes: Record<string, unknown> | null;
  master_version_id: string | null;
  created_at: string;
  updated_at: string;
};

export type LegalMasterListResponse = {
  entry_count: number;
  db_path: string;
  domains: { domain: string; count: number }[];
  entries: LegalMasterEntry[];
};

export type LegalMasterWriteBody = {
  domain: string;
  master_key: string;
  label_ja: string;
  value_numeric?: number | null;
  value_text?: string | null;
  jurisdiction?: string | null;
  valid_from: string;
  valid_to?: string | null;
  source_law?: string | null;
  attributes?: Record<string, unknown> | null;
  master_version_id?: string | null;
};

export type ImportMode = "replace" | "merge";

export const DOMAIN_LABELS: Record<string, string> = {
  consumption_tax: "消費税",
  deduction_amount: "控除額",
  income_tax_bracket: "所得税累進",
  income_tax_surcharge: "所得税加算",
  withholding_tax: "源泉徴収",
  corporate_tax: "法人税",
  social_insurance: "社会保険",
  corporate_tax_surcharge: "法人税加算",
  individual_resident_tax: "個人住民税",
  labor_insurance: "労働保険",
  ref_table: "参照表",
};

async function parseError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return (body as { detail?: string }).detail || res.statusText;
}

export async function fetchLegalMasterEntries(opts?: {
  domain?: string;
  asOf?: string;
}): Promise<LegalMasterListResponse> {
  const q = new URLSearchParams();
  if (opts?.domain) q.set("domain", opts.domain);
  if (opts?.asOf) q.set("as_of", opts.asOf);
  const suffix = q.toString() ? `?${q}` : "";
  const res = await authFetch(`${API_BASE}/dev/legal-master${suffix}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<LegalMasterListResponse>;
}

export async function exportLegalMasterCsv(domain?: string): Promise<{
  entry_count: number;
  csv_text: string;
}> {
  const q = domain ? `?domain=${encodeURIComponent(domain)}` : "";
  const res = await authFetch(`${API_BASE}/dev/legal-master/export${q}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function validateLegalMasterCsv(csvText: string): Promise<{
  valid: boolean;
  errors: string[];
  row_count: number;
}> {
  const res = await authFetch(`${API_BASE}/dev/legal-master/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ csv_text: csvText }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function importLegalMasterCsv(
  csvText: string,
  mode: ImportMode,
): Promise<{ imported: number; total: number }> {
  const res = await authFetch(`${API_BASE}/dev/legal-master/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ csv_text: csvText, mode }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function seedLegalMaster(): Promise<{ imported: number; total: number }> {
  const res = await authFetch(`${API_BASE}/dev/legal-master/seed`, { method: "POST" });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function createLegalMasterEntry(
  body: LegalMasterWriteBody,
): Promise<LegalMasterEntry> {
  const res = await authFetch(`${API_BASE}/dev/legal-master`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<LegalMasterEntry>;
}

export async function updateLegalMasterEntry(
  id: string,
  body: LegalMasterWriteBody,
): Promise<LegalMasterEntry> {
  const res = await authFetch(`${API_BASE}/dev/legal-master/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<LegalMasterEntry>;
}

export async function deleteLegalMasterEntry(id: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/dev/legal-master/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export type NtaImportTemplate = "income_tax_speed_table";

export type NtaPreviewResponse = {
  template: string;
  source: string;
  entries: LegalMasterWriteBody[];
  csv_text: string;
  warnings: string[];
};

export async function previewNtaImport(body: {
  template: NtaImportTemplate;
  url?: string;
  text?: string;
  valid_from: string;
  valid_to?: string | null;
  source_law?: string | null;
  jurisdiction?: string | null;
}): Promise<NtaPreviewResponse> {
  const res = await authFetch(`${API_BASE}/dev/legal-master/nta-preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<NtaPreviewResponse>;
}

export type WithholdingTableSummary = {
  table_type: string;
  label_ja: string;
  year_label: string;
  valid_from: string | null;
  valid_to: string | null;
  source_law: string | null;
  source_url: string | null;
  row_count: number;
};

export type WithholdingRow = {
  min: number;
  max: number;
  kou: number[];
  otsu: number;
};

export type WithholdingTable = {
  table_type: string;
  label_ja: string;
  year_label: string;
  valid_from: string | null;
  valid_to: string | null;
  source_law: string | null;
  source_url: string | null;
  columns: string[];
  low_band: { max: number; kou: number[]; otsu_rate: number; note?: string };
  high_income_kou: { min: number; rate: number; kou: number[] }[];
  high_income_otsu: { min: number; base: number; over: number; rate: number }[];
  over_7_deduction: number;
  note_over_7?: string;
  rows: WithholdingRow[];
};

export type WithholdingMonthlyResponse = {
  tables: WithholdingTableSummary[];
  table: WithholdingTable | null;
};

export type WithholdingLookupResponse = {
  salary: number;
  dependents: number;
  kind: "kou" | "otsu";
  tax: number;
  method: string;
  valid_from: string | null;
  year_label: string | null;
};

export async function fetchWithholdingMonthly(
  asOf?: string,
): Promise<WithholdingMonthlyResponse> {
  const q = asOf ? `?as_of=${encodeURIComponent(asOf)}` : "";
  const res = await authFetch(`${API_BASE}/dev/withholding-tax/monthly${q}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<WithholdingMonthlyResponse>;
}

export async function lookupWithholdingMonthly(params: {
  salary: number;
  dependents?: number;
  kind?: "kou" | "otsu";
  asOf?: string;
}): Promise<WithholdingLookupResponse> {
  const q = new URLSearchParams({ salary: String(params.salary) });
  if (params.dependents != null) q.set("dependents", String(params.dependents));
  if (params.kind) q.set("kind", params.kind);
  if (params.asOf) q.set("as_of", params.asOf);
  const res = await authFetch(`${API_BASE}/v1/withholding-tax/monthly?${q}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<WithholdingLookupResponse>;
}

export type CorporateTaxPeriod = { label: string; start: string };

export type CorporateTaxRow = {
  corp_type: string;
  segment: string;
  income_band: string;
  rates: number[];
  consolidated_rate: number | null;
  note: string;
};

export type CorporateTaxTable = {
  master: string;
  label_ja: string;
  law_asof: string;
  source_law: string | null;
  source_url: string | null;
  valid_from: string | null;
  valid_to: string | null;
  small_business_threshold: number;
  periods: CorporateTaxPeriod[];
  rows: CorporateTaxRow[];
  notes: string[];
  special_10b_reduced_rate?: number;
  special_10b_threshold?: number;
  special_10b_from?: string;
};

export type CorporateTaxCalcResponse = {
  taxable_income: number;
  fiscal_year_start: string;
  small_business: boolean;
  excluded_business: boolean;
  reduced_rate: number | null;
  standard_rate: number;
  threshold: number;
  reduced_portion: number;
  standard_portion: number;
  tax: number;
  valid_from: string | null;
};

export async function fetchCorporateTaxRate(): Promise<CorporateTaxTable | null> {
  const res = await authFetch(`${API_BASE}/dev/corporate-tax/rate`);
  if (!res.ok) throw new Error(await parseError(res));
  const body = (await res.json()) as { table: CorporateTaxTable | null };
  return body.table;
}

export async function calcCorporateTax(params: {
  taxableIncome: number;
  fiscalYearStart: string;
  smallBusiness?: boolean;
  excludedBusiness?: boolean;
}): Promise<CorporateTaxCalcResponse> {
  const q = new URLSearchParams({
    taxable_income: String(params.taxableIncome),
    fiscal_year_start: params.fiscalYearStart,
  });
  if (params.smallBusiness != null) q.set("small_business", String(params.smallBusiness));
  if (params.excludedBusiness != null) q.set("excluded_business", String(params.excludedBusiness));
  const res = await authFetch(`${API_BASE}/v1/corporate-tax/calc?${q}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<CorporateTaxCalcResponse>;
}

export async function lookupLegalMasterRate(
  masterKey: string,
  asOf: string,
): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({ master_key: masterKey, as_of: asOf });
  const res = await authFetch(`${API_BASE}/v1/legal-master/rates?${q}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<Record<string, unknown>>;
}

// --- Reference tables (表形式マスタ) ---

export type RefTableColumn = { key: string; label: string; type: string };

export type RefTableVersion = {
  valid_from: string;
  valid_to: string | null;
  label: string;
  columns: RefTableColumn[];
  rows: Record<string, unknown>[];
};

export type RefTableSummary = {
  id: string;
  label_ja: string;
  category: string;
  unit: string;
  source_law: string | null;
  source_url: string | null;
  version_count: number;
  latest_valid_from: string | null;
};

export type RefTable = {
  id: string;
  label_ja: string;
  category: string;
  unit: string;
  source_law: string | null;
  source_url: string | null;
  notes: string[];
  versions: RefTableVersion[];
};

export async function fetchRefTables(): Promise<RefTableSummary[]> {
  const res = await authFetch(`${API_BASE}/dev/ref-tables`);
  if (!res.ok) throw new Error(await parseError(res));
  const body = (await res.json()) as { tables: RefTableSummary[] };
  return body.tables;
}

export async function fetchRefTable(tableId: string): Promise<RefTable | null> {
  const res = await authFetch(`${API_BASE}/dev/ref-tables/${encodeURIComponent(tableId)}`);
  if (!res.ok) throw new Error(await parseError(res));
  const body = (await res.json()) as { table: RefTable | null };
  return body.table;
}

export async function calcEmploymentInsurance(params: {
  wage: number;
  business?: string;
  asOf?: string;
}): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({ wage: String(params.wage) });
  if (params.business) q.set("business", params.business);
  if (params.asOf) q.set("as_of", params.asOf);
  const res = await authFetch(`${API_BASE}/v1/employment-insurance/calc?${q}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<Record<string, unknown>>;
}

export async function clipSocialInsuranceBasis(params: {
  amount: number;
  insurance?: string;
  basis?: string;
  asOf?: string;
}): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({ amount: String(params.amount) });
  if (params.insurance) q.set("insurance", params.insurance);
  if (params.basis) q.set("basis", params.basis);
  if (params.asOf) q.set("as_of", params.asOf);
  const res = await authFetch(`${API_BASE}/v1/social-insurance/cap?${q}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<Record<string, unknown>>;
}

export async function lookupBasicDeduction(params: {
  totalIncome: number;
  asOf?: string;
  nonResident?: boolean;
}): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({ total_income: String(params.totalIncome) });
  if (params.asOf) q.set("as_of", params.asOf);
  if (params.nonResident) q.set("non_resident", "true");
  const res = await authFetch(`${API_BASE}/v1/deductions/basic?${q}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<Record<string, unknown>>;
}

export async function lookupSpouseDeduction(params: {
  spouseIncome: number;
  taxpayerIncome: number;
  spouseElderly?: boolean;
  asOf?: string;
}): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({
    spouse_income: String(params.spouseIncome),
    taxpayer_income: String(params.taxpayerIncome),
  });
  if (params.spouseElderly) q.set("spouse_elderly", "true");
  if (params.asOf) q.set("as_of", params.asOf);
  const res = await authFetch(`${API_BASE}/v1/deductions/spouse?${q}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<Record<string, unknown>>;
}

export async function lookupCorporatePercapita(params: {
  capital: number;
  employees: number;
  asOf?: string;
}): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({
    capital: String(params.capital),
    employees: String(params.employees),
  });
  if (params.asOf) q.set("as_of", params.asOf);
  const res = await authFetch(`${API_BASE}/v1/corporate-resident/percapita?${q}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<Record<string, unknown>>;
}

export async function calcSimplifiedConsumption(params: {
  taxByType: Record<number, number>;
  unclassifiedTax?: number;
  unclassifiedTypes?: number[];
  asOf?: string;
}): Promise<Record<string, unknown>> {
  const res = await authFetch(`${API_BASE}/v1/consumption-tax/simplified/calc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tax_by_type: params.taxByType,
      unclassified_tax: params.unclassifiedTax ?? 0,
      unclassified_types: params.unclassifiedTypes,
      as_of: params.asOf,
    }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<Record<string, unknown>>;
}

export async function calcEmploymentIncome(params: {
  salaryRevenue: number;
  asOf?: string;
}): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({ salary_revenue: String(params.salaryRevenue) });
  if (params.asOf) q.set("as_of", params.asOf);
  const res = await authFetch(`${API_BASE}/v1/employment-income/deduction?${q}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<Record<string, unknown>>;
}

export async function calcIndividualResidentTax(params: {
  taxableIncome: number;
  asOf: string;
  jurisdictionCode?: string;
  designatedCity?: boolean;
  includeForestTax?: boolean;
}): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({
    taxable_income: String(params.taxableIncome),
    as_of: params.asOf,
  });
  if (params.jurisdictionCode) q.set("jurisdiction_code", params.jurisdictionCode);
  if (params.designatedCity) q.set("designated_city", "true");
  if (params.includeForestTax === false) q.set("include_forest_tax", "false");
  const res = await authFetch(`${API_BASE}/v1/resident-tax/individual?${q}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<Record<string, unknown>>;
}

export async function checkMinimumWage(params: {
  monthlyBaseSalary: number;
  monthlyScheduledHours: number;
  prefecture: string;
  asOf?: string;
}): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({
    monthly_base_salary: String(params.monthlyBaseSalary),
    monthly_scheduled_hours: String(params.monthlyScheduledHours),
    prefecture: params.prefecture,
  });
  if (params.asOf) q.set("as_of", params.asOf);
  const res = await authFetch(`${API_BASE}/v1/minimum-wage/check?${q}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<Record<string, unknown>>;
}

export async function calcAssociationHealth(params: {
  remunerationMonthly: number;
  prefectureCode?: string;
  careApplicable?: boolean;
  asOf?: string;
}): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({
    remuneration_monthly: String(params.remunerationMonthly),
    prefecture_code: params.prefectureCode ?? "13",
    care_applicable: String(!!params.careApplicable),
  });
  if (params.asOf) q.set("as_of", params.asOf);
  const res = await authFetch(`${API_BASE}/v1/association-health/calc?${q}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<Record<string, unknown>>;
}

export async function fetchAssociationHealthAmountTableAuth(params: {
  prefectureCode: string;
  asOf?: string;
}): Promise<{
  prefecture_code: string;
  prefecture: string;
  health_rate: number;
  care_rate: number;
  health_care_rate: number;
  child_support_rate: number;
  pension_rate: number;
  childcare_contrib_rate: number;
  source_url?: string | null;
  valid_from?: string | null;
  label?: string | null;
  rows: Record<string, unknown>[];
}> {
  const q = new URLSearchParams({ prefecture_code: params.prefectureCode });
  if (params.asOf) q.set("as_of", params.asOf);
  const res = await authFetch(`${API_BASE}/v1/association-health/amount-table?${q}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function upsertRefTableRow(
  tableId: string,
  body: {
    valid_from: string;
    match_key?: string;
    row: Record<string, unknown>;
  },
): Promise<{ ok: boolean; table: RefTable }> {
  const res = await authFetch(`${API_BASE}/dev/ref-tables/${encodeURIComponent(tableId)}/rows`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      valid_from: body.valid_from,
      match_key: body.match_key ?? "prefecture_code",
      row: body.row,
    }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<{ ok: boolean; table: RefTable }>;
}

export function domainLabel(domain: string): string {
  return DOMAIN_LABELS[domain] || domain;
}

export function formatValue(entry: LegalMasterEntry): string {
  if (entry.value_numeric != null) {
    if (entry.value_numeric > 0 && entry.value_numeric < 1) {
      return `${(entry.value_numeric * 100).toFixed(1)}%`;
    }
    return entry.value_numeric.toLocaleString("ja-JP");
  }
  return entry.value_text || "—";
}
