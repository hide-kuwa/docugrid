import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";

export type ClientRecordItem = {
  id: string;
  client_id: string;
  domain: "investigation" | "special_note" | "tax_alert" | string;
  title: string;
  body: string;
  meta?: Record<string, unknown> | null;
  sort_order: number;
  source_type: string;
  updated_at: string;
};

export async function fetchClientRecords(
  clientId: string,
  domain?: string,
  signal?: AbortSignal,
): Promise<ClientRecordItem[]> {
  const url = new URL(`${API_BASE}/clients/${encodeURIComponent(clientId)}/records`);
  if (domain) url.searchParams.set("domain", domain);
  const res = await authFetch(url.toString(), {
    headers: buildAuthHeaders(clientId),
    signal,
  });
  if (!res.ok) throw new Error(`records-fetch-failed:${res.status}`);
  const data = (await res.json()) as { items: ClientRecordItem[] };
  return data.items ?? [];
}

export async function upsertClientRecord(
  clientId: string,
  item: Partial<ClientRecordItem> & { domain: string },
): Promise<ClientRecordItem> {
  const res = await authFetch(
    `${API_BASE}/clients/${encodeURIComponent(clientId)}/records`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(clientId),
      },
      body: JSON.stringify(item),
    },
  );
  if (!res.ok) throw new Error(`records-upsert-failed:${res.status}`);
  return (await res.json()) as ClientRecordItem;
}

export async function deleteClientRecord(clientId: string, itemId: string): Promise<void> {
  const res = await authFetch(
    `${API_BASE}/clients/${encodeURIComponent(clientId)}/records/${encodeURIComponent(itemId)}`,
    {
      method: "DELETE",
      headers: buildAuthHeaders(clientId),
    },
  );
  if (!res.ok) throw new Error(`records-delete-failed:${res.status}`);
}
