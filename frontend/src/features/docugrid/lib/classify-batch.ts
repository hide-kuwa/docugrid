import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";

import type {
  ClassifyBatchResult,
  FirmDocumentTemplate,
} from "../schema/tax-document";

export async function classifyBatch(
  files: File[],
  clientId?: string,
): Promise<ClassifyBatchResult & { template?: FirmDocumentTemplate }> {
  const form = new FormData();
  for (const file of files) {
    form.append("files", file, file.name);
  }
  if (clientId) form.append("client_id", clientId);

  const res = await authFetch(`${API_BASE}/classify/batch`, {
    method: "POST",
    headers: buildAuthHeaders(clientId),
    body: form,
  });
  if (!res.ok) throw new Error(`classify-batch-failed:${res.status}`);
  return (await res.json()) as ClassifyBatchResult & { template?: FirmDocumentTemplate };
}

export async function fetchDocumentTemplate(): Promise<FirmDocumentTemplate> {
  const res = await authFetch(`${API_BASE}/document-templates`, {
    headers: buildAuthHeaders(),
  });
  if (!res.ok) throw new Error(`document-templates-get-failed:${res.status}`);
  return (await res.json()) as FirmDocumentTemplate;
}

export async function mergePdfsInOrder(files: File[], clientId?: string): Promise<Blob> {
  const form = new FormData();
  for (const file of files) {
    form.append("files", file, file.name);
  }
  const res = await authFetch(`${API_BASE}/edit/merge`, {
    method: "POST",
    headers: buildAuthHeaders(clientId),
    body: form,
  });
  if (!res.ok) throw new Error(`merge-failed:${res.status}`);
  return res.blob();
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadMergedPackage(
  files: File[],
  filename: string,
  clientId?: string,
): Promise<void> {
  const blob = await mergePdfsInOrder(files, clientId);
  triggerDownload(blob, filename);
}
