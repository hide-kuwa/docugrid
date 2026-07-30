"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchAssociationHealthAmountTable,
  fetchCorporateTaxTable,
  fetchEmploymentIncomeTable,
  fetchLocalTaxTables,
  fetchWithholdingTable,
  type AssociationHealthAmountTable,
  type CorporateTaxTable,
  type EmploymentIncomeTable,
  type ExecCompCorporateBreakdown,
  type LocalTaxCalc,
  type LocalTaxRefTable,
  type LocalTaxTables,
  type WithholdingTable,
} from "@/lib/taxx-tools-api";
import { ratePct, yen } from "@/features/tools/ui";
import { toolsTheme } from "@/features/tools/taxx-tools-theme";
import {
  buildWithholdingDisplayRows,
  matchSocialGrade,
  matchWithholdingRowMin,
  withholdingKouColIndex,
} from "@/features/tools/withholding-display";

const SECTIONS = [
  { id: "sim", label: "シミュレーター" },
  { id: "ref-corporate", label: "法人税" },
  { id: "ref-local", label: "地方税" },
  { id: "ref-employment", label: "給与所得控除" },
  { id: "ref-withholding", label: "源泉徴収" },
  { id: "ref-social", label: "社会保険" },
] as const;

function periodIndex(table: CorporateTaxTable, fyStart: string): number {
  let idx = 0;
  table.periods.forEach((p, i) => {
    if (p.start && p.start <= fyStart) idx = i;
  });
  return idx;
}

function cellText(value: unknown, type?: string): string {
  if (value == null) return "-";
  if (type === "rate") return ratePct(value);
  if (type === "yen") return yen(value);
  return String(value);
}

function fmtAmt(n: unknown): string {
  const v = Number(n);
  if (Number.isNaN(v) || v === 0) return "—";
  return v.toLocaleString("ja-JP", {
    minimumFractionDigits: Number.isInteger(v) ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

function fmtYenBand(min: unknown, max: unknown): string {
  const lo = min == null ? "" : Number(min).toLocaleString("ja-JP");
  const hi = max == null ? "" : Number(max).toLocaleString("ja-JP");
  if (!lo && hi) return `〜 ${hi}`;
  if (lo && !hi) return `${lo} 〜`;
  if (!lo && !hi) return "—";
  return `${lo} 〜 ${hi}`;
}

function isEnterpriseRowActive(row: Record<string, unknown>, detail: LocalTaxCalc): boolean {
  const rowBand = String(row.income_band ?? "");
  return detail.enterprise_bands.some((band) => String(band.income_band ?? "") === rowBand);
}

function isPercapitaRowActive(row: Record<string, unknown>, detail: LocalTaxCalc): boolean {
  if (detail.percapita_band && String(row.capital_band ?? "") === String(detail.percapita_band)) {
    return true;
  }
  const max = row.capital_max;
  return max == null || detail.capital <= Number(max);
}

function scrollRowWithinContainer(
  container: HTMLDivElement | null,
  row: HTMLTableRowElement | null,
) {
  if (!container || !row) return;
  const rowTop = row.offsetTop;
  const rowBottom = rowTop + row.offsetHeight;
  const viewTop = container.scrollTop;
  const viewBottom = viewTop + container.clientHeight;
  if (rowTop < viewTop || rowBottom > viewBottom) {
    container.scrollTo({
      top: Math.max(0, rowTop - container.clientHeight / 2 + row.offsetHeight / 2),
      behavior: "smooth",
    });
  }
}

function LocalTaxRefTableBlock({
  title,
  resultAmount,
  meta,
  table,
  activeRow,
  activeCell,
  scrollKey,
  maxHeightClass,
}: {
  title: string;
  resultAmount?: number | null;
  meta?: string | null;
  table: LocalTaxRefTable;
  activeRow: (row: Record<string, unknown>) => boolean;
  activeCell: (row: Record<string, unknown>, key: string) => boolean;
  scrollKey?: string | null;
  maxHeightClass?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const highlightRowRef = useRef<HTMLTableRowElement | null>(null);
  const firstHighlightAssigned = useRef(false);

  useEffect(() => {
    firstHighlightAssigned.current = false;
  }, [scrollKey, table]);

  useEffect(() => {
    if (!scrollKey || !containerRef.current || !highlightRowRef.current) return;
    const container = containerRef.current;
    const row = highlightRowRef.current;
    const id = window.requestAnimationFrame(() => {
      scrollRowWithinContainer(container, row);
    });
    return () => window.cancelAnimationFrame(id);
  }, [scrollKey, title]);

  return (
    <div className="mt-4">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <h4 className="flex flex-wrap items-baseline gap-2 text-xs font-black text-slate-700">
          <span>{title}</span>
          {resultAmount != null ? (
            <span className={toolsTheme.amountBadge}>
              {yen(resultAmount)}
            </span>
          ) : null}
        </h4>
        {meta ? <span className="text-[11px] text-slate-500">{meta}</span> : null}
      </div>
      <div
        ref={containerRef}
        className={`overflow-auto rounded-xl border border-slate-200 bg-white ${maxHeightClass ?? ""}`}
      >
        <table className="min-w-full border-collapse text-left text-[11px] text-slate-700">
          <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-black uppercase text-slate-500">
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
              const assignHighlightRef =
                rowHit && !firstHighlightAssigned.current
                  ? (el: HTMLTableRowElement | null) => {
                      if (el && !firstHighlightAssigned.current) {
                        firstHighlightAssigned.current = true;
                        highlightRowRef.current = el;
                      }
                    }
                  : undefined;
              return (
                <tr key={idx} ref={assignHighlightRef} className={rowHit ? toolsTheme.tableRowHit : "odd:bg-slate-50/50"}>
                  {table.columns.map((col) => {
                    const cellHit = rowHit && activeCell(row, col.key);
                    return (
                      <td
                        key={col.key}
                        className={`border-b border-slate-100 px-3 py-2 align-top ${
                          col.type === "rate" || col.type === "yen" ? "text-right tabular-nums" : ""
                        } ${cellHit ? toolsTheme.tableCellHitStrong : ""}`}
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

export function ExecutiveCompSectionNav() {
  return (
    <nav className="sticky top-0 z-20 -mx-1 mb-6 overflow-x-auto rounded-xl border border-slate-200 bg-white/95 px-2 py-2 shadow-sm backdrop-blur">
      <ul className="flex min-w-max gap-1">
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className={`inline-block rounded-lg px-3 py-1.5 text-[11px] font-black text-slate-600 ${toolsTheme.navLink}`}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** シミュレーターが参照する法定マスタを1ページに並べる。 */
export function ExecutiveCompReferenceTables({
  fyStart,
  smallBusiness,
  prefectureCode,
  highlightOptimalMonthly,
  highlightCurrentMonthly,
  corporateBreakdown,
  scrollToken,
}: {
  fyStart: string;
  smallBusiness: boolean;
  prefectureCode: string;
  /** 最適の月額報酬。源泉・社保の該当行ハイライト用 */
  highlightOptimalMonthly: number | null;
  /** いまの設定の月額報酬（比較ON時） */
  highlightCurrentMonthly: number | null;
  /** 確定後の法人税・地方税内訳（最適点） */
  corporateBreakdown?: ExecCompCorporateBreakdown | null;
  /** 確定のたびに変わるトークン。ハイライト行を表示位置へスクロール */
  scrollToken?: string | null;
}) {
  const employmentHitRef = useRef<HTMLTableRowElement | null>(null);
  const withholdingOptimalRef = useRef<HTMLTableRowElement | null>(null);
  const withholdingCurrentRef = useRef<HTMLTableRowElement | null>(null);
  const withholdingContainerRef = useRef<HTMLDivElement | null>(null);
  const socialOptimalRef = useRef<HTMLTableRowElement | null>(null);
  const socialCurrentRef = useRef<HTMLTableRowElement | null>(null);
  const socialContainerRef = useRef<HTMLDivElement | null>(null);
  const [corpTable, setCorpTable] = useState<CorporateTaxTable | null>(null);
  const [localTables, setLocalTables] = useState<LocalTaxTables | null>(null);
  const [employmentTable, setEmploymentTable] = useState<EmploymentIncomeTable | null>(null);
  const [withholdingTable, setWithholdingTable] = useState<WithholdingTable | null>(null);
  const [amountTable, setAmountTable] = useState<AssociationHealthAmountTable | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localScrollTick, setLocalScrollTick] = useState(0);
  // socialHitRef removed — no auto-scroll on highlight

  useEffect(() => {
    void Promise.all([
      fetchCorporateTaxTable(),
      fetchLocalTaxTables({ asOf: fyStart }),
      fetchEmploymentIncomeTable(),
      fetchWithholdingTable(),
    ])
      .then(([corp, local, emp, wh]) => {
        setCorpTable(corp);
        setLocalTables(local);
        setEmploymentTable(emp);
        setWithholdingTable(wh.table);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "マスタの取得に失敗しました"));
  }, [fyStart]);

  useEffect(() => {
    const t = setTimeout(() => {
      void fetchAssociationHealthAmountTable({ prefectureCode })
        .then(setAmountTable)
        .catch(() => setAmountTable(null));
    }, 150);
    return () => clearTimeout(t);
  }, [prefectureCode]);

  const pidx = corpTable ? periodIndex(corpTable, fyStart) : -1;

  const { reducedIdx, standardIdx } = useMemo(() => {
    if (!corpTable) return { reducedIdx: -1, standardIdx: -1 };
    let reduced = -1;
    let standard = -1;
    corpTable.rows.forEach((row, i) => {
      if (row.corp_type !== "普通法人") return;
      const band = row.income_band || "";
      if (band.includes("800万円以下") && !band.includes("適用除外")) reduced = i;
      if ((row.segment || "").startsWith("上記以外") && standard === -1) standard = i;
    });
    return { reducedIdx: reduced, standardIdx: standard };
  }, [corpTable]);

  const annualSalary = highlightOptimalMonthly != null ? highlightOptimalMonthly * 12 : null;
  const employmentHitBand = useMemo(() => {
    if (!employmentTable || annualSalary == null) return null;
    for (const row of employmentTable.rows) {
      const min = row.min != null ? Number(row.min) : 0;
      const max = row.max != null ? Number(row.max) : Infinity;
      if (annualSalary >= min && annualSalary < max) return String(row.band ?? "");
    }
    return null;
  }, [employmentTable, annualSalary]);

  const withholdingDisplayRows = useMemo(
    () => (withholdingTable ? buildWithholdingDisplayRows(withholdingTable) : []),
    [withholdingTable],
  );

  const withholdingOptimalMin =
    withholdingTable && highlightOptimalMonthly != null
      ? matchWithholdingRowMin(withholdingTable, highlightOptimalMonthly)
      : null;
  const withholdingCurrentMin =
    withholdingTable && highlightCurrentMonthly != null
      ? matchWithholdingRowMin(withholdingTable, highlightCurrentMonthly)
      : null;

  const withholdingKouCol = withholdingTable ? withholdingKouColIndex(withholdingTable, 0) : 0;

  const socialOptimalGrade =
    amountTable && highlightOptimalMonthly != null
      ? matchSocialGrade(amountTable.rows, highlightOptimalMonthly)
      : null;
  const socialCurrentGrade =
    amountTable && highlightCurrentMonthly != null
      ? matchSocialGrade(amountTable.rows, highlightCurrentMonthly)
      : null;

  const localTaxDetail = corporateBreakdown?.detail ?? null;
  const localTableScrollKey = scrollToken ? `${scrollToken}:${localScrollTick}` : null;

  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === "#ref-local") {
        setLocalScrollTick((n) => n + 1);
      }
      if (window.location.hash === "#ref-withholding" && scrollToken) {
        window.requestAnimationFrame(() => {
          scrollRowWithinContainer(
            withholdingContainerRef.current,
            withholdingOptimalRef.current ?? withholdingCurrentRef.current,
          );
        });
      }
      if (window.location.hash === "#ref-social" && scrollToken) {
        window.requestAnimationFrame(() => {
          scrollRowWithinContainer(
            socialContainerRef.current,
            socialOptimalRef.current ?? socialCurrentRef.current,
          );
        });
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [scrollToken]);

  useEffect(() => {
    if (!scrollToken) return;
    const id = window.requestAnimationFrame(() => {
      scrollRowWithinContainer(
        withholdingContainerRef.current,
        withholdingOptimalRef.current ?? withholdingCurrentRef.current,
      );
      scrollRowWithinContainer(
        socialContainerRef.current,
        socialOptimalRef.current ?? socialCurrentRef.current,
      );
    });
    return () => window.cancelAnimationFrame(id);
  }, [scrollToken, withholdingOptimalMin, withholdingCurrentMin, socialOptimalGrade, socialCurrentGrade]);

  return (
    <div className="mt-10 space-y-10 border-t border-slate-200 pt-8">
      <div>
        <h2 className="text-lg font-black text-slate-900">計算に使う法定マスタ（全表）</h2>
        <p className="mt-1 text-sm text-slate-600">
          シミュレーターが参照する法人税・地方税・給与所得控除・源泉・協会けんぽの表を、このページにまとめています。
          {highlightOptimalMonthly != null || highlightCurrentMonthly != null ? (
            <>
              {" "}
              ハイライトは
              {highlightOptimalMonthly != null ? (
                <>
                  {" "}
                  最適 <span className="font-bold tabular-nums">{yen(highlightOptimalMonthly)}</span>
                </>
              ) : null}
              {highlightCurrentMonthly != null ? (
                <>
                  {highlightOptimalMonthly != null ? " ／" : ""} いまの設定{" "}
                  <span className="font-bold tabular-nums">{yen(highlightCurrentMonthly)}</span>
                </>
              ) : null}
              {" "}
              基準です（濃緑=最適／薄緑=いまの設定）。
            </>
          ) : null}
        </p>
        {error ? <p className="mt-2 text-xs font-bold text-red-600">{error}</p> : null}
      </div>

      {/* --- 法人税 --- */}
      <section id="ref-corporate" className="scroll-mt-16">
        <h3 className="mb-2 flex flex-wrap items-baseline gap-2 text-sm font-black text-slate-800">
          <span>法人税 税率表</span>
          {corporateBreakdown ? (
            <span className={toolsTheme.amountBadge}>
              法人税額 {yen(corporateBreakdown.national)}
            </span>
          ) : null}
        </h3>
        {corpTable ? (
          <div className="overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full border-collapse text-left text-[11px] text-slate-700">
              <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-500">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2">法人区分</th>
                  <th className="border-b border-slate-200 px-3 py-2">所得区分</th>
                  {corpTable.periods.map((p, i) => (
                    <th
                      key={p.start}
                      className={`border-b border-slate-200 px-3 py-2 text-right ${
                        i === pidx ? "bg-[var(--taxx-green-100)] text-[var(--taxx-green-700)]" : ""
                      }`}
                    >
                      {p.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {corpTable.rows.map((row, ri) => {
                  const rowHit =
                    smallBusiness && (ri === reducedIdx || ri === standardIdx)
                      ? true
                      : !smallBusiness && ri === standardIdx;
                  return (
                    <tr key={ri} className={rowHit ? "bg-[var(--taxx-green-50)]" : "odd:bg-slate-50/50"}>
                      <td className="border-b border-slate-100 px-3 py-2 align-top">
                        <div className="font-bold">{row.corp_type}</div>
                        {row.segment ? <div className="text-[10px] text-slate-400">{row.segment}</div> : null}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2 align-top">{row.income_band}</td>
                      {row.rates.map((rate, ci) => {
                        const cross = rowHit && ci === pidx;
                        return (
                          <td
                            key={ci}
                            className={`border-b border-slate-100 px-3 py-2 text-right tabular-nums ${
                              cross
                                ? toolsTheme.tableCellHitStrong
                                : ci === pidx
                                  ? "bg-[var(--taxx-green-50)]"
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
        ) : (
          <p className="text-xs text-slate-500">読み込み中…</p>
        )}
      </section>

      {/* --- 地方税 --- */}
      <section id="ref-local" className="scroll-mt-16">
        <h3 className="mb-1 flex flex-wrap items-baseline gap-2 text-sm font-black text-slate-800">
          <span>法人地方税（住民税・事業税）</span>
          {corporateBreakdown ? (
            <span className={toolsTheme.amountBadge}>
              地方税合計{" "}
              {yen(
                corporateBreakdown.local_corporate +
                  corporateBreakdown.resident_levy +
                  corporateBreakdown.percapita +
                  corporateBreakdown.enterprise +
                  corporateBreakdown.special_enterprise,
              )}
            </span>
          ) : null}
        </h3>
        <p className="mb-2 text-[11px] text-slate-500">
          法人税割・均等割・事業税所得割。確定後、該当行を青く光らせ、題名横に試算額を表示します。
          {localTaxDetail
            ? `（課税所得 ${yen(localTaxDetail.taxable_income)}・${localTaxDetail.jurisdiction_label}・資本金 ${yen(localTaxDetail.capital)}・従業員 ${localTaxDetail.employees}人）`
            : " シミュレーターは標準税率・中小前提の概算で使います。"}
        </p>
        {localTables ? (
          <>
            <LocalTaxRefTableBlock
              title="法人住民税 法人税割"
              resultAmount={localTaxDetail?.resident_levy ?? corporateBreakdown?.resident_levy}
              meta={localTables.resident_levy.label ?? localTables.resident_levy.valid_from}
              table={localTables.resident_levy}
              scrollKey={localTableScrollKey}
              maxHeightClass="max-h-[280px]"
              activeRow={(row) =>
                !!localTaxDetail && String(row.jurisdiction ?? "") === localTaxDetail.jurisdiction
              }
              activeCell={(_, key) =>
                !!localTaxDetail &&
                key === (localTaxDetail.use_excess_rate ? "excess_rate" : "standard_rate")
              }
            />
            <LocalTaxRefTableBlock
              title="法人住民税 均等割"
              resultAmount={localTaxDetail?.percapita ?? corporateBreakdown?.percapita}
              meta={localTables.percapita.label ?? localTables.percapita.valid_from}
              table={localTables.percapita}
              scrollKey={localTableScrollKey}
              maxHeightClass="max-h-[360px]"
              activeRow={(row) => (localTaxDetail ? isPercapitaRowActive(row, localTaxDetail) : false)}
              activeCell={(_, key) =>
                localTaxDetail
                  ? key === "pref" ||
                    key === (localTaxDetail.employees > 50 ? "city_over50" : "city_le50")
                  : false
              }
            />
            <LocalTaxRefTableBlock
              title="法人事業税 所得割"
              resultAmount={localTaxDetail?.enterprise ?? corporateBreakdown?.enterprise}
              meta={localTables.enterprise.label ?? localTables.enterprise.valid_from}
              table={localTables.enterprise}
              scrollKey={localTableScrollKey}
              maxHeightClass="max-h-[360px]"
              activeRow={(row) => (localTaxDetail ? isEnterpriseRowActive(row, localTaxDetail) : false)}
              activeCell={(_, key) =>
                localTaxDetail
                  ? key === (localTaxDetail.use_excess_rate ? "excess_rate" : "standard_rate")
                  : false
              }
            />
            {corporateBreakdown ? (
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-600">
                <span className="rounded-lg bg-slate-100 px-2 py-1">
                  地方法人税 {yen(corporateBreakdown.local_corporate)}
                </span>
                <span className="rounded-lg bg-slate-100 px-2 py-1">
                  特別法人事業税 {yen(corporateBreakdown.special_enterprise)}
                </span>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-xs text-slate-500">読み込み中…</p>
        )}
      </section>

      {/* --- 給与所得控除 --- */}
      <section id="ref-employment" className="scroll-mt-16">
        <h3 className="mb-2 flex flex-wrap items-baseline gap-2 text-sm font-black text-slate-800">
          <span>
            {employmentTable?.label_ja ?? "給与所得控除"}の速算表
            {employmentTable?.label ? `（${employmentTable.label}）` : ""}
          </span>
        </h3>
        {employmentTable ? (
          <div className="overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full border-collapse text-left text-[11px] text-slate-700">
              <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-500">
                <tr>
                  {employmentTable.columns.map((col) => (
                    <th key={col.key} className="border-b border-slate-200 px-3 py-2">
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employmentTable.rows.map((row, idx) => {
                  const band = String(row.band ?? row.formula ?? "");
                  const hit = employmentHitBand != null && band === employmentHitBand;
                  return (
                    <tr
                      key={idx}
                      ref={hit ? employmentHitRef : undefined}
                      className={hit ? toolsTheme.tableRowHit : "odd:bg-slate-50/50"}
                    >
                      {employmentTable.columns.map((col) => (
                        <td
                          key={col.key}
                          className={`border-b border-slate-100 px-3 py-2 ${
                            hit ? toolsTheme.tableCellHit : ""
                          } ${col.type === "yen" || col.type === "rate" ? "text-right tabular-nums" : ""}`}
                        >
                          {cellText(row[col.key], col.type)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-slate-500">読み込み中…</p>
        )}
      </section>

      {/* --- 源泉 --- */}
      <section id="ref-withholding" className="scroll-mt-16">
        <h3 className="mb-2 text-sm font-black text-slate-800">
          {withholdingTable
            ? `${withholdingTable.label_ja}（${withholdingTable.year_label}）`
            : "源泉徴収税額表（月額表）"}
        </h3>
        <p className="mb-2 text-[11px] text-slate-500">
          シミュレーターの所得税は年税の概算です。実務の月次源泉はこの表（甲欄）を参照します。740,000円以上の高額帯も同じ表に続けて表示しています。
        </p>
        {withholdingTable ? (
          <div
            ref={withholdingContainerRef}
            className="max-h-[480px] overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <table className="min-w-full border-collapse text-right text-[11px] text-slate-700">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-black uppercase text-slate-500">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2 text-right">以上</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right">未満</th>
                  {withholdingTable.columns.map((c) => (
                    <th key={c} className="border-b border-slate-200 px-3 py-2 text-right">
                      {c}
                    </th>
                  ))}
                  <th className="border-b border-slate-200 px-3 py-2 text-right">乙</th>
                </tr>
              </thead>
              <tbody>
                {withholdingDisplayRows.map((r) => {
                  const isOptimal = r.min === withholdingOptimalMin;
                  const isCurrent =
                    r.min === withholdingCurrentMin && !isOptimal;
                  const isBoth =
                    r.min === withholdingOptimalMin &&
                    r.min === withholdingCurrentMin;
                  const rowHit = isOptimal || isCurrent || isBoth;
                  return (
                    <tr
                      key={r.min}
                      ref={
                        isCurrent || isBoth
                          ? withholdingCurrentRef
                          : isOptimal
                            ? withholdingOptimalRef
                            : undefined
                      }
                      className={
                        isBoth || isOptimal
                          ? toolsTheme.optimalRow
                          : isCurrent
                            ? toolsTheme.currentRow
                            : "odd:bg-slate-50/50"
                      }
                    >
                      <td
                        className={`border-b border-slate-100 px-3 py-1.5 tabular-nums ${
                          rowHit ? toolsTheme.tableCellHit : ""
                        }`}
                      >
                        {yen(r.min)}
                        {isOptimal || isBoth ? (
                          <span className={toolsTheme.optimalBadge}>最適</span>
                        ) : null}
                        {isCurrent || isBoth ? (
                          <span className={toolsTheme.currentBadge}>いま</span>
                        ) : null}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-1.5 tabular-nums text-slate-400">
                        {r.max != null ? yen(r.max) : "—"}
                      </td>
                      {r.kou.map((k, i) => {
                        const cross = rowHit && i === withholdingKouCol;
                        return (
                          <td
                            key={i}
                            className={`border-b border-slate-100 px-3 py-1.5 tabular-nums ${
                              cross
                                ? isBoth || isOptimal
                                  ? toolsTheme.tableCellHitStrong
                                  : toolsTheme.tableCellHit
                                : ""
                            }`}
                          >
                            {yen(k)}
                          </td>
                        );
                      })}
                      <td
                        className={`border-b border-slate-100 px-3 py-1.5 tabular-nums ${
                          rowHit
                            ? isBoth || isOptimal
                              ? toolsTheme.tableCellHitStrong
                              : toolsTheme.tableCellHit
                            : ""
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
        ) : (
          <p className="text-xs text-slate-500">読み込み中…</p>
        )}
      </section>

      {/* --- 社保 --- */}
      <section id="ref-social" className="scroll-mt-16">
        <h3 className="mb-2 text-sm font-black text-slate-800">
          協会けんぽ 保険料額表
          {amountTable ? `（${amountTable.prefecture}支部）` : ""}
        </h3>
        {amountTable ? (
          <>
            <div className="mb-2 grid gap-2 rounded-xl border border-slate-300 bg-slate-50 p-3 text-[11px] text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className="font-black text-slate-500">健保（介護非該当）</div>
                <div className="text-base font-black tabular-nums">{ratePct(amountTable.health_rate)}</div>
              </div>
              <div>
                <div className="font-black text-slate-500">健保＋介護</div>
                <div className="text-base font-black tabular-nums">{ratePct(amountTable.health_care_rate)}</div>
              </div>
              <div>
                <div className="font-black text-slate-500">子ども・子育て支援金</div>
                <div className="text-base font-black tabular-nums">{ratePct(amountTable.child_support_rate)}</div>
              </div>
              <div>
                <div className="font-black text-slate-500">厚生年金</div>
                <div className="text-base font-black tabular-nums">{ratePct(amountTable.pension_rate)}</div>
              </div>
            </div>
            <div
              ref={socialContainerRef}
              className="max-h-[480px] overflow-auto rounded-2xl border border-slate-400 bg-white shadow-sm"
            >
              <table className="min-w-[1100px] w-full border-collapse text-[10px] text-slate-800">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-100 text-center font-black text-slate-600">
                    <th rowSpan={2} className="border border-slate-300 px-1.5 py-2">
                      等級
                    </th>
                    <th rowSpan={2} className="border border-slate-300 px-1.5 py-2">
                      標準報酬月額
                    </th>
                    <th rowSpan={2} className="border border-slate-300 px-1.5 py-2">
                      報酬月額
                    </th>
                    <th colSpan={2} className="border border-slate-300 px-1.5 py-1.5">
                      健保・介護非該当
                    </th>
                    <th colSpan={2} className="border border-slate-300 px-1.5 py-1.5">
                      健保・介護該当
                    </th>
                    <th colSpan={2} className="border border-slate-300 px-1.5 py-1.5">
                      支援金
                    </th>
                    <th colSpan={2} className="border border-slate-300 px-1.5 py-1.5">
                      厚生年金
                    </th>
                  </tr>
                  <tr className="bg-slate-50 text-center font-bold text-slate-500">
                    {["全額", "折半額", "全額", "折半額", "全額", "折半額", "全額", "折半額"].map((h, i) => (
                      <th key={i} className="border border-slate-300 px-1.5 py-1">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {amountTable.rows.map((row) => {
                    const grade = Number(row.grade_health);
                    const isOptimal = socialOptimalGrade != null && grade === socialOptimalGrade;
                    const isCurrent =
                      socialCurrentGrade != null && grade === socialCurrentGrade && !isOptimal;
                    const isBoth =
                      socialOptimalGrade != null &&
                      socialCurrentGrade != null &&
                      grade === socialOptimalGrade &&
                      grade === socialCurrentGrade;
                    const rowHit = isOptimal || isCurrent || isBoth;
                    return (
                      <tr
                        key={String(row.grade_health)}
                        ref={
                          isCurrent || isBoth
                            ? socialCurrentRef
                            : isOptimal
                              ? socialOptimalRef
                              : undefined
                        }
                        className={
                          isBoth || isOptimal
                            ? toolsTheme.optimalRow
                            : isCurrent
                              ? toolsTheme.currentRow
                              : "odd:bg-white even:bg-slate-50/70"
                        }
                      >
                        <td className="border border-slate-200 px-1.5 py-1 text-center tabular-nums">
                          {row.grade_pension == null
                            ? String(row.grade_health)
                            : `${row.grade_health}(${row.grade_pension})`}
                          {isOptimal || isBoth ? (
                            <span className={`ml-0.5 ${toolsTheme.optimalBadge}`}>最適</span>
                          ) : null}
                          {isCurrent || isBoth ? (
                            <span className={`ml-0.5 ${toolsTheme.currentBadge}`}>いま</span>
                          ) : null}
                        </td>
                        <td className="border border-slate-200 px-1.5 py-1 text-right tabular-nums">
                          {Number(row.standard_monthly).toLocaleString("ja-JP")}
                        </td>
                        <td className="border border-slate-200 px-1.5 py-1 text-center tabular-nums text-[9px]">
                          {fmtYenBand(row.remuneration_min, row.remuneration_max)}
                        </td>
                        <td className="border border-slate-200 px-1.5 py-1 text-right tabular-nums">
                          {fmtAmt(row.health_full)}
                        </td>
                        <td className="border border-slate-200 px-1.5 py-1 text-right tabular-nums">
                          {fmtAmt(row.health_half)}
                        </td>
                        <td className="border border-slate-200 px-1.5 py-1 text-right tabular-nums">
                          {fmtAmt(row.health_care_full)}
                        </td>
                        <td className="border border-slate-200 px-1.5 py-1 text-right tabular-nums">
                          {fmtAmt(row.health_care_half)}
                        </td>
                        <td className="border border-slate-200 px-1.5 py-1 text-right tabular-nums">
                          {fmtAmt(row.child_support_full)}
                        </td>
                        <td className="border border-slate-200 px-1.5 py-1 text-right tabular-nums">
                          {fmtAmt(row.child_support_half)}
                        </td>
                        <td className="border border-slate-200 px-1.5 py-1 text-right tabular-nums">
                          {fmtAmt(row.pension_full)}
                        </td>
                        <td className="border border-slate-200 px-1.5 py-1 text-right tabular-nums">
                          {fmtAmt(row.pension_half)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-xs text-slate-500">読み込み中…</p>
        )}
      </section>
    </div>
  );
}
