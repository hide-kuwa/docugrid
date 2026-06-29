import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";
import type { NormalizeResultPayload } from "@/features/docugrid/lib/slot-documents";

export type FieldExtractionStatus = "extracted" | "missing" | "low_confidence";

export type FieldExtractionItem = {
  field_id: string;
  label: string;
  value: string | null;
  confidence: number;
  status: FieldExtractionStatus;
  target: string;
  required: boolean;
};

export type ExtractionReviewPayload = {
  slot_id: string;
  document_label: string;
  schema_version: number;
  review_status: "complete" | "needs_review";
  fields: FieldExtractionItem[];
  extracted_profile?: Record<string, string>;
};

export type ApplyExtractionArgs = {
  clientId: string;
  periodKey: string;
  slotId: string;
  slotLabel?: string;
  fields: Record<string, string>;
};

/** 人が確認・補完したフィールドをマスタへ反映 */
export async function applyExtractionFields(
  args: ApplyExtractionArgs,
): Promise<NormalizeResultPayload> {
  const res = await authFetch(`${API_BASE}/extraction/apply`, {
    method: "POST",
    headers: {
      ...buildAuthHeaders(args.clientId),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: args.clientId,
      period_key: args.periodKey,
      slot_id: args.slotId,
      slot_label: args.slotLabel,
      fields: args.fields,
    }),
  });
  if (!res.ok) throw new Error(`extraction-apply-failed:${res.status}`);
  return (await res.json()) as NormalizeResultPayload;
}

export function pendingExtractionFields(
  review: ExtractionReviewPayload | null | undefined,
): FieldExtractionItem[] {
  if (!review?.fields?.length) return [];
  return review.fields.filter((f) => f.status !== "extracted" || !f.value);
}

export function appliedExtractionFields(
  review: ExtractionReviewPayload | null | undefined,
): FieldExtractionItem[] {
  if (!review?.fields?.length) return [];
  return review.fields.filter((f) => f.status === "extracted" && f.value);
}
