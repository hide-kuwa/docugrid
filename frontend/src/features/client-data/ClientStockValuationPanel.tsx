"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calculator, Loader2 } from "lucide-react";
import type { OrgClient } from "@/config/organization";
import { WipBanner } from "@/components/work-in-progress";
import { CanonicalValuationMetricsEditor } from "@/features/client-data/CanonicalValuationMetricsEditor";
import { CanonicalSimLabeledField } from "@/features/client-data/components/CanonicalSimField";
import { SimDiffLegend, SimDisplayValue } from "@/features/client-data/components/SimDisplayValue";
import { SimulationEditToolbar } from "@/features/client-data/components/SimulationEditToolbar";
import { useSimulationOverlay } from "@/features/client-data/hooks/use-simulation-overlay";
import {
  fetchValuationPayload,
  type ValuationInputsPayload,
} from "@/features/client-data/lib/client-valuation-api";
import {
  ssotHasAnyChanges,
  useSsotPropagateReload,
} from "@/features/client-data/hooks/use-ssot-propagate-reload";
import { valuationHasAnyDiff } from "@/features/client-data/lib/sim-diff";
import {
  computeValuation,
  formatYen,
  formatYenPerShare,
  VALUATION_METHODS,
  type ValuationMethodId,
} from "@/lib/stock-valuation";

const EMPTY_INPUTS: ValuationInputsPayload = {
  issued_shares: 0,
  capital_yen: 0,
  net_assets_yen: 0,
  annual_profit_yen: 0,
  annual_dividend_yen: 0,
};

function cloneInputs(payload: ValuationInputsPayload): ValuationInputsPayload {
  return { ...payload };
}

function toComputeInputs(p: ValuationInputsPayload) {
  return {
    issuedShares: p.issued_shares,
    capitalYen: p.capital_yen,
    netAssetsYen: p.net_assets_yen,
    annualProfitYen: p.annual_profit_yen,
    annualDividendYen: p.annual_dividend_yen,
  };
}

function computeMethods(inputs: ValuationInputsPayload) {
  const out: Record<string, { per_share_yen: number; total_yen: number; note?: string }> = {};
  for (const method of VALUATION_METHODS) {
    const result = computeValuation(toComputeInputs(inputs), method.id);
    if (result.perShareYen != null && result.totalYen != null) {
      out[method.id] = {
        per_share_yen: result.perShareYen,
        total_yen: result.totalYen,
        note: result.note,
      };
    }
  }
  return out;
}

type Props = {
  client: OrgClient;
  canEdit?: boolean;
};

export function ClientStockValuationPanel({ client, canEdit }: Props) {
  const [canonicalInputs, setCanonicalInputs] = useState<ValuationInputsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeMethod, setActiveMethod] = useState<ValuationMethodId>("composite");

  const sim = useSimulationOverlay({
    clientId: client.id,
    panelKey: "valuation",
    canonical: canonicalInputs ?? EMPTY_INPUTS,
    clone: cloneInputs,
  });

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchValuationPayload(client.id);
      setCanonicalInputs(payload.inputs);
    } catch {
      setError("評価データの読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [client.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useSsotPropagateReload(client.id, () => void reload(), ssotHasAnyChanges);

  const methods = useMemo(() => computeMethods(sim.display), [sim.display]);
  const canonicalMethods = useMemo(() => computeMethods(sim.canonical), [sim.canonical]);
  const hasDiff = valuationHasAnyDiff(sim.canonical, sim.display);

  const patchInput = (field: keyof ValuationInputsPayload, value: number) => {
    sim.patchDraft((prev) => ({ ...prev, [field]: value }));
  };

  if (client.category === "individual") {
    return (
      <div className="flex flex-1 items-center justify-center bg-slate-50 p-12 text-center">
        <p className="text-sm text-slate-500">自社株評価は法人顧問先向けの機能です。</p>
      </div>
    );
  }

  if ((loading && !canonicalInputs) || !sim.overlayReady) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        評価データを読み込み中…
      </div>
    );
  }

  const displayInputs = sim.display;
  const draftInputs = sim.isEditing && sim.draft ? sim.draft : displayInputs;
  const canonical = sim.canonical;
  const active = methods[activeMethod];
  const activeCanonical = canonicalMethods[activeMethod];
  const activeMeta = VALUATION_METHODS.find((m) => m.id === activeMethod)!;
  const displayError = error ?? sim.persistError;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-50 p-4 md:p-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-violet-600">
            <Calculator className="h-3.5 w-3.5" />
            VALUATION
            {sim.hasOverlay ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-semibold normal-case text-amber-800">
                シミュレーション保存済
              </span>
            ) : null}
          </div>
          <h2 className="mt-1 text-lg font-black text-slate-800">{client.name} — 非上場株式評価</h2>
          <p className="mt-1 text-sm text-slate-500">
            正規値は client_metrics から読み取り専用。シミュレーションは別 DB に保存され、この試算のみに反映されます。
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

      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,20rem)_1fr]">
        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-xs font-bold text-slate-700">評価の前提数値</h3>
            {sim.isEditing ? (
              <p className="mt-1 text-[10px] text-slate-400">
                正規（グレー）とシミュレーション（正規と違うと琥珀色）
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                <SimDiffRow
                  label="発行済株式数"
                  canonical={canonical.issued_shares}
                  display={displayInputs.issued_shares}
                  suffix="株"
                />
                <SimDiffRow
                  label="資本金"
                  canonical={canonical.capital_yen}
                  display={displayInputs.capital_yen}
                  suffix="円"
                />
                <SimDiffRow
                  label="純資産価額"
                  canonical={canonical.net_assets_yen}
                  display={displayInputs.net_assets_yen}
                  suffix="円"
                />
                <SimDiffRow
                  label="年利益"
                  canonical={canonical.annual_profit_yen}
                  display={displayInputs.annual_profit_yen}
                  suffix="円"
                />
                <SimDiffRow
                  label="年配当額"
                  canonical={canonical.annual_dividend_yen}
                  display={displayInputs.annual_dividend_yen}
                  suffix="円"
                />
              </div>
            )}
            {sim.isEditing ? (
              <div className="mt-3 space-y-3">
                <CanonicalSimLabeledField
                  label="発行済株式数"
                  suffix="株"
                  editing
                  canonical={canonical.issued_shares}
                  simValue={draftInputs.issued_shares}
                  onSimChange={(n) => patchInput("issued_shares", n)}
                />
                <CanonicalSimLabeledField
                  label="資本金"
                  suffix="円"
                  editing
                  canonical={canonical.capital_yen}
                  simValue={draftInputs.capital_yen}
                  onSimChange={(n) => patchInput("capital_yen", n)}
                />
                <CanonicalSimLabeledField
                  label="純資産価額"
                  suffix="円"
                  editing
                  canonical={canonical.net_assets_yen}
                  simValue={draftInputs.net_assets_yen}
                  onSimChange={(n) => patchInput("net_assets_yen", n)}
                />
                <CanonicalSimLabeledField
                  label="年利益（課税所得）"
                  suffix="円"
                  editing
                  canonical={canonical.annual_profit_yen}
                  simValue={draftInputs.annual_profit_yen}
                  onSimChange={(n) => patchInput("annual_profit_yen", n)}
                />
                <CanonicalSimLabeledField
                  label="年配当額"
                  suffix="円"
                  editing
                  canonical={canonical.annual_dividend_yen}
                  simValue={draftInputs.annual_dividend_yen}
                  onSimChange={(n) => patchInput("annual_dividend_yen", n)}
                />
              </div>
            ) : null}
          </section>
          <WipBanner
            kind="partial"
            title="非上場株式評価（簡易試算）"
            message="評価通達どおりの正式計算・大株主・会社規模等は未対応です。シミュレーションは別 DB に保存されます。"
            className="mt-0"
          />
        </aside>

        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {VALUATION_METHODS.map((method) => {
              const result = methods[method.id];
              const canonResult = canonicalMethods[method.id];
              const resultDiff =
                result &&
                canonResult &&
                (result.per_share_yen !== canonResult.per_share_yen ||
                  result.total_yen !== canonResult.total_yen);
              return (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => setActiveMethod(method.id)}
                  className={`rounded-2xl border p-4 text-left transition-all ${
                    method.id === activeMethod
                      ? "border-violet-400 bg-violet-50 shadow-md ring-2 ring-violet-200"
                      : resultDiff
                        ? "border-amber-200 bg-amber-50/30 hover:border-amber-300"
                        : "border-slate-200 bg-white hover:border-violet-200"
                  }`}
                >
                  <p className="text-[10px] font-bold text-slate-500">{method.shortLabel}</p>
                  {result && canonResult ? (
                    <p className="mt-1 text-lg font-black tabular-nums">
                      <SimDisplayValue
                        canonical={canonResult.per_share_yen}
                        display={result.per_share_yen}
                        format={formatYenPerShare}
                        size="base"
                        className="!text-lg !font-black"
                      />
                    </p>
                  ) : (
                    <p className="mt-1 text-lg font-black tabular-nums text-slate-800">
                      {formatYenPerShare(result?.per_share_yen ?? 0)}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
          {active ? (
            <section
              className={`rounded-2xl border bg-white p-5 shadow-sm ${
                hasDiff ? "border-amber-200" : "border-violet-200"
              }`}
            >
              <h3 className="text-sm font-bold text-violet-900">{activeMeta.label}</h3>
              <p className="mt-1 text-xs text-slate-500">{activeMeta.description}</p>
              {active.note ? (
                <p className="mt-1 text-[10px] text-slate-400">{active.note}</p>
              ) : null}
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-violet-50 px-4 py-3">
                  <p className="text-[10px] font-bold text-violet-600">1株あたり</p>
                  <p className="mt-1 text-2xl font-black tabular-nums">
                    {activeCanonical ? (
                      <SimDisplayValue
                        canonical={activeCanonical.per_share_yen}
                        display={active.per_share_yen}
                        format={formatYenPerShare}
                        size="base"
                        className="!text-2xl !font-black"
                      />
                    ) : (
                      <span className="text-violet-900">
                        {formatYenPerShare(active.per_share_yen)}
                      </span>
                    )}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 px-4 py-3">
                  <p className="text-[10px] font-bold text-slate-500">会社全体</p>
                  <p className="mt-1 text-2xl font-black tabular-nums">
                    {activeCanonical ? (
                      <SimDisplayValue
                        canonical={activeCanonical.total_yen}
                        display={active.total_yen}
                        format={formatYen}
                        size="base"
                        className="!text-2xl !font-black"
                      />
                    ) : (
                      <span className="text-slate-800">{formatYen(active.total_yen)}</span>
                    )}
                  </p>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </div>

      {canonicalInputs ? (
        <div className="mx-auto mt-6 w-full max-w-6xl">
          <CanonicalValuationMetricsEditor
            clientId={client.id}
            canonical={canonicalInputs}
            canEdit={canEdit}
            onUpdated={() => void reload()}
          />
        </div>
      ) : null}
    </div>
  );
}

function SimDiffRow({
  label,
  canonical,
  display,
  suffix,
}: {
  label: string;
  canonical: number;
  display: number;
  suffix: string;
}) {
  const format = (n: number) => (n > 0 ? `${n.toLocaleString()} ${suffix}` : "—");
  return (
    <div className="flex justify-between gap-2 border-b border-slate-50 py-1 text-xs">
      <span className="text-slate-500">{label}</span>
      <SimDisplayValue canonical={canonical} display={display} format={format} size="sm" />
    </div>
  );
}
