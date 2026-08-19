import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";

export type TaxProgressStageDef = {
  id: string;
  label: string;
  due_offset_days: number;
};

export type TaxProgressCell = {
  stage_id: string;
  label: string;
  status: "pending" | "done" | "na" | string;
  completed_on?: string | null;
  due_on?: string | null;
  note: string;
  source: string;
};

export type TaxProgressRow = {
  client_id: string;
  client_name: string;
  client_code: string;
  fiscal_month: number;
  primary_assignee_id?: string | null;
  primary_assignee_name: string;
  note: string;
  stages: TaxProgressCell[];
};

export type TaxProgressBoard = {
  pack: string;
  pack_label: string;
  cycle_key: string;
  stages: TaxProgressStageDef[];
  packs: { id: string; label: string; stages: TaxProgressStageDef[] }[];
  rows: TaxProgressRow[];
  summary: { clients: number; done_cells: number; total_cells: number };
};

export async function fetchTaxProgressBoard(opts?: {
  pack?: string;
  fiscalMonth?: number;
  assigneeId?: string;
  cycleKey?: string;
}): Promise<TaxProgressBoard> {
  const q = new URLSearchParams();
  if (opts?.pack) q.set("pack", opts.pack);
  if (opts?.fiscalMonth) q.set("fiscal_month", String(opts.fiscalMonth));
  if (opts?.assigneeId) q.set("assignee_id", opts.assigneeId);
  if (opts?.cycleKey) q.set("cycle_key", opts.cycleKey);
  const qs = q.toString();
  const res = await authFetch(`${API_BASE}/tax-progress/board${qs ? `?${qs}` : ""}`, {
    headers: buildAuthHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as TaxProgressBoard;
}

export async function updateTaxProgressCell(body: {
  client_id: string;
  pack: string;
  stage_id: string;
  status: string;
  note?: string;
  cycle_key?: string;
}): Promise<void> {
  const res = await authFetch(`${API_BASE}/tax-progress/cell`, {
    method: "PUT",
    headers: { ...buildAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
}
