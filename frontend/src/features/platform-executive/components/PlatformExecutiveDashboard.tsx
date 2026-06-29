"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Loader2,
  RefreshCw,
  Rocket,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { MetricKpiCard } from "@/features/platform-executive/components/MetricKpiCard";
import { MrrTrendChart } from "@/features/platform-executive/components/MrrTrendChart";
import { SimpleBarChart } from "@/features/platform-executive/components/SimpleBarChart";
import {
  billingStatusJa,
  fetchPlatformExecutiveDashboard,
  formatPercent,
  formatYen,
  type PlatformExecutiveDashboard,
  type PlatformFirmRow,
} from "@/features/platform-executive/platform-executive-api";

type Tab = "overview" | "firms" | "clients" | "accounting";

export function PlatformExecutiveDashboard() {
  const [data, setData] = useState<PlatformExecutiveDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [firmFilter, setFirmFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [selectedFirmId, setSelectedFirmId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchPlatformExecutiveDashboard());
    } catch {
      setError("経営ダッシュボードの取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filteredFirms = useMemo(() => {
    if (!data) return [];
    const q = firmFilter.trim().toLowerCase();
    return data.firms.filter(
      (f) =>
        !q ||
        f.label.toLowerCase().includes(q) ||
        f.firmId.toLowerCase().includes(q) ||
        f.billingStatus.includes(q),
    );
  }, [data, firmFilter]);

  const filteredClients = useMemo(() => {
    if (!data) return [];
    const q = clientFilter.trim().toLowerCase();
    let rows = data.clients;
    if (selectedFirmId) {
      rows = rows.filter((c) => c.firmId === selectedFirmId);
    }
    if (!q) return rows;
    return rows.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.firmLabel.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q),
    );
  }, [data, clientFilter, selectedFirmId]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return <p className="py-8 text-sm text-rose-400">{error ?? "データを読み込めません。"}</p>;
  }

  const { kpis, accounting, charts } = data;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-blue-400">DocuGrid Executive</p>
          <h1 className="mt-1 text-2xl font-black text-white">経営ダッシュボード</h1>
          <p className="mt-1 text-sm text-slate-400">
            全テナント横断 — MRR / ARR / チャーン / 経理指標
          </p>
          <Link
            href="/dev/executive/ma-goals"
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-xs font-bold text-amber-200 hover:bg-amber-950/70"
          >
            <Rocket className="h-3.5 w-3.5" />
            10億円 ARR ロードマップ →
          </Link>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          更新
        </button>
      </header>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["overview", "概要"],
            ["firms", "事務所"],
            ["clients", "顧問先"],
            ["accounting", "経理"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
              tab === id
                ? "bg-blue-600 text-white"
                : "border border-slate-700 text-slate-400 hover:bg-slate-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricKpiCard label="MRR（総額）" value={formatYen(kpis.mrrYen)} sub={`ARR ${formatYen(kpis.arrYen)}`} tone="emerald" />
            <MetricKpiCard
              label="Net MRR"
              value={formatYen(kpis.netMrrYen)}
              sub={`パートナー分配 ${formatYen(kpis.partnerCommissionYen)}`}
              tone="violet"
            />
            <MetricKpiCard
              label="契約事務所"
              value={`${kpis.payingFirms} / ${kpis.firmCount}`}
              sub={`アクティブ ${kpis.activeFirms} · 要注意 ${kpis.atRiskFirms}`}
            />
            <MetricKpiCard
              label="顧問先合計"
              value={kpis.totalClients.toLocaleString("ja-JP")}
              sub={`ARPC ${formatYen(kpis.arpcYen)} · ARPF ${formatYen(kpis.arpfYen)}`}
            />
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricKpiCard
              label="ロゴ・チャーン率"
              value={formatPercent(kpis.logoChurnRate)}
              sub={`解約 ${kpis.churnedFirms} 社`}
              tone={kpis.churnedFirms > 0 ? "rose" : "default"}
            />
            <MetricKpiCard
              label="基本料 MRR"
              value={formatYen(kpis.baseMrrYen)}
              sub={`従量 ${formatYen(kpis.clientMeterMrrYen)}`}
            />
            <MetricKpiCard
              label="販売パートナー"
              value={`${kpis.onboardedPartners} / ${kpis.partnerCount}`}
              sub="Connect 登録済み"
              tone="amber"
            />
            <MetricKpiCard
              label="更新日時"
              value={new Date(kpis.generatedAt).toLocaleDateString("ja-JP")}
              sub={new Date(kpis.generatedAt).toLocaleTimeString("ja-JP")}
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <MrrTrendChart title="MRR トレンド（日次）" points={charts.mrrTrend} />
            <SimpleBarChart
              title="契約ステータス内訳"
              items={charts.statusBreakdown.map((s) => ({
                label: billingStatusJa(s.status),
                value: s.count,
                subLabel: "社",
              }))}
              valueFormatter={(n) => `${n}`}
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <SimpleBarChart
              title="MRR by 事務所（Top）"
              items={charts.mrrByFirm.map((f) => ({
                label: f.label,
                value: f.mrrYen,
                subLabel: `${f.clientCount}社`,
              }))}
              valueFormatter={formatYen}
            />
            <SimpleBarChart
              title="顧問先数 by 事務所（Top）"
              items={charts.clientsByFirm.map((f) => ({
                label: f.label,
                value: f.clientCount,
                subLabel: "社",
              }))}
              valueFormatter={(n) => `${n}`}
            />
          </section>

          <RevenueMixPanel mix={charts.revenueMix} usageShare={accounting.usageSharePercent} />
        </>
      )}

      {tab === "firms" && (
        <FirmsTable
          firms={filteredFirms}
          filter={firmFilter}
          onFilterChange={setFirmFilter}
          onSelectFirm={(firmId) => {
            setSelectedFirmId(firmId);
            setTab("clients");
          }}
        />
      )}

      {tab === "clients" && (
        <ClientsTable
          clients={filteredClients}
          filter={clientFilter}
          onFilterChange={setClientFilter}
          selectedFirmId={selectedFirmId}
          onClearFirm={() => setSelectedFirmId(null)}
          firms={data.firms}
          onSelectFirm={setSelectedFirmId}
        />
      )}

      {tab === "accounting" && <AccountingPanel accounting={accounting} kpis={kpis} />}

      {error && <p className="text-sm text-rose-400">{error}</p>}
    </div>
  );
}

function RevenueMixPanel({
  mix,
  usageShare,
}: {
  mix: PlatformExecutiveDashboard["charts"]["revenueMix"];
  usageShare: number;
}) {
  const total = Math.max(mix.baseYen + mix.clientMeterYen, 1);
  const segments = [
    { label: "基本料", value: mix.baseYen, color: "bg-blue-500" },
    { label: "顧問先従量", value: mix.clientMeterYen, color: "bg-cyan-400" },
    { label: "パートナー分配", value: mix.partnerCommissionYen, color: "bg-amber-500" },
  ];

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
      <h3 className="text-sm font-bold text-slate-200">収益構成（MRR）</h3>
      <p className="mt-1 text-xs text-slate-500">従量シェア {usageShare.toFixed(1)}% · Net MRR {formatYen(mix.netMrrYen)}</p>
      <div className="mt-4 flex h-4 overflow-hidden rounded-full bg-slate-800">
        {segments.map((s) =>
          s.value > 0 ? (
            <div
              key={s.label}
              className={s.color}
              style={{ width: `${(s.value / total) * 100}%` }}
              title={`${s.label}: ${formatYen(s.value)}`}
            />
          ) : null,
        )}
      </div>
      <ul className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${s.color}`} />
            {s.label} {formatYen(s.value)}
          </li>
        ))}
      </ul>
    </section>
  );
}

function FirmsTable({
  firms,
  filter,
  onFilterChange,
  onSelectFirm,
}: {
  firms: PlatformFirmRow[];
  filter: string;
  onFilterChange: (v: string) => void;
  onSelectFirm: (firmId: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/60 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 px-4 py-3">
        <div className="flex items-center gap-2 text-slate-200">
          <Building2 className="h-4 w-4" />
          <h3 className="text-sm font-bold">事務所一覧（{firms.length}）</h3>
        </div>
        <input
          type="search"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder="検索…"
          className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-200"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-slate-800/80 text-slate-400">
            <tr>
              <th className="px-4 py-2 font-bold">事務所</th>
              <th className="px-4 py-2 font-bold">契約</th>
              <th className="px-4 py-2 font-bold text-right">顧問先</th>
              <th className="px-4 py-2 font-bold text-right">MRR</th>
              <th className="px-4 py-2 font-bold text-right">Net</th>
              <th className="px-4 py-2 font-bold">パートナー</th>
              <th className="px-4 py-2 font-bold">状態</th>
            </tr>
          </thead>
          <tbody>
            {firms.map((f) => (
              <tr key={f.firmId} className="border-t border-slate-800 hover:bg-slate-800/50">
                <td className="px-4 py-2">
                  <button
                    type="button"
                    onClick={() => onSelectFirm(f.firmId)}
                    className="font-bold text-blue-300 hover:underline"
                  >
                    {f.label}
                  </button>
                  <p className="text-[10px] text-slate-500">{f.firmId}</p>
                </td>
                <td className="px-4 py-2 text-slate-300">{billingStatusJa(f.billingStatus)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{f.clientCount}</td>
                <td className="px-4 py-2 text-right tabular-nums font-bold text-emerald-300">
                  {formatYen(f.mrrYen)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{formatYen(f.netMrrYen)}</td>
                <td className="px-4 py-2 text-slate-400">{f.referralPartnerName ?? "—"}</td>
                <td className="px-4 py-2">
                  {f.isAtRisk && (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-950/60 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                      <AlertTriangle className="h-3 w-3" />
                      要注意
                    </span>
                  )}
                  {f.isChurned && (
                    <span className="inline-flex items-center gap-1 rounded bg-rose-950/60 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                      <TrendingDown className="h-3 w-3" />
                      解約
                    </span>
                  )}
                  {f.isPaying && !f.isAtRisk && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                      <TrendingUp className="h-3 w-3" />
                      課金中
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ClientsTable({
  clients,
  filter,
  onFilterChange,
  selectedFirmId,
  onClearFirm,
  firms,
  onSelectFirm,
}: {
  clients: PlatformExecutiveDashboard["clients"];
  filter: string;
  onFilterChange: (v: string) => void;
  selectedFirmId: string | null;
  onClearFirm: () => void;
  firms: PlatformFirmRow[];
  onSelectFirm: (id: string | null) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/60 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 px-4 py-3">
        <div className="flex items-center gap-2 text-slate-200">
          <Users className="h-4 w-4" />
          <h3 className="text-sm font-bold">顧問先一覧（{clients.length}）</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedFirmId ?? ""}
            onChange={(e) => onSelectFirm(e.target.value || null)}
            className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-slate-200"
          >
            <option value="">全事務所</option>
            {firms.map((f) => (
              <option key={f.firmId} value={f.firmId}>
                {f.label}
              </option>
            ))}
          </select>
          {selectedFirmId && (
            <button
              type="button"
              onClick={onClearFirm}
              className="text-[10px] font-bold text-slate-400 hover:text-white"
            >
              フィルタ解除
            </button>
          )}
          <input
            type="search"
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            placeholder="検索…"
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-200"
          />
        </div>
      </div>
      <div className="max-h-[32rem] overflow-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-800/95 text-slate-400">
            <tr>
              <th className="px-4 py-2 font-bold">顧問先</th>
              <th className="px-4 py-2 font-bold">事務所</th>
              <th className="px-4 py-2 font-bold">区分</th>
              <th className="px-4 py-2 font-bold">決算月</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={`${c.firmId}-${c.id}`} className="border-t border-slate-800">
                <td className="px-4 py-2">
                  <p className="font-bold text-slate-200">{c.name}</p>
                  <p className="text-[10px] text-slate-500">{c.id}</p>
                </td>
                <td className="px-4 py-2 text-slate-300">{c.firmLabel}</td>
                <td className="px-4 py-2 text-slate-400">{c.category || "—"}</td>
                <td className="px-4 py-2 text-slate-400">{c.fiscalMonth ? `${c.fiscalMonth}月` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AccountingPanel({
  accounting,
  kpis,
}: {
  accounting: PlatformExecutiveDashboard["accounting"];
  kpis: PlatformExecutiveDashboard["kpis"];
}) {
  const rows = [
    ["総 MRR（グロス）", accounting.grossMrrYen],
    ["パートナー支払（月額）", accounting.partnerPayoutYen],
    ["Net MRR", accounting.netMrrYen],
    ["年間 ARR（グロス）", accounting.annualizedGrossArrYen],
    ["年間 ARR（ネット）", accounting.annualizedNetArrYen],
    ["基本料収益（月）", accounting.basePlanRevenueYen],
    ["従量収益（月）", accounting.usageRevenueYen],
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
        <h3 className="text-sm font-bold text-slate-200">経理向けサマリー</h3>
        <p className="mt-1 text-xs text-slate-500">Stripe 連携前は見積ベース。契約事務所 {kpis.payingFirms} 社。</p>
        <table className="mt-4 w-full text-xs">
          <tbody>
            {rows.map(([label, yen]) => (
              <tr key={label} className="border-t border-slate-800">
                <td className="py-2 text-slate-400">{label}</td>
                <td className="py-2 text-right font-bold tabular-nums text-slate-100">
                  {formatYen(yen as number)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
        <h3 className="text-sm font-bold text-slate-200">MA / 投資家向け指標</h3>
        <ul className="mt-4 space-y-3 text-xs text-slate-300">
          <li>
            <span className="text-slate-500">MRR → ARR 倍率</span>
            <p className="font-bold text-white">12x（サブスク）</p>
          </li>
          <li>
            <span className="text-slate-500">ロゴ・チャーン率</span>
            <p className="font-bold text-white">{formatPercent(kpis.logoChurnRate)}</p>
          </li>
          <li>
            <span className="text-slate-500">ARPC（顧問先あたり月額）</span>
            <p className="font-bold text-white">{formatYen(kpis.arpcYen)}</p>
          </li>
          <li>
            <span className="text-slate-500">ARPF（課金事務所あたり月額）</span>
            <p className="font-bold text-white">{formatYen(kpis.arpfYen)}</p>
          </li>
          <li>
            <span className="text-slate-500">従量収益シェア</span>
            <p className="font-bold text-white">{accounting.usageSharePercent.toFixed(1)}%</p>
          </li>
          <li>
            <span className="text-slate-500">要注意テナント</span>
            <p className="font-bold text-amber-300">{kpis.atRiskFirms} 社（解約予定 / 支払い遅延）</p>
          </li>
        </ul>
      </section>
    </div>
  );
}
