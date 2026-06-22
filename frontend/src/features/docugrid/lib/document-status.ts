import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";

export type PeriodStatus = {
  period_key: string;
  period_type: string;
  required_count: number;
  filled_count: number;
  approved_count?: number;
  missing: string[];
  pending_approval?: string[];
  complete: boolean;
  approved_complete?: boolean;
};

export type DocumentStatusSummary = {
  client_id: string;
  periods: PeriodStatus[];
  missing_total: number;
  pending_approval_total?: number;
  incomplete_count: number;
  started_count: number;
};

/** 顧客全体の充足状況（アップロード実績のある期間のサマリ）を取得する。 */
export async function fetchDocumentStatus(
  clientId: string,
  signal?: AbortSignal,
): Promise<DocumentStatusSummary> {
  const url = new URL(`${API_BASE}/document-status`);
  url.searchParams.set("client_id", clientId);
  const res = await authFetch(url.toString(), { headers: buildAuthHeaders(clientId), signal });
  if (!res.ok) throw new Error(`document-status-failed:${res.status}`);
  return (await res.json()) as DocumentStatusSummary;
}
