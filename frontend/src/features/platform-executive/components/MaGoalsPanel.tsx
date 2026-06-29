"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Rocket,
  Target,
  TrendingUp,
} from "lucide-react";
import { MetricKpiCard } from "@/features/platform-executive/components/MetricKpiCard";
import { SimpleBarChart } from "@/features/platform-executive/components/SimpleBarChart";
import {
  fetchMaGoals,
  formatPercent,
  formatYen,
  saveMaAssumptions,
  type MaGoalsPayload,
} from "@/features/platform-executive/platform-executive-api";

const AVG_CLIENTS_MODE_LABELS: Record<"auto" | "planning" | "actual", string> = {
  auto: "自動（実績が十分なら実績、なければ計画仮定）",
  planning: "計画仮定を常に使う",
  actual: "実績ベースを常に使う",
};

function formatOku(yen: number): string {
  if (yen >= 100_000_000) return `${(yen / 100_000_000).toFixed(1)}億円`;
  if (yen >= 10_000) return `${Math.round(yen / 10_000)}万円`;
  return formatYen(yen);
}

export function MaGoalsPanel() {
  const [data, setData] = useState<MaGoalsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [targetArrOku, setTargetArrOku] = useState(10);
  const [horizonYears, setHorizonYears] = useState(5);
  const [churnPct, setChurnPct] = useState(5);
  const [partnerRatePct, setPartnerRatePct] = useState(50);
  const [avgClientsMode, setAvgClientsMode] = useState<"auto" | "planning" | "actual">("auto");
  const [planningAvgClients, setPlanningAvgClients] = useState(80);
  const hydratedAssumptions = useRef(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchMaGoals({
        target_arr_yen: targetArrOku * 100_000_000,
        horizon_months: horizonYears * 12,
        annual_logo_churn: churnPct / 100,
        partner_attach_rate: partnerRatePct / 100,
        avg_clients_mode: avgClientsMode,
      });
      setData(payload);
      if (!hydratedAssumptions.current) {
        setPlanningAvgClients(payload.assumptions.planningAvgClientsPerFirm);
        setAvgClientsMode(payload.assumptions.avgClientsMode);
        hydratedAssumptions.current = true;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("403")) {
        setError("MA 目標の取得に失敗しました。platform 権限（settings.platform）が必要です。");
      } else if (msg.includes("404")) {
        setError("MA 目標 API が見つかりません。バックエンドを再起動してください。");
      } else {
        setError(`MA 目標の取得に失敗しました。${msg.replace("ma-goals-failed:", "")}`);
      }
    } finally {
      setLoading(false);
    }
  }, [targetArrOku, horizonYears, churnPct, partnerRatePct, avgClientsMode]);

  const persistAssumptions = useCallback(
    async (patch: {
      planning_avg_clients_per_firm?: number;
      avg_clients_mode?: "planning" | "actual" | "auto";
    }) => {
      try {
        await saveMaAssumptions(patch);
        await reload();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("404")) {
          setError("設定の保存に失敗しました。バックエンドを再起動してから再度お試しください。");
        } else {
          setError(`設定の保存に失敗しました。${msg.replace("ma-assumptions-save-failed:", "")}`);
        }
      }
    },
    [reload],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return <p className="py-8 text-sm text-rose-400">{error ?? "読み込めません。"}</p>;
  }

  const rec = data.recommendations;
  const gap = data.gap;
  const actual = data.avgClientsActual;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/dev/executive"
            className="mb-2 inline-flex items-center gap-1 text-xs font-bold text-blue-400 hover:underline"
          >
            <ArrowLeft className="h-3 w-3" />
            経営ダッシュボード
          </Link>
          <div className="flex items-center gap-2 text-amber-400">
            <Rocket className="h-5 w-5" />
            <p className="text-xs font-bold uppercase tracking-widest">MA Planning</p>
          </div>
          <h1 className="mt-1 text-2xl font-black text-white">10億円 ARR ロードマップ</h1>
          <p className="mt-1 text-sm text-slate-400">
            目標 ARR・チャーン・事務所数・月次獲得ペースを逆算します（料金: 基本 ¥1万 + 顧問先 ¥100/社/月）
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          再計算
        </button>
      </header>

      <section className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
        <h2 className="text-sm font-bold text-slate-200">前提の調整</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-slate-400">
            目標 ARR（億円）
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={targetArrOku}
              onChange={(e) => setTargetArrOku(Number(e.target.value) || 10)}
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-slate-400">
            達成期間（年）
            <select
              value={horizonYears}
              onChange={(e) => setHorizonYears(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
            >
              {[3, 4, 5, 7].map((y) => (
                <option key={y} value={y}>
                  {y} 年
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            想定年間ロゴ・チャーン（%）
            <input
              type="number"
              min={1}
              max={20}
              value={churnPct}
              onChange={(e) => setChurnPct(Number(e.target.value) || 5)}
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-slate-400">
            パートナー経由比率（%）
            <input
              type="number"
              min={0}
              max={100}
              value={partnerRatePct}
              onChange={(e) => setPartnerRatePct(Number(e.target.value) || 0)}
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-emerald-800/50 bg-emerald-950/30 p-4">
        <h2 className="text-sm font-bold text-emerald-200">平均顧問先数（計画仮定 ↔ 実績）</h2>
        <p className="mt-1 text-xs text-slate-400">
          デモデータの実績は少なめです。初期は計画仮定（既定 80 社/事務所）で逆算し、
          課金事務所が {data.assumptions.minFirmsForActualAvg} 社以上になったら自動モードで実績に切り替わります。
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <label className="text-xs text-slate-400">
            採用モード
            <select
              value={avgClientsMode}
              onChange={(e) => {
                const mode = e.target.value as "auto" | "planning" | "actual";
                setAvgClientsMode(mode);
                void persistAssumptions({ avg_clients_mode: mode });
              }}
              className="mt-1 w-full rounded-lg border border-emerald-900/60 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              {(Object.keys(AVG_CLIENTS_MODE_LABELS) as Array<keyof typeof AVG_CLIENTS_MODE_LABELS>).map(
                (key) => (
                  <option key={key} value={key}>
                    {AVG_CLIENTS_MODE_LABELS[key]}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            計画仮定（社/事務所）
            <input
              type="number"
              min={1}
              max={9999}
              value={planningAvgClients}
              onChange={(e) => setPlanningAvgClients(Number(e.target.value) || 80)}
              onBlur={() => {
                void persistAssumptions({
                  planning_avg_clients_per_firm: planningAvgClients,
                });
              }}
              className="mt-1 w-full rounded-lg border border-emerald-900/60 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-emerald-900/60 bg-slate-950/50 p-3">
            <p className="text-[10px] font-bold text-slate-500">逆算に採用</p>
            <p className="mt-1 text-2xl font-black text-white">
              {data.target.avgClientsPerFirm}
              <span className="ml-1 text-sm font-bold text-slate-400">社/事務所</span>
            </p>
            <p className="mt-1 text-[10px] text-emerald-400">
              {data.target.avgClientsSourceLabel ?? data.avgClientsActual.sourceLabel}
            </p>
            {data.target.actualReady && avgClientsMode === "auto" ? (
              <p className="mt-1 text-[10px] text-blue-300">実績切替可能（{data.assumptions.minFirmsForActualAvg} 事務所以上）</p>
            ) : null}
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400">
            <p>顧問先あり事務所平均</p>
            <p className="mt-1 text-lg font-bold text-slate-200">
              {actual.avgFirmsWithClients != null ? `${actual.avgFirmsWithClients} 社` : "—"}
            </p>
            <p className="mt-1 text-[10px]">{actual.firmsWithClients} / {actual.firmCount} 事務所</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400">
            <p>課金事務所平均</p>
            <p className="mt-1 text-lg font-bold text-slate-200">
              {actual.avgPayingFirms != null ? `${actual.avgPayingFirms} 社` : "—"}
            </p>
            <p className="mt-1 text-[10px]">{actual.payingFirmCount} 事務所が課金中</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400">
            <p>中央値 / レンジ</p>
            <p className="mt-1 text-lg font-bold text-slate-200">
              {actual.medianClientsPerFirm ?? "—"}
              <span className="ml-1 text-sm font-normal text-slate-500">
                （{actual.minClientsPerFirm}〜{actual.maxClientsPerFirm}）
              </span>
            </p>
            <p className="mt-1 text-[10px]">顧問先合計 {actual.totalClients.toLocaleString("ja-JP")} 社</p>
          </div>
        </div>
      </section>

      <div className="rounded-2xl border border-amber-800/50 bg-amber-950/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-amber-300">North Star — ARR 進捗</p>
            <p className="mt-1 text-3xl font-black text-white">{gap.progressPercent.toFixed(1)}%</p>
            <p className="mt-1 text-xs text-slate-400">
              現在 {formatOku(data.current.arrYen)} → 目標 {formatOku(data.target.arrYen)}
            </p>
          </div>
          <div className="h-3 w-full max-w-md overflow-hidden rounded-full bg-slate-800 sm:w-64">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-400"
              style={{ width: `${Math.min(100, gap.progressPercent)}%` }}
            />
          </div>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricKpiCard
          label="目標 ARR"
          value={formatOku(rec.targetArrYen)}
          sub={`${data.target.horizonYears} 年で達成`}
          tone="amber"
        />
        <MetricKpiCard
          label="目標 課金事務所数"
          value={`${rec.targetPayingFirms.toLocaleString("ja-JP")} 社`}
          sub={`顧問先 ${rec.targetTotalClients.toLocaleString("ja-JP")} 社（採用平均 ${data.target.avgClientsPerFirm}）`}
          tone="emerald"
        />
        <MetricKpiCard
          label="月間 新規獲得（事務所）"
          value={`${rec.monthlyGrossAcquisitions.toFixed(1)} 社/月`}
          sub={`週 ${rec.weeklyGrossAcquisitions.toFixed(1)} 社 · 純増 ${rec.monthlyNetNewFirms.toFixed(1)} + チャーン補填 ${rec.monthlyChurnReplacement.toFixed(1)}`}
          tone="violet"
        />
        <MetricKpiCard
          label="月間 新規顧問先"
          value={`${rec.monthlyNewClients.toLocaleString("ja-JP")} 社/月`}
          sub={`MRR 増分目標 ${formatYen(gap.monthlyMrrGrowthYen)}/月`}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 text-slate-200">
            <Target className="h-4 w-4" />
            <h3 className="text-sm font-bold">推奨 KPI（MA / 経営）</h3>
          </div>
          <table className="mt-4 w-full text-xs">
            <tbody className="text-slate-300">
              <tr className="border-t border-slate-800">
                <td className="py-2 text-slate-500">目標 ARR（グロス）</td>
                <td className="py-2 text-right font-bold">{formatOku(rec.targetArrYen)}</td>
              </tr>
              <tr className="border-t border-slate-800">
                <td className="py-2 text-slate-500">事務所あたり ARR（想定）</td>
                <td className="py-2 text-right font-bold">{formatYen(rec.arrPerFirmYen)}</td>
              </tr>
              <tr className="border-t border-slate-800">
                <td className="py-2 text-slate-500">Net ARR / 事務所（パートナー控除後）</td>
                <td className="py-2 text-right">{formatYen(rec.netArrPerFirmYen)}</td>
              </tr>
              <tr className="border-t border-slate-800">
                <td className="py-2 text-slate-500">年間ロゴ・チャーン上限</td>
                <td className="py-2 text-right font-bold text-emerald-300">
                  ≤ {formatPercent(rec.targetAnnualLogoChurnMax)}（ストレッチ ≤{" "}
                  {formatPercent(rec.targetAnnualLogoChurnStretch)}）
                </td>
              </tr>
              <tr className="border-t border-slate-800">
                <td className="py-2 text-slate-500">現在のチャーン</td>
                <td className="py-2 text-right">{formatPercent(data.current.logoChurnRate)}</td>
              </tr>
              <tr className="border-t border-slate-800">
                <td className="py-2 text-slate-500">ARR ギャップ</td>
                <td className="py-2 text-right font-bold text-amber-300">{formatOku(gap.arrYen)}</td>
              </tr>
              <tr className="border-t border-slate-800">
                <td className="py-2 text-slate-500">事務所ギャップ</td>
                <td className="py-2 text-right">+{gap.payingFirms.toLocaleString("ja-JP")} 社</td>
              </tr>
              <tr className="border-t border-slate-800">
                <td className="py-2 text-slate-500">参考企業価値（ARR 10x）</td>
                <td className="py-2 text-right">{formatOku(rec.valuationAt10xArrYen)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-[10px] text-slate-500">{rec.valuationMultipleNote}</p>
        </article>

        <article className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 text-slate-200">
            <TrendingUp className="h-4 w-4" />
            <h3 className="text-sm font-bold">ARR マイルストーン</h3>
          </div>
          <ul className="mt-4 space-y-2">
            {data.milestones.map((m) => (
              <li
                key={m.label}
                className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs"
              >
                <span className="font-bold text-slate-300">
                  {m.label} — {formatOku(m.arrYen)}
                </span>
                <span className="text-slate-500">
                  約 {m.monthIndex} ヶ月目 · {m.payingFirms.toLocaleString("ja-JP")} 事務所
                </span>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <SimpleBarChart
          title="達成期間別 — 必要な月間獲得（事務所）"
          items={data.horizonScenarios.map((s) => ({
            label: `${s.horizonYears} 年`,
            value: s.monthlyGrossAcquisitions,
            subLabel: `週${s.weeklyGrossAcquisitions.toFixed(1)}`,
          }))}
          valueFormatter={(n) => `${n.toFixed(1)} 社/月`}
        />
        <SimpleBarChart
          title="平均顧問先数別 — 目標事務所数（★=採用値）"
          items={data.clientAssumptionScenarios.map((s) => ({
            label: s.isActual
              ? `★ 実績 ${s.avgClientsPerFirm} 社`
              : s.isPlanning
                ? `◆ 仮定 ${s.avgClientsPerFirm} 社`
                : `平均 ${s.avgClientsPerFirm} 社`,
            value: s.targetPayingFirms,
            subLabel: formatOku(s.arrPerFirmYen) + "/事務所",
          }))}
          valueFormatter={(n) => `${n.toLocaleString("ja-JP")} 社`}
        />
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
        <h3 className="text-sm font-bold text-slate-200">チャーン水準別 — 月間獲得の違い</h3>
        <p className="mt-1 text-xs text-slate-500">
          チャーンが高いほど「補填獲得」が増え、同じ ARR 目標でも月間の新規契約が必要になります。
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {data.churnScenarios.map((s) => (
            <div
              key={s.tier}
              className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs"
            >
              <p className="font-bold text-slate-200">{s.label}</p>
              <p className="mt-1 text-2xl font-black text-white">
                {s.monthlyGrossAcquisitions.toFixed(1)}
                <span className="ml-1 text-sm font-bold text-slate-400">社/月</span>
              </p>
              <p className="mt-2 text-slate-500">{s.note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-blue-900/40 bg-blue-950/20 p-4 text-xs text-slate-300">
        <p className="font-bold text-blue-200">計算ロジック（概要）</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-slate-400">
          <li>
            事務所 ARR = （¥{data.pricing.firmBaseYenMonthly.toLocaleString()} + ¥
            {data.pricing.firmPerClientYenMonthly} × 顧問先数）× 12
          </li>
          <li>目標事務所数 = 目標 ARR ÷ 事務所あたり ARR（切り上げ）</li>
          <li>月間獲得 = 純増（ギャップ ÷ 月数）+ チャーン補填（平均事務所数 × 月次チャーン率）</li>
          <li>
            パートナー経由 {formatPercent(data.target.partnerAttachRate)} 想定時、Net ARR は手数料{" "}
            {data.pricing.partnerCommissionPercent}% を控除
          </li>
        </ul>
      </section>

      {error && <p className="text-sm text-rose-400">{error}</p>}
    </div>
  );
}
