"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, FileCheck, Loader2 } from "lucide-react";
import type { PersonaDefinition } from "@/config/personas";
import type { ScreenDesignPersona } from "@/config/screen-design-types";
import { useOrgDirectory } from "@/features/org/useOrgDirectory";
import { fetchDocumentStatus } from "@/features/docugrid/lib/document-status";
import { fetchClientChartsMetrics, type ClientChartsPayload } from "@/features/client-data/lib/client-metrics-api";
import { PersonaWorkspaceLayout } from "@/features/persona/PersonaWorkspaceLayout";
import { TaxRiskHighlightsWidget } from "@/features/persona/widgets/TaxRiskHighlightsWidget";
import { setClientScope } from "@/lib/api-auth";
import type { DocugridUser } from "@/lib/auth";

type Props = {
  persona: PersonaDefinition;
  user: DocugridUser | null;
  design: ScreenDesignPersona | null;
};

function formatMan(yen: number): string {
  if (yen >= 100_000_000) return `${(yen / 100_000_000).toFixed(1)}億円`;
  if (yen <= 0) return "—";
  return `${Math.round(yen / 10_000)}万円`;
}

export function ClientExecutiveHome({ persona, user, design }: Props) {
  const { clients } = useOrgDirectory();
  const clientId = user?.visibleClientIds?.[0] ?? clients[0]?.id ?? "";
  const clientName = clients.find((c) => c.id === clientId)?.name ?? clientId;
  const client = clients.find((c) => c.id === clientId) ?? null;

  const [statusLoading, setStatusLoading] = useState(true);
  const [chartsLoading, setChartsLoading] = useState(true);
  const [missingTotal, setMissingTotal] = useState<number | null>(null);
  const [incompleteCount, setIncompleteCount] = useState<number | null>(null);
  const [charts, setCharts] = useState<ClientChartsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (clientId) setClientScope(clientId);
  }, [clientId]);

  useEffect(() => {
    if (!clientId) return;
    const controller = new AbortController();
    setStatusLoading(true);
    void (async () => {
      try {
        const summary = await fetchDocumentStatus(clientId, controller.signal);
        setMissingTotal(summary.missing_total);
        setIncompleteCount(summary.incomplete_count);
      } catch {
        setError("提出状況の取得に失敗しました");
      } finally {
        setStatusLoading(false);
      }
    })();
    return () => controller.abort();
  }, [clientId]);

  useEffect(() => {
    if (!clientId) return;
    const controller = new AbortController();
    setChartsLoading(true);
    void (async () => {
      try {
        setCharts(await fetchClientChartsMetrics(clientId, controller.signal));
      } catch {
        setError("経営指標の取得に失敗しました");
      } finally {
        setChartsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [clientId]);

  const latestFiscal = useMemo(() => {
    if (!charts?.fiscal_years?.length) return null;
    return charts.fiscal_years[charts.fiscal_years.length - 1];
  }, [charts]);

  const consumptionFy = useMemo(() => {
    if (!charts?.fiscal_years?.length) return null;
    return [...charts.fiscal_years].reverse().find((fy) => (fy.consumption_taxable_yen ?? 0) > 0);
  }, [charts]);

  const loading = statusLoading || chartsLoading;

  return (
    <PersonaWorkspaceLayout persona={persona} user={user} design={design}>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-800">経営サマリー</h2>
        <p className="mt-1 text-xs text-slate-500">{clientName}</p>
        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            読み込み中…
          </div>
        ) : error ? (
          <p className="mt-4 text-sm text-red-600">{error}</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-4">
              <p className="flex items-center gap-1 text-[10px] font-bold uppercase text-amber-800">
                <FileCheck className="h-3.5 w-3.5" />
                資料提出
              </p>
              <p className="mt-2 text-2xl font-black text-amber-950">{missingTotal ?? 0}</p>
              <p className="text-xs text-amber-800/80">不足資料（点）</p>
              <p className="mt-1 text-[10px] text-amber-700">
                未完了期間 {incompleteCount ?? 0} 件
              </p>
            </div>
            <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-4">
              <p className="flex items-center gap-1 text-[10px] font-bold uppercase text-violet-800">
                <BarChart3 className="h-3.5 w-3.5" />
                直近期売上
              </p>
              <p className="mt-2 text-2xl font-black text-violet-950">
                {formatMan(latestFiscal?.revenue_yen ?? 0)}
              </p>
              <p className="text-xs text-violet-800/80">
                {latestFiscal?.label ?? "—"} · client_metrics
              </p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
              <p className="text-[10px] font-bold uppercase text-emerald-800">直近期利益</p>
              <p className="mt-2 text-2xl font-black text-emerald-950">
                {formatMan(latestFiscal?.profit_yen ?? 0)}
              </p>
              {consumptionFy ? (
                <p className="mt-1 text-[10px] text-emerald-700">
                  消費税課税標準 {formatMan(consumptionFy.consumption_taxable_yen ?? 0)}
                </p>
              ) : null}
            </div>
          </div>
        )}
      </section>

      {client ? (
        <section className="rounded-2xl border border-red-100 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-red-900">リスクハイライト</h2>
          <p className="mt-1 text-xs text-slate-500">
            税務アラートと申告資料の不足を表示します。
          </p>
          <div className="mt-4">
            <TaxRiskHighlightsWidget client={client} />
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-800">直近3期の推移</h2>
        {!charts || charts.fiscal_years.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">指標データがありません</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="px-2 py-1">期</th>
                  <th className="px-2 py-1">売上</th>
                  <th className="px-2 py-1">利益</th>
                  <th className="px-2 py-1">課税標準</th>
                </tr>
              </thead>
              <tbody>
                {charts.fiscal_years.map((fy) => (
                  <tr key={fy.label} className="border-t border-slate-100">
                    <td className="px-2 py-2 font-bold">{fy.label}</td>
                    <td className="px-2 py-2">{formatMan(fy.revenue_yen)}</td>
                    <td className="px-2 py-2">{formatMan(fy.profit_yen)}</td>
                    <td className="px-2 py-2">{formatMan(fy.consumption_taxable_yen ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PersonaWorkspaceLayout>
  );
}
