import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";

export type SlotIdentity = {
  clientId: string;
  periodKey: string;
  slotId: string;
};

export type ReviewEventItem = {
  id: string;
  client_id: string;
  period_key: string;
  slot_id: string;
  content_sha256: string | null;
  version_label: string | null;
  event_type: string;
  status: string | null;
  action_title: string | null;
  reason: string | null;
  actor_stakeholder_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  is_major: boolean;
  created_at: string;
  logical_document_id?: string | null;
  document_version_id?: string | null;
  detail?: string | null;
};

export type ReviewTimelineItem = ReviewEventItem & {
  slot_label?: string | null;
};

export type ReviewEventCreate = {
  event_type: string;
  status?: string;
  action_title?: string;
  version_label?: string;
  reason?: string;
  content_sha256?: string;
  is_major?: boolean;
  logical_document_id?: string;
  document_version_id?: string;
  detail?: string;
};

export async function listReviewEvents(
  slot: SlotIdentity,
  signal?: AbortSignal,
): Promise<ReviewEventItem[]> {
  const url = new URL(`${API_BASE}/review-events`);
  url.searchParams.set("client_id", slot.clientId);
  url.searchParams.set("period_key", slot.periodKey);
  url.searchParams.set("slot_id", slot.slotId);
  const res = await authFetch(url.toString(), { headers: buildAuthHeaders(slot.clientId), signal });
  if (!res.ok) throw new Error(`list-review-events-failed:${res.status}`);
  return (await res.json()) as ReviewEventItem[];
}

export type ReviewTimelineParams = {
  clientId: string;
  periodKey?: string;
  limit?: number;
};

/** 顧問先（＋任意で期間）横断の監査イベントを新しい順に取得する。 */
export async function listReviewTimeline(
  params: ReviewTimelineParams,
  signal?: AbortSignal,
): Promise<ReviewTimelineItem[]> {
  const url = new URL(`${API_BASE}/review-events/timeline`);
  url.searchParams.set("client_id", params.clientId);
  if (params.periodKey) url.searchParams.set("period_key", params.periodKey);
  if (params.limit != null) url.searchParams.set("limit", String(params.limit));
  const res = await authFetch(url.toString(), { headers: buildAuthHeaders(params.clientId), signal });
  if (!res.ok) throw new Error(`list-review-timeline-failed:${res.status}`);
  return (await res.json()) as ReviewTimelineItem[];
}

export async function createReviewEvent(
  slot: SlotIdentity,
  event: ReviewEventCreate,
): Promise<ReviewEventItem> {
  const res = await authFetch(`${API_BASE}/review-events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...buildAuthHeaders(slot.clientId) },
    body: JSON.stringify({
      client_id: slot.clientId,
      period_key: slot.periodKey,
      slot_id: slot.slotId,
      ...event,
    }),
  });
  if (!res.ok) throw new Error(`create-review-event-failed:${res.status}`);
  return (await res.json()) as ReviewEventItem;
}

export async function batchCreateReviewEvents(
  slot: SlotIdentity,
  events: ReviewEventCreate[],
): Promise<ReviewEventItem[]> {
  if (events.length === 0) return [];
  const res = await authFetch(`${API_BASE}/review-events/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...buildAuthHeaders(slot.clientId) },
    body: JSON.stringify({
      events: events.map((event) => ({
        client_id: slot.clientId,
        period_key: slot.periodKey,
        slot_id: slot.slotId,
        ...event,
      })),
    }),
  });
  if (!res.ok) throw new Error(`batch-review-events-failed:${res.status}`);
  return (await res.json()) as ReviewEventItem[];
}

export type ReviewExportParams = {
  clientId: string;
  periodKey?: string;
  slotId?: string;
  format: "csv" | "json";
};

export async function downloadReviewEventsExport(params: ReviewExportParams): Promise<void> {
  const url = new URL(`${API_BASE}/review-events/export`);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("format", params.format);
  if (params.periodKey) url.searchParams.set("period_key", params.periodKey);
  if (params.slotId) url.searchParams.set("slot_id", params.slotId);
  const res = await authFetch(url.toString(), { headers: buildAuthHeaders(params.clientId) });
  if (!res.ok) throw new Error(`review-export-failed:${res.status}`);
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? `review-events.${params.format}`;
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}
