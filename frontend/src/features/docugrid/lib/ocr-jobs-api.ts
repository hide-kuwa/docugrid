import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";

export type OcrJobStatus = "processing" | "done" | "failed";

export type OcrJobItem = {
  id: string;
  client_id: string;
  document_version_id: string;
  period_key?: string | null;
  slot_id?: string | null;
  slot_label?: string | null;
  status: OcrJobStatus;
  result?: (Record<string, unknown> & { normalize_result?: unknown }) | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
};

export async function createOcrJob(
  args: {
    clientId: string;
    documentVersionId: string;
    periodKey?: string;
    slotId?: string;
    slotLabel?: string;
  },
  signal?: AbortSignal,
): Promise<OcrJobItem> {
  const res = await authFetch(`${API_BASE}/ocr/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(args.clientId),
    },
    body: JSON.stringify({
      client_id: args.clientId,
      document_version_id: args.documentVersionId,
      period_key: args.periodKey,
      slot_id: args.slotId,
      slot_label: args.slotLabel,
    }),
    signal,
  });
  if (!res.ok) throw new Error(`ocr-job-create-failed:${res.status}`);
  return (await res.json()) as OcrJobItem;
}

export async function fetchOcrJob(jobId: string, clientId?: string): Promise<OcrJobItem> {
  const res = await authFetch(`${API_BASE}/ocr/jobs/${encodeURIComponent(jobId)}`, {
    headers: buildAuthHeaders(clientId),
  });
  if (!res.ok) throw new Error(`ocr-job-fetch-failed:${res.status}`);
  return (await res.json()) as OcrJobItem;
}

export async function pollOcrJob(
  jobId: string,
  clientId?: string,
  opts?: { intervalMs?: number; maxAttempts?: number },
): Promise<OcrJobItem> {
  const interval = opts?.intervalMs ?? 800;
  const max = opts?.maxAttempts ?? 60;
  for (let i = 0; i < max; i += 1) {
    const job = await fetchOcrJob(jobId, clientId);
    if (job.status !== "processing") return job;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error("ocr-job-timeout");
}
