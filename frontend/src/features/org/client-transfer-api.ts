import { API_BASE } from "@/config/api";

export type PublicTransferView = {
  code: string;
  clientDisplayName: string;
  status: string;
  expiresAt: string;
  documentCount: number;
};

export type TransferCreateResult = {
  id: string;
  code: string;
  shareUrl: string;
  expiresAt: string;
  clientId: string;
  clientDisplayName: string;
  documentCount: number;
  status: string;
};

export type TransferPreview = {
  mode: "preview";
  transferId: string;
  code: string;
  clientDisplayName: string;
  documentCount: number;
  expiresAt: string;
  fromFirmId: string;
};

export type TransferClaimed = {
  mode: "claimed";
  transferId: string;
  code: string;
  newClientId: string;
  clientName: string;
  documentsImported: number;
  documentCount: number;
};

export type TransferListItem = {
  id: string;
  code: string;
  shareUrl: string;
  clientId: string;
  clientDisplayName: string;
  status: string;
  expiresAt: string;
  documentCount: number;
  createdAt: string;
  claimedClientId?: string | null;
};

export async function fetchPublicTransfer(code: string): Promise<PublicTransferView | null> {
  const res = await fetch(`${API_BASE}/client-transfers/public/${encodeURIComponent(code)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`public_transfer_${res.status}`);
  return (await res.json()) as PublicTransferView;
}

export async function createClientTransfer(
  clientId: string,
  init?: RequestInit,
): Promise<TransferCreateResult> {
  const { authFetch, buildAuthHeaders } = await import("@/lib/api-auth");
  const res = await authFetch(`${API_BASE}/client-transfers`, {
    method: "POST",
    headers: { ...buildAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ clientId }),
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail?.message || err?.detail || `create_${res.status}`);
  }
  return (await res.json()) as TransferCreateResult;
}

export async function claimClientTransfer(
  code: string,
  confirm: boolean,
): Promise<TransferPreview | TransferClaimed> {
  const { authFetch, buildAuthHeaders } = await import("@/lib/api-auth");
  const res = await authFetch(`${API_BASE}/client-transfers/claim`, {
    method: "POST",
    headers: { ...buildAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ code, confirm }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail?.message || err?.detail || `claim_${res.status}`);
  }
  return (await res.json()) as TransferPreview | TransferClaimed;
}

export async function revokeClientTransfer(transferId: string): Promise<void> {
  const { authFetch, buildAuthHeaders } = await import("@/lib/api-auth");
  const res = await authFetch(`${API_BASE}/client-transfers/${encodeURIComponent(transferId)}/revoke`, {
    method: "POST",
    headers: buildAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail?.message || err?.detail || `revoke_${res.status}`);
  }
}

export async function listClientTransfers(): Promise<TransferListItem[]> {
  const { authFetch, buildAuthHeaders } = await import("@/lib/api-auth");
  const res = await authFetch(`${API_BASE}/client-transfers`, {
    headers: buildAuthHeaders(),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { transfers?: TransferListItem[] };
  return Array.isArray(data.transfers) ? data.transfers : [];
}

export function statusLabelJa(status: string): string {
  switch (status) {
    case "pending":
      return "受付待ち";
    case "claimed":
      return "受取済み";
    case "expired":
      return "期限切れ";
    case "revoked":
      return "取消済み";
    default:
      return status;
  }
}
