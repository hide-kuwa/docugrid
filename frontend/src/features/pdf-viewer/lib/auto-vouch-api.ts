import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";

export type AutoVouchMatchStrategy = "all" | "best" | "first";

export type AutoVouchFieldDef = {
  field_id: string;
  label: string;
  context_hints: string[];
  default_context_hint: string;
};

export type AutoVouchDocumentRef = {
  period_key: string;
  slot_id: string;
  label: string;
};

export type AutoVouchSuggest = {
  field_id: string;
  field_label: string;
  context_hint?: string;
  target_value: string;
  metric_key: string;
  document_ref: AutoVouchDocumentRef;
};

export type AutoVouchMatchedCoordinate = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  matched_text: string;
  x_norm?: number;
  y_norm?: number;
  width_norm?: number;
  height_norm?: number;
};

export type AutoVouchResponse = {
  status: "success" | "error";
  output_pdf_path: string;
  matched_coordinates: AutoVouchMatchedCoordinate[];
  message: string;
  ocr_recommended?: boolean;
  stamp_id?: string;
  error_code?: string | null;
  dry_run?: boolean;
  source_pdf_path?: string | null;
  total_matches_found?: number;
  new_version_id?: string | null;
  queue_id?: string | null;
  ocr_job_id?: string | null;
  match_source?: string | null;
};

export type AutoVouchRequest = {
  target_value: string | number;
  user_id: string;
  field_id: string;
  pdf_file_path?: string;
  version_id?: string;
  match_strategy?: AutoVouchMatchStrategy;
  context_hint?: string;
  dry_run?: boolean;
  create_version?: boolean;
  queue_on_ocr?: boolean;
  trigger_ocr?: boolean;
};

export async function fetchAutoVouchSuggest(
  metricKey: string,
  valueYen: number,
  clientId?: string,
): Promise<AutoVouchSuggest | null> {
  const q = new URLSearchParams({
    metric_key: metricKey,
    value_yen: String(valueYen),
  });
  const res = await authFetch(`${API_BASE}/audit/auto-link/suggest?${q}`, {
    headers: buildAuthHeaders(clientId),
  });
  if (!res.ok) return null;
  return (await res.json()) as AutoVouchSuggest;
}

export function autoVouchStampFileUrl(stampId: string): string {
  return `${API_BASE}/audit/auto-link/stamps/${encodeURIComponent(stampId)}/file`;
}

export async function openAutoVouchStampPreview(
  stampId: string,
  clientId?: string,
): Promise<void> {
  const res = await authFetch(autoVouchStampFileUrl(stampId), {
    headers: buildAuthHeaders(clientId),
  });
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function fetchAutoVouchFields(clientId?: string): Promise<AutoVouchFieldDef[]> {
  const res = await authFetch(`${API_BASE}/audit/auto-link/fields`, {
    headers: buildAuthHeaders(clientId),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { fields?: AutoVouchFieldDef[] };
  return data.fields ?? [];
}

export async function runAutoVouch(
  body: AutoVouchRequest,
  clientId?: string,
): Promise<AutoVouchResponse> {
  const res = await authFetch(`${API_BASE}/audit/auto-link`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(clientId),
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as AutoVouchResponse;
  if (!res.ok && data.status !== "error") {
    throw new Error(`auto-vouch-failed:${res.status}`);
  }
  return data;
}
