import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";
import type { LedgerSummary, PayrollEmployee, WithholdingLedgerRow, YearEndRun } from "@/features/payroll/types";

export async function fetchPayrollEmployees(
  clientId: string,
  signal?: AbortSignal,
): Promise<PayrollEmployee[]> {
  const res = await authFetch(`${API_BASE}/clients/${encodeURIComponent(clientId)}/payroll/employees`, {
    headers: buildAuthHeaders(clientId),
    signal,
  });
  if (!res.ok) throw new Error(`payroll-employees-fetch-failed:${res.status}`);
  const data = (await res.json()) as { employees: PayrollEmployee[] };
  return data.employees ?? [];
}

export async function savePayrollEmployees(
  clientId: string,
  employees: PayrollEmployee[],
): Promise<PayrollEmployee[]> {
  const res = await authFetch(`${API_BASE}/clients/${encodeURIComponent(clientId)}/payroll/employees`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(clientId),
    },
    body: JSON.stringify({ employees }),
  });
  if (!res.ok) throw new Error(`payroll-employees-save-failed:${res.status}`);
  const data = (await res.json()) as { employees: PayrollEmployee[] };
  return data.employees ?? [];
}

export async function fetchWithholdingLedger(
  clientId: string,
  yearMonth?: string,
  signal?: AbortSignal,
): Promise<{ rows: WithholdingLedgerRow[]; summary: LedgerSummary | null }> {
  const url = new URL(`${API_BASE}/clients/${encodeURIComponent(clientId)}/payroll/ledger`);
  if (yearMonth) url.searchParams.set("year_month", yearMonth);
  const res = await authFetch(url.toString(), {
    headers: buildAuthHeaders(clientId),
    signal,
  });
  if (!res.ok) throw new Error(`withholding-ledger-fetch-failed:${res.status}`);
  return (await res.json()) as { rows: WithholdingLedgerRow[]; summary: LedgerSummary | null };
}

export async function upsertWithholdingLedgerRow(
  clientId: string,
  row: Omit<WithholdingLedgerRow, "id" | "client_id"> & { id?: string },
): Promise<WithholdingLedgerRow> {
  const res = await authFetch(`${API_BASE}/clients/${encodeURIComponent(clientId)}/payroll/ledger`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(clientId),
    },
    body: JSON.stringify({ ...row, client_id: clientId }),
  });
  if (!res.ok) throw new Error(`withholding-ledger-upsert-failed:${res.status}`);
  return (await res.json()) as WithholdingLedgerRow;
}

export async function deleteWithholdingLedgerRow(clientId: string, rowId: string): Promise<void> {
  const res = await authFetch(
    `${API_BASE}/clients/${encodeURIComponent(clientId)}/payroll/ledger/${encodeURIComponent(rowId)}`,
    {
      method: "DELETE",
      headers: buildAuthHeaders(clientId),
    },
  );
  if (!res.ok) throw new Error(`withholding-ledger-delete-failed:${res.status}`);
}

export function formatYen(value: number): string {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(value);
}

export function currentYearMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function currentTaxYear(): number {
  return new Date().getFullYear();
}

export async function runYearEndAdjustment(
  clientId: string,
  taxYear: number,
  settlementMonth?: string,
): Promise<YearEndRun> {
  const res = await authFetch(
    `${API_BASE}/clients/${encodeURIComponent(clientId)}/payroll/year-end/run`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(clientId),
      },
      body: JSON.stringify({
        tax_year: taxYear,
        settlement_month: settlementMonth ?? null,
      }),
    },
  );
  if (!res.ok) throw new Error(`year-end-run-failed:${res.status}`);
  return (await res.json()) as YearEndRun;
}

export async function fetchYearEndRuns(clientId: string): Promise<YearEndRun[]> {
  const res = await authFetch(
    `${API_BASE}/clients/${encodeURIComponent(clientId)}/payroll/year-end/runs`,
    { headers: buildAuthHeaders(clientId) },
  );
  if (!res.ok) throw new Error(`year-end-runs-failed:${res.status}`);
  const data = (await res.json()) as { runs: YearEndRun[] };
  return data.runs ?? [];
}

export async function applyYearEndRun(clientId: string, runId: string): Promise<unknown> {
  const res = await authFetch(
    `${API_BASE}/clients/${encodeURIComponent(clientId)}/payroll/year-end/runs/${encodeURIComponent(runId)}/apply`,
    {
      method: "POST",
      headers: buildAuthHeaders(clientId),
    },
  );
  if (!res.ok) throw new Error(`year-end-apply-failed:${res.status}`);
  return await res.json();
}

export async function applySanteiGrades(clientId: string, taxYear: number): Promise<unknown> {
  const res = await authFetch(
    `${API_BASE}/clients/${encodeURIComponent(clientId)}/payroll/santei/apply`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(clientId),
      },
      body: JSON.stringify({ tax_year: taxYear }),
    },
  );
  if (!res.ok) throw new Error(`santei-apply-failed:${res.status}`);
  return await res.json();
}

export type SanteiEmployeePreview = {
  employee_id: string;
  employee_name?: string | null;
  months_found: number;
  monthly_amounts_yen?: number[];
  average_monthly_yen: number;
  suggested_grade?: number | null;
  suggested_standard_monthly_yen?: number | null;
  current_grade?: number | null;
  grade_changed?: boolean;
  status: string;
};

export type SanteiPreview = {
  tax_year: number;
  employee_count: number;
  grade_change_count: number;
  employees: SanteiEmployeePreview[];
};

export async function fetchSanteiPreview(
  clientId: string,
  taxYear: number,
): Promise<SanteiPreview> {
  const url = new URL(`${API_BASE}/clients/${encodeURIComponent(clientId)}/payroll/santei/preview`);
  url.searchParams.set("tax_year", String(taxYear));
  const res = await authFetch(url.toString(), {
    headers: buildAuthHeaders(clientId),
  });
  if (!res.ok) throw new Error(`santei-preview-failed:${res.status}`);
  return (await res.json()) as SanteiPreview;
}
