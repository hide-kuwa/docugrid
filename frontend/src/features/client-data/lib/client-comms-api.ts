import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";

export type CommThread = {
  id: string;
  client_id: string;
  channel: "slack" | "email" | string;
  subject: string;
  preview: string;
  participants: string;
  occurred_at: string;
  source_type: string;
  updated_at: string;
};

export async function fetchCommThreads(
  clientId: string,
  signal?: AbortSignal,
): Promise<CommThread[]> {
  const res = await authFetch(
    `${API_BASE}/clients/${encodeURIComponent(clientId)}/comms/threads`,
    { headers: buildAuthHeaders(clientId), signal },
  );
  if (!res.ok) throw new Error(`comms-fetch-failed:${res.status}`);
  const data = (await res.json()) as { threads: CommThread[] };
  return data.threads ?? [];
}

export async function upsertCommThread(
  clientId: string,
  thread: Partial<CommThread> & { subject: string },
): Promise<CommThread> {
  const res = await authFetch(
    `${API_BASE}/clients/${encodeURIComponent(clientId)}/comms/threads`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(clientId),
      },
      body: JSON.stringify(thread),
    },
  );
  if (!res.ok) throw new Error(`comms-upsert-failed:${res.status}`);
  return (await res.json()) as CommThread;
}

export async function deleteCommThread(clientId: string, threadId: string): Promise<void> {
  const res = await authFetch(
    `${API_BASE}/clients/${encodeURIComponent(clientId)}/comms/threads/${encodeURIComponent(threadId)}`,
    {
      method: "DELETE",
      headers: buildAuthHeaders(clientId),
    },
  );
  if (!res.ok) throw new Error(`comms-delete-failed:${res.status}`);
}
