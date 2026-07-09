import {
  periodIndexFromKey,
  periodLabelFromIndex,
} from "@/lib/period-nav";
import {
  isOldDrumLabel,
  isOldPeriodKey,
  reiwaFromYearPeriodKey,
  YEAR_OLD_LABEL,
  type YearDrumMeta,
} from "@/lib/fiscal-year-drum";

export type FiscalPeriodDisplay = {
  headline: string;
  subline?: string;
};

type PeriodLists = { year: string[]; month: string[] };

export type HistorySlotItem = {
  id: string;
  period_key: string;
  uploaded_at: string;
};

function reiwaYearFromRLabel(rLabel: string): number | null {
  const m = /^R(\d+)$/.exec(rLabel.trim());
  return m ? Number(m[1]) : null;
}

function calendarYearToReiwa(calendarYear: number): number {
  return calendarYear - 2018;
}

function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function isOpaqueYearKey(periodKey: string): boolean {
  if (periodKey === "data" || periodKey === "perm") return false;
  if (!periodKey.startsWith("year:")) return true;
  const suffix = periodKey.slice("year:".length);
  return !/^\d+$/.test(suffix);
}

export function inferFiscalPeriodFromUpload(
  uploadedAt: string,
  fiscalMonth: number,
): FiscalPeriodDisplay {
  const d = new Date(uploadedAt);
  if (Number.isNaN(d.getTime()) || fiscalMonth < 1 || fiscalMonth > 12) {
    return { headline: `${fiscalMonth}月決算`, subline: "期間未特定" };
  }
  const calYear = d.getFullYear();
  const calMonth = d.getMonth() + 1;
  const endCalYear = calMonth > fiscalMonth ? calYear : calYear - 1;
  const reiwa = calendarYearToReiwa(endCalYear);
  return {
    headline: `令和${reiwa}年${fiscalMonth}月期`,
    subline: formatShortDate(uploadedAt),
  };
}

function headlineFromRLabel(rLabel: string, fiscalMonth: number): FiscalPeriodDisplay {
  const reiwa = reiwaYearFromRLabel(rLabel);
  if (reiwa !== null) {
    return {
      headline: `令和${reiwa}年${fiscalMonth}月期`,
      subline: rLabel,
    };
  }
  return { headline: rLabel, subline: `${fiscalMonth}月決算` };
}

function reiwaYearForItem(
  item: HistorySlotItem,
  fiscalMonth: number,
  periods: PeriodLists,
  yearMeta?: YearDrumMeta,
): number | null {
  if (isOldPeriodKey(item.period_key)) return null;

  if (yearMeta) {
    const fromKey = reiwaFromYearPeriodKey(item.period_key, yearMeta);
    if (fromKey !== null) return fromKey;
  }

  const resolved = periodIndexFromKey(item.period_key, periods);
  if (resolved?.mode === "year") {
    const label = periodLabelFromIndex(resolved.index, "year", periods);
    if (label && !isOldDrumLabel(label)) return reiwaYearFromRLabel(label);
  }
  if (item.period_key.startsWith("year:") && item.uploaded_at) {
    const inf = inferFiscalPeriodFromUpload(item.uploaded_at, fiscalMonth);
    const m = /令和(\d+)年/.exec(inf.headline);
    if (m) return Number(m[1]);
  }
  return null;
}

export function inferReiwaYearForSlotItem(
  item: HistorySlotItem,
  fiscalMonth: number,
  periods: PeriodLists,
  yearMeta?: YearDrumMeta,
): number | null {
  return reiwaYearForItem(item, fiscalMonth, periods, yearMeta);
}

/** 書類別ビュー: 年度ごとに最新1件 · 新しい年度順（R8→R7…） */
export function arrangeDocumentHistory<T extends HistorySlotItem>(
  items: T[],
  periodMode: "year" | "month",
  fiscalMonth: number,
  periods: PeriodLists,
  yearMeta?: YearDrumMeta,
): T[] {
  const eligible = items.filter(
    (item) =>
      item.period_key !== "perm" &&
      item.period_key !== "data" &&
      (periodMode === "year"
        ? item.period_key.startsWith("year:")
        : item.period_key.startsWith("month:")),
  );

  if (periodMode === "year") {
    const byYear = new Map<number, T>();
    const ungrouped: T[] = [];

    for (const item of eligible) {
      const reiwa = reiwaYearForItem(item, fiscalMonth, periods, yearMeta);
      if (reiwa === null) {
        ungrouped.push(item);
        continue;
      }
      const prev = byYear.get(reiwa);
      if (!prev || item.uploaded_at.localeCompare(prev.uploaded_at) > 0) {
        byYear.set(reiwa, item);
      }
    }

    const sortedYears = Array.from(byYear.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([, item]) => item);

    const byOpaqueKey = new Map<string, T>();
    for (const item of ungrouped) {
      const prev = byOpaqueKey.get(item.period_key);
      if (!prev || item.uploaded_at.localeCompare(prev.uploaded_at) > 0) {
        byOpaqueKey.set(item.period_key, item);
      }
    }

    return [...sortedYears, ...Array.from(byOpaqueKey.values())];
  }

  const byMonth = new Map<number, T>();
  for (const item of eligible) {
    const monthMatch = /^month:(\d+)$/.exec(item.period_key);
    if (!monthMatch) continue;
    const monthNum = Number(monthMatch[1]);
    if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) continue;
    const prev = byMonth.get(monthNum);
    if (!prev || item.uploaded_at.localeCompare(prev.uploaded_at) > 0) {
      byMonth.set(monthNum, item);
    }
  }

  return Array.from(byMonth.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, item]) => item);
}

export function formatFiscalPeriodDisplay(
  periodKey: string,
  fiscalMonth: number,
  periods: PeriodLists,
  uploadedAt?: string,
  periodMode: "year" | "month" = "year",
  yearMeta?: YearDrumMeta,
): FiscalPeriodDisplay {
  if (periodKey === "data") {
    return { headline: "顧客データ", subline: "DATA" };
  }
  if (periodKey === "perm") {
    return { headline: "永久保存", subline: "PERMANENT" };
  }
  if (isOldPeriodKey(periodKey)) {
    return { headline: "旧年度（まとめ）", subline: YEAR_OLD_LABEL };
  }

  const resolved = periodIndexFromKey(periodKey, periods);
  if (resolved?.mode) {
    const rOrMonth = periodLabelFromIndex(resolved.index, resolved.mode, periods);
    if (resolved.mode === "year" && rOrMonth) {
      if (isOldDrumLabel(rOrMonth)) {
        return { headline: "旧年度（まとめ）", subline: YEAR_OLD_LABEL };
      }
      return headlineFromRLabel(rOrMonth, fiscalMonth);
    }
    if (resolved.mode === "month" && rOrMonth) {
      const currentReiwa =
        yearMeta?.latestReiwa ?? reiwaYearFromRLabel(periods.year[0] ?? "") ?? 7;
      return {
        headline: `令和${currentReiwa}年 ${rOrMonth}`,
        subline: "月次",
      };
    }
    if (resolved.mode === "year" && uploadedAt) {
      return inferFiscalPeriodFromUpload(uploadedAt, fiscalMonth);
    }
  }

  if (isOpaqueYearKey(periodKey) && uploadedAt) {
    return inferFiscalPeriodFromUpload(uploadedAt, fiscalMonth);
  }

  const yearMatch = /^year:(\d+)$/.exec(periodKey);
  if (yearMatch && yearMeta) {
    const reiwa = reiwaFromYearPeriodKey(periodKey, yearMeta);
    if (reiwa !== null) {
      return headlineFromRLabel(`R${reiwa}`, fiscalMonth);
    }
  }
  if (yearMatch && uploadedAt && periodMode === "year") {
    return inferFiscalPeriodFromUpload(uploadedAt, fiscalMonth);
  }

  return {
    headline: periodMode === "month" ? periodKey : `${fiscalMonth}月決算`,
    subline: periodKey,
  };
}
