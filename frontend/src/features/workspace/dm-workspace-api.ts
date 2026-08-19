import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";
import type { MessagingChannelsPayload } from "@/features/integrations/messaging-channels-api";

export type DmToolStatus = {
  id: "email" | "slack" | "line" | string;
  label: string;
  enabled: boolean;
  ready: boolean;
  mode?: string | null;
};

export type DmInboxItem = {
  id: string;
  channel: string;
  client_id?: string | null;
  direction: string;
  title: string;
  body: string;
  participants: string;
  occurred_at: string;
  projection?: boolean;
  meta?: Record<string, unknown>;
};

export type DmWorkspacePayload = {
  tools: DmToolStatus[];
  channels: MessagingChannelsPayload;
  items: DmInboxItem[];
  count: number;
  filter: { channel: string; client_id?: string | null };
};

export async function fetchDmWorkspace(opts?: {
  channel?: string;
  clientId?: string;
  limit?: number;
}): Promise<DmWorkspacePayload> {
  const q = new URLSearchParams();
  if (opts?.channel && opts.channel !== "all") q.set("channel", opts.channel);
  if (opts?.clientId) q.set("client_id", opts.clientId);
  if (opts?.limit) q.set("limit", String(opts.limit));
  const qs = q.toString();
  const res = await authFetch(`${API_BASE}/dm/workspace${qs ? `?${qs}` : ""}`, {
    headers: buildAuthHeaders(opts?.clientId),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as DmWorkspacePayload;
}

export async function ingestDmItem(body: {
  channel: string;
  title: string;
  body?: string;
  direction?: string;
  client_id?: string;
  participants?: string;
}): Promise<DmInboxItem> {
  const res = await authFetch(`${API_BASE}/dm/inbox`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(body.client_id),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as DmInboxItem;
}

export async function saveDmTools(
  patch: Record<string, unknown>,
): Promise<DmWorkspacePayload> {
  const res = await authFetch(`${API_BASE}/dm/tools`, {
    method: "PUT",
    headers: { ...buildAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as DmWorkspacePayload;
}

export async function sendDmMessage(body: {
  channel: "email" | "slack" | "line" | string;
  text: string;
  to?: string;
  subject?: string;
  client_id?: string;
}): Promise<{ ok: boolean; item: DmInboxItem; send: Record<string, unknown> }> {
  const res = await authFetch(`${API_BASE}/dm/send`, {
    method: "POST",
    headers: { ...buildAuthHeaders(body.client_id), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as {
    ok: boolean;
    item: DmInboxItem;
    send: Record<string, unknown>;
  };
}

export async function simulateDmInbound(body: {
  channel: "email" | "slack" | "line" | string;
  client_id?: string;
  count?: number;
}): Promise<{ ok: boolean; items: DmInboxItem[] }> {
  const res = await authFetch(`${API_BASE}/dm/simulate-inbound`, {
    method: "POST",
    headers: { ...buildAuthHeaders(body.client_id), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { ok: boolean; items: DmInboxItem[] };
}

export async function enableDmLocalLab(body?: {
  client_id?: string;
  seed?: boolean;
  count?: number;
}): Promise<{
  ok: boolean;
  seeded: DmInboxItem[];
  workspace: DmWorkspacePayload;
}> {
  const res = await authFetch(`${API_BASE}/dm/enable-local`, {
    method: "POST",
    headers: {
      ...buildAuthHeaders(body?.client_id),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: body?.client_id,
      seed: body?.seed ?? true,
      count: body?.count ?? 1,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as {
    ok: boolean;
    seeded: DmInboxItem[];
    workspace: DmWorkspacePayload;
  };
}

export async function fetchDmInboundHooks(): Promise<{
  firm_id: string;
  token: string;
  hooks: Record<string, string>;
  notes: string[];
}> {
  const res = await authFetch(`${API_BASE}/dm/inbound-hooks`, {
    headers: buildAuthHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as {
    firm_id: string;
    token: string;
    hooks: Record<string, string>;
    notes: string[];
  };
}
