"use client";

import { useEffect, useRef, useState } from "react";
import {
  calcAssociationHealthPublic,
  fetchAssociationHealthAmountTable,
  fetchAssociationHealthPrefectures,
  type AssociationHealthAmountTable,
  type AssociationHealthCalc,
  type AssociationHealthPref,
} from "@/lib/taxx-tools-api";
import { ToolShell } from "@/features/tools/ToolShell";
import { Field, NumInput, ResultCard, ratePct, yen } from "@/features/tools/ui";
import { toolsTheme } from "@/features/tools/taxx-tools-theme";

function fmtAmt(n: unknown): string {
  const v = Number(n);
  if (Number.isNaN(v) || v === 0) return "—";
  // PDF は 0.5 円単位（例: 2,856.5）も出す。
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

function gradeLabel(health: unknown, pension: unknown): string {
  if (pension == null || pension === "") return String(health);
  return `${health}(${pension})`;
}

export function AssociationHealthTool() {
  const [prefectures, setPrefectures] = useState<AssociationHealthPref[]>([]);
  const [amountTable, setAmountTable] = useState<AssociationHealthAmountTable | null>(null);
  const [prefCode, setPrefCode] = useState("13");
  const [remuneration, setRemuneration] = useState(300000);
  const [care, setCare] = useState(false);
  const [result, setResult] = useState<AssociationHealthCalc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const matchedRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    void fetchAssociationHealthPrefectures()
      .then((prefs) => {
        setPrefectures(prefs.prefectures);
        if (prefs.prefectures.length && !prefs.prefectures.some((p) => p.prefecture_code === prefCode)) {
          setPrefCode(prefs.prefectures[0].prefecture_code);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "マスタの取得に失敗しました"));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void fetchAssociationHealthAmountTable({ prefectureCode: prefCode })
        .then(setAmountTable)
        .catch((e) => setError(e instanceof Error ? e.message : "保険料額表の取得に失敗しました"));
    }, 150);
    return () => clearTimeout(t);
  }, [prefCode]);

  useEffect(() => {
    const t = setTimeout(() => {
      void calcAssociationHealthPublic({
        remunerationMonthly: remuneration,
        prefectureCode: prefCode,
        careApplicable: care,
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
  }, [remuneration, prefCode, care]);

  useEffect(() => {
    matchedRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [result?.grade_health, result?.prefecture_code, amountTable]);

  const sourceUrl = result?.source_url || amountTable?.source_url || undefined;

  return (
    <ToolShell
      title="協会けんぽ 保険料額表"
      subtitle="協会けんぽの公表様式に近い等級一覧です。報酬月額を入れると該当行が光ります。"
      category="社会保険"
      sourceUrl={typeof sourceUrl === "string" ? sourceUrl : undefined}
      sourceLabel="全国健康保険協会"
      asOf={result?.valid_from ?? amountTable?.valid_from ?? undefined}
    >
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="報酬月額（円）" htmlFor="rem">
            <NumInput
              id="rem"
              value={remuneration}
              onValueChange={setRemuneration}
              formatWithCommas
              className="w-48 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </Field>
          <Field label="都道府県（協会けんぽ支部）" htmlFor="pref">
            <select
              id="pref"
              value={prefCode}
              onChange={(e) => setPrefCode(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              {prefectures.map((p) => (
                <option key={p.prefecture_code} value={p.prefecture_code}>
                  {p.prefecture}（{p.prefecture_code}）
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <input
              type="checkbox"
              checked={care}
              onChange={(e) => setCare(e.target.checked)}
              className="h-4 w-4"
            />
            介護保険第2号（40〜64歳）で結果カードを出す
          </label>
        </div>

        <ResultCard
          tone="blue"
          metrics={
            result
              ? [
                  { label: "被保険者負担（月）", value: yen(result.employee_total) },
                  { label: "事業主負担（月）", value: yen(result.employer_total) },
                  { label: "合計", value: yen(result.total) },
                ]
              : null
          }
          placeholder={error ?? "上の値を入力すると自動で結果が表示されます。"}
          breakdown={
            result ? (
              <div className="space-y-0.5 text-xs text-slate-500">
                <div>
                  等級 {result.grade_health}
                  {result.grade_pension != null ? `（厚年${result.grade_pension}）` : ""}
                  ／標準報酬 {yen(result.standard_monthly_health)}
                </div>
                <div>
                  健保 {ratePct(result.health_rate)}
                  {result.care_applicable ? "（介護込）" : ""}
                  ／支援金 {ratePct(result.child_support_rate)}
                  ／厚年 {ratePct(result.pension_rate)}
                </div>
              </div>
            ) : null
          }
        />
      </div>

      {amountTable ? (
        <div className="mt-6">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-black text-slate-700">
              健康保険・厚生年金保険の保険料額表（{amountTable.prefecture}支部）
            </h3>
            <p className="text-[11px] text-slate-500">
              {amountTable.label || amountTable.valid_from} · 単位: 円
            </p>
          </div>

          {/* PDFヘッダー相当の料率帯 */}
          <div className="mb-2 grid gap-2 rounded-xl border border-slate-300 bg-slate-50 p-3 text-[11px] text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="font-black text-slate-500">健保（介護非該当）</div>
              <div className="text-base font-black tabular-nums">{ratePct(amountTable.health_rate)}</div>
            </div>
            <div>
              <div className="font-black text-slate-500">健保＋介護（第2号）</div>
              <div className="text-base font-black tabular-nums">{ratePct(amountTable.health_care_rate)}</div>
              <div className="text-[10px] text-slate-400">介護 {ratePct(amountTable.care_rate)}</div>
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

          <div className="overflow-auto rounded-2xl border border-slate-400 bg-white shadow-sm">
            <table className="min-w-[1100px] w-full border-collapse text-[10px] text-slate-800">
              <thead>
                <tr className="bg-slate-100 text-center font-black text-slate-600">
                  <th rowSpan={2} className="border border-slate-300 px-1.5 py-2 align-middle">
                    等級
                  </th>
                  <th rowSpan={2} className="border border-slate-300 px-1.5 py-2 align-middle">
                    標準報酬
                    <br />
                    月額
                  </th>
                  <th rowSpan={2} className="border border-slate-300 px-1.5 py-2 align-middle">
                    報酬月額
                    <br />
                    （円以上〜円未満）
                  </th>
                  <th colSpan={2} className="border border-slate-300 px-1.5 py-1.5">
                    健保・介護非該当
                    <span className={`ml-1 ${toolsTheme.rateAccent}`}>{ratePct(amountTable.health_rate)}</span>
                  </th>
                  <th colSpan={2} className="border border-slate-300 px-1.5 py-1.5">
                    健保・介護該当
                    <span className={`ml-1 ${toolsTheme.rateAccent}`}>{ratePct(amountTable.health_care_rate)}</span>
                  </th>
                  <th colSpan={2} className="border border-slate-300 px-1.5 py-1.5">
                    子ども・子育て支援金
                    <span className={`ml-1 ${toolsTheme.rateAccent}`}>{ratePct(amountTable.child_support_rate)}</span>
                  </th>
                  <th colSpan={2} className="border border-slate-300 px-1.5 py-1.5">
                    厚生年金
                    <span className={`ml-1 ${toolsTheme.rateAccent}`}>{ratePct(amountTable.pension_rate)}</span>
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
                  const hit = !!result && Number(row.grade_health) === Number(result.grade_health);
                  const careCol = care;
                  return (
                    <tr
                      key={String(row.grade_health)}
                      ref={hit ? matchedRef : undefined}
                      className={
                        hit
                          ? toolsTheme.tableRowHitStrong
                          : "odd:bg-white even:bg-slate-50/70"
                      }
                    >
                      <td className="border border-slate-200 px-1.5 py-1 text-center tabular-nums">
                        {gradeLabel(row.grade_health, row.grade_pension)}
                      </td>
                      <td className="border border-slate-200 px-1.5 py-1 text-right tabular-nums">
                        {Number(row.standard_monthly).toLocaleString("ja-JP")}
                      </td>
                      <td className="border border-slate-200 px-1.5 py-1 text-center tabular-nums text-[9px]">
                        {fmtYenBand(row.remuneration_min, row.remuneration_max)}
                      </td>
                      <td
                        className={`border border-slate-200 px-1.5 py-1 text-right tabular-nums ${
                          hit && !careCol ? "bg-[var(--taxx-green-200)]/80" : ""
                        }`}
                      >
                        {fmtAmt(row.health_full)}
                      </td>
                      <td
                        className={`border border-slate-200 px-1.5 py-1 text-right tabular-nums ${
                          hit && !careCol ? "bg-[var(--taxx-green-200)]/80" : ""
                        }`}
                      >
                        {fmtAmt(row.health_half)}
                      </td>
                      <td
                        className={`border border-slate-200 px-1.5 py-1 text-right tabular-nums ${
                          hit && careCol ? "bg-[var(--taxx-green-200)]/80" : ""
                        }`}
                      >
                        {fmtAmt(row.health_care_full)}
                      </td>
                      <td
                        className={`border border-slate-200 px-1.5 py-1 text-right tabular-nums ${
                          hit && careCol ? "bg-[var(--taxx-green-200)]/80" : ""
                        }`}
                      >
                        {fmtAmt(row.health_care_half)}
                      </td>
                      <td
                        className={`border border-slate-200 px-1.5 py-1 text-right tabular-nums ${
                          hit ? "bg-[var(--taxx-green-200)]/80" : ""
                        }`}
                      >
                        {fmtAmt(row.child_support_full)}
                      </td>
                      <td
                        className={`border border-slate-200 px-1.5 py-1 text-right tabular-nums ${
                          hit ? "bg-[var(--taxx-green-200)]/80" : ""
                        }`}
                      >
                        {fmtAmt(row.child_support_half)}
                      </td>
                      <td
                        className={`border border-slate-200 px-1.5 py-1 text-right tabular-nums ${
                          hit ? "bg-[var(--taxx-green-200)]/80" : ""
                        }`}
                      >
                        {fmtAmt(row.pension_full)}
                      </td>
                      <td
                        className={`border border-slate-200 px-1.5 py-1 text-right tabular-nums ${
                          hit ? "bg-[var(--taxx-green-200)]/80" : ""
                        }`}
                      >
                        {fmtAmt(row.pension_half)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ul className="mt-3 space-y-1 text-[11px] leading-relaxed text-slate-500">
            <li>・等級欄の（　）内は厚生年金の等級です。括弧なしは健保のみの等級です。</li>
            <li>・介護保険第2号（40〜64歳）は「健保・介護該当」列を使います。</li>
            <li>・子ども・子育て拠出金（事業主のみ {ratePct(amountTable.childcare_contrib_rate)}）は本表の列外です。</li>
            <li>・折半額の端数は協会けんぽ公表表の表記に合わせた概算です。実務の天引きは就業規則・特約に従ってください。</li>
          </ul>
        </div>
      ) : null}
    </ToolShell>
  );
}
