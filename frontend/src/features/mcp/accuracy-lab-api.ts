import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";

export type AccuracyOutcome = "ok" | "partial" | "fail" | "unknown";
export type AccuracySource = "auto" | "manual";
export type AccuracyKind =
  | "search"
  | "ocr"
  | "get_document"
  | "status"
  | "note"
  | "failure"
  | "rating";

export type AccuracyLabEntry = {
  id: string;
  firm_id: string;
  client_id?: string | null;
  source: AccuracySource;
  kind: AccuracyKind;
  outcome: AccuracyOutcome;
  title: string;
  body: string;
  context: Record<string, unknown>;
  tags: string[];
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type AccuracyLabPresets = {
  version?: number;
  trial_keywords: string[];
  check_prompts: Array<{ id?: string; label?: string } | string>;
  outcome_labels: Record<string, string>;
};

export async function fetchAccuracyLabPresets(): Promise<AccuracyLabPresets> {
  const res = await authFetch(`${API_BASE}/accuracy-lab/presets`, {
    headers: buildAuthHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as AccuracyLabPresets;
}

export async function saveAccuracyLabPresets(
  body: Partial<Pick<AccuracyLabPresets, "trial_keywords" | "check_prompts">>,
): Promise<AccuracyLabPresets> {
  const res = await authFetch(`${API_BASE}/accuracy-lab/presets`, {
    method: "PUT",
    headers: { ...buildAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as AccuracyLabPresets;
}

export async function fetchAccuracyLabEntries(opts?: {
  clientId?: string;
  outcome?: AccuracyOutcome;
  source?: AccuracySource;
  limit?: number;
}): Promise<{ items: AccuracyLabEntry[]; count: number }> {
  const q = new URLSearchParams();
  if (opts?.clientId) q.set("client_id", opts.clientId);
  if (opts?.outcome) q.set("outcome", opts.outcome);
  if (opts?.source) q.set("source", opts.source);
  if (opts?.limit) q.set("limit", String(opts.limit));
  const qs = q.toString();
  const res = await authFetch(`${API_BASE}/accuracy-lab/entries${qs ? `?${qs}` : ""}`, {
    headers: buildAuthHeaders(opts?.clientId),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { items: AccuracyLabEntry[]; count: number };
}

export async function createAccuracyLabEntry(body: {
  source?: AccuracySource;
  kind?: AccuracyKind;
  title: string;
  outcome?: AccuracyOutcome;
  body?: string;
  client_id?: string;
  context?: Record<string, unknown>;
  tags?: string[];
}): Promise<AccuracyLabEntry> {
  const res = await authFetch(`${API_BASE}/accuracy-lab/entries`, {
    method: "POST",
    headers: { ...buildAuthHeaders(body.client_id), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as AccuracyLabEntry;
}

export async function deleteAccuracyLabEntry(entryId: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/accuracy-lab/entries/${encodeURIComponent(entryId)}`, {
    method: "DELETE",
    headers: buildAuthHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function exportAccuracyLabMarkdown(): Promise<string> {
  const res = await authFetch(`${API_BASE}/accuracy-lab/export.md`, {
    headers: buildAuthHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.text();
}

export async function snapshotAccuracyLab(): Promise<{
  path: string;
  bytes: number;
  markdown: string;
}> {
  const res = await authFetch(`${API_BASE}/accuracy-lab/snapshot`, {
    method: "POST",
    headers: buildAuthHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { path: string; bytes: number; markdown: string };
}

export async function publishAccuracyLabDocs(): Promise<{
  docs_path?: string;
  bytes: number;
  markdown: string;
}> {
  const res = await authFetch(`${API_BASE}/accuracy-lab/publish-docs`, {
    method: "POST",
    headers: buildAuthHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as {
    docs_path?: string;
    bytes: number;
    markdown: string;
  };
}
