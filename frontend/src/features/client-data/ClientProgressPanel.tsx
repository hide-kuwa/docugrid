"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCircle2,
  Circle,
  ListChecks,
  Loader2,
} from "lucide-react";
import type { OrgClient } from "@/config/organization";
import { WipBanner } from "@/components/work-in-progress";
import type { DocumentStatusSummary, PeriodStatus } from "@/features/docugrid/lib/document-status";
import { TaxPaymentCalendarSection } from "@/features/client-data/TaxPaymentCalendarSection";
import { ClientCalendarEventsSection } from "@/features/client-data/ClientCalendarEventsSection";
import { ClientTaxAlertsSection } from "@/features/client-data/ClientTaxAlertsSection";
import type { ClientRecordItem } from "@/features/client-data/lib/client-records-api";

type TaxAlert = {
  id: string;
  severity: "urgent" | "warning" | "info";
  title: string;
  body: string;
  dueLabel?: string;
};

type Milestone = {
  id: string;
  label: string;
  status: "done" | "active" | "pending";
  note?: string;
};

function filingDeadlineLabel(fiscalMonth: number): string {
  const filingMonth = ((fiscalMonth + 1) % 12) + 1;
  return `${filingMonth}月頃（${fiscalMonth}月決算・2ヶ月以内想定）`;
}

function buildTaxAlerts(
  client: OrgClient,
  docStatus: DocumentStatusSummary | null,
  manualAlerts: ClientRecordItem[],
): TaxAlert[] {
  const alerts: TaxAlert[] = [];

  for (const item of manualAlerts) {
    const severity = (item.meta?.severity as TaxAlert["severity"]) || "info";
    alerts.push({
      id: item.id,
      severity,
      title: item.title || "税務アラート",
      body: item.body,
      dueLabel: typeof item.meta?.due_label === "string" ? item.meta.due_label : undefined,
    });
  }

  const taxPeriods = (docStatus?.periods ?? []).filter((p) => p.period_key.startsWith("year:"));
  for (const period of taxPeriods) {
    const taxMissing = period.missing.filter(
      (label) =>
        label.includes("法人税") ||
        label.includes("消費税") ||
        label.includes("申告"),
    );
    if (taxMissing.length > 0) {
      alerts.push({
        id: `missing-${period.period_key}`,
        severity: "urgent",
        title: `申告資料の不足（${period.period_key.replace("year:", "R")}相当）`,
        body: taxMissing.join("、"),
        dueLabel: filingDeadlineLabel(client.fiscalMonth),
      });
    }

    const pending = period.pending_approval ?? [];
    if (pending.length > 0) {
      alerts.push({
        id: `approval-${period.period_key}`,
        severity: "warning",
        title: "承認待ちの申告関連資料",
        body: pending.join("、"),
      });
    }
  }

  if (client.profile?.consumption_tax?.trim()) {
    alerts.push({
      id: "consumption-election",
      severity: "info",
      title: "消費税区分の確認",
      body: client.profile.consumption_tax.slice(0, 120),
      dueLabel: "届出期限を要確認",
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: "no-urgent",
      severity: "info",
      title: "直近の税務アラートはありません",
      body: "申告期限・資料不足はここに表示されます。設定の通知アラート連携は工事中です。",
      dueLabel: filingDeadlineLabel(client.fiscalMonth),
    });
  }

  return alerts;
}

function buildMilestones(client: OrgClient, periods: PeriodStatus[]): Milestone[] {
  const latestYear = periods.find((p) => p.period_key === "year:1");
  const filled = latestYear?.filled_count ?? 0;
  const required = latestYear?.required_count ?? 1;
  const ratio = required > 0 ? filled / required : 0;

  return [
    {
      id: "collect",
      label: "資料回収",
      status: ratio >= 1 ? "done" : ratio > 0.3 ? "active" : "pending",
      note: latestYear ? `${filled}/${required} 枠` : undefined,
    },
    {
      id: "draft",
      label: "申告書ドラフト",
      status: ratio >= 1 ? "active" : "pending",
    },
    {
      id: "review",
      label: "レビュー・承認",
      status: (latestYear?.pending_approval?.length ?? 0) > 0 ? "active" : "pending",
    },
    {
      id: "file",
      label: "電子申告",
      status: latestYear?.approved_complete ? "done" : "pending",
      note: filingDeadlineLabel(client.fiscalMonth),
    },
  ];
}

const SEVERITY_STYLE = {
  urgent: "border-red-200 bg-red-50 text-red-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-blue-200 bg-blue-50 text-blue-900",
} as const;

type Props = {
  client: OrgClient;
  canEdit?: boolean;
  docStatus?: DocumentStatusSummary | null;
  docStatusLoading?: boolean;
};

export function ClientProgressPanel({
  client,
  canEdit,
  docStatus,
  docStatusLoading,
}: Props) {
  const [manualAlerts, setManualAlerts] = useState<ClientRecordItem[]>([]);

  const periods = docStatus?.periods ?? [];
  const yearPeriod = periods.find((p) => p.period_key === "year:1");
  const permPeriod = periods.find((p) => p.period_key === "perm");

  const fillPercent = yearPeriod
    ? Math.round((yearPeriod.filled_count / Math.max(yearPeriod.required_count, 1)) * 100)
    : null;

  const alerts = useMemo(
    () => buildTaxAlerts(client, docStatus ?? null, manualAlerts),
    [client, docStatus, manualAlerts],
  );
  const milestones = useMemo(() => buildMilestones(client, periods), [client, periods]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-50 p-4 md:p-6">
      <header className="mb-6">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-violet-600">
          <ListChecks className="h-3.5 w-3.5" />
          PROGRESS
        </div>
        <h2 className="mt-1 text-lg font-black text-slate-800">{client.name} — 進捗・税務アラート</h2>
        <p className="mt-1 text-sm text-slate-500">
          申告サイクルの進捗と税務アラート。資料充足率はマトリクス上のスロットから自動集計（手入力不可）。
        </p>
      </header>

      {docStatusLoading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          進捗を読み込み中…
        </div>
      ) : (
        <div className="mx-auto w-full max-w-6xl space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryCard
              label="マトリクス資料充足率"
              value={fillPercent != null ? `${fillPercent}%` : "—"}
              sub={
                yearPeriod
                  ? `${yearPeriod.filled_count} / ${yearPeriod.required_count} スロット（year:1）`
                  : "マトリクス未連携"
              }
            />
            <SummaryCard
              label="不足資料"
              value={String(docStatus?.missing_total ?? yearPeriod?.missing.length ?? 0)}
              sub="全期間合計"
              accent="rose"
            />
            <SummaryCard
              label="承認待ち"
              value={String(docStatus?.pending_approval_total ?? 0)}
              sub="レビュー待ち"
              accent="amber"
            />
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <CalendarClock className="h-4 w-4 text-violet-600" />
              申告サイクル
            </h3>
            <ol className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              {milestones.map((step, idx) => (
                <li key={step.id} className="flex min-w-0 flex-1 items-start gap-2 sm:flex-col sm:items-center">
                  <div className="flex items-center gap-2 sm:flex-col">
                    {step.status === "done" ? (
                      <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                    ) : step.status === "active" ? (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-violet-500 bg-violet-50 text-[10px] font-black text-violet-700">
                        {idx + 1}
                      </span>
                    ) : (
                      <Circle className="h-6 w-6 text-slate-300" />
                    )}
                    <span className="text-xs font-bold text-slate-700">{step.label}</span>
                  </div>
                  {step.note ? (
                    <span className="text-[10px] text-slate-400 sm:text-center">{step.note}</span>
                  ) : null}
                </li>
              ))}
            </ol>
            {permPeriod && !permPeriod.complete ? (
              <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                永続資料: {permPeriod.filled_count}/{permPeriod.required_count} 枠
                {permPeriod.missing.length > 0 ? `（不足: ${permPeriod.missing.join("、")}）` : ""}
              </p>
            ) : null}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-700">
              <Bell className="h-4 w-4 text-red-500" />
              税務アラート
            </h3>
            <WipBanner
              kind="partial"
              title="自動アラート + 手動登録"
              message="資料不足・承認待ちはマトリクスから自動表示。設定の「通知・アラート」連携は工事中です。"
              className="mt-3"
            />
            <ul className="mt-4 space-y-3">
              {alerts.map((alert) => (
                <li
                  key={alert.id}
                  className={`rounded-xl border px-4 py-3 ${SEVERITY_STYLE[alert.severity]}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      {alert.severity === "urgent" ? (
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      ) : null}
                      <div>
                        <p className="text-sm font-bold">{alert.title}</p>
                        <p className="mt-1 text-xs leading-relaxed opacity-90">{alert.body}</p>
                      </div>
                    </div>
                    {alert.dueLabel ? (
                      <span className="shrink-0 rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-bold">
                        {alert.dueLabel}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <ClientTaxAlertsSection
            client={client}
            canEdit={canEdit}
            onRecordsChange={setManualAlerts}
          />

          <TaxPaymentCalendarSection client={client} />
          <ClientCalendarEventsSection clientId={client.id} canEdit={canEdit} />
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: "rose" | "amber";
}) {
  const valueClass =
    accent === "rose"
      ? "text-red-600"
      : accent === "amber"
        ? "text-amber-700"
        : "text-violet-700";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-bold text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-black tabular-nums ${valueClass}`}>{value}</p>
      <p className="mt-0.5 text-[10px] text-slate-400">{sub}</p>
    </div>
  );
}
