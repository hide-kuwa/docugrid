/** データ項目と参照すべき永続・決算資料の対応（クイックオープン用）。 */

export type RelatedDocumentRef = {
  periodKey: string;
  slotId: string;
  label: string;
  /** @deprecated use auditMode */
  audit?: boolean;
  /** check = 承認不要の数値照合 / formal = 承認フロー付き監査 */
  auditMode?: "check" | "formal";
};

/** 税務・申告系フィールドが参照する既定の決算期（ドラム index 2 = year:1）。 */
export const DEFAULT_YEAR_PERIOD_KEY = "year:1";

/** 給与・月次系フィールドが参照する既定の月次期。 */
export const DEFAULT_MONTH_PERIOD_KEY = "month:1";

const PERM_ARTICLES: RelatedDocumentRef = {
  periodKey: "perm",
  slotId: "articles_of_incorporation",
  label: "定款",
};

const PERM_REGISTRY: RelatedDocumentRef = {
  periodKey: "perm",
  slotId: "corporate_registry",
  label: "履歴事項全部証明書",
};

const PERM_SHAREHOLDER: RelatedDocumentRef = {
  periodKey: "perm",
  slotId: "shareholder_registry",
  label: "株主名簿",
};

const PERM_ESTABLISHMENT: RelatedDocumentRef = {
  periodKey: "perm",
  slotId: "establishment_notice",
  label: "設立届出書",
};

function yearSlot(slotId: string, label: string): RelatedDocumentRef {
  return { periodKey: DEFAULT_YEAR_PERIOD_KEY, slotId, label };
}

function monthSlot(slotId: string, label: string): RelatedDocumentRef {
  return { periodKey: DEFAULT_MONTH_PERIOD_KEY, slotId, label };
}

const CORP_TAX = yearSlot("tax_return_corporate", "法人税申告書");
const CONSUMPTION_TAX = yearSlot("tax_return_consumption", "消費税申告書");
const FINANCIAL_REPORT = yearSlot("financial_report", "決算報告書");
const LEDGER = yearSlot("ledger", "総勘定元帳");
const PAYROLL_LEDGER = monthSlot("payroll_ledger", "給与台帳");

const CORPORATE_IDENTITY: RelatedDocumentRef[] = [PERM_ARTICLES, PERM_REGISTRY];

export const FIELD_RELATED_DOCUMENTS: Record<string, RelatedDocumentRef[]> = {
  _name: CORPORATE_IDENTITY,
  _fiscal_month: [PERM_ARTICLES],
  customer_name: CORPORATE_IDENTITY,
  customer_name_kana: CORPORATE_IDENTITY,
  head_office_address: [PERM_REGISTRY, PERM_ARTICLES],
  mailing_address: [PERM_REGISTRY],
  established_date: [PERM_ARTICLES, PERM_REGISTRY, PERM_ESTABLISHMENT],
  capital: [PERM_ARTICLES, PERM_REGISTRY],
  corporate_number: [PERM_REGISTRY],
  entity_major: [PERM_ARTICLES, PERM_REGISTRY],
  entity_minor: [PERM_ARTICLES, PERM_REGISTRY],
  fiscal_year_end_date: [PERM_ARTICLES, CORP_TAX],
  representative_name: [PERM_ARTICLES, PERM_REGISTRY],
  director1_name: [PERM_ARTICLES, PERM_SHAREHOLDER],
  director2_name: [PERM_ARTICLES, PERM_SHAREHOLDER],
  shareholder_count: [PERM_SHAREHOLDER, PERM_REGISTRY],
  issued_shares: [PERM_SHAREHOLDER, PERM_ARTICLES],
  shareholders_with_voting_rights: [PERM_SHAREHOLDER],
  voting_rights_total: [PERM_SHAREHOLDER],
  shareholders_attending: [PERM_SHAREHOLDER],
  voting_rights_attending: [PERM_SHAREHOLDER],
  tax_office: [PERM_REGISTRY, CORP_TAX],
  tax_returns: [CORP_TAX, CONSUMPTION_TAX],
  consumption_tax: [CONSUMPTION_TAX],
  officer_compensation: [FINANCIAL_REPORT, CORP_TAX],
  director1_monthly_salary: [FINANCIAL_REPORT, PAYROLL_LEDGER],
  director2_monthly_salary: [FINANCIAL_REPORT, PAYROLL_LEDGER],
  total_monthly_salary: [PAYROLL_LEDGER, FINANCIAL_REPORT],
  payroll: [PAYROLL_LEDGER],
  withholding_tax: [PAYROLL_LEDGER, CORP_TAX],
  employee_count: [PAYROLL_LEDGER, FINANCIAL_REPORT],
  officer_count: [PERM_ARTICLES, PERM_SHAREHOLDER],
  accounting_software: [LEDGER],
  profit_taxable_income: [CORP_TAX, FINANCIAL_REPORT],
};

export function relatedDocumentsForField(fieldId: string): RelatedDocumentRef[] {
  return FIELD_RELATED_DOCUMENTS[fieldId] ?? [];
}

export function slotCatalogKey(periodKey: string, slotId: string): string {
  return `${periodKey}:${slotId}`;
}

export function isRelatedDocumentAvailable(
  ref: RelatedDocumentRef,
  filledSlotKeys: ReadonlySet<string>,
): boolean {
  return filledSlotKeys.has(slotCatalogKey(ref.periodKey, ref.slotId));
}
