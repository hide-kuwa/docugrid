import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";

export type FirmTaskAssignee = {
  member_id: string;
  display_name: string;
  assignment_role: string;
};

export type FirmTaskItem = {
  client_id: string;
  period_key: string;
  slot_label: string;
  kind: "missing" | "pending_approval";
  assignees?: FirmTaskAssignee[];
  primary_assignee_id?: string | null;
};

export type FirmClientTaskSummary = {
  client_id: string;
  missing_total: number;
  pending_approval_total: number;
  incomplete_period_count: number;
  assignees?: FirmTaskAssignee[];
};

export type FirmStaffTaskSummary = {
  member_id: string;
  display_name: string;
  missing_total: number;
  pending_approval_total: number;
  open_client_count: number;
  assigned_client_count: number;
  assigned_client_ids: string[];
};

export type FirmTasksSummary = {
  firm_id: string;
  missing_total: number;
  pending_approval_total: number;
  client_count: number;
  clients: FirmClientTaskSummary[];
  items: FirmTaskItem[];
  staff: FirmStaffTaskSummary[];
  unassigned_missing_total: number;
  unassigned_pending_total: number;
};

export function formatAssigneeLabel(assignees: FirmTaskAssignee[] | undefined): string {
  if (!assignees?.length) return "未割当";
  const main = assignees.find((a) => a.assignment_role === "main") ?? assignees[0];
  const roleSuffix = main.assignment_role === "main" ? "" : " (サブ)";
  const extra = assignees.length > 1 ? ` +${assignees.length - 1}` : "";
  return `${main.display_name}${roleSuffix}${extra}`;
}

export async function fetchFirmTasks(signal?: AbortSignal): Promise<FirmTasksSummary> {
  const res = await authFetch(`${API_BASE}/firm-tasks`, {
    headers: buildAuthHeaders(),
    signal,
  });
  if (!res.ok) throw new Error(`firm-tasks-failed:${res.status}`);
  const data = (await res.json()) as FirmTasksSummary;
  return {
    ...data,
    staff: data.staff ?? [],
    unassigned_missing_total: data.unassigned_missing_total ?? 0,
    unassigned_pending_total: data.unassigned_pending_total ?? 0,
  };
}
