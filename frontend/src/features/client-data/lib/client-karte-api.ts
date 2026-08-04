import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";

export type KarteHorizon = "permanent" | "period" | "period_end" | "task";
export type KarteStatus = "open" | "done" | "archived";

export type KarteEntry = {
  id: string;
  client_id: string;
  horizon: KarteHorizon;
  period_key: string | null;
  title: string;
  body: string;
  status: KarteStatus;
  due_date: string | null;
  meeting_at: string | null;
  tags: string[];
  content_sha256: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  sort_order: number;
};

export const KARTE_HORIZON_LABELS: Record<KarteHorizon, string> = {
  permanent: "永続",
  period: "期ごと",
  period_end: "期末メモ",
  task: "宿題・短期",
};

export async function fetchKarteEntries(
  clientId: string,
  opts?: {
    horizon?: KarteHorizon;
    periodKey?: string;
    status?: KarteStatus;
    includeArchived?: boolean;
  },
  signal?: AbortSignal,
): Promise<KarteEntry[]> {
  const url = new URL(`${API_BASE}/clients/${encodeURIComponent(clientId)}/karte`);
  if (opts?.horizon) url.searchParams.set("horizon", opts.horizon);
  if (opts?.periodKey) url.searchParams.set("period_key", opts.periodKey);
  if (opts?.status) url.searchParams.set("status", opts.status);
  if (opts?.includeArchived) url.searchParams.set("include_archived", "true");
  const res = await authFetch(url.toString(), {
    headers: buildAuthHeaders(clientId),
    signal,
  });
  if (!res.ok) throw new Error(`karte-fetch-failed:${res.status}`);
  const data = (await res.json()) as { items: KarteEntry[] };
  return data.items ?? [];
}

export async function upsertKarteEntry(
  clientId: string,
  item: Partial<KarteEntry> & { horizon: KarteHorizon },
): Promise<KarteEntry> {
  const res = await authFetch(`${API_BASE}/clients/${encodeURIComponent(clientId)}/karte`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(clientId),
    },
    body: JSON.stringify(item),
  });
  if (!res.ok) throw new Error(`karte-upsert-failed:${res.status}`);
  return (await res.json()) as KarteEntry;
}

export async function deleteKarteEntry(clientId: string, entryId: string): Promise<void> {
  const res = await authFetch(
    `${API_BASE}/clients/${encodeURIComponent(clientId)}/karte/${encodeURIComponent(entryId)}`,
    {
      method: "DELETE",
      headers: buildAuthHeaders(clientId),
    },
  );
  if (!res.ok) throw new Error(`karte-delete-failed:${res.status}`);
}

export async function syncKarteRag(
  clientId: string,
): Promise<{ entries: number; ingested: number; reused: number }> {
  const res = await authFetch(
    `${API_BASE}/clients/${encodeURIComponent(clientId)}/karte/rag-sync`,
    {
      method: "POST",
      headers: buildAuthHeaders(clientId),
    },
  );
  if (!res.ok) throw new Error(`karte-rag-sync-failed:${res.status}`);
  return (await res.json()) as { entries: number; ingested: number; reused: number };
}
