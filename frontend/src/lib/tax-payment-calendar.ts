import type { OrgClient } from "@/config/organization";

export type TaxCalendarCategory =
  | "corporate"
  | "consumption"
  | "withholding"
  | "local"
  | "interim"
  | "statutory"
  | "other";

export type TaxCalendarEvent = {
  id: string;
  date: string;
  title: string;
  category: TaxCalendarCategory;
  description: string;
};

export const TAX_CALENDAR_CATEGORY_LABEL: Record<TaxCalendarCategory, string> = {
  corporate: "法人税",
  consumption: "消費税",
  withholding: "源泉税",
  local: "地方税",
  interim: "中間申告",
  statutory: "法定調書",
  other: "その他",
};

const CATEGORY_STYLE: Record<TaxCalendarCategory, string> = {
  corporate: "bg-violet-100 text-violet-800",
  consumption: "bg-blue-100 text-blue-800",
  withholding: "bg-slate-100 text-slate-700",
  local: "bg-emerald-100 text-emerald-800",
  interim: "bg-amber-100 text-amber-800",
  statutory: "bg-rose-100 text-rose-800",
  other: "bg-slate-100 text-slate-600",
};

export function taxCalendarCategoryClass(category: TaxCalendarCategory): string {
  return CATEGORY_STYLE[category];
}

function lastDayOfMonth(year: number, month: number): Date {
  return new Date(year, month, 0);
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function pushEvent(
  events: TaxCalendarEvent[],
  date: Date,
  title: string,
  category: TaxCalendarCategory,
  description: string,
  idSuffix: string,
) {
  events.push({
    id: `${toIsoDate(date)}-${idSuffix}`,
    date: toIsoDate(date),
    title,
    category,
    description,
  });
}

function hasConsumptionTax(client: OrgClient): boolean {
  const raw = (client.profile?.consumption_tax ?? "").toLowerCase();
  if (!raw.trim()) return true;
  return !raw.includes("免税") && !raw.includes("課税事業者でない");
}

/** 決算月・顧客プロフィールから先の納税・申告カレンダーを生成（簡易試算）。 */
export function buildTaxPaymentCalendar(
  client: OrgClient,
  fromDate: Date = new Date(),
  monthsAhead = 18,
): TaxCalendarEvent[] {
  const fiscalMonth = client.fiscalMonth;
  if (!fiscalMonth || fiscalMonth < 1 || fiscalMonth > 12) return [];

  const events: TaxCalendarEvent[] = [];
  const horizon = addMonths(fromDate, monthsAhead);
  const startYear = fromDate.getFullYear() - 1;

  for (let y = startYear; y <= startYear + 3; y++) {
    const fyEnd = lastDayOfMonth(y, fiscalMonth);
    const filingDue = addMonths(fyEnd, 2);
    const interimMonth = ((fiscalMonth + 7) % 12) + 1;
    const interimDue = lastDayOfMonth(
      interimMonth > fiscalMonth ? y : y + 1,
      interimMonth,
    );

    pushEvent(
      events,
      fyEnd,
      "決算日",
      "other",
      `${y}年${fiscalMonth}月期の決算日`,
      `fy-end-${y}`,
    );
    pushEvent(
      events,
      filingDue,
      "法人税申告・納付期限",
      "corporate",
      "確定申告書の提出・法人税等の納付（2ヶ月以内・電子申告延長は別途）",
      `corp-file-${y}`,
    );
    pushEvent(
      events,
      filingDue,
      "地方法人税・事業税・住民税",
      "local",
      "法人税申告と同時期に申告・納付する地方税",
      `local-${y}`,
    );

    if (hasConsumptionTax(client)) {
      pushEvent(
        events,
        filingDue,
        "消費税申告・納付期限",
        "consumption",
        "本則 / 簡易課税の確定申告・納付",
        `consumption-${y}`,
      );
    }

    pushEvent(
      events,
      interimDue,
      "法人税中間申告・納付",
      "interim",
      "中間申告対象の場合（概算・見込納付）",
      `interim-${y}`,
    );
  }

  let cursor = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
  while (cursor <= horizon) {
    const due = new Date(cursor.getFullYear(), cursor.getMonth(), 10);
    if (due >= fromDate) {
      pushEvent(
        events,
        due,
        "源泉所得税納付",
        "withholding",
        `${due.getMonth() + 1}月10日までに前月分を納付`,
        `withholding-${toIsoDate(due)}`,
      );
    }
    cursor = addMonths(cursor, 1);
  }

  for (let y = fromDate.getFullYear(); y <= horizon.getFullYear() + 1; y++) {
    const statutory = new Date(y, 0, 31);
    if (statutory >= fromDate && statutory <= horizon) {
      pushEvent(
        events,
        statutory,
        "法定調書合計表の提出",
        "statutory",
        "給与・報酬等の法定調書合計表（1月31日まで）",
        `statutory-${y}`,
      );
    }
  }

  const fromIso = toIsoDate(fromDate);
  const horizonIso = toIsoDate(horizon);

  return events
    .filter((e) => e.date >= fromIso && e.date <= horizonIso)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function formatCalendarDate(iso: string): string {
  try {
    const d = new Date(`${iso}T00:00:00`);
    return d.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
    });
  } catch {
    return iso;
  }
}

export function daysUntil(iso: string, from: Date = new Date()): number {
  const target = new Date(`${iso}T00:00:00`);
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}
