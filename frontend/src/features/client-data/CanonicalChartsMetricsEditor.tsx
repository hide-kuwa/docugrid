"use client";

import { useState } from "react";
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

function cloneCharts(payload: ClientChartsPayload): ClientChartsPayload {
  return {
    ...payload,
    fiscal_years: payload.fiscal_years.map((fy) => ({ ...fy })),
    monthly_sales_index: payload.monthly_sales_index.map((m) => ({ ...m })),
    monthly_revenue_yen: (payload.monthly_revenue_yen ?? []).map((m) => ({ ...m })),
  };
}

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

  const patchFiscal = (label: string, field: "revenue_yen" | "profit_yen" | "consumption_taxable_yen", n: number) => {
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

  return (
    <section className="rounded-2xl border border-slate-300 bg-slate-50/80 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Database className="h-4 w-4 text-slate-500" />
            正規指標（client_metrics）
          </h3>
          <p className="mt-1 text-[10px] text-slate-500">
            SSOT の実数値。シミュレーションとは別に「変更」→「決定」で保存します。
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

      {showAudit ? <AuditActionLegend className="mt-3" /> : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div>
          <p className="mb-2 text-[10px] font-bold text-slate-500">直近3期（円）</p>
          <div className="space-y-2">
            {data.fiscal_years.map((fy) => (
              <div
                key={fy.label}
                className={`grid items-center gap-2 text-xs ${
                  showAudit
                    ? "grid-cols-[3rem_1fr_1fr_1fr_auto]"
                    : "grid-cols-[3rem_1fr_1fr_1fr]"
                }`}
              >
                <span className="font-bold text-slate-600">{fy.label}</span>
                <input
                  type="number"
                  min={0}
                  disabled={!edit.isEditing}
                  className="rounded border border-slate-200 px-2 py-1 disabled:bg-white disabled:text-slate-700"
                  value={fy.revenue_yen || ""}
                  placeholder="売上"
                  onChange={(e) =>
                    patchFiscal(fy.label, "revenue_yen", Number(e.target.value) || 0)
                  }
                />
                <input
                  type="number"
                  min={0}
                  disabled={!edit.isEditing}
                  className="rounded border border-slate-200 px-2 py-1 disabled:bg-white disabled:text-slate-700"
                  value={fy.profit_yen || ""}
                  placeholder="利益"
                  onChange={(e) =>
                    patchFiscal(fy.label, "profit_yen", Number(e.target.value) || 0)
                  }
                />
                <input
                  type="number"
                  min={0}
                  disabled={!edit.isEditing}
                  className="rounded border border-blue-200 px-2 py-1 disabled:bg-white disabled:text-slate-700"
                  value={fy.consumption_taxable_yen || ""}
                  placeholder="課税標準"
                  title="消費税課税標準額"
                  onChange={(e) =>
                    patchFiscal(fy.label, "consumption_taxable_yen", Number(e.target.value) || 0)
                  }
                />
                {showAudit ? (
                  <MetricFiscalAuditActions
                    layout="stack"
                    revenueYen={fy.revenue_yen}
                    profitYen={fy.profit_yen}
                    consumptionYen={fy.consumption_taxable_yen ?? 0}
                    onOpenMetricVouch={onOpenMetricVouch}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[10px] font-bold text-slate-500">月次売上指数</p>
          <div className="flex flex-wrap gap-2">
            {data.monthly_sales_index.map((m) => (
              <label key={m.month} className="flex flex-col items-center gap-0.5 text-[10px]">
                <span className="text-slate-400">{m.month}月</span>
                <input
                  type="number"
                  min={0}
                  disabled={!edit.isEditing}
                  className="w-14 rounded border border-slate-200 px-1 py-0.5 text-center disabled:bg-white"
                  value={m.index || ""}
                  onChange={(e) => patchMonthly(m.month, Number(e.target.value) || 0)}
                />
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[10px] font-bold text-slate-500">月次売上（円・OCR取込）</p>
          <div className="flex flex-wrap gap-2">
            {monthlyRevenue.map((m) => (
              <label
                key={`rev-${m.month}`}
                className="flex flex-col items-center gap-1 text-[10px]"
              >
                <span className="text-slate-400">{m.month}月</span>
                <input
                  type="number"
                  min={0}
                  disabled={!edit.isEditing}
                  className="w-20 rounded border border-slate-200 px-1 py-0.5 text-center disabled:bg-white"
                  value={m.revenue_yen || ""}
                  onChange={(e) => patchMonthlyRevenue(m.month, Number(e.target.value) || 0)}
                />
                {showAudit && m.revenue_yen > 0 ? (
                  <AuditCheckToggle
                    tag={`${m.month}月`}
                    metricLabel={`${m.month}月${metricAuditLabel("monthly.revenue")}`}
                    loading={pendingMetricKey === monthlyRevenuePendingKey(m.month)}
                    active={pendingMetricKey === monthlyRevenuePendingKey(m.month)}
                    completed={isStamped(monthlyRevenuePendingKey(m.month))}
                    onActivate={() =>
                      trigger("monthly.revenue", m.revenue_yen, monthlyRevenuePendingKey(m.month))
                    }
                  />
                ) : null}
              </label>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
