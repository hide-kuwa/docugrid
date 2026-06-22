import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";

export type FirmTaskItem = {
  client_id: string;
  period_key: string;
  slot_label: string;
  kind: "missing" | "pending_approval";
};

export type FirmClientTaskSummary = {
  client_id: string;
  missing_total: number;
  pending_approval_total: number;
  incomplete_period_count: number;
};

export type FirmTasksSummary = {
  firm_id: string;
  missing_total: number;
  pending_approval_total: number;
  client_count: number;
  clients: FirmClientTaskSummary[];
  items: FirmTaskItem[];
};

export async function fetchFirmTasks(signal?: AbortSignal): Promise<FirmTasksSummary> {
  const res = await authFetch(`${API_BASE}/firm-tasks`, {
    headers: buildAuthHeaders(),
    signal,
  });
  if (!res.ok) throw new Error(`firm-tasks-failed:${res.status}`);
  return (await res.json()) as FirmTasksSummary;
}
