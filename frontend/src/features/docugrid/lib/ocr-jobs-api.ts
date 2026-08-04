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
  reused?: boolean;
};

export async function createOcrJob(
  args: {
    clientId: string;
    documentVersionId: string;
    periodKey?: string;
    slotId?: string;
    slotLabel?: string;
    force?: boolean;
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
      force: args.force ?? false,
    }),
    signal,
  });
  if (!res.ok) throw new Error(`ocr-job-create-failed:${res.status}`);
  return (await res.json()) as OcrJobItem;
}

export async function fetchOcrJob(jobId: string, clientId?: string): Promise<OcrJobItem> {
  const q = new URLSearchParams();
  if (clientId) q.set("client_id", clientId);
  const qs = q.toString();
  const res = await authFetch(
    `${API_BASE}/ocr/jobs/${encodeURIComponent(jobId)}${qs ? `?${qs}` : ""}`,
    {
      headers: buildAuthHeaders(clientId),
    },
  );
  if (!res.ok) throw new Error(`ocr-job-fetch-failed:${res.status}`);
  return (await res.json()) as OcrJobItem;
}

export type OcrIndexStateItem = {
  document_version_id: string;
  firm_id: string;
  client_id: string;
  content_sha256: string;
  ocr_status: string;
  indexed_at?: string | null;
  last_job_id?: string | null;
  text_excerpt?: string | null;
  updated_at: string;
};

export async function fetchOcrStatus(
  clientId: string,
  opts?: { ocrStatus?: string; limit?: number },
): Promise<{ items: OcrIndexStateItem[]; count: number }> {
  const q = new URLSearchParams({
    client_id: clientId,
    limit: String(opts?.limit ?? 100),
  });
  if (opts?.ocrStatus) q.set("ocr_status", opts.ocrStatus);
  const res = await authFetch(`${API_BASE}/ocr/status?${q}`, {
    headers: buildAuthHeaders(clientId),
  });
  if (!res.ok) throw new Error(`ocr-status-failed:${res.status}`);
  return (await res.json()) as { items: OcrIndexStateItem[]; count: number };
}

export async function fetchOcrDocument(
  clientId: string,
  documentVersionId: string,
): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({ client_id: clientId });
  const res = await authFetch(
    `${API_BASE}/ocr/documents/${encodeURIComponent(documentVersionId)}?${q}`,
    { headers: buildAuthHeaders(clientId) },
  );
  if (!res.ok) throw new Error(`ocr-document-failed:${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

export async function searchOcrExcerpts(
  clientId: string,
  keyword: string,
  limit = 50,
  mode: "keyword" | "semantic" | "hybrid" = "hybrid",
): Promise<{
  query: string;
  mode?: string;
  items: Array<OcrIndexStateItem & Record<string, unknown>>;
  count: number;
}> {
  const q = new URLSearchParams({
    client_id: clientId,
    q: keyword,
    limit: String(limit),
    mode,
  });
  const res = await authFetch(`${API_BASE}/ocr/search?${q}`, {
    headers: buildAuthHeaders(clientId),
  });
  if (!res.ok) throw new Error(`ocr-search-failed:${res.status}`);
  return (await res.json()) as {
    query: string;
    mode?: string;
    items: Array<OcrIndexStateItem & Record<string, unknown>>;
    count: number;
  };
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
