"use client";

import { useEffect, useMemo, useState } from "react";
import {
  calcLocalTax,
  fetchLocalTaxTables,
  type LocalTaxCalc,
  type LocalTaxRefTable,
  type LocalTaxTables,
} from "@/lib/taxx-tools-api";
import { ToolShell } from "@/features/tools/ToolShell";
import { Field, NumInput, ResultCard, ratePct, yen } from "@/features/tools/ui";

const JURISDICTIONS = [
  { value: "tokyo_23", label: "東京都23区" },
  { value: "tokyo_muni", label: "東京都市町村" },
];

function amountRows(result: LocalTaxCalc) {
  return [
    { label: "法人税（国税）", value: result.national, note: "法人税率表から計算" },
    {
      label: "地方法人税",
      value: result.local_corporate,
      note: `法人税額 x ${ratePct(result.local_corporate_rate)}`,
    },
    {
      label: "法人住民税 法人税割",
      value: result.resident_levy,
      note: `${result.jurisdiction_label} / ${ratePct(result.resident_levy_rate)}`,
    },
    {
      label: "法人住民税 均等割",
      value: result.percapita,
      note: result.percapita_band ?? "資本金等・従業員数で判定",
    },
    { label: "法人事業税", value: result.enterprise, note: "所得割（外形標準課税・事業所税は対象外）" },
    {
      label: "特別法人事業税",
      value: result.special_enterprise,
      note: `事業税所得割 x ${ratePct(result.special_enterprise_rate)}`,
    },
  ];
}

function cellText(value: unknown, type?: string): string {
  if (value == null) return "-";
  if (type === "rate") return ratePct(value);
  if (type === "yen") return yen(value);
  return String(value);
}

function isEnterpriseRowActive(row: Record<string, unknown>, result: LocalTaxCalc): boolean {
  const rowBand = String(row.income_band ?? "");
  return result.enterprise_bands.some((band) => String(band.income_band ?? "") === rowBand);
}

function isPercapitaRowActive(row: Record<string, unknown>, result: LocalTaxCalc): boolean {
  if (result.percapita_band && String(row.capital_band ?? "") === String(result.percapita_band)) {
    return true;
  }
  const max = row.capital_max;
  return max == null || result.capital <= Number(max);
}

function LocalTaxRefTableView({
  title,
  table,
  activeRow,
  activeCell,
}: {
  title: string;
  table: LocalTaxRefTable;
  activeRow: (row: Record<string, unknown>) => boolean;
  activeCell: (row: Record<string, unknown>, key: string) => boolean;
}) {
  return (
    <div className="mt-6">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <h3 className="text-sm font-black text-slate-700">{title}</h3>
        <span className="text-[11px] text-slate-500">{table.label ?? table.valid_from}</span>
      </div>
      <div className="overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full border-collapse text-left text-[11px] text-slate-700">
          <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-500">
            <tr>
              {table.columns.map((col) => (
                <th key={col.key} className="border-b border-slate-200 px-3 py-2">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, idx) => {
              const rowHit = activeRow(row);
              return (
                <tr key={idx} className="odd:bg-slate-50/50">
                  {table.columns.map((col) => {
                    const cellHit = rowHit && activeCell(row, col.key);
                    return (
                      <td
                        key={col.key}
                        className={`border-b border-slate-100 px-3 py-2 align-top ${
                          col.type === "rate" || col.type === "yen" ? "text-right tabular-nums" : ""
                        } ${
                          cellHit
                            ? "bg-blue-200 font-black text-blue-950 ring-1 ring-inset ring-blue-400"
                            : ""
                        }`}
                      >
                        {cellText(row[col.key], col.type)}
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
  );
}

export function LocalTaxTool() {
  const [income, setIncome] = useState(10_000_000);
  const [fyStart, setFyStart] = useState("2026-04-01");
  const [smallBusiness, setSmallBusiness] = useState(true);
  const [capital, setCapital] = useState(10_000_000);
  const [employees, setEmployees] = useState(30);
  const [jurisdiction, setJurisdiction] = useState("tokyo_23");
  const [useExcessRate, setUseExcessRate] = useState(false);
  const [result, setResult] = useState<LocalTaxCalc | null>(null);
  const [tables, setTables] = useState<LocalTaxTables | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchLocalTaxTables({ asOf: fyStart })
      .then(setTables)
      .catch(() => setTables(null));
  }, [fyStart]);

  useEffect(() => {
    const t = setTimeout(() => {
      void calcLocalTax({
        taxableIncome: income,
        fiscalYearStart: fyStart,
        smallBusiness,
        capital,
        employees,
        jurisdiction,
        useExcessRate,
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
  }, [income, fyStart, smallBusiness, capital, employees, jurisdiction, useExcessRate]);

  const rows = useMemo(() => (result ? amountRows(result) : []), [result]);

  return (
    <ToolShell
      title="法人地方税シミュレーター"
      subtitle="課税所得から法人税、地方法人税、法人住民税、法人事業税、特別法人事業税をまとめて概算します。"
      category="地方税（法人）"
      sourceUrl="https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/ichiran.html"
      sourceLabel="総務省 地方税制度"
      asOf={result?.fiscal_year_start}
    >
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="課税所得（円）" htmlFor="local-income">
            <NumInput id="local-income" value={income} onValueChange={setIncome} formatWithCommas className="w-52 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </Field>
          <Field label="事業年度開始日" htmlFor="local-fy">
            <input
              id="local-fy"
              type="date"
              value={fyStart}
              onChange={(e) => setFyStart(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </Field>
          <Field label="資本金等の額（円）" htmlFor="local-capital">
            <NumInput id="local-capital" value={capital} onValueChange={setCapital} formatWithCommas className="w-52 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </Field>
          <Field label="従業員数" htmlFor="local-employees">
            <NumInput id="local-employees" value={employees} onValueChange={setEmployees} className="w-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </Field>
          <Field label="自治体区分" htmlFor="local-jurisdiction">
            <select
              id="local-jurisdiction"
              value={jurisdiction}
              onChange={(e) => setJurisdiction(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              {JURISDICTIONS.map((j) => (
                <option key={j.value} value={j.value}>
                  {j.label}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <input type="checkbox" checked={smallBusiness} onChange={(e) => setSmallBusiness(e.target.checked)} className="h-4 w-4" />
            中小法人として法人税を計算
          </label>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <input type="checkbox" checked={useExcessRate} onChange={(e) => setUseExcessRate(e.target.checked)} className="h-4 w-4" />
            超過税率を適用
          </label>
        </div>

        <ResultCard
          metrics={result ? [{ label: "合計税額", value: yen(result.total) }] : null}
          placeholder={error ?? "上の値を入力すると自動で試算します。"}
          breakdown={result ? `軽減税率: ${result.reduced_rate_applicable ? "適用" : "不適用"}` : null}
        />
      </div>

      {result ? (
        <>
          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-black uppercase text-slate-500">
                <tr>
                  <th className="border-b border-slate-200 px-4 py-3">税目</th>
                  <th className="border-b border-slate-200 px-4 py-3 text-right">税額</th>
                  <th className="border-b border-slate-200 px-4 py-3">前提</th>
                </tr>
              </thead>
              <tbody className="text-slate-700">
                {rows.map((row) => (
                  <tr key={row.label} className="odd:bg-slate-50/50">
                    <td className="border-b border-slate-100 px-4 py-3 font-bold">{row.label}</td>
                    <td className="border-b border-slate-100 px-4 py-3 text-right font-black tabular-nums text-slate-900">
                      {yen(row.value)}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3 text-xs text-slate-500">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {tables ? (
            <>
              <LocalTaxRefTableView
                title="法人住民税 法人税割"
                table={tables.resident_levy}
                activeRow={(row) => String(row.jurisdiction ?? "") === result.jurisdiction}
                activeCell={(_, key) => key === (result.use_excess_rate ? "excess_rate" : "standard_rate")}
              />

              <LocalTaxRefTableView
                title="法人住民税 均等割"
                table={tables.percapita}
                activeRow={(row) => isPercapitaRowActive(row, result)}
                activeCell={(_, key) =>
                  key === "pref" || key === (result.employees > 50 ? "city_over50" : "city_le50")
                }
              />

              <LocalTaxRefTableView
                title="法人事業税 所得割"
                table={tables.enterprise}
                activeRow={(row) => isEnterpriseRowActive(row, result)}
                activeCell={(_, key) => key === (result.use_excess_rate ? "excess_rate" : "standard_rate")}
              />
            </>
          ) : null}

          <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
            外形標準課税、事業所税、事業税の損金算入タイミングは含めていません。東京都の登録マスタを既定にした概算です。
          </p>
        </>
      ) : null}
    </ToolShell>
  );
}
