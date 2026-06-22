"use client";

import { useMemo } from "react";
import { CalendarClock } from "lucide-react";
import type { OrgClient } from "@/config/organization";
import {
  buildTaxPaymentCalendar,
  daysUntil,
  formatCalendarDate,
  taxCalendarCategoryClass,
  TAX_CALENDAR_CATEGORY_LABEL,
} from "@/lib/tax-payment-calendar";

type Props = {
  clients: OrgClient[];
  maxItems?: number;
  horizonDays?: number;
};

export function DeadlineAlertsWidget({
  clients,
  maxItems = 8,
  horizonDays = 90,
}: Props) {
  const events = useMemo(() => {
    const today = new Date();
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + horizonDays);
    const merged = clients.flatMap((client) =>
      buildTaxPaymentCalendar(client).map((event) => ({
        ...event,
        clientName: client.name,
        clientId: client.id,
      })),
    );
    return merged
      .filter((e) => {
        const d = new Date(e.date);
        return d >= today && d <= horizon;
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, maxItems);
  }, [clients, horizonDays, maxItems]);

  if (events.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        直近 {horizonDays} 日以内の納税予定はありません。
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {events.map((event) => {
        const days = daysUntil(event.date);
        const urgency =
          days <= 14
            ? "border-red-200 bg-red-50/60"
            : days <= 45
              ? "border-amber-200 bg-amber-50/50"
              : "border-slate-200 bg-slate-50/50";
        return (
          <li
            key={`${event.clientId}-${event.id}`}
            className={`rounded-lg border px-3 py-2 ${urgency}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <CalendarClock className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-xs font-bold text-slate-800">{event.clientName}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${taxCalendarCategoryClass(event.category)}`}
              >
                {TAX_CALENDAR_CATEGORY_LABEL[event.category]}
              </span>
              <span className="text-[10px] text-slate-500">
                {formatCalendarDate(event.date)} · あと {days} 日
              </span>
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-800">{event.title}</p>
          </li>
        );
      })}
    </ul>
  );
}
