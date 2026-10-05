import { API_ENDPOINTS } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";
import type { ClassifyPersistMetadata } from "./classify";
import { guessSlotMime, isConvertibleImageName, isPdfSlotName } from "./slot-file-kinds";

export type NormalizeFieldApplied = {
  field_id: string;
  value: string;
  previous_value: string;
  confidence: number;
};

export type NormalizeResultPayload = {
  applied: NormalizeFieldApplied[];
  skipped: { field_id: string; reason: string; incoming_value?: string | null }[];
  conflicts: {
    field_id: string;
    existing_value: string;
    incoming_value: string;
    existing_source: string;
  }[];
  metrics_applied: unknown[];
  tax_alerts_created: string[];
  propagate: boolean;
  extraction_review?: import("@/features/client-data/lib/extraction-api").ExtractionReviewPayload | null;
};

export type SlotDocumentItem = {
  id: string;
  client_id: string;
  period_key: string;
  slot_id: string;
  slot_label: string | null;
  original_name: string;
  page_count: number | null;
  content_sha256: string;
  byte_size: number;
  uploaded_by: string | null;
  uploaded_at: string;
  logical_document_id?: string | null;
  current_version_id?: string | null;
  current_version_label?: string | null;
  workflow_status?: string | null;
  docugrid_document_id?: string | null;
  logical_status?: string | null;
  classify_metadata?: ClassifyPersistMetadata | null;
  google_drive_file_id?: string | null;
  version_count?: number | null;
  normalize_result?: NormalizeResultPayload | null;
  ocr_job_id?: string | null;
  deleted_at?: string | null;
  deleted_from_slot_id?: string | null;
  deleted_from_slot_label?: string | null;
  client_shared_at?: string | null;
  client_shared_by?: string | null;
  content_type?: string | null;
  is_pdf?: boolean;
  is_convertible_image?: boolean;
};

export type PersistSlotArgs = {
  clientId: string;
  periodKey: string;
  slotId: string;
  slotLabel: string;
  file: File;
  classifyMetadata?: ClassifyPersistMetadata;
  /** true のとき同期正規化をスキップしバックグラウンド OCR ジョブを起動 */
  asyncClassify?: boolean;
};

/** Upload (or replace) the document stored in a client × period × slot. */
export async function persistSlotDocument({
  clientId,
  periodKey,
  slotId,
  slotLabel,
  file,
  classifyMetadata,
  asyncClassify,
}: PersistSlotArgs): Promise<SlotDocumentItem> {
  const form = new FormData();
  form.append("client_id", clientId);
  form.append("period_key", periodKey);
  form.append("slot_id", slotId);
  form.append("slot_label", slotLabel);
  form.append("file", file);
  if (classifyMetadata) {
    form.append("classify_metadata", JSON.stringify(classifyMetadata));
  }
  if (asyncClassify) {
    form.append("async_classify", "true");
  }

  const res = await authFetch(API_ENDPOINTS.SLOTS, {
    method: "POST",
    body: form,
    headers: buildAuthHeaders(clientId),
  });
  if (!res.ok) {
    throw new Error(`persist-slot-failed:${res.status}`);
  }
  return (await res.json()) as SlotDocumentItem;
}

/** List persisted documents for a client, optionally scoped to one period. */
export async function listSlotDocuments(
  clientId: string,
  periodKey?: string,
  signal?: AbortSignal,
  options?: { includeDeleted?: boolean },
): Promise<SlotDocumentItem[]> {
  const url = new URL(API_ENDPOINTS.SLOTS);
  url.searchParams.set("client_id", clientId);
  if (periodKey) url.searchParams.set("period_key", periodKey);
  if (options?.includeDeleted) url.searchParams.set("include_deleted", "true");

  const res = await authFetch(url.toString(), {
    method: "GET",
    headers: buildAuthHeaders(clientId),
    signal,
  });
  if (!res.ok) {
    throw new Error(`list-slots-failed:${res.status}`);
  }
  return (await res.json()) as SlotDocumentItem[];
}

/** Download stored bytes and rebuild a File (PDF or other allowlisted type). */
export async function fetchSlotDocumentFile(
  item: SlotDocumentItem,
  signal?: AbortSignal,
): Promise<File> {
  const res = await authFetch(API_ENDPOINTS.SLOT_FILE(item.id), {
    method: "GET",
    headers: buildAuthHeaders(item.client_id),
    signal,
  });
  if (!res.ok) {
    throw new Error(`fetch-slot-file-failed:${res.status}`);
  }
  const blob = await res.blob();
  const name = item.original_name || "document.bin";
  const type =
    item.content_type ||
    blob.type ||
    guessSlotMime(name, isPdfSlotName(name) ? "application/pdf" : "application/octet-stream");
  return new File([blob], name, { type });
}

/** Trigger browser download of the current slot file. */
export async function downloadSlotDocumentFile(item: SlotDocumentItem): Promise<void> {
  const file = await fetchSlotDocumentFile(item);
  const url = URL.createObjectURL(file);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Convert current image version to PDF (new version; original stays in history). */
export async function convertSlotDocumentToPdf(
  docId: string,
  clientId?: string,
): Promise<SlotDocumentItem> {
  const res = await authFetch(`${API_ENDPOINTS.SLOTS}/${encodeURIComponent(docId)}/convert-to-pdf`, {
    method: "POST",
    headers: buildAuthHeaders(clientId),
  });
  if (!res.ok) {
    throw new Error(`convert-slot-to-pdf-failed:${res.status}`);
  }
  return (await res.json()) as SlotDocumentItem;
}

export function slotItemIsPdf(item: Pick<SlotDocumentItem, "original_name" | "is_pdf">): boolean {
  if (typeof item.is_pdf === "boolean") return item.is_pdf;
  return isPdfSlotName(item.original_name);
}

export function slotItemIsConvertibleImage(
  item: Pick<SlotDocumentItem, "original_name" | "is_convertible_image">,
): boolean {
  if (typeof item.is_convertible_image === "boolean") return item.is_convertible_image;
  return isConvertibleImageName(item.original_name);
}

export async function detachSlotDocument(docId: string, clientId?: string): Promise<void> {
  const url = new URL(API_ENDPOINTS.SLOT_FILE(docId).replace(/\/file$/, ""));
  url.searchParams.set("mode", "detach");
  const res = await authFetch(url.toString(), {
    method: "DELETE",
    headers: buildAuthHeaders(clientId),
  });
  if (!res.ok) {
    throw new Error(`detach-slot-failed:${res.status}`);
  }
}

export type MoveSlotDocumentArgs = {
  docId: string;
  slotId: string;
  slotLabel?: string;
  /** 移動元の認可ヘッダ用（省略可） */
  sourceClientId?: string;
  /** 行き先の期（省略時は現状維持） */
  periodKey?: string;
  /** 行き先の顧問先（省略時は現状維持） */
  clientId?: string;
};

export async function moveSlotDocument(
  args: MoveSlotDocumentArgs | string,
  slotId?: string,
  slotLabel?: string,
  clientId?: string,
): Promise<SlotDocumentItem> {
  // 旧シグネチャ互換: moveSlotDocument(docId, slotId, slotLabel, clientId)
  const normalized: MoveSlotDocumentArgs =
    typeof args === "string"
      ? {
          docId: args,
          slotId: slotId ?? "",
          slotLabel,
          sourceClientId: clientId,
        }
      : args;

  const body: Record<string, string> = {
    slot_id: normalized.slotId,
  };
  if (normalized.slotLabel != null && normalized.slotLabel !== "") {
    body.slot_label = normalized.slotLabel;
  }
  if (normalized.periodKey) body.period_key = normalized.periodKey;
  if (normalized.clientId) body.client_id = normalized.clientId;

  const res = await authFetch(
    API_ENDPOINTS.SLOT_FILE(normalized.docId).replace(/\/file$/, ""),
    {
      method: "PATCH",
      headers: {
        ...buildAuthHeaders(normalized.sourceClientId ?? normalized.clientId),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    if (res.status === 409) {
      throw new Error("move-slot-occupied");
    }
    throw new Error(`move-slot-failed:${res.status}`);
  }
  return (await res.json()) as SlotDocumentItem;
}

export async function shareSlotWithClient(
  docId: string,
  clientId?: string,
): Promise<SlotDocumentItem> {
  const res = await authFetch(
    `${API_ENDPOINTS.SLOT_FILE(docId).replace(/\/file$/, "")}/share-with-client`,
    {
      method: "POST",
      headers: buildAuthHeaders(clientId),
    },
  );
  if (!res.ok) {
    throw new Error(`share-slot-failed:${res.status}`);
  }
  const body = (await res.json()) as { item: SlotDocumentItem };
  return body.item;
}

export async function unshareSlotWithClient(
  docId: string,
  clientId?: string,
): Promise<SlotDocumentItem> {
  const res = await authFetch(
    `${API_ENDPOINTS.SLOT_FILE(docId).replace(/\/file$/, "")}/unshare-with-client`,
    {
      method: "POST",
      headers: buildAuthHeaders(clientId),
    },
  );
  if (!res.ok) {
    throw new Error(`unshare-slot-failed:${res.status}`);
  }
  const body = (await res.json()) as { item: SlotDocumentItem };
  return body.item;
}

export async function softDeleteSlotDocument(docId: string, clientId?: string): Promise<void> {
  const res = await authFetch(API_ENDPOINTS.SLOT_FILE(docId).replace(/\/file$/, ""), {
    method: "DELETE",
    headers: buildAuthHeaders(clientId),
  });
  if (!res.ok) {
    throw new Error(`soft-delete-slot-failed:${res.status}`);
  }
}

export async function purgeSlotDocument(docId: string, clientId?: string): Promise<void> {
  const url = new URL(API_ENDPOINTS.SLOT_FILE(docId).replace(/\/file$/, ""));
  url.searchParams.set("mode", "purge");
  const res = await authFetch(url.toString(), {
    method: "DELETE",
    headers: buildAuthHeaders(clientId),
  });
  if (!res.ok) {
    throw new Error(`purge-slot-failed:${res.status}`);
  }
}

export async function restoreSlotDocument(
  docId: string,
  clientId?: string,
): Promise<SlotDocumentItem> {
  const res = await authFetch(`${API_ENDPOINTS.SLOT_FILE(docId).replace(/\/file$/, "")}/restore`, {
    method: "POST",
    headers: buildAuthHeaders(clientId),
  });
  if (!res.ok) {
    throw new Error(`restore-slot-failed:${res.status}`);
  }
  const body = (await res.json()) as { item: SlotDocumentItem };
  return body.item;
}

/** @deprecated Use softDeleteSlotDocument or purgeSlotDocument */
export async function deleteSlotDocument(docId: string, clientId?: string): Promise<void> {
  return softDeleteSlotDocument(docId, clientId);
}
