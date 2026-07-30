import { API_BASE } from "@/config/api";
import { authFetch } from "@/lib/api-auth";

export type FirmOnboardingInfo = {
  firmId: string;
  firmLabel: string;
  joinCode: string;
  pendingCount: number;
  isBillingOwner: boolean;
};

export type InvitePreview = {
  firmId: string;
  firmLabel: string;
  emailHint: string;
  expiresAt: string;
};

export type MemberInviteResult = {
  id: string;
  email: string;
  token: string;
  inviteUrl: string;
  expiresAt: string;
};

export async function fetchFirmOnboarding(): Promise<FirmOnboardingInfo> {
  const res = await authFetch(`${API_BASE}/firm/onboarding`);
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as FirmOnboardingInfo;
}

export async function inviteFirmMember(
  email: string,
  opts?: { firm_role?: string; persona_id?: string },
): Promise<MemberInviteResult> {
  const res = await authFetch(`${API_BASE}/firm-members/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      firm_role: opts?.firm_role || "operator",
      persona_id: opts?.persona_id || null,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as MemberInviteResult;
}

export async function fetchInvitePreview(token: string): Promise<InvitePreview> {
  const res = await fetch(
    `${API_BASE}/auth/invite-preview?token=${encodeURIComponent(token)}`,
  );
  if (!res.ok) throw new Error("invite_not_found");
  return (await res.json()) as InvitePreview;
}
