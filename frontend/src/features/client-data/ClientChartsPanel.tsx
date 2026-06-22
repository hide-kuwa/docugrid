"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, TrendingUp } from "lucide-react";
import type { OrgClient } from "@/config/organization";
import { AuditCheckToggle } from "@/features/audit/components/AuditCheckToggle";
import { AuditActionLegend } from "@/features/audit/components/AuditApprovalBadge";
import { MetricFiscalAuditActions } from "@/features/audit/components/MetricFiscalAuditActions";
import { metricAuditLabel } from "@/features/audit/lib/metric-audit-labels";
import {
  monthlyRevenuePendingKey,
  useMetricAuditTrigger,
} from "@/features/audit/hooks/use-metric-audit-trigger";
import { CanonicalChartsMetricsEditor } from "@/features/client-data/CanonicalChartsMetricsEditor";
import { CanonicalSimField } from "@/features/client-data/components/CanonicalSimField";
import { SimDiffLegend, SimDisplayValue } from "@/features/client-data/components/SimDisplayValue";
import { SimulationEditToolbar } from "@/features/client-data/components/SimulationEditToolbar";
import { useSimulationOverlay } from "@/features/client-data/hooks/use-simulation-overlay";
import {
  fetchClientChartsMetrics,
  type ClientChartsPayload,
} from "@/features/client-data/lib/client-metrics-api";
import {
  ssotHasMetricsChanges,
  useSsotPropagateReload,
} from "@/features/client-data/hooks/use-ssot-propagate-reload";
import {
  chartsHasAnyDiff,
  numDiffers,
  simBarProfitClass,
  simBarRevenueClass,
  simMonthlyBarClass,
} from "@/features/client-data/lib/sim-diff";

function formatMan(yen: number): string {
  if (yen >= 100_000_000) return `${(yen / 100_000_000).toFixed(1)}億`;
  return `${Math.round(yen / 10_000)}万`;
}

const EMPTY_CHARTS: ClientChartsPayload = {
  client_id: "",
  fiscal_years: [],
  monthly_sales_index: [],
  monthly_revenue_yen: [],
  monthly_ytd_index: 0,
};

function cloneCharts(payload: ClientChartsPayload): ClientChartsPayload {
  return {
    ...payload,
    fiscal_years: payload.fiscal_years.map((fy) => ({ ...fy })),
    monthly_sales_index: payload.monthly_sales_index.map((m) => ({ ...m })),
    monthly_revenue_yen: (payload.monthly_revenue_yen ?? []).map((m) => ({ ...m })),
  };
}

type Props = {
  client: OrgClient;
  canEdit?: boolean;
  onOpenMetricVouch?: (metricKey: string, valueYen: number) => void;
};

export function ClientChartsPanel({ client, canEdit, onOpenMetricVouch }: Props) {
  const { pendingMetricKey, trigger, isStamped } = useMetricAuditTrigger(onOpenMetricVouch);
  const [canonical, setCanonical] = useState<ClientChartsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sim = useSimulationOverlay({
    clientId: client.id,
    panelKey: "charts",
    canonical: canonical ?? EMPTY_CHARTS,
    clone: cloneCharts,
  });

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCanonical(await fetchClientChartsMetrics(client.id));
    } catch {
      setError("指標の読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [client.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useSsotPropagateReload(client.id, () => void reload(), ssotHasMetricsChanges);

  if ((loading && !canonical) || !sim.overlayReady) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        指標を読み込み中…
      </div>
    );
  }

  const view = sim.display;
  const draft = sim.isEditing && sim.draft ? sim.draft : view;
  const canonicalData = sim.canonical;
  const hasDiff = chartsHasAnyDiff(canonicalData, view);
  const yearBars = view.fiscal_years;
  const monthly = view.monthly_sales_index;
  const monthlyRevenue = canonicalData.monthly_revenue_yen ?? [];
  const hasMonthlyRevenue = monthlyRevenue.some((m) => m.revenue_yen > 0);
  const hasConsumptionTaxable =
    canonicalData.fiscal_years.some((fy) => (fy.consumption_taxable_yen ?? 0) > 0) ||
    view.fiscal_years.some((fy) => (fy.consumption_taxable_yen ?? 0) > 0);
  const maxMonthlyRev = Math.max(...monthlyRevenue.map((m) => m.revenue_yen), 1);
  const maxRevenue = Math.max(...yearBars.map((y) => y.revenue_yen), 1);
  const maxMonthly = Math.max(...monthly.map((m) => m.index), 1);
  const ytd = monthly.reduce((a, b) => a + b.index, 0);
  const canonYtd = canonicalData.monthly_sales_index.reduce((a, b) => a + b.index, 0);

  const patchFiscal = (
    label: string,
    field: "revenue_yen" | "profit_yen" | "consumption_taxable_yen",
    n: number,
  ) => {
    sim.patchDraft((prev) => ({
      ...prev,
      fiscal_years: prev.fiscal_years.map((fy) =>
        fy.label === label ? { ...fy, [field]: n } : fy,
      ),
    }));
  };

  const patchMonthly = (month: number, n: number) => {
    sim.patchDraft((prev) => {
      const nextMonthly = prev.monthly_sales_index.map((m) =>
        m.month === month ? { ...m, index: n } : m,
      );
      return {
        ...prev,
        monthly_sales_index: nextMonthly,
        monthly_ytd_index: nextMonthly.reduce((a, b) => a + b.index, 0),
      };
    });
  };

  const displayError = error ?? sim.persistError;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-50 p-4 md:p-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-violet-600">
            <TrendingUp className="h-3.5 w-3.5" />
            CHARTS
            {sim.hasOverlay ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-semibold normal-case text-amber-800">
                シミュレーション保存済
              </span>
            ) : null}
          </div>
          <h2 className="mt-1 text-lg font-black text-slate-800">{client.name} — ダッシュボード</h2>
          <p className="mt-1 text-sm text-slate-500">
            正規値は client_metrics から読み取り専用。シミュレーションは別 DB に保存され、このグラフのみに反映されます。
          </p>
          <SimDiffLegend show={hasDiff} className="mt-2" />
        </div>
        <SimulationEditToolbar
          isEditing={sim.isEditing}
          canEdit={canEdit}
          hasOverlay={sim.hasOverlay}
          saving={sim.persisting}
          onStart={sim.startEdit}
          onCommit={() => void sim.commitEdit()}
          onCancel={sim.cancelEdit}
          onClearOverlay={() => void sim.clearOverlay()}
        />
      </header>

      {displayError ? (
        <div className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {displayError}
        </div>
      ) : null}

      {onOpenMetricVouch && !sim.isEditing ? (
        <div className="mx-auto mb-4 w-full max-w-6xl">
          <AuditActionLegend />
        </div>
      ) : null}

      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-xs font-bold text-slate-600">直近3期 売上・利益（円）</h3>
          {sim.isEditing ? (
            <p className="mt-1 text-[10px] text-slate-400">
              上: 正規値（グレー） / 下: シミュレーション（正規と違うと琥珀色）
            </p>
          ) : null}
          <div className="mt-6 flex items-end justify-around gap-4" style={{ height: "12rem" }}>
            {yearBars.map((year) => {
              const canonYear = canonicalData.fiscal_years.find((fy) => fy.label === year.label);
              const draftYear = draft.fiscal_years.find((fy) => fy.label === year.label);
              const revDiff = canonYear ? numDiffers(canonYear.revenue_yen, year.revenue_yen) : false;
              const profDiff = canonYear ? numDiffers(canonYear.profit_yen, year.profit_yen) : false;
              return (
                <div key={year.label} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-40 w-full max-w-[5rem] items-end justify-center gap-1">
                    <div
                      className={simBarRevenueClass(revDiff)}
                      style={{ height: `${(year.revenue_yen / maxRevenue) * 100}%` }}
                      title={
                        revDiff && canonYear
                          ? `売上（シミュ） ${formatMan(year.revenue_yen)} / 正規 ${formatMan(canonYear.revenue_yen)}`
                          : `売上 ${formatMan(year.revenue_yen)}`
                      }
                    />
                    <div
                      className={simBarProfitClass(profDiff)}
                      style={{ height: `${(year.profit_yen / maxRevenue) * 100}%` }}
                      title={
                        profDiff && canonYear
                          ? `利益（シミュ） ${formatMan(year.profit_yen)} / 正規 ${formatMan(canonYear.profit_yen)}`
                          : `利益 ${formatMan(year.profit_yen)}`
                      }
                    />
                  </div>
                  <span className="text-xs font-bold text-slate-700">{year.label}</span>
                  {sim.isEditing && canonYear && draftYear ? (
                    <div className="flex w-full flex-col gap-1">
                      <CanonicalSimField
                        editing
                        canonical={canonYear.revenue_yen}
                        simValue={draftYear.revenue_yen}
                        onSimChange={(n) => patchFiscal(year.label, "revenue_yen", n)}
                      />
                      <CanonicalSimField
                        editing
                        canonical={canonYear.profit_yen}
                        simValue={draftYear.profit_yen}
                        onSimChange={(n) => patchFiscal(year.label, "profit_yen", n)}
                      />
                    </div>
                  ) : canonYear ? (
                    <div className="flex flex-col items-center gap-1.5">
                      <SimDisplayValue
                        canonical={canonYear.revenue_yen}
                        display={year.revenue_yen}
                        format={formatMan}
                      />
                      {!sim.isEditing && onOpenMetricVouch ? (
                        <MetricFiscalAuditActions
                          revenueYen={canonYear.revenue_yen}
                          profitYen={canonYear.profit_yen}
                          onOpenMetricVouch={onOpenMetricVouch}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          {hasConsumptionTaxable ? (
            <div className="mt-6 border-t border-slate-100 pt-4">
              <h4 className="text-[10px] font-bold text-blue-700">
                消費税課税標準額（OCR 取込・円）
              </h4>
              <div className="mt-3 grid grid-cols-3 gap-3">
                {view.fiscal_years.map((fy) => {
                  const canonFy = canonicalData.fiscal_years.find((x) => x.label === fy.label);
                  const draftFy = draft.fiscal_years.find((x) => x.label === fy.label);
                  const yen = fy.consumption_taxable_yen ?? 0;
                  const canonYen = canonFy?.consumption_taxable_yen ?? 0;
                  if (!sim.isEditing && yen <= 0 && canonYen <= 0) return null;
                  const ctDiff = canonFy ? numDiffers(canonYen, yen) : false;
                  return (
                    <div
                      key={`ct-${fy.label}`}
                      className={`rounded-lg border px-3 py-2 text-center ${
                        ctDiff
                          ? "border-amber-200 bg-amber-50/80 ring-1 ring-amber-200"
                          : "border-blue-100 bg-blue-50/60"
                      }`}
                    >
                      <p className="text-[10px] font-bold text-blue-800">{fy.label}</p>
                      {sim.isEditing && canonFy && draftFy ? (
                        <div className="mt-1">
                          <CanonicalSimField
                            editing
                            canonical={canonYen}
                            simValue={draftFy.consumption_taxable_yen ?? 0}
                            onSimChange={(n) =>
                              patchFiscal(fy.label, "consumption_taxable_yen", n)
                            }
                          />
                        </div>
                      ) : (
                        <>
                          <p className="mt-1 text-sm font-black text-blue-900">
                            {formatMan(yen)}
                          </p>
                          {ctDiff && canonFy ? (
                            <p className="text-[9px] text-amber-700">
                              正規 {formatMan(canonYen)}
                            </p>
                          ) : canonFy?.consumption_taxable_source === "ocr" ? (
                            <p className="mt-0.5 text-[9px] text-blue-600">OCR</p>
                          ) : null}
                          {!sim.isEditing && onOpenMetricVouch && canonYen > 0 ? (
                            <div className="mt-1.5">
                              <MetricFiscalAuditActions
                                consumptionYen={canonYen}
                                onOpenMetricVouch={onOpenMetricVouch}
                              />
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold text-slate-600">当期 月次売上推移（指数）</h3>
              {sim.isEditing ? (
                <p className="mt-0.5 text-[10px] text-slate-400">上: 正規 / 下: シミュ</p>
              ) : null}
            </div>
            <SimDisplayValue
              canonical={canonYtd}
              display={ytd}
              format={(n) => `${Math.round(n)}%`}
              className="rounded-full bg-violet-50 px-2 py-0.5 font-bold text-violet-700"
            />
          </div>
          <div className="mt-4 flex h-40 items-end gap-1">
            {monthly.map((row) => {
              const canonRow = canonicalData.monthly_sales_index.find((m) => m.month === row.month);
              const draftRow = draft.monthly_sales_index.find((m) => m.month === row.month);
              const indexDiff = canonRow ? numDiffers(canonRow.index, row.index) : false;
              return (
                <div key={row.month} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className={simMonthlyBarClass(indexDiff)}
                    style={{ height: `${(row.index / maxMonthly) * 100}%` }}
                    title={
                      indexDiff && canonRow
                        ? `${row.month}月: シミュ ${row.index}% / 正規 ${canonRow.index}%`
                        : `${row.month}月: ${row.index}%`
                    }
                  />
                  {sim.isEditing && canonRow && draftRow ? (
                    <CanonicalSimField
                      editing
                      canonical={canonRow.index}
                      simValue={draftRow.index}
                      onSimChange={(n) => patchMonthly(row.month, n)}
                      inputClassName="max-w-[2rem] text-[8px]"
                    />
                  ) : null}
                  <span className="text-[8px] text-slate-400">{row.month}</span>
                </div>
              );
            })}
          </div>
          {hasMonthlyRevenue ? (
            <div className="mt-6 border-t border-slate-100 pt-4">
              <h4 className="text-[10px] font-bold text-emerald-700">
                月次売上（OCR / 試算表取込・円）
              </h4>
              <div className="mt-3 flex h-24 items-end gap-1">
                {monthlyRevenue.map((row) => (
                  <div key={`rev-${row.month}`} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full max-w-[1.25rem] rounded-t bg-emerald-500/80"
                      style={{ height: `${(row.revenue_yen / maxMonthlyRev) * 100}%` }}
                      title={`${row.month}月: ${formatMan(row.revenue_yen)}${
                        row.source_type === "ocr" ? " (OCR)" : ""
                      }`}
                    />
                    {!sim.isEditing && onOpenMetricVouch && row.revenue_yen > 0 ? (
                      <AuditCheckToggle
                        tag={`${row.month}月`}
                        metricLabel={`${row.month}月${metricAuditLabel("monthly.revenue")}`}
                        loading={
                          pendingMetricKey === monthlyRevenuePendingKey(row.month)
                        }
                        active={pendingMetricKey === monthlyRevenuePendingKey(row.month)}
                        completed={isStamped(monthlyRevenuePendingKey(row.month))}
                        onActivate={() =>
                          trigger(
                            "monthly.revenue",
                            row.revenue_yen,
                            monthlyRevenuePendingKey(row.month),
                          )
                        }
                      />
                    ) : null}
                    <span className="text-[8px] text-slate-400">{row.month}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {canonical ? (
        <div className="mx-auto mt-6 w-full max-w-6xl">
          <CanonicalChartsMetricsEditor
            clientId={client.id}
            canonical={canonical}
            canEdit={canEdit}
            onUpdated={() => void reload()}
            onOpenMetricVouch={onOpenMetricVouch}
          />
        </div>
      ) : null}
    </div>
  );
}
