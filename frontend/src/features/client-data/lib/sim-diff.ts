/** 正規値と表示値が異なるか（シミュレーション上書きの検出） */

import type { ClientChartsPayload } from "@/features/client-data/lib/client-metrics-api";
import type { ValuationInputsPayload } from "@/features/client-data/lib/client-valuation-api";

export function numDiffers(canonical: number, display: number): boolean {
  return canonical !== display;
}

export function chartsHasAnyDiff(
  canonical: ClientChartsPayload,
  display: ClientChartsPayload,
): boolean {
  for (const fy of display.fiscal_years) {
    const c = canonical.fiscal_years.find((x) => x.label === fy.label);
    if (!c) continue;
    if (
      numDiffers(c.revenue_yen, fy.revenue_yen) ||
      numDiffers(c.profit_yen, fy.profit_yen) ||
      numDiffers(c.consumption_taxable_yen ?? 0, fy.consumption_taxable_yen ?? 0)
    ) {
      return true;
    }
  }
  for (const m of display.monthly_sales_index) {
    const c = canonical.monthly_sales_index.find((x) => x.month === m.month);
    if (c && numDiffers(c.index, m.index)) return true;
  }
  return false;
}

export function valuationHasAnyDiff(
  canonical: ValuationInputsPayload,
  display: ValuationInputsPayload,
): boolean {
  return (
    numDiffers(canonical.issued_shares, display.issued_shares) ||
    numDiffers(canonical.capital_yen, display.capital_yen) ||
    numDiffers(canonical.net_assets_yen, display.net_assets_yen) ||
    numDiffers(canonical.annual_profit_yen, display.annual_profit_yen) ||
    numDiffers(canonical.annual_dividend_yen, display.annual_dividend_yen)
  );
}

export function simBarTintClass(differs: boolean, baseClass: string): string {
  if (!differs) return baseClass;
  return `${baseClass} ring-1 ring-amber-300/60`;
}

export function simBarRevenueClass(differs: boolean): string {
  return simBarTintClass(differs, "w-5 rounded-t-md bg-violet-200");
}

export function simBarProfitClass(differs: boolean): string {
  return simBarTintClass(
    differs,
    "w-5 rounded-t-md bg-violet-600",
  );
}

export function simMonthlyBarClass(differs: boolean): string {
  if (!differs) {
    return "w-full max-w-[1.25rem] rounded-t bg-gradient-to-t from-violet-600 to-violet-400";
  }
  return "w-full max-w-[1.25rem] rounded-t bg-gradient-to-t from-amber-500 to-amber-300 ring-1 ring-amber-300/60";
}
