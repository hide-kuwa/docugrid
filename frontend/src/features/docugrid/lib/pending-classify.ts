import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";
import type { ClassifyPersistMetadata, ClassifyRankedItem } from "./classify";

export type PendingClassifyItem = {
  id: string;
  client_id: string;
  period_key: string;
  file_name: string;
  byte_size: number;
  confidence: number;
  engine: string;
  suggested_slot_id?: string | null;
  classify_metadata?: ClassifyPersistMetadata | null;
  ranked: ClassifyRankedItem[];
  created_at?: string;
};

export async function listPendingClassify(
  clientId: string,
  periodKey: string,
  signal?: AbortSignal,
): Promise<PendingClassifyItem[]> {
  const url = new URL(`${API_BASE}/classify/pending`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("period_key", periodKey);
  const res = await authFetch(url.toString(), {
    headers: buildAuthHeaders(clientId),
    signal,
  });
  if (!res.ok) throw new Error(`list-pending-failed:${res.status}`);
  return (await res.json()) as PendingClassifyItem[];
}

export async function createPendingClassify(args: {
  clientId: string;
  periodKey: string;
  file: File;
  confidence: number;
  engine: string;
  suggestedSlotId?: string | null;
  suggestedIndex?: number | null;
  classifyMeta?: ClassifyPersistMetadata;
  ranked: ClassifyRankedItem[];
}): Promise<PendingClassifyItem> {
  const form = new FormData();
  form.append("file", args.file, args.file.name);
  form.append("client_id", args.clientId);
  form.append("period_key", args.periodKey);
  form.append("confidence", String(args.confidence));
  form.append("engine", args.engine);
  if (args.suggestedSlotId) form.append("suggested_slot_id", args.suggestedSlotId);
  if (args.classifyMeta) {
    form.append("classify_metadata", JSON.stringify(args.classifyMeta));
  }
  if (args.ranked.length > 0) {
    form.append("ranked", JSON.stringify(args.ranked));
  }
  const res = await authFetch(`${API_BASE}/classify/pending`, {
    method: "POST",
    headers: buildAuthHeaders(args.clientId),
    body: form,
  });
  if (!res.ok) throw new Error(`create-pending-failed:${res.status}`);
  return (await res.json()) as PendingClassifyItem;
}

export async function fetchPendingClassifyFile(
  itemId: string,
  fileName: string,
  clientId?: string,
): Promise<File> {
  const res = await authFetch(`${API_BASE}/classify/pending/${encodeURIComponent(itemId)}/file`, {
    headers: buildAuthHeaders(clientId),
  });
  if (!res.ok) throw new Error(`fetch-pending-file-failed:${res.status}`);
  const blob = await res.blob();
  return new File([blob], fileName, { type: "application/pdf" });
}

export async function deletePendingClassify(itemId: string, clientId?: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/classify/pending/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
    headers: buildAuthHeaders(clientId),
  });
  if (!res.ok) throw new Error(`delete-pending-failed:${res.status}`);
}
