import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";
import { parseApiErrorBody } from "@/lib/parse-api-error";

export type StakeholderMasterPayload = {
  roleByStakeholderId: Record<string, string>;
  clientScopesByStakeholderId: Record<string, string[]>;
  updated_at?: string | null;
};

export async function fetchStakeholderMaster(signal?: AbortSignal): Promise<StakeholderMasterPayload> {
  const res = await authFetch(`${API_BASE}/stakeholder-master`, {
    headers: buildAuthHeaders(),
    signal,
  });
  if (!res.ok) throw new Error(`stakeholder-master-get-failed:${res.status}`);
  return (await res.json()) as StakeholderMasterPayload;
}

export async function saveStakeholderMaster(
  payload: StakeholderMasterPayload,
): Promise<StakeholderMasterPayload> {
  const res = await authFetch(`${API_BASE}/stakeholder-master`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...buildAuthHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseApiErrorBody(body, `stakeholder-master-put-failed:${res.status}`));
  }
  return (await res.json()) as StakeholderMasterPayload;
}
