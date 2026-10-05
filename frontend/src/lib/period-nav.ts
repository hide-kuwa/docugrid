/** サイドバー縦ドラムの期間インデックス（0=旧データ〔廃止・永続へ寄せる〕, 1=永続, 2+=決算/月次）。
 * Doc のドラム UI から「データ」行は削除済み。カルテはレールへ集約。
 */


import {
  fiscalPeriodOrdinalLabel,
  fiscalPeriodTermLabel,
  isOldDrumLabel,
  YEAR_OLD_PERIOD_KEY,
  type PeriodLists,
} from "@/lib/fiscal-year-drum";

export const PERIOD_INDEX_DATA = 0;
export const PERIOD_INDEX_PERM = 1;

export function isDataPeriodIndex(idx: number): boolean {
  return idx === PERIOD_INDEX_DATA;
}

export function isPermPeriodIndex(idx: number): boolean {
  return idx === PERIOD_INDEX_PERM;
}

export function isDocumentMatrixPeriodIndex(idx: number): boolean {
  return idx >= PERIOD_INDEX_PERM;
}

/** ドラム index → API / ストレージ用 period_key */
export function periodKeyFromIndex(
  activePeriodIdx: number,
  activeMode: "year" | "month",
  periods?: PeriodLists,
): string {
  if (activePeriodIdx === PERIOD_INDEX_DATA) return "data";
  if (activePeriodIdx === PERIOD_INDEX_PERM) return "perm";
  if (activeMode === "year" && periods) {
    const label = periods.year[activePeriodIdx - 2];
    if (isOldDrumLabel(label)) return YEAR_OLD_PERIOD_KEY;
  }
  return `${activeMode}:${activePeriodIdx - 1}`;
}

/** period_key → ドラム index（mode は year/month キーから更新） */
export function periodIndexFromKey(
  pk: string,
  periods?: PeriodLists,
): { index: number; mode?: "year" | "month" } | null {
  if (pk === "data") return { index: PERIOD_INDEX_DATA };
  if (pk === "perm") return { index: PERIOD_INDEX_PERM };
  if (pk === YEAR_OLD_PERIOD_KEY && periods) {
    const oldIdx = periods.year.indexOf("OLD");
    if (oldIdx >= 0) return { index: oldIdx + 2, mode: "year" };
    return null;
  }
  const [mode, idxStr] = pk.split(":");
  const n = Number(idxStr);
  if ((mode === "year" || mode === "month") && Number.isInteger(n) && n >= 1) {
    return { index: n + 1, mode };
  }
  return null;
}

/** 決算/月次ラベル（R7 など）をドラム index から取得 */
export function periodLabelFromIndex(
  activePeriodIdx: number,
  activeMode: "year" | "month",
  periods: PeriodLists,
): string | null {
  if (activePeriodIdx < 2) return null;
  const list = periods[activeMode];
  return list[activePeriodIdx - 2] ?? null;
}

/** 見出し用。月次は西暦、年度は「R8年3月期」（任意で第N期） */
export function periodHeadingLabel(
  activePeriodIdx: number,
  activeMode: "year" | "month",
  periods: PeriodLists,
  options?: {
    fiscalMonth?: number;
    establishedDate?: string | null;
  },
): string | null {
  const label = periodLabelFromIndex(activePeriodIdx, activeMode, periods);
  if (!label) return null;
  if (isOldDrumLabel(label)) return label;
  if (activeMode === "month") {
    const year = periods.monthCalendarYears?.[activePeriodIdx - 2];
    return typeof year === "number" ? `${year}年${label}` : label;
  }
  const reiwaMatch = /^R(\d+)$/.exec(label);
  if (reiwaMatch) {
    const reiwa = Number(reiwaMatch[1]);
    const fm = options?.fiscalMonth;
    const term =
      typeof fm === "number"
        ? fiscalPeriodTermLabel(reiwa, fm)
        : `${label}（${reiwa + 2018}年）`;
    const ordinal =
      typeof fm === "number"
        ? fiscalPeriodOrdinalLabel(reiwa, fm, options?.establishedDate)
        : null;
    if (term && ordinal) return `${term} ${ordinal}`;
    return term ?? label;
  }
  return label;
}

export function periodDisplayLabelFromKey(
  periodKey: string,
  periods: PeriodLists,
): string {
  if (periodKey === "data") return "データ";
  if (periodKey === "perm") return "永続";
  if (periodKey === YEAR_OLD_PERIOD_KEY) return "OLD";
  const resolved = periodIndexFromKey(periodKey, periods);
  if (!resolved?.mode) return periodKey;
  return periodLabelFromIndex(resolved.index, resolved.mode, periods) ?? periodKey;
}
