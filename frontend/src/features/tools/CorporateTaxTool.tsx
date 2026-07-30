"use client";

import { useEffect, useMemo, useState } from "react";
import {
  calcCorporateTax,
  fetchCorporateTaxTable,
  type CorporateTaxCalc,
  type CorporateTaxTable,
} from "@/lib/taxx-tools-api";
import { ToolShell } from "@/features/tools/ToolShell";
import { Field, NumInput, ResultCard, ratePct, yen } from "@/features/tools/ui";

function periodIndex(table: CorporateTaxTable, fyStart: string): number {
  let idx = 0;
  table.periods.forEach((p, i) => {
    if (p.start && p.start <= fyStart) idx = i;
  });
  return idx;
}

export function CorporateTaxTool() {
  const [income, setIncome] = useState(10_000_000);
  const [fyStart, setFyStart] = useState("2025-06-01");
  const [smallBusiness, setSmallBusiness] = useState(true);
  const [excludedBusiness, setExcludedBusiness] = useState(false);
  const [result, setResult] = useState<CorporateTaxCalc | null>(null);
  const [table, setTable] = useState<CorporateTaxTable | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchCorporateTaxTable()
      .then(setTable)
      .catch(() => setTable(null));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void calcCorporateTax({
        taxableIncome: income,
        fiscalYearStart: fyStart,
        smallBusiness,
        excludedBusiness,
      })
        .then((r) => {
          setResult(r);
          setError(null);
        })
        .catch((e) => {
          setResult(null);
          setError(e instanceof Error ? e.message : "計算に失敗しました");
        });
    }, 250);
    return () => clearTimeout(t);
  }, [income, fyStart, smallBusiness, excludedBusiness]);

  const pidx = table ? periodIndex(table, fyStart) : -1;

  // 計算に使った行を特定する（横ハイライト）。
  const { reducedIdx, standardIdx } = useMemo(() => {
    if (!table) return { reducedIdx: -1, standardIdx: -1 };
    let reduced = -1;
    let standard = -1;
    table.rows.forEach((row, i) => {
      if (row.corp_type !== "普通法人") return;
      const band = row.income_band || "";
      if (band.includes("800万円以下")) {
        if (excludedBusiness === band.includes("適用除外")) reduced = i;
      }
      if ((row.segment || "").startsWith("上記以外") && standard === -1) standard = i;
    });
    return { reducedIdx: reduced, standardIdx: standard };
  }, [table, excludedBusiness]);

  const reducedActive = !!result && result.reduced_portion > 0;
  const standardActive = !!result && result.standard_portion > 0;

  return (
    <ToolShell
      title="法人税率チェッカー"
      subtitle="普通法人の課税所得から法人税額を試算します（別表一の税額計算に相当）。"
      category="法人税"
      sourceUrl={table?.source_url}
      sourceLabel="国税庁 No.5759"
      asOf={result?.valid_from ?? undefined}
    >
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="課税所得金額（円）" htmlFor="income">
            <NumInput id="income" value={income} onValueChange={setIncome} formatWithCommas className="w-48 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </Field>
          <Field label="事業年度開始日" htmlFor="fy">
            <input
              id="fy"
              type="date"
              value={fyStart}
              onChange={(e) => setFyStart(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </Field>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <input type="checkbox" checked={smallBusiness} onChange={(e) => setSmallBusiness(e.target.checked)} className="h-4 w-4" />
            中小法人（資本金1億円以下）
          </label>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <input
              type="checkbox"
              checked={excludedBusiness}
              onChange={(e) => setExcludedBusiness(e.target.checked)}
              className="h-4 w-4"
              disabled={!smallBusiness}
            />
            適用除外事業者
          </label>
        </div>

        <ResultCard
          metrics={result ? [{ label: "法人税額", value: yen(result.tax) }] : null}
          placeholder={error ?? "上の値を入力すると自動で結果が表示されます。"}
          breakdown={
            result ? (
              <>
                {reducedActive ? (
                  <>
                    軽減 {ratePct(result.reduced_rate)} × {yen(result.reduced_portion)}
                    {standardActive ? " ＋ " : ""}
                  </>
                ) : null}
                {standardActive ? (
                  <>
                    標準 {ratePct(result.standard_rate)} × {yen(result.standard_portion)}
                  </>
                ) : null}
              </>
            ) : null
          }
        />
        <p className="mt-2 text-[11px] text-slate-500">
          課税所得は1,000円未満切捨後の金額を入力してください。税額の100円未満切捨は最終申告側で行います。
          {smallBusiness
            ? "　年800万円以下と超の部分で税率が分かれる場合は、下表の両方の行が光ります。"
            : "　大法人は全額を標準税率で計算します。"}
        </p>
      </div>

      {table ? (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-black text-slate-700">{table.label_ja}（税率マトリクス）</h3>
          <div className="overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full border-collapse text-left text-[11px] text-slate-700">
              <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-500">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2">法人区分</th>
                  <th className="border-b border-slate-200 px-3 py-2">所得区分</th>
                  {table.periods.map((p, i) => (
                    <th
                      key={p.start}
                      className={`border-b border-slate-200 px-3 py-2 text-right ${
                        i === pidx ? "bg-blue-100 text-blue-700" : ""
                      }`}
                    >
                      {p.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, ri) => {
                  const rowHit =
                    (ri === reducedIdx && reducedActive) || (ri === standardIdx && standardActive);
                  return (
                    <tr key={ri} className={rowHit ? "bg-blue-50" : "odd:bg-slate-50/50"}>
                      <td className="border-b border-slate-100 px-3 py-2 align-top">
                        <div className="font-bold">{row.corp_type}</div>
                        {row.segment ? <div className="text-[10px] text-slate-400">{row.segment}</div> : null}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2 align-top">{row.income_band}</td>
                      {row.rates.map((rate, ci) => {
                        const colHit = ci === pidx;
                        const cross = rowHit && colHit;
                        return (
                          <td
                            key={ci}
                            className={`border-b border-slate-100 px-3 py-2 text-right tabular-nums ${
                              cross
                                ? "bg-blue-200 font-black text-blue-900 ring-1 ring-inset ring-blue-400"
                                : colHit
                                  ? "bg-blue-50"
                                  : ""
                            }`}
                          >
                            {ratePct(rate)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </ToolShell>
  );
}
