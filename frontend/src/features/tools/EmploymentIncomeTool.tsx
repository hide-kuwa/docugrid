"use client";

import { useEffect, useState } from "react";
import {
  calcEmploymentIncome,
  fetchEmploymentIncomeTable,
  type EmploymentIncomeCalc,
  type EmploymentIncomeTable,
} from "@/lib/taxx-tools-api";
import { ToolShell } from "@/features/tools/ToolShell";
import { Field, NumInput, ResultCard, yen } from "@/features/tools/ui";

export function EmploymentIncomeTool() {
  const [revenue, setRevenue] = useState(5_000_000);
  const [result, setResult] = useState<EmploymentIncomeCalc | null>(null);
  const [table, setTable] = useState<EmploymentIncomeTable | null>(null);
  const [tableError, setTableError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchEmploymentIncomeTable()
      .then((t) => {
        setTable(t);
        setTableError(null);
      })
      .catch((e) => {
        setTable(null);
        setTableError(e instanceof Error ? e.message : "速算表の取得に失敗しました");
      });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void calcEmploymentIncome({ salaryRevenue: revenue })
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
  }, [revenue]);

  return (
    <ToolShell
      title="給与所得控除チェッカー"
      subtitle="給与収入（額面）から給与所得控除額と給与所得を計算します。"
      category="所得税"
      sourceUrl={table?.source_url ?? "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shoto/1410.htm"}
      sourceLabel="国税庁 No.1410"
      asOf={result?.valid_from ?? undefined}
    >
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="給与収入（額面・円）" htmlFor="rev">
            <NumInput id="rev" value={revenue} onValueChange={setRevenue} formatWithCommas className="w-52 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </Field>
        </div>

        <ResultCard
          metrics={
            result
              ? [
                  { label: "給与所得控除", value: yen(result.deduction) },
                  { label: "給与所得", value: yen(result.employment_income) },
                ]
              : null
          }
          placeholder={error ?? "給与収入を入力すると自動で結果が表示されます。"}
          breakdown={result?.band ? <>区分: {result.band}</> : null}
        />
        <p className="mt-2 text-[11px] text-slate-500">
          給与所得＝給与収入 − 給与所得控除。ここから各種所得控除を差し引いて課税所得を求めます。
        </p>
      </div>

      {table ? (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-black text-slate-700">
            {table.label_ja}の速算表{table.label ? `（${table.label}）` : ""}
          </h3>
          <div className="overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full border-collapse text-left text-[11px] text-slate-700">
              <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-500">
                <tr>
                  {table.columns.map((col) => {
                    const colHit = !!result && col.key === "formula";
                    return (
                      <th
                        key={col.key}
                        className={`border-b border-slate-200 px-3 py-2 ${
                          colHit ? "bg-blue-100 text-blue-700" : ""
                        }`}
                      >
                        {col.label}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, ri) => {
                  const rowHit = !!result && String(row.band) === String(result.band);
                  return (
                    <tr key={ri} className={rowHit ? "bg-blue-50" : "odd:bg-slate-50/50"}>
                      {table.columns.map((col) => {
                        const colHit = !!result && col.key === "formula";
                        const cross = rowHit && colHit;
                        return (
                          <td
                            key={col.key}
                            className={`border-b border-slate-100 px-3 py-2 ${
                              cross
                                ? "bg-blue-200 font-black text-blue-900 ring-1 ring-inset ring-blue-400"
                                : colHit
                                  ? "bg-blue-50"
                                  : ""
                            }`}
                          >
                            {String(row[col.key] ?? "—")}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {table.notes.length > 0 ? (
            <ul className="mt-3 space-y-1 rounded-xl border border-slate-200 bg-white p-3 text-[10px] text-slate-500">
              {table.notes.map((n, i) => (
                <li key={i}>・{n}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : tableError ? (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          速算表を読み込めませんでした（{tableError}）。ページを再読み込みしてください。
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs text-slate-500">
          速算表を読み込み中です…
        </div>
      )}
    </ToolShell>
  );
}
