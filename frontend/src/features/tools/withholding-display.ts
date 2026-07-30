import type { WithholdingTable } from "@/lib/taxx-tools-api";

export type WithholdingDisplayRow = {
  min: number;
  max: number | null;
  kou: number[];
  otsu: number;
  /** 740,000円以上の限界税率帯 */
  isHighBand: boolean;
};

function floorYen(value: number): number {
  return Math.max(0, Math.floor(value));
}

function highOtsuAt(
  bands: NonNullable<WithholdingTable["high_income_otsu"]>,
  salary: number,
): number {
  let chosen: (typeof bands)[number] | null = null;
  for (const band of bands) {
    if (band.min <= salary && (chosen == null || band.min > chosen.min)) {
      chosen = band;
    }
  }
  if (!chosen) return 0;
  const over = chosen.over ?? chosen.min;
  return floorYen(chosen.base + (salary - over) * chosen.rate);
}

/** 通常行＋高額帯ブレークポイントを1本の表用データにまとめる。 */
export function buildWithholdingDisplayRows(table: WithholdingTable): WithholdingDisplayRow[] {
  const regular: WithholdingDisplayRow[] = table.rows.map((r) => ({
    min: r.min,
    max: r.max,
    kou: r.kou,
    otsu: r.otsu,
    isHighBand: false,
  }));

  const hiKou = table.high_income_kou ?? [];
  if (!hiKou.length) return regular;

  const hiOtsu = table.high_income_otsu ?? [];
  const high: WithholdingDisplayRow[] = hiKou.map((band, i) => ({
    min: band.min,
    max: hiKou[i + 1]?.min ?? null,
    kou: band.kou,
    otsu: hiOtsu.length ? highOtsuAt(hiOtsu, band.min) : 0,
    isHighBand: true,
  }));

  return [...regular, ...high];
}

/** 月額が該当する行の min（ハイライト・スクロール用）。 */
export function matchWithholdingRowMin(table: WithholdingTable, salary: number): number | null {
  const dense = table.rows.find((r) => r.min <= salary && salary < r.max);
  if (dense) return dense.min;

  const bands = table.high_income_kou ?? [];
  if (!bands.length || salary < bands[0].min) return null;

  let chosen = bands[0];
  for (const band of bands) {
    if (band.min <= salary && band.min >= chosen.min) chosen = band;
  }
  return chosen.min;
}

export function withholdingKouColIndex(table: WithholdingTable, dependents: number): number {
  return Math.min(Math.max(0, dependents), table.columns.length - 1);
}

/** 報酬月額から協会けんぽ等級（健保）を特定。 */
export function matchSocialGrade(
  rows: { grade_health?: number | string | null; remuneration_min?: number | null; remuneration_max?: number | null }[],
  monthly: number,
): number | null {
  const row = rows.find((r) => {
    const lo = r.remuneration_min == null ? -Infinity : Number(r.remuneration_min);
    const hi = r.remuneration_max == null ? Infinity : Number(r.remuneration_max);
    return monthly >= lo && monthly < hi;
  });
  if (row?.grade_health == null) return null;
  return Number(row.grade_health);
}
