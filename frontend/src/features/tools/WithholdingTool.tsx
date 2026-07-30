"use client";

import { useEffect, useMemo, useState } from "react";
import {
  calcWithholding,
  fetchWithholdingTable,
  type WithholdingCalc,
  type WithholdingTable,
} from "@/lib/taxx-tools-api";
import { ToolShell } from "@/features/tools/ToolShell";
import { Field, NumInput, ResultCard, yen } from "@/features/tools/ui";
import { toolsTheme } from "@/features/tools/taxx-tools-theme";
import {
  buildWithholdingDisplayRows,
  matchWithholdingRowMin,
  withholdingKouColIndex,
} from "@/features/tools/withholding-display";

export function WithholdingTool() {
  const [salary, setSalary] = useState(300_000);
  const [dependents, setDependents] = useState(0);
  const [kou, setKou] = useState<WithholdingCalc | null>(null);
  const [otsu, setOtsu] = useState<WithholdingCalc | null>(null);
  const [table, setTable] = useState<WithholdingTable | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchWithholdingTable()
      .then((d) => setTable(d.table))
      .catch(() => setTable(null));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void Promise.all([
        calcWithholding({ salary, dependents, kind: "kou" }),
        calcWithholding({ salary, dependents, kind: "otsu" }),
      ])
        .then(([k, o]) => {
          setKou(k);
          setOtsu(o);
          setError(null);
        })
        .catch((e) => {
          setKou(null);
          setOtsu(null);
          setError(e instanceof Error ? e.message : "計算に失敗しました");
        });
    }, 250);
    return () => clearTimeout(t);
  }, [salary, dependents]);

  const displayRows = useMemo(() => (table ? buildWithholdingDisplayRows(table) : []), [table]);
  const matchedMin = table ? matchWithholdingRowMin(table, salary) : null;
  const kouColIdx = table ? withholdingKouColIndex(table, dependents) : -1;

  return (
    <ToolShell
      title="源泉徴収税額表ビューア"
      subtitle="給与所得の源泉徴収税額表（月額表）に基づき、その月の源泉所得税を試算します。"
      category="源泉所得税"
      sourceUrl={table?.source_url}
      sourceLabel="国税庁 税額表"
      asOf={kou?.valid_from ?? undefined}
    >
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="社会保険料等控除後の給与（円）" htmlFor="sal">
            <NumInput id="sal" value={salary} onValueChange={setSalary} formatWithCommas className="w-52 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </Field>
          <Field label="扶養親族等の数" htmlFor="dep">
            <NumInput id="dep" value={dependents} onValueChange={setDependents} className="w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </Field>
        </div>

        <ResultCard
          metrics={
            kou && otsu
              ? [
                  { label: "甲欄（申告書あり）", value: yen(kou.tax) },
                  { label: "乙欄（申告書なし）", value: yen(otsu.tax) },
                ]
              : null
          }
          placeholder={error ?? "給与額を入力すると自動で結果が表示されます。"}
          breakdown={kou?.year_label ? <>{kou.year_label}</> : null}
        />
      </div>

      {table ? (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-black text-slate-700">{table.label_ja}（{table.year_label}）</h3>
          <div className="max-h-[440px] overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full border-collapse text-right text-[11px] text-slate-700">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-black uppercase text-slate-500">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2 text-right">以上</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right">未満</th>
                  {table.columns.map((c, i) => (
                    <th
                      key={c}
                      className={`border-b border-slate-200 px-3 py-2 text-right ${
                        i === kouColIdx ? "bg-[var(--taxx-green-100)] text-[var(--taxx-green-700)]" : ""
                      }`}
                    >
                      {c}
                    </th>
                  ))}
                  <th className="border-b border-slate-200 px-3 py-2 text-right bg-[var(--taxx-green-100)] text-[var(--taxx-green-700)]">乙</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((r) => {
                  const hit = r.min === matchedMin;
                  return (
                    <tr key={r.min} className={hit ? toolsTheme.tableRowHitStrong : "odd:bg-slate-50/50"}>
                      <td className="border-b border-slate-100 px-3 py-1.5 tabular-nums">{yen(r.min)}</td>
                      <td className="border-b border-slate-100 px-3 py-1.5 tabular-nums text-slate-400">
                        {r.max != null ? yen(r.max) : "—"}
                      </td>
                      {r.kou.map((k, i) => {
                        const colHit = i === kouColIdx;
                        const cross = hit && colHit;
                        return (
                          <td
                            key={i}
                            className={`border-b border-slate-100 px-3 py-1.5 tabular-nums ${
                              cross
                                ? toolsTheme.tableCellHitStrong
                                : colHit
                                  ? toolsTheme.tableCellHit
                                  : ""
                            }`}
                          >
                            {yen(k)}
                          </td>
                        );
                      })}
                      <td
                        className={`border-b border-slate-100 px-3 py-1.5 tabular-nums ${
                          hit ? toolsTheme.tableCellHitStrong : ""
                        }`}
                      >
                        {yen(r.otsu)}
                      </td>
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
