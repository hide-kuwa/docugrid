/** サイドバー縦ドラムの期間インデックス（0=データ, 1=永続, 2+=決算/月次）。 */

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
): string {
  if (activePeriodIdx === PERIOD_INDEX_DATA) return "data";
  if (activePeriodIdx === PERIOD_INDEX_PERM) return "perm";
  return `${activeMode}:${activePeriodIdx - 1}`;
}

/** period_key → ドラム index（mode は year/month キーから更新） */
export function periodIndexFromKey(
  pk: string,
): { index: number; mode?: "year" | "month" } | null {
  if (pk === "data") return { index: PERIOD_INDEX_DATA };
  if (pk === "perm") return { index: PERIOD_INDEX_PERM };
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
