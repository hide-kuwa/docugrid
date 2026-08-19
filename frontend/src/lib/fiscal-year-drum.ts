/** サイドバー年度ドラム: 最新年度を自動追従 · 表示年数は設定 · それ以前は OLD */

export const YEAR_OLD_PERIOD_KEY = "year:old";
export const YEAR_OLD_LABEL = "OLD";
export const YEAR_DISPLAY_COUNT_DEFAULT = 5;
export const YEAR_DISPLAY_COUNT_MAX = 30;
export const YEAR_DISPLAY_COUNT_MIN = 1;

export type YearDrumMeta = {
  labels: string[];
  displayCount: number;
  latestReiwa: number;
  oldestVisibleReiwa: number;
};

export type PeriodLists = { year: string[]; month: string[] };

export function clampYearDisplayCount(value: number): number {
  if (!Number.isFinite(value)) return YEAR_DISPLAY_COUNT_DEFAULT;
  return Math.min(YEAR_DISPLAY_COUNT_MAX, Math.max(YEAR_DISPLAY_COUNT_MIN, Math.round(value)));
}

/** 決算月を基準に「今」属する令和年度（例: 2026/7 + 3月期 → R8） */
export function currentReiwaYear(referenceDate = new Date(), _fiscalMonth = 3): number {
  const calYear = referenceDate.getFullYear();
  const calMonth = referenceDate.getMonth() + 1;
  const fiscalMonth = _fiscalMonth >= 1 && _fiscalMonth <= 12 ? _fiscalMonth : 3;
  const endCalYear = calMonth > fiscalMonth ? calYear : calYear - 1;
  return endCalYear - 2018;
}

export function buildYearDrumMeta(
  displayCount: number,
  referenceDate = new Date(),
  fiscalMonth = 3,
): YearDrumMeta {
  const count = clampYearDisplayCount(displayCount);
  const latestReiwa = currentReiwaYear(referenceDate, fiscalMonth);
  const labels = Array.from({ length: count }, (_, i) => `R${latestReiwa - i}`);
  labels.push(YEAR_OLD_LABEL);
  return {
    labels,
    displayCount: count,
    latestReiwa,
    oldestVisibleReiwa: latestReiwa - count + 1,
  };
}

/** 月次ドラム: 決算月を先頭に、そこから遡る（例: 3月決算 → 3月…4月） */
export function buildMonthDrumLabels(fiscalMonth = 3): string[] {
  const fm = fiscalMonth >= 1 && fiscalMonth <= 12 ? fiscalMonth : 3;
  return Array.from({ length: 12 }, (_, i) => {
    const month = ((fm - 1 - i) % 12 + 12) % 12 + 1;
    return `${month}月`;
  });
}

export function buildMatrixPeriods(
  yearMeta: YearDrumMeta,
  fiscalMonth = 3,
): PeriodLists {
  return {
    year: yearMeta.labels,
    month: buildMonthDrumLabels(fiscalMonth),
  };
}

export function isOldPeriodKey(periodKey: string): boolean {
  return periodKey === YEAR_OLD_PERIOD_KEY;
}

export function isOldDrumLabel(label: string | null | undefined): boolean {
  return label === YEAR_OLD_LABEL;
}

export function reiwaFromYearPeriodOffset(offset: number, latestReiwa: number): number | null {
  if (!Number.isInteger(offset) || offset < 1) return null;
  return latestReiwa - (offset - 1);
}

export function reiwaFromYearPeriodKey(
  periodKey: string,
  yearMeta: YearDrumMeta,
): number | null {
  if (isOldPeriodKey(periodKey)) return null;
  const match = /^year:(\d+)$/.exec(periodKey);
  if (!match) return null;
  const offset = Number(match[1]);
  if (offset < 1 || offset > yearMeta.displayCount) return null;
  return reiwaFromYearPeriodOffset(offset, yearMeta.latestReiwa);
}

export function reiwaLabel(reiwa: number): string {
  return `R${reiwa}`;
}
