import { API_BASE } from "@/config/api";
import { authFetch } from "@/lib/api-auth";

export type FirmMemberRow = {
  id: string;
  email: string;
  stakeholder_id: string;
  firm_role: string;
  persona_id: string;
  status: string;
  display_name: string | null;
};

export async function fetchFirmMembers(): Promise<FirmMemberRow[]> {
  const res = await authFetch(`${API_BASE}/firm-members`);
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as FirmMemberRow[];
}

export async function patchFirmMemberStatus(
  memberId: string,
  status: "active" | "inactive",
): Promise<FirmMemberRow> {
  const res = await authFetch(`${API_BASE}/firm-members/${encodeURIComponent(memberId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as FirmMemberRow;
}
