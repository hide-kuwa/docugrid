"use client";

import { useMemo } from "react";
import { CalendarDays } from "lucide-react";
import type { OrgClient } from "@/config/organization";
import { WipBadge, WipBanner } from "@/components/work-in-progress";
import {
  buildTaxPaymentCalendar,
  daysUntil,
  formatCalendarDate,
  taxCalendarCategoryClass,
  TAX_CALENDAR_CATEGORY_LABEL,
  type TaxCalendarEvent,
} from "@/lib/tax-payment-calendar";

type Props = {
  client: OrgClient;
};

function groupByMonth(events: TaxCalendarEvent[]): [string, TaxCalendarEvent[]][] {
  const map = new Map<string, TaxCalendarEvent[]>();
  for (const event of events) {
    const key = event.date.slice(0, 7);
    const list = map.get(key) ?? [];
    list.push(event);
    map.set(key, list);
  }
  return [...map.entries()];
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y}年${Number(m)}月`;
}

export function TaxPaymentCalendarSection({ client }: Props) {
  const events = useMemo(() => buildTaxPaymentCalendar(client), [client]);
  const grouped = useMemo(() => groupByMonth(events), [events]);
  const nextEvent = events[0];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-700">
          <CalendarDays className="h-4 w-4 text-violet-600" />
          納税カレンダー（今後）
          <WipBadge kind="partial" />
        </h3>
        {nextEvent ? (
          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-bold text-violet-700">
            次の予定: {daysUntil(nextEvent.date)}日後 — {nextEvent.title}
          </span>
        ) : null}
      </div>
      <WipBanner
        kind="partial"
        title="納税カレンダー（参照用）"
        message={`${client.fiscalMonth}月決算から自動生成した予定日です。e-Tax・銀行・会計ソフトとの連携は未実装です。`}
        className="mt-3"
      />

      {events.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">カレンダーを生成できません（決算月を確認してください）</p>
      ) : (
        <div className="mt-4 space-y-5">
          {grouped.map(([ym, monthEvents]) => (
            <div key={ym}>
              <h4 className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                {monthLabel(ym)}
              </h4>
              <ul className="space-y-2">
                {monthEvents.map((event) => {
                  const days = daysUntil(event.date);
                  const urgency =
                    days <= 14
                      ? "border-red-200 bg-red-50/50"
                      : days <= 45
                        ? "border-amber-200 bg-amber-50/40"
                        : "border-slate-100 bg-slate-50/50";

                  return (
                    <li
                      key={event.id}
                      className={`flex flex-wrap items-start gap-3 rounded-xl border px-3 py-2.5 ${urgency}`}
                    >
                      <div className="min-w-[5.5rem] shrink-0">
                        <p className="text-[10px] font-bold text-slate-500">
                          {formatCalendarDate(event.date)}
                        </p>
                        <p className="text-[10px] tabular-nums text-slate-400">
                          {days === 0 ? "今日" : days > 0 ? `あと${days}日` : `${Math.abs(days)}日前`}
                        </p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${taxCalendarCategoryClass(event.category)}`}
                          >
                            {TAX_CALENDAR_CATEGORY_LABEL[event.category]}
                          </span>
                          <span className="text-sm font-bold text-slate-800">{event.title}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">
                          {event.description}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
