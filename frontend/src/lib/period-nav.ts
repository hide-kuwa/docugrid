/** サイドバー縦ドラムの期間インデックス（0=データ, 1=永続, 2+=決算/月次）。 */

import { isOldDrumLabel, YEAR_OLD_PERIOD_KEY } from "@/lib/fiscal-year-drum";

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
  periods?: { year: string[]; month: string[] },
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
  periods?: { year: string[]; month: string[] },
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
  periods: { year: string[]; month: string[] },
): string | null {
  if (activePeriodIdx < 2) return null;
  const list = periods[activeMode];
  return list[activePeriodIdx - 2] ?? null;
}

/** period_key を表示用ラベルに変換（R7 / データ / 永続 など） */
export function periodDisplayLabelFromKey(
  periodKey: string,
  periods: { year: string[]; month: string[] },
): string {
  if (periodKey === "data") return "データ";
  if (periodKey === "perm") return "永続";
  if (periodKey === YEAR_OLD_PERIOD_KEY) return "OLD";
  const resolved = periodIndexFromKey(periodKey, periods);
  if (!resolved?.mode) return periodKey;
  return periodLabelFromIndex(resolved.index, resolved.mode, periods) ?? periodKey;
}
