/** 期間 × インデックスに対応する安定スロット ID（P0.5 / OCR 振り分け用）。 */

const PERM_SLOT_IDS = [
  "articles_of_incorporation",
  "corporate_registry",
  "shareholder_registry",
  "establishment_notice",
] as const;

const YEAR_SLOT_IDS = [
  "tax_proxy",
  "tax_return_corporate",
  "account_details",
  "corp_summary",
  "financial_report",
  "ledger",
  "tax_return_consumption",
] as const;

const MONTH_SLOT_IDS = [
  "monthly_trial_balance",
  "bank_statement",
  "invoices_bundle",
  "payroll_ledger",
] as const;

export function defaultSlotIdsForPeriod(periodKey: string): readonly string[] {
  if (periodKey === "perm") return PERM_SLOT_IDS;
  if (periodKey.startsWith("year:")) return YEAR_SLOT_IDS;
  if (periodKey.startsWith("month:")) return MONTH_SLOT_IDS;
  return YEAR_SLOT_IDS;
}

export function stableSlotId(periodKey: string, slotIndex: number): string {
  const ids = defaultSlotIdsForPeriod(periodKey);
  return ids[slotIndex] ?? `slot_${slotIndex}`;
}

/** レガシー数値 slot_id（"0".."3"）を安定 ID へ正規化。 */
export function normalizeSlotId(periodKey: string, slotId: string): string {
  if (/^\d+$/.test(slotId)) {
    return stableSlotId(periodKey, Number(slotId));
  }
  return slotId;
}

export function slotIndexFromStableId(periodKey: string, slotId: string): number {
  const normalized = normalizeSlotId(periodKey, slotId);
  const ids = defaultSlotIdsForPeriod(periodKey);
  const idx = ids.indexOf(normalized);
  return idx >= 0 ? idx : Number.parseInt(slotId, 10);
}

export function buildSlotStorageKey(
  clientId: string,
  periodKey: string,
  slotIndex: number,
): string {
  return `${clientId}:${periodKey}:${stableSlotId(periodKey, slotIndex)}`;
}

export function buildSlotStorageKeyFromSlotId(
  clientId: string,
  periodKey: string,
  slotId: string,
): string {
  return `${clientId}:${periodKey}:${normalizeSlotId(periodKey, slotId)}`;
}

export function classifyCandidates(
  periodKey: string,
  slotLabels: string[],
  slotIds?: string[],
): { id: string; label: string }[] {
  return slotLabels.map((label, idx) => ({
    id: slotIds?.[idx] ?? stableSlotId(periodKey, idx),
    label,
  }));
}

export function parseSlotKeySlotId(slotKey: string): string | null {
  const parts = slotKey.split(":");
  if (parts.length < 3) return null;
  return parts[parts.length - 1]!;
}

export function slotIndexFromSlotKey(slotKey: string, periodKey: string): number | null {
  const slotId = parseSlotKeySlotId(slotKey);
  if (!slotId) return null;
  const idx = slotIndexFromStableId(periodKey, slotId);
  return Number.isInteger(idx) && idx >= 0 ? idx : null;
}
