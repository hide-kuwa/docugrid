"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Sparkles, Users } from "lucide-react";
import type { OrgClient } from "@/config/organization";
import { SsotEditToolbar } from "@/features/client-data/components/SsotEditToolbar";
import { useSsotEditSession } from "@/features/client-data/hooks/use-ssot-edit-session";
import { computeNetPayYen } from "@/features/payroll/hooks/use-debounced-callback";
import {
  currentYearMonth,
  currentTaxYear,
  fetchPayrollEmployees,
  fetchWithholdingLedger,
  fetchYearEndRuns,
  formatYen,
  runYearEndAdjustment,
  savePayrollEmployees,
  upsertWithholdingLedgerRow,
  fetchSanteiPreview,
  applySanteiGrades,
  applyYearEndRun,
  type SanteiPreview,
} from "@/features/payroll/lib/payroll-api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";
import { API_BASE } from "@/config/api";
import type { PayrollEmployee, WithholdingLedgerRow, YearEndRun } from "@/features/payroll/types";

type Props = {
  client: OrgClient;
  canEdit?: boolean;
};

function newEmployee(clientId: string): PayrollEmployee {
  return {
    id: crypto.randomUUID().replace(/-/g, ""),
    client_id: clientId,
    employee_code: null,
    name: "",
    hire_date: null,
    tax_column: "甲",
    dependent_count: 0,
    spouse_deduction: false,
    social_insurance_grade: null,
    notes: null,
    active: true,
  };
}

type SanteiDraft = Record<string, Record<string, number>>;

function buildSanteiMap(
  rows: WithholdingLedgerRow[],
  months: readonly string[],
): SanteiDraft {
  const map: SanteiDraft = {};
  for (const r of rows) {
    if (!months.includes(r.year_month)) continue;
    const gross = r.gross_pay_yen + r.bonus_yen;
    if (!map[r.employee_id]) map[r.employee_id] = {};
    map[r.employee_id][r.year_month] = gross;
  }
  return map;
}

export function ClientPayrollPanel({ client, canEdit }: Props) {
  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const [rows, setRows] = useState<WithholdingLedgerRow[]>([]);
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [marufuCount, setMarufuCount] = useState(0);
  const [taxYear, setTaxYear] = useState(currentTaxYear());
  const [yearEndRuns, setYearEndRuns] = useState<YearEndRun[]>([]);
  const [latestRun, setLatestRun] = useState<YearEndRun | null>(null);
  const [yearEndBusy, setYearEndBusy] = useState(false);
  const [allLedgerRows, setAllLedgerRows] = useState<WithholdingLedgerRow[]>([]);
  const [santeiPreview, setSanteiPreview] = useState<SanteiPreview | null>(null);
  const [santeiBusy, setSanteiBusy] = useState(false);
  const [settlementMonth, setSettlementMonth] = useState("");
  const [ledgerSaving, setLedgerSaving] = useState(false);
  const [employeeSaving, setEmployeeSaving] = useState(false);
  const [santeiSaving, setSanteiSaving] = useState(false);

  const employeeEdit = useSsotEditSession(employees);
  const ledgerEdit = useSsotEditSession(rows);
  const santeiMonths = useMemo(
    () => [`${taxYear}-04`, `${taxYear}-05`, `${taxYear}-06`] as const,
    [taxYear],
  );
  const committedSantei = useMemo(
    () => buildSanteiMap(allLedgerRows, santeiMonths),
    [allLedgerRows, santeiMonths],
  );
  const santeiEdit = useSsotEditSession(committedSantei);

  const refreshSanteiPreview = useCallback(async () => {
    try {
      const preview = await fetchSanteiPreview(client.id, taxYear);
      setSanteiPreview(preview);
    } catch {
      setSanteiPreview(null);
    }
  }, [client.id, taxYear]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [emps, ledger, allLedger, marufuRes, runs, santei] = await Promise.all([
        fetchPayrollEmployees(client.id),
        fetchWithholdingLedger(client.id, yearMonth),
        fetchWithholdingLedger(client.id),
        authFetch(`${API_BASE}/clients/${encodeURIComponent(client.id)}/payroll/marufu`, {
          headers: buildAuthHeaders(client.id),
        }).then(async (r) => (r.ok ? ((await r.json()) as { submissions: unknown[] }) : { submissions: [] })),
        fetchYearEndRuns(client.id).catch(() => [] as YearEndRun[]),
        fetchSanteiPreview(client.id, taxYear).catch(() => null),
      ]);
      setEmployees(emps);
      setRows(ledger.rows);
      setAllLedgerRows(allLedger.rows);
      setSummary(ledger.summary?.totals ?? null);
      setMarufuCount(marufuRes.submissions?.length ?? 0);
      setYearEndRuns(runs);
      setLatestRun(runs[0] ?? null);
      setSanteiPreview(santei);
    } catch {
      setError("給与・源泉データの読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [client.id, yearMonth, taxYear]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    void refreshSanteiPreview();
  }, [refreshSanteiPreview]);

  const handleCommitEmployees = async () => {
    setEmployeeSaving(true);
    setError(null);
    try {
      const saved = await savePayrollEmployees(client.id, employeeEdit.draft);
      setEmployees(saved);
      employeeEdit.finishEdit();
    } catch {
      setError("従業員マスタの保存に失敗しました");
    } finally {
      setEmployeeSaving(false);
    }
  };

  const handleAddEmployee = () => {
    employeeEdit.patchDraft((prev) => [...prev, newEmployee(client.id)]);
  };

  const handleCommitLedger = async () => {
    setLedgerSaving(true);
    setError(null);
    try {
      const activeIds = new Set(employees.filter((e) => e.active).map((e) => e.id));
      const draft = ledgerEdit.draft;
      const toSave = draft.filter(
        (r) =>
          activeIds.has(r.employee_id) &&
          (r.gross_pay_yen > 0 ||
            r.health_insurance_yen > 0 ||
            r.pension_yen > 0 ||
            r.income_tax_yen > 0 ||
            r.bonus_yen > 0 ||
            r.resident_tax_yen > 0),
      );
      await Promise.all(
        toSave.map((row) =>
          upsertWithholdingLedgerRow(client.id, {
            ...row,
            net_pay_yen: computeNetPayYen(row),
          }),
        ),
      );
      await reload();
      ledgerEdit.finishEdit();
    } catch {
      setError("台帳行の保存に失敗しました");
    } finally {
      setLedgerSaving(false);
    }
  };

  const patchLedgerRow = useCallback(
    (employeeId: string, patch: Partial<WithholdingLedgerRow>) => {
      if (!ledgerEdit.isEditing) return;
      ledgerEdit.patchDraft((prev) => {
        const existing = prev.find((r) => r.employee_id === employeeId);
        const base: WithholdingLedgerRow = existing ?? {
          id: "",
          client_id: client.id,
          employee_id: employeeId,
          year_month: yearMonth,
          gross_pay_yen: 0,
          bonus_yen: 0,
          health_insurance_yen: 0,
          pension_yen: 0,
          employment_insurance_yen: 0,
          income_tax_yen: 0,
          resident_tax_yen: 0,
          net_pay_yen: 0,
          notes: null,
        };
        const merged = { ...base, ...patch };
        const withNet = {
          ...merged,
          net_pay_yen: computeNetPayYen(merged),
        };
        if (existing) {
          return prev.map((r) => (r.employee_id === employeeId ? withNet : r));
        }
        return [...prev, withNet];
      });
    },
    [client.id, ledgerEdit, yearMonth],
  );

  const getSanteiGross = (employeeId: string, ym: string): number => {
    if (santeiEdit.isEditing) {
      return santeiEdit.draft[employeeId]?.[ym] ?? 0;
    }
    const row = allLedgerRows.find((r) => r.employee_id === employeeId && r.year_month === ym);
    return (row?.gross_pay_yen ?? 0) + (row?.bonus_yen ?? 0);
  };

  const patchSanteiGross = (employeeId: string, ym: string, gross: number) => {
    if (!santeiEdit.isEditing) return;
    santeiEdit.patchDraft((prev) => ({
      ...prev,
      [employeeId]: { ...prev[employeeId], [ym]: gross },
    }));
  };

  const handleCommitSantei = async () => {
    setSanteiSaving(true);
    setError(null);
    try {
      const draft = santeiEdit.draft;
      const upserts: Promise<WithholdingLedgerRow>[] = [];
      for (const [employeeId, months] of Object.entries(draft)) {
        for (const [ym, gross] of Object.entries(months)) {
          if (gross <= 0) continue;
          const existing = allLedgerRows.find(
            (r) => r.employee_id === employeeId && r.year_month === ym,
          );
          const payload = existing
            ? { ...existing, gross_pay_yen: gross }
            : {
                employee_id: employeeId,
                year_month: ym,
                gross_pay_yen: gross,
                bonus_yen: 0,
                health_insurance_yen: 0,
                pension_yen: 0,
                employment_insurance_yen: 0,
                income_tax_yen: 0,
                resident_tax_yen: 0,
                net_pay_yen: gross,
                notes: null,
              };
          upserts.push(upsertWithholdingLedgerRow(client.id, payload));
        }
      }
      await Promise.all(upserts);
      await reload();
      santeiEdit.finishEdit();
      await refreshSanteiPreview();
    } catch {
      setError("算定基礎届用の給与保存に失敗しました");
    } finally {
      setSanteiSaving(false);
    }
  };

  const handleApplySantei = async () => {
    setSanteiBusy(true);
    setError(null);
    try {
      await applySanteiGrades(client.id, taxYear);
      await reload();
    } catch {
      setError("算定基礎届の等級反映に失敗しました");
    } finally {
      setSanteiBusy(false);
    }
  };

  const handleRunYearEnd = async () => {
    setYearEndBusy(true);
    setError(null);
    try {
      const run = await runYearEndAdjustment(
        client.id,
        taxYear,
        settlementMonth || undefined,
      );
      setLatestRun(run);
      setYearEndRuns((prev) => [run, ...prev.filter((r) => r.id !== run.id)]);
    } catch {
      setError("年末調整の計算に失敗しました。月次台帳データを確認してください。");
    } finally {
      setYearEndBusy(false);
    }
  };

  const handleApplyYearEnd = async () => {
    if (!latestRun || latestRun.status === "applied") return;
    setYearEndBusy(true);
    setError(null);
    try {
      await applyYearEndRun(client.id, latestRun.id);
      const runs = await fetchYearEndRuns(client.id);
      setYearEndRuns(runs);
      setLatestRun(runs.find((r) => r.id === latestRun.id) ?? runs[0] ?? null);
      await reload();
    } catch {
      setError("年末調整の給与台帳への反映に失敗しました");
    } finally {
      setYearEndBusy(false);
    }
  };

  const hasLedgerNumbers = rows.some(
    (r) =>
      r.gross_pay_yen > 0 ||
      r.health_insurance_yen > 0 ||
      r.income_tax_yen > 0,
  );

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        源泉徴収簿を読み込み中…
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">源泉徴収簿（SSOT）</h2>
          <p className="text-xs text-slate-500">
            従業員マスタと月次台帳。まるふ OCR・年末調整はここに集約されます。
            {marufuCount > 0 ? ` · まるふ反映 ${marufuCount}件` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">
            対象月
            <input
              type="month"
              className="ml-2 rounded border border-slate-200 px-2 py-1 text-sm"
              value={yearMonth}
              onChange={(e) => setYearMonth(e.target.value)}
            />
          </label>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      ) : null}

      <section className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-violet-900">
              <Sparkles className="h-4 w-4" />
              年末調整
            </h3>
            <p className="text-xs text-violet-700/80">
              月次台帳に数字を入れると自動保存。試算後、過不足を精算月の台帳へ反映できます。
            </p>
          </div>
          {canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-slate-600">
                対象年
                <input
                  type="number"
                  className="ml-1 w-20 rounded border border-slate-200 px-2 py-1 text-sm"
                  value={taxYear}
                  onChange={(e) => setTaxYear(Number(e.target.value) || currentTaxYear())}
                />
              </label>
              <label className="text-xs text-slate-600">
                精算月
                <input
                  type="month"
                  className="ml-1 rounded border border-slate-200 px-2 py-1 text-sm"
                  value={settlementMonth || `${taxYear}-12`}
                  onChange={(e) => setSettlementMonth(e.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={yearEndBusy || !hasLedgerNumbers}
                className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                onClick={() => void handleRunYearEnd()}
              >
                {yearEndBusy ? "処理中…" : "年末調整を実行"}
              </button>
              {latestRun && latestRun.status !== "applied" ? (
                <button
                  type="button"
                  disabled={yearEndBusy}
                  className="rounded-md border border-violet-300 bg-white px-3 py-1.5 text-xs font-medium text-violet-800 hover:bg-violet-50 disabled:opacity-50"
                  onClick={() => void handleApplyYearEnd()}
                >
                  過不足を台帳へ反映
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {latestRun?.result ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="rounded-lg bg-white/80 p-2">
                <p className="text-slate-500">対象者</p>
                <p className="font-semibold">{latestRun.result.employee_count}名</p>
              </div>
              <div className="rounded-lg bg-white/80 p-2">
                <p className="text-slate-500">追徴合計</p>
                <p className="font-semibold text-rose-600">
                  {formatYen(latestRun.result.total_collect_yen)}
                </p>
              </div>
              <div className="rounded-lg bg-white/80 p-2">
                <p className="text-slate-500">還付合計</p>
                <p className="font-semibold text-emerald-600">
                  {formatYen(latestRun.result.total_refund_yen)}
                </p>
              </div>
              <div className="rounded-lg bg-white/80 p-2">
                <p className="text-slate-500">ステータス</p>
                <p className="font-semibold">
                  {latestRun.status === "applied" ? "給与反映済" : "試算完了"}
                </p>
              </div>
            </div>
            <div className="overflow-x-auto rounded-lg border border-violet-100 bg-white">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead>
                  <tr className="border-b bg-violet-50/50 text-slate-500">
                    <th className="px-2 py-2">氏名</th>
                    <th className="px-2 py-2">年間支給</th>
                    <th className="px-2 py-2">源泉徴収済</th>
                    <th className="px-2 py-2">年税額</th>
                    <th className="px-2 py-2">過不足</th>
                  </tr>
                </thead>
                <tbody>
                  {latestRun.result.employees.map((emp) => (
                    <tr key={emp.employee_id} className="border-b border-slate-50">
                      <td className="px-2 py-2 font-medium">
                        {emp.employee_name || "—"}
                        {emp.marufu_applied ? (
                          <span className="ml-1 text-[10px] text-violet-500">まるふ</span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2">{formatYen(emp.annual_payment_yen)}</td>
                      <td className="px-2 py-2">{formatYen(emp.annual_withheld_yen)}</td>
                      <td className="px-2 py-2">{formatYen(emp.annual_tax_yen)}</td>
                      <td
                        className={`px-2 py-2 font-semibold ${
                          emp.settlement_yen > 0
                            ? "text-rose-600"
                            : emp.settlement_yen < 0
                              ? "text-emerald-600"
                              : "text-slate-500"
                        }`}
                      >
                        {emp.settlement_yen > 0 ? "+" : ""}
                        {formatYen(emp.settlement_yen)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            月次台帳を入力したら「変更」→「決定」で保存してください。
            {hasLedgerNumbers
              ? " 準備ができたら「年末調整を実行」を押してください。"
              : " まず下の台帳に金額を入力してください。"}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-sky-900">算定基礎届（4〜6月）</h3>
            <p className="text-xs text-sky-800/80">
              4・5・6月の総支給を入力し「決定」で保存。等級試算後に反映すると従業員マスタの社保等級が更新されます。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SsotEditToolbar
              isEditing={santeiEdit.isEditing}
              canEdit={canEdit}
              saving={santeiSaving}
              onStart={santeiEdit.startEdit}
              onCommit={() => void handleCommitSantei()}
              onCancel={santeiEdit.cancelEdit}
            />
            {canEdit && santeiPreview && santeiPreview.grade_change_count > 0 ? (
            <button
              type="button"
              disabled={santeiBusy}
              className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
              onClick={() => void handleApplySantei()}
            >
              {santeiBusy ? "反映中…" : `等級を反映（${santeiPreview.grade_change_count}名）`}
            </button>
          ) : null}
          </div>
        </div>
        {employees.filter((e) => e.active).length === 0 ? (
          <p className="text-xs text-slate-500">従業員を登録すると算定基礎届を入力できます。</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-sky-100 bg-white">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="border-b bg-sky-50/50 text-slate-500">
                  <th className="px-2 py-2">氏名</th>
                  <th className="px-2 py-2">4月</th>
                  <th className="px-2 py-2">5月</th>
                  <th className="px-2 py-2">6月</th>
                  <th className="px-2 py-2">平均</th>
                  <th className="px-2 py-2">等級</th>
                  <th className="px-2 py-2">標準月額</th>
                </tr>
              </thead>
              <tbody>
                {employees
                  .filter((e) => e.active)
                  .map((emp) => {
                    const preview = santeiPreview?.employees.find(
                      (p) => p.employee_id === emp.id,
                    );
                    return (
                      <tr key={emp.id} className="border-b border-slate-50">
                        <td className="px-2 py-2 font-medium">{emp.name || "（未設定）"}</td>
                        {santeiMonths.map((ym) => (
                          <td key={ym} className="px-2 py-2">
                            <input
                              type="number"
                              min={0}
                              className="w-20 rounded border border-slate-200 px-1 py-0.5"
                              value={getSanteiGross(emp.id, ym) || ""}
                              disabled={!canEdit || !santeiEdit.isEditing}
                              placeholder="0"
                              onChange={(e) => {
                                const n = Number(e.target.value) || 0;
                                patchSanteiGross(emp.id, ym, n);
                              }}
                            />
                          </td>
                        ))}
                        <td className="px-2 py-2 text-slate-600">
                          {preview?.average_monthly_yen
                            ? formatYen(preview.average_monthly_yen)
                            : "—"}
                        </td>
                        <td className="px-2 py-2">
                          {preview?.suggested_grade ?? "—"}
                          {preview?.grade_changed ? (
                            <span className="ml-1 text-[10px] text-sky-600">変更</span>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 text-slate-600">
                          {preview?.suggested_standard_monthly_yen
                            ? formatYen(preview.suggested_standard_monthly_yen)
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Users className="h-4 w-4" />
            従業員マスタ
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <SsotEditToolbar
              isEditing={employeeEdit.isEditing}
              canEdit={canEdit}
              saving={employeeSaving}
              onStart={employeeEdit.startEdit}
              onCommit={() => void handleCommitEmployees()}
              onCancel={employeeEdit.cancelEdit}
            />
            {canEdit && employeeEdit.isEditing ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
                onClick={handleAddEmployee}
              >
                <Plus className="h-3 w-3" />
                追加
              </button>
            ) : null}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-2 pr-2">氏名</th>
                <th className="py-2 pr-2">甲乙</th>
                <th className="py-2 pr-2">扶養</th>
                <th className="py-2 pr-2">配偶者控除</th>
                <th className="py-2 pr-2">社保等級</th>
              </tr>
            </thead>
            <tbody>
              {employeeEdit.value.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-400">
                    従業員が未登録です
                  </td>
                </tr>
              ) : (
                employeeEdit.value.map((emp, idx) => (
                  <tr key={emp.id} className="border-b border-slate-100">
                    <td className="py-2 pr-2">
                      <input
                        className="w-full rounded border border-slate-200 px-2 py-1"
                        value={emp.name}
                        disabled={!canEdit || !employeeEdit.isEditing}
                        onChange={(e) => {
                          const name = e.target.value;
                          employeeEdit.patchDraft((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, name } : p)),
                          );
                        }}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <select
                        className="rounded border border-slate-200 px-2 py-1"
                        value={emp.tax_column}
                        disabled={!canEdit || !employeeEdit.isEditing}
                        onChange={(e) => {
                          const tax_column = e.target.value as "甲" | "乙";
                          employeeEdit.patchDraft((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, tax_column } : p)),
                          );
                        }}
                      >
                        <option value="甲">甲</option>
                        <option value="乙">乙</option>
                      </select>
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        min={0}
                        className="w-16 rounded border border-slate-200 px-2 py-1"
                        value={emp.dependent_count}
                        disabled={!canEdit || !employeeEdit.isEditing}
                        onChange={(e) => {
                          const dependent_count = Number(e.target.value) || 0;
                          employeeEdit.patchDraft((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, dependent_count } : p)),
                          );
                        }}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="checkbox"
                        checked={emp.spouse_deduction}
                        disabled={!canEdit || !employeeEdit.isEditing}
                        onChange={(e) => {
                          const spouse_deduction = e.target.checked;
                          employeeEdit.patchDraft((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, spouse_deduction } : p)),
                          );
                        }}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        min={1}
                        className="w-16 rounded border border-slate-200 px-2 py-1"
                        value={emp.social_insurance_grade ?? ""}
                        disabled={!canEdit || !employeeEdit.isEditing}
                        onChange={(e) => {
                          const v = e.target.value;
                          const social_insurance_grade = v ? Number(v) : null;
                          employeeEdit.patchDraft((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, social_insurance_grade } : p)),
                          );
                        }}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">
            {yearMonth} 源泉徴収簿
          </h3>
          <SsotEditToolbar
            isEditing={ledgerEdit.isEditing}
            canEdit={canEdit}
            saving={ledgerSaving}
            onStart={ledgerEdit.startEdit}
            onCommit={() => void handleCommitLedger()}
            onCancel={ledgerEdit.cancelEdit}
          />
        </div>
        {summary ? (
          <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-2">
              <p className="text-slate-500">総支給</p>
              <p className="font-semibold">{formatYen(summary.gross_pay_yen ?? 0)}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <p className="text-slate-500">社保合計</p>
              <p className="font-semibold">
                {formatYen(
                  (summary.health_insurance_yen ?? 0) +
                    (summary.pension_yen ?? 0) +
                    (summary.employment_insurance_yen ?? 0),
                )}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <p className="text-slate-500">源泉所得税</p>
              <p className="font-semibold">{formatYen(summary.income_tax_yen ?? 0)}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <p className="text-slate-500">差引支給</p>
              <p className="font-semibold">{formatYen(summary.net_pay_yen ?? 0)}</p>
            </div>
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-xs">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-2 pr-2">氏名</th>
                <th className="py-2 pr-2">総支給</th>
                <th className="py-2 pr-2">健保</th>
                <th className="py-2 pr-2">厚年</th>
                <th className="py-2 pr-2">雇保</th>
                <th className="py-2 pr-2">源泉税</th>
                <th className="py-2 pr-2">賞与</th>
                <th className="py-2 pr-2">住民税</th>
                <th className="py-2 pr-2">差引</th>
              </tr>
            </thead>
            <tbody>
              {employees.filter((e) => e.active).map((emp) => {
                const displayRows = ledgerEdit.isEditing ? ledgerEdit.draft : ledgerEdit.value;
                const row =
                  displayRows.find((r) => r.employee_id === emp.id) ??
                  ({
                    employee_id: emp.id,
                    year_month: yearMonth,
                    gross_pay_yen: 0,
                    bonus_yen: 0,
                    health_insurance_yen: 0,
                    pension_yen: 0,
                    employment_insurance_yen: 0,
                    income_tax_yen: 0,
                    resident_tax_yen: 0,
                    net_pay_yen: 0,
                    notes: null,
                  } as Omit<WithholdingLedgerRow, "id" | "client_id">);
                return (
                  <tr key={emp.id} className="border-b border-slate-100">
                    <td className="py-2 pr-2 font-medium text-slate-800">
                      {emp.name || "（未設定）"}
                    </td>
                    {(
                      [
                        "gross_pay_yen",
                        "health_insurance_yen",
                        "pension_yen",
                        "employment_insurance_yen",
                        "income_tax_yen",
                        "bonus_yen",
                        "resident_tax_yen",
                      ] as const
                    ).map((field) => (
                      <td key={field} className="py-2 pr-2">
                        <input
                          type="number"
                          min={0}
                          className="w-24 rounded border border-slate-200 px-2 py-1"
                          value={row[field]}
                          disabled={!canEdit || !ledgerEdit.isEditing}
                          onChange={(e) =>
                            patchLedgerRow(emp.id, {
                              [field]: Number(e.target.value) || 0,
                            })
                          }
                        />
                      </td>
                    ))}
                    <td className="py-2 pr-2 text-slate-600">
                      {formatYen(computeNetPayYen(row as WithholdingLedgerRow))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {employees.filter((e) => e.active).length === 0 ? (
          <p className="mt-2 text-center text-xs text-slate-400">
            従業員を登録すると月次台帳を入力できます
          </p>
        ) : null}
      </section>
    </div>
  );
}
