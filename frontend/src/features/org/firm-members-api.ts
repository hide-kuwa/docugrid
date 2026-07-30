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

export type FirmMemberRole = "firm_admin" | "operator" | "viewer";

export type FirmMemberPatch = {
  status?: "active" | "inactive" | "pending";
  firm_role?: FirmMemberRole;
  persona_id?: string | null;
  display_name?: string | null;
};

export async function fetchFirmMembers(): Promise<FirmMemberRow[]> {
  const res = await authFetch(`${API_BASE}/firm-members`);
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as FirmMemberRow[];
}

export async function patchFirmMember(
  memberId: string,
  patch: FirmMemberPatch,
): Promise<FirmMemberRow> {
  const res = await authFetch(`${API_BASE}/firm-members/${encodeURIComponent(memberId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as FirmMemberRow;
}

/** @deprecated use patchFirmMember */
export async function patchFirmMemberStatus(
  memberId: string,
  status: "active" | "inactive" | "pending",
): Promise<FirmMemberRow> {
  return patchFirmMember(memberId, { status });
}
