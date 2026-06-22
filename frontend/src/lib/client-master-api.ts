import { API_BASE } from "@/config/api";
import {
  sanitizeClientProfile,
  sanitizeClientProfileHistory,
  sanitizeClientProfileMeta,
} from "@/config/client-profile-fields";
import type { ClientFamilyGroup, OrgClient } from "@/config/organization";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";
import {
  applyFieldUpdate,
  type FieldChangeActor,
} from "@/lib/client-field-mutations";
import { dispatchOrgDirectoryReload } from "@/features/org/org-directory-events";

export type ClientMasterPayload = {
  clients: OrgClient[];
  groups: ClientFamilyGroup[];
  updated_at?: string | null;
};

function sanitizeClient(client: OrgClient): OrgClient {
  return {
    ...client,
    profile: sanitizeClientProfile(client.profile),
    profileMeta: sanitizeClientProfileMeta(client.profileMeta),
    profileHistory: sanitizeClientProfileHistory(client.profileHistory),
  };
}

export async function fetchClientMaster(signal?: AbortSignal): Promise<ClientMasterPayload> {
  const res = await authFetch(`${API_BASE}/client-master`, {
    headers: buildAuthHeaders(),
    signal,
  });
  if (!res.ok) throw new Error(`client-master-fetch-failed:${res.status}`);
  const data = (await res.json()) as ClientMasterPayload;
  return {
    clients: (data.clients ?? []).map(sanitizeClient),
    groups: data.groups ?? [],
    updated_at: data.updated_at,
  };
}

export async function fetchClientById(
  clientId: string,
  signal?: AbortSignal,
): Promise<OrgClient | null> {
  const master = await fetchClientMaster(signal);
  return master.clients.find((c) => c.id === clientId) ?? null;
}

export async function saveClientMaster(
  clients: OrgClient[],
  groups: ClientFamilyGroup[],
): Promise<ClientMasterPayload> {
  const res = await authFetch(`${API_BASE}/client-master`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...buildAuthHeaders() },
    body: JSON.stringify({
      clients: clients.map(sanitizeClient),
      groups,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail =
      typeof body === "object" && body && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : `save-failed:${res.status}`;
    throw new Error(detail);
  }
  const saved = (await res.json()) as ClientMasterPayload;
  dispatchOrgDirectoryReload();
  return {
    clients: (saved.clients ?? []).map(sanitizeClient),
    groups: saved.groups ?? [],
    updated_at: saved.updated_at,
  };
}

/** 1 項目を更新して顧客マスタ全体を保存（データ画面のインライン編集用）。 */
export async function patchClientField(
  clientId: string,
  fieldId: string,
  value: string,
  actor: FieldChangeActor,
): Promise<OrgClient> {
  const master = await fetchClientMaster();
  const index = master.clients.findIndex((client) => client.id === clientId);
  if (index < 0) throw new Error("顧問先が見つかりません。");

  const current = master.clients[index]!;
  const updated = applyFieldUpdate(current, fieldId, value, actor);
  if (updated === current) return current;

  const clients = [...master.clients];
  clients[index] = updated;
  const saved = await saveClientMaster(clients, master.groups);
  const savedClient = saved.clients.find((client) => client.id === clientId);
  if (!savedClient) throw new Error("保存後の顧問先が見つかりません。");
  return savedClient;
}
