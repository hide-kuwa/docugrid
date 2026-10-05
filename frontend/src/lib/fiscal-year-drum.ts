/** サイドバー年度ドラム: 最新年度を自動追従 · 表示年数は設定 · それ以前は OLD */

export const YEAR_OLD_PERIOD_KEY = "year:old";
export const YEAR_OLD_LABEL = "OLD";
export const YEAR_DISPLAY_COUNT_DEFAULT = 5;
export const YEAR_DISPLAY_COUNT_MAX = 30;
export const YEAR_DISPLAY_COUNT_MIN = 1;
/** 今日からこの年数後までに期末を迎える期までドラムに出す（12月決算の当年を含む） */
export const YEAR_DRUM_AHEAD_YEARS = 1;

export type YearDrumMeta = {
  labels: string[];
  displayCount: number;
  latestReiwa: number;
  oldestVisibleReiwa: number;
};

export type PeriodLists = {
  year: string[];
  month: string[];
  /** 月次ドラム各行の西暦（進行中の事業年度に対応） */
  monthCalendarYears?: number[];
};

/** 永続の次が最初の期（period-nav の PERIOD_INDEX_PERM + 1） */
const FIRST_PERIOD_INDEX = 2;

export function clampYearDisplayCount(value: number): number {
  if (!Number.isFinite(value)) return YEAR_DISPLAY_COUNT_DEFAULT;
  return Math.min(YEAR_DISPLAY_COUNT_MAX, Math.max(YEAR_DISPLAY_COUNT_MIN, Math.round(value)));
}

function clampFiscalMonth(month: number): number {
  return month >= 1 && month <= 12 ? month : 3;
}

function addCalendarYears(date: Date, years: number): Date {
  const next = new Date(date.getTime());
  next.setFullYear(next.getFullYear() + years);
  return next;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** 基準日以前（当日含む）で直近の決算期末のカレンダー年 */
export function fiscalEndCalendarYear(referenceDate: Date, fiscalMonth: number): number {
  const fm = clampFiscalMonth(fiscalMonth);
  const y = referenceDate.getFullYear();
  const m = referenceDate.getMonth() + 1;
  const d = referenceDate.getDate();
  const last = lastDayOfMonth(y, fm);
  if (m > fm || (m === fm && d >= last)) return y;
  return y - 1;
}

/** 決算月を基準に、直近で期末を迎えた令和（例: 2026/7 + 3月期 → R8＝2026年期末） */
export function currentReiwaYear(referenceDate = new Date(), _fiscalMonth = 3): number {
  return fiscalEndCalendarYear(referenceDate, _fiscalMonth) - 2018;
}

/** 今日から 1 年後までに期末を迎える最新の令和年（12月決算でも当年が出る） */
export function latestVisibleReiwaYear(
  referenceDate = new Date(),
  fiscalMonth = 3,
  aheadYears = YEAR_DRUM_AHEAD_YEARS,
): number {
  return currentReiwaYear(addCalendarYears(referenceDate, aheadYears), fiscalMonth);
}

export function buildYearDrumMeta(
  displayCount: number,
  referenceDate = new Date(),
  fiscalMonth = 3,
): YearDrumMeta {
  const count = clampYearDisplayCount(displayCount);
  const latestReiwa = latestVisibleReiwaYear(referenceDate, fiscalMonth);
  const labels = Array.from({ length: count }, (_, i) => `R${latestReiwa - i}`);
  labels.push(YEAR_OLD_LABEL);
  return {
    labels,
    displayCount: count,
    latestReiwa,
    oldestVisibleReiwa: latestReiwa - count + 1,
  };
}

/**
 * 進行中事業年度の期末カレンダー年。
 * 3月決算・8月時点なら 翌年（例: 2027）＝ドラムでは R9（2027年）表記。
 * 「画面の今年（2026→R8）」とは一致しない点に注意。
 */
export function inProgressFiscalEndCalendarYear(
  referenceDate: Date,
  fiscalMonth: number,
): number {
  const fm = clampFiscalMonth(fiscalMonth);
  const y = referenceDate.getFullYear();
  const m = referenceDate.getMonth() + 1;
  if (m > fm) return y + 1;
  return y;
}

/** 法人 / 個人。自動ジャンプの「今の年度」判定に使う */
export type TaxpayerCategory = "corporate" | "individual";

/** 法人税の標準的な申告期限（決算日の翌日から2か月以内） */
export const CORPORATE_FILING_GRACE_MONTHS = 2;

/** 個人の確定申告シーズン末（この日まで前年分を「その年度」） */
export const INDIVIDUAL_FILING_SEASON_END_MONTH = 3;

function ymdNumber(date: Date): number {
  return date.getFullYear() * 10_000 + (date.getMonth() + 1) * 100 + date.getDate();
}

/** 決算期末から graceMonths 後の月末（例: 3/31 + 2か月 → 5/31） */
export function filingDeadlineAfterFiscalEnd(
  endYear: number,
  fiscalMonth: number,
  graceMonths = CORPORATE_FILING_GRACE_MONTHS,
): Date {
  const fm = clampFiscalMonth(fiscalMonth);
  let y = endYear;
  let m = fm + Math.max(0, graceMonths);
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return new Date(y, m, 0);
}

/**
 * 作業上の「今の年度」の期末（または個人の暦年）西暦。
 * - 法人: 直近決算期末から申告猶予（既定2か月）の間はその期末年。過ぎたら進行中期末年。
 * - 個人: 暦年ベース。1〜3月は前年（申告シーズン）、4月以降は当年。
 */
export function workingEndCalendarYear(
  referenceDate: Date,
  fiscalMonth: number,
  category: TaxpayerCategory = "corporate",
  corporateGraceMonths = CORPORATE_FILING_GRACE_MONTHS,
): number {
  if (category === "individual") {
    const y = referenceDate.getFullYear();
    const m = referenceDate.getMonth() + 1;
    return m <= INDIVIDUAL_FILING_SEASON_END_MONTH ? y - 1 : y;
  }
  const completed = fiscalEndCalendarYear(referenceDate, fiscalMonth);
  const deadline = filingDeadlineAfterFiscalEnd(
    completed,
    fiscalMonth,
    corporateGraceMonths,
  );
  if (ymdNumber(referenceDate) <= ymdNumber(deadline)) return completed;
  return inProgressFiscalEndCalendarYear(referenceDate, fiscalMonth);
}

export function calendarYearForFiscalMonthSlot(
  month: number,
  fiscalEndYear: number,
  fiscalMonth: number,
): number {
  const fm = clampFiscalMonth(fiscalMonth);
  const m = month >= 1 && month <= 12 ? month : fm;
  return m > fm ? fiscalEndYear - 1 : fiscalEndYear;
}

export type MonthDrumEntry = {
  month: number;
  label: string;
  calendarYear: number;
  fiscalEndYear: number;
};

export const MONTHS_PER_FISCAL_YEAR = 12;

/** 月次ドラム: 決算月を先頭に遡る。fiscalYearCount 事業年度分（前期以降も含む） */
export function buildMonthDrumEntries(
  fiscalMonth = 3,
  referenceDate = new Date(),
  fiscalYearCount = 1,
): MonthDrumEntry[] {
  const fm = clampFiscalMonth(fiscalMonth);
  const latestEndYear = inProgressFiscalEndCalendarYear(referenceDate, fm);
  const count = Math.max(1, fiscalYearCount);
  const entries: MonthDrumEntry[] = [];
  for (let y = 0; y < count; y += 1) {
    const endYear = latestEndYear - y;
    for (let i = 0; i < MONTHS_PER_FISCAL_YEAR; i += 1) {
      const month = ((fm - 1 - i) % 12 + 12) % 12 + 1;
      entries.push({
        month,
        label: `${month}月`,
        calendarYear: calendarYearForFiscalMonthSlot(month, endYear, fm),
        fiscalEndYear: endYear,
      });
    }
  }
  return entries;
}

/** 月次ドラム: 決算月を先頭に、そこから遡る（例: 3月決算 → 3月…4月） */
export function buildMonthDrumLabels(fiscalMonth = 3): string[] {
  return buildMonthDrumEntries(fiscalMonth).map((entry) => entry.label);
}

export function buildMatrixPeriods(
  yearMeta: YearDrumMeta,
  fiscalMonth = 3,
  referenceDate = new Date(),
): PeriodLists {
  const months = buildMonthDrumEntries(fiscalMonth, referenceDate, yearMeta.displayCount);
  return {
    year: yearMeta.labels,
    month: months.map((entry) => entry.label),
    monthCalendarYears: months.map((entry) => entry.calendarYear),
  };
}

/**
 * 自動ジャンプ先の年度ドラム index。
 * 「今の年度」は決算そのものではなく申告シーズン込み:
 * - 法人: 決算日の翌日から2か月以内はその期末年（例: 3月決算 → 5月末まで R8）
 * - 個人: 3月末までは前年分（申告）、4月以降は当年
 */
export function defaultYearPeriodIndex(
  yearMeta: YearDrumMeta,
  referenceDate = new Date(),
  fiscalMonth = 3,
  category: TaxpayerCategory = "corporate",
): number {
  const workingReiwa =
    workingEndCalendarYear(referenceDate, fiscalMonth, category) - 2018;
  const preferred = yearMeta.labels.indexOf(`R${workingReiwa}`);
  if (preferred >= 0) return preferred + FIRST_PERIOD_INDEX;

  const inProgressReiwa =
    inProgressFiscalEndCalendarYear(referenceDate, fiscalMonth) - 2018;
  const inProgressIdx = yearMeta.labels.indexOf(`R${inProgressReiwa}`);
  if (inProgressIdx >= 0) return inProgressIdx + FIRST_PERIOD_INDEX;

  const completedReiwa = currentReiwaYear(referenceDate, fiscalMonth);
  const completedIdx = yearMeta.labels.indexOf(`R${completedReiwa}`);
  if (completedIdx >= 0) return completedIdx + FIRST_PERIOD_INDEX;

  return FIRST_PERIOD_INDEX;
}

/** 今日の暦月を月次ドラム index で返す */
export function defaultMonthPeriodIndex(
  referenceDate = new Date(),
  fiscalMonth = 3,
  fiscalYearCount = 1,
): number {
  const month = referenceDate.getMonth() + 1;
  const year = referenceDate.getFullYear();
  const entries = buildMonthDrumEntries(fiscalMonth, referenceDate, fiscalYearCount);
  const idx = entries.findIndex((entry) => entry.month === month && entry.calendarYear === year);
  return idx >= 0 ? idx + FIRST_PERIOD_INDEX : FIRST_PERIOD_INDEX;
}

/** 前期（古いほう）/ 次期（新しいほう）。月次は12か月単位。OLD には入らない */
export function adjacentFiscalPeriodIndex(
  activePeriodIdx: number,
  activeMode: "year" | "month",
  periods: PeriodLists,
  direction: "previous" | "next",
): number | null {
  const labels = periods[activeMode];
  if (!labels.length) return null;
  const first = FIRST_PERIOD_INDEX;
  let last = first + labels.length - 1;
  if (activeMode === "year") {
    const oldIdx = labels.indexOf(YEAR_OLD_LABEL);
    if (oldIdx >= 0) last = first + oldIdx - 1;
  }
  if (activePeriodIdx < first || activePeriodIdx > last) return null;
  const step = activeMode === "month" ? MONTHS_PER_FISCAL_YEAR : 1;
  const next = direction === "previous" ? activePeriodIdx + step : activePeriodIdx - step;
  if (next < first || next > last) return null;
  return next;
}

export function isOldPeriodKey(periodKey: string): boolean {
  return periodKey === YEAR_OLD_PERIOD_KEY;
}

export function isOldDrumLabel(label: string | null | undefined): boolean {
  return label === YEAR_OLD_LABEL;
}

/**
 * 令和 Rn と決算月 → 事業年度の起算～期末。
 * 例: R7 + 12月決算 → 「2025年1月1日～2025年12月31日」
 * 例: R8 + 3月決算 → 「2025年4月1日～2026年3月31日」
 */
export function fiscalPeriodDateRangeLabel(
  reiwa: number,
  fiscalMonth: number,
): string | null {
  if (!Number.isFinite(reiwa) || reiwa < 1) return null;
  const fm = clampFiscalMonth(fiscalMonth);
  const endYear = Math.trunc(reiwa) + 2018;
  const endDay = lastDayOfMonth(endYear, fm);
  const startYear = fm === 12 ? endYear : endYear - 1;
  const startMonth = fm === 12 ? 1 : fm + 1;
  return `（${startYear}年${startMonth}月1日～${endYear}年${fm}月${endDay}日）`;
}

/** 例: R8 + 3月決算 → 「R8年3月期」 */
export function fiscalPeriodTermLabel(reiwa: number, fiscalMonth: number): string | null {
  if (!Number.isFinite(reiwa) || reiwa < 1) return null;
  const fm = clampFiscalMonth(fiscalMonth);
  return `R${Math.trunc(reiwa)}年${fm}月期`;
}

/**
 * 設立年月日と決算月から「第N期」を求める。
 * 第1期 = 設立日が属する（または直後に終わる）最初の事業年度。
 */
export function fiscalPeriodOrdinalNumber(
  reiwa: number,
  fiscalMonth: number,
  establishedDateRaw: string | null | undefined,
): number | null {
  if (!Number.isFinite(reiwa) || reiwa < 1) return null;
  const established = parseProfileDate(establishedDateRaw);
  if (!established) return null;
  const fm = clampFiscalMonth(fiscalMonth);
  const y = established.getFullYear();
  // 設立日が属する最初の決算期末年 = 第1期の期末年
  const last = lastDayOfMonth(y, fm);
  const endThisYear = new Date(y, fm - 1, last);
  const firstEndYear =
    established.getTime() <= endThisYear.getTime() ? y : y + 1;
  const endYear = Math.trunc(reiwa) + 2018;
  const n = endYear - firstEndYear + 1;
  return n >= 1 ? n : null;
}

export function fiscalPeriodOrdinalLabel(
  reiwa: number,
  fiscalMonth: number,
  establishedDateRaw: string | null | undefined,
): string | null {
  const n = fiscalPeriodOrdinalNumber(reiwa, fiscalMonth, establishedDateRaw);
  return n != null ? `第${n}期` : null;
}

function parseProfileDate(raw: string | null | undefined): Date | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return new Date(y, mo - 1, d);
  }
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  const dt = new Date(t);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** ドラムの R7 / R8… ラベルから令和数字を取る */
export function parseReiwaFromDrumLabel(label: string | null | undefined): number | null {
  if (!label) return null;
  const m = /^R(\d+)$/.exec(label.trim());
  return m ? Number(m[1]) : null;
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
