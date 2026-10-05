"use client";

import { useState, type ReactNode } from "react";
import { Database } from "lucide-react";
import { AuditActionLegend } from "@/features/audit/components/AuditApprovalBadge";
import { AuditCheckToggle } from "@/features/audit/components/AuditCheckToggle";
import { MetricFiscalAuditActions } from "@/features/audit/components/MetricFiscalAuditActions";
import { metricAuditLabel } from "@/features/audit/lib/metric-audit-labels";
import {
  monthlyRevenuePendingKey,
  useMetricAuditTrigger,
} from "@/features/audit/hooks/use-metric-audit-trigger";
import { SsotEditToolbar } from "@/features/client-data/components/SsotEditToolbar";
import { useSsotEditSession } from "@/features/client-data/hooks/use-ssot-edit-session";
import {
  upsertClientMetricFact,
  type ClientChartsPayload,
} from "@/features/client-data/lib/client-metrics-api";

type Props = {
  clientId: string;
  canonical: ClientChartsPayload;
  canEdit?: boolean;
  onUpdated: () => void;
  onOpenMetricVouch?: (metricKey: string, valueYen: number) => void;
};

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs tabular-nums text-slate-800 placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-600";

/** 正規 client_metrics の手動編集（シミュレーションとは別） */
export function CanonicalChartsMetricsEditor({
  clientId,
  canonical,
  canEdit,
  onUpdated,
  onOpenMetricVouch,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const edit = useSsotEditSession(canonical);
  const { pendingMetricKey, trigger, isStamped } = useMetricAuditTrigger(onOpenMetricVouch);

  const handleCommit = async () => {
    setSaving(true);
    setError(null);
    const d = edit.draft;
    try {
      const tasks: Promise<unknown>[] = [];
      for (const fy of d.fiscal_years) {
        tasks.push(
          upsertClientMetricFact(clientId, {
            metric_key: "annual.revenue",
            period_key: fy.label,
            value_yen: fy.revenue_yen,
          }),
        );
        tasks.push(
          upsertClientMetricFact(clientId, {
            metric_key: "annual.profit",
            period_key: fy.label,
            value_yen: fy.profit_yen,
          }),
        );
        if ((fy.consumption_taxable_yen ?? 0) > 0) {
          tasks.push(
            upsertClientMetricFact(clientId, {
              metric_key: "annual.consumption_taxable",
              period_key: fy.label,
              value_yen: fy.consumption_taxable_yen,
            }),
          );
        }
      }
      for (const m of d.monthly_sales_index) {
        tasks.push(
          upsertClientMetricFact(clientId, {
            metric_key: "monthly.sales_index",
            period_key: `M${String(m.month).padStart(2, "0")}`,
            value_num: m.index,
          }),
        );
      }
      for (const m of d.monthly_revenue_yen ?? []) {
        tasks.push(
          upsertClientMetricFact(clientId, {
            metric_key: "monthly.revenue",
            period_key: `M${String(m.month).padStart(2, "0")}`,
            value_yen: m.revenue_yen,
          }),
        );
      }
      await Promise.all(tasks);
      onUpdated();
      edit.finishEdit();
    } catch {
      setError("正規指標の保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const patchFiscal = (
    label: string,
    field: "revenue_yen" | "profit_yen" | "consumption_taxable_yen",
    n: number,
  ) => {
    edit.patchDraft((prev) => ({
      ...prev,
      fiscal_years: prev.fiscal_years.map((fy) =>
        fy.label === label ? { ...fy, [field]: n } : fy,
      ),
    }));
  };

  const patchMonthly = (month: number, n: number) => {
    edit.patchDraft((prev) => ({
      ...prev,
      monthly_sales_index: prev.monthly_sales_index.map((m) =>
        m.month === month ? { ...m, index: n } : m,
      ),
    }));
  };

  const patchMonthlyRevenue = (month: number, yen: number) => {
    edit.patchDraft((prev) => ({
      ...prev,
      monthly_revenue_yen: (prev.monthly_revenue_yen ?? []).map((m) =>
        m.month === month ? { ...m, revenue_yen: yen } : m,
      ),
    }));
  };

  const data = edit.isEditing ? edit.draft : edit.value;
  const monthlyRevenue = data.monthly_revenue_yen ?? [];
  const showAudit = Boolean(onOpenMetricVouch) && !edit.isEditing;
  const hasAnyFiscalValue = data.fiscal_years.some(
    (fy) =>
      (fy.revenue_yen ?? 0) > 0 ||
      (fy.profit_yen ?? 0) > 0 ||
      (fy.consumption_taxable_yen ?? 0) > 0,
  );
  const hasAnyMonthlyRevenue = monthlyRevenue.some((m) => (m.revenue_yen ?? 0) > 0);
  const showLegend = showAudit && (hasAnyFiscalValue || hasAnyMonthlyRevenue);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Database className="h-4 w-4 shrink-0 text-slate-500" />
            正規指標（client_metrics）
          </h3>
          <p className="mt-1 text-[10px] text-slate-500">
            SSOT の実数値。「変更」→「決定」で保存します（シミュレーションとは別）。
          </p>
        </div>
        <SsotEditToolbar
          isEditing={edit.isEditing}
          canEdit={canEdit}
          saving={saving}
          onStart={() => edit.startEdit()}
          onCommit={() => void handleCommit()}
          onCancel={edit.cancelEdit}
        />
      </div>

      {error ? (
        <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      ) : null}

      {showLegend ? <AuditActionLegend className="mt-3" /> : null}

      {/* 1. 年次 — 単独ブロック（監査ボタンが月次へはみ出さない） */}
      <div className="mt-4">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          直近3期（円）
        </p>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[28rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold text-slate-500">
                <th className="w-12 px-3 py-2">期</th>
                <th className="px-2 py-2">売上</th>
                <th className="px-2 py-2">利益</th>
                <th className="px-2 py-2">課税標準</th>
                {showAudit ? <th className="w-[9rem] px-2 py-2">照合</th> : null}
              </tr>
            </thead>
            <tbody>
              {data.fiscal_years.map((fy) => (
                <tr key={fy.label} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 align-middle text-xs font-bold text-slate-700">
                    {fy.label}
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <input
                      type="number"
                      min={0}
                      disabled={!edit.isEditing}
                      className={inputClass}
                      value={fy.revenue_yen ?? ""}
                      placeholder="未入力"
                      onChange={(e) =>
                        patchFiscal(fy.label, "revenue_yen", Number(e.target.value) || 0)
                      }
                    />
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <input
                      type="number"
                      min={0}
                      disabled={!edit.isEditing}
                      className={inputClass}
                      value={fy.profit_yen ?? ""}
                      placeholder="未入力"
                      onChange={(e) =>
                        patchFiscal(fy.label, "profit_yen", Number(e.target.value) || 0)
                      }
                    />
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <input
                      type="number"
                      min={0}
                      disabled={!edit.isEditing}
                      className={`${inputClass} border-blue-100`}
                      value={fy.consumption_taxable_yen ?? ""}
                      placeholder="未入力"
                      title="消費税課税標準額"
                      onChange={(e) =>
                        patchFiscal(
                          fy.label,
                          "consumption_taxable_yen",
                          Number(e.target.value) || 0,
                        )
                      }
                    />
                  </td>
                  {showAudit ? (
                    <td className="px-2 py-1.5 align-middle">
                      <MetricFiscalAuditActions
                        layout="row"
                        revenueYen={fy.revenue_yen ?? 0}
                        profitYen={fy.profit_yen ?? 0}
                        consumptionYen={fy.consumption_taxable_yen ?? 0}
                        onOpenMetricVouch={onOpenMetricVouch}
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. 月次 — 下段に分離。指数と売上を同型グリッドで揃える */}
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <MonthGridCard title="月次売上指数">
          {data.monthly_sales_index.map((m) => (
            <label key={m.month} className="flex min-w-0 flex-col gap-0.5">
              <span className="text-center text-[10px] text-slate-400">{m.month}月</span>
              <input
                type="number"
                min={0}
                disabled={!edit.isEditing}
                className={`${inputClass} text-center`}
                value={m.index ?? ""}
                placeholder="未入力"
                onChange={(e) => patchMonthly(m.month, Number(e.target.value) || 0)}
              />
            </label>
          ))}
        </MonthGridCard>

        <MonthGridCard title="月次売上（円・OCR取込）">
          {monthlyRevenue.map((m) => (
            <label key={`rev-${m.month}`} className="flex min-w-0 flex-col gap-0.5">
              <span className="text-center text-[10px] text-slate-400">{m.month}月</span>
              <input
                type="number"
                min={0}
                disabled={!edit.isEditing}
                className={`${inputClass} text-center`}
                value={m.revenue_yen ?? ""}
                placeholder="未入力"
                onChange={(e) => patchMonthlyRevenue(m.month, Number(e.target.value) || 0)}
              />
              {showAudit && (m.revenue_yen ?? 0) > 0 ? (
                <AuditCheckToggle
                  tag={`${m.month}月`}
                  metricLabel={`${m.month}月${metricAuditLabel("monthly.revenue")}`}
                  loading={pendingMetricKey === monthlyRevenuePendingKey(m.month)}
                  active={pendingMetricKey === monthlyRevenuePendingKey(m.month)}
                  completed={isStamped(monthlyRevenuePendingKey(m.month))}
                  onActivate={() =>
                    trigger(
                      "monthly.revenue",
                      m.revenue_yen ?? 0,
                      monthlyRevenuePendingKey(m.month),
                    )
                  }
                />
              ) : null}
            </label>
          ))}
        </MonthGridCard>
      </div>
    </section>
  );
}

function MonthGridCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
        {title}
      </p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{children}</div>
    </div>
  );
}
