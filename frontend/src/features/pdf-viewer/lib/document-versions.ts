import { API_ENDPOINTS } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";
import type { SlotIdentity } from "@/features/pdf-viewer/lib/review-events";

export type DocumentVersionItem = {
  id: string;
  logical_document_id: string;
  version_label: string;
  content_sha256: string;
  byte_size: number;
  page_count: number | null;
  original_name: string;
  source: string;
  parent_version_id: string | null;
  created_by_stakeholder_id: string | null;
  created_by_email: string | null;
  created_at: string;
};

export type VersionBump = "minor" | "major" | "audit_start";

export async function listDocumentVersions(
  slot: SlotIdentity,
  signal?: AbortSignal,
): Promise<DocumentVersionItem[]> {
  const url = new URL(API_ENDPOINTS.LOGICAL_VERSIONS);
  url.searchParams.set("client_id", slot.clientId);
  url.searchParams.set("period_key", slot.periodKey);
  url.searchParams.set("slot_id", slot.slotId);
  const res = await authFetch(url.toString(), { headers: buildAuthHeaders(slot.clientId), signal });
  if (!res.ok) throw new Error(`list-versions-failed:${res.status}`);
  return (await res.json()) as DocumentVersionItem[];
}

export async function fetchDocumentVersionFile(
  versionId: string,
  fileName: string,
  signal?: AbortSignal,
): Promise<File> {
  const res = await authFetch(API_ENDPOINTS.DOCUMENT_VERSION_FILE(versionId), {
    headers: buildAuthHeaders(),
    signal,
  });
  if (!res.ok) throw new Error(`fetch-version-file-failed:${res.status}`);
  const blob = await res.blob();
  return new File([blob], fileName || "document.pdf", { type: "application/pdf" });
}

/** 作業保存・監査開始・承認時に immutable 新版 PDF をサーバーへ保存する。 */
export async function createDocumentVersionSnapshot(
  slot: SlotIdentity,
  file: File,
  bump: VersionBump,
  slotLabel?: string,
): Promise<DocumentVersionItem> {
  const form = new FormData();
  form.append("client_id", slot.clientId);
  form.append("period_key", slot.periodKey);
  form.append("slot_id", slot.slotId);
  if (slotLabel) form.append("slot_label", slotLabel);
  form.append("bump", bump);
  form.append("file", file, file.name);

  const res = await authFetch(API_ENDPOINTS.DOCUMENT_VERSIONS, {
    method: "POST",
    headers: buildAuthHeaders(slot.clientId),
    body: form,
  });
  if (!res.ok) throw new Error(`create-version-failed:${res.status}`);
  return (await res.json()) as DocumentVersionItem;
}

export async function deleteDocumentVersion(versionId: string, clientId?: string): Promise<void> {
  const res = await authFetch(API_ENDPOINTS.DOCUMENT_VERSION(versionId), {
    method: "DELETE",
    headers: buildAuthHeaders(clientId),
  });
  if (!res.ok) {
    throw new Error(`delete-version-failed:${res.status}`);
  }
}

const SOURCE_LABELS: Record<string, string> = {
  client_upload: "再アップロード",
  firm_upload: "事務所保存",
  annotation_export: "編集スナップショット",
};

export function versionSourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}
