import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";
import type {
  ReviewChecklistAlert,
  ReviewChecklistInstance,
  ReviewChecklistSection,
  ReviewChecklistTemplate,
} from "./schema";

export type ReviewChecklistTemplateSummary = {
  id: string;
  templateId: string;
  scope: "global" | "local" | string;
  title: string;
  description: string;
  periodTypes: string[];
  sectionCount: number;
  itemCount: number;
  updatedAt?: string;
};

export type ReviewChecklistCatalog = {
  defaultTemplateId: string;
  templates: ReviewChecklistTemplateSummary[];
};

export type ReviewChecklistAlertsResponse = {
  clientId: string;
  periodKey: string;
  templateId?: string;
  alerts: ReviewChecklistAlert[];
  summary: { total: number; warning: number; info: number };
};

export async function fetchReviewChecklistCatalog(): Promise<ReviewChecklistCatalog> {
  const res = await authFetch(`${API_BASE}/review-checklists/templates`);
  if (!res.ok) throw new Error("チェックリスト一覧の取得に失敗しました");
  return res.json();
}

export async function fetchReviewChecklistTemplate(
  templateId?: string,
): Promise<ReviewChecklistTemplate> {
  const url = templateId
    ? `${API_BASE}/review-checklists/templates/${encodeURIComponent(templateId)}`
    : `${API_BASE}/review-checklists/template`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error("チェックリスト定義の取得に失敗しました");
  return res.json();
}

export async function createReviewChecklistTemplate(payload: {
  title: string;
  description?: string;
  periodTypes?: string[];
  sourceTemplateId?: string;
  sections?: ReviewChecklistSection[];
}): Promise<ReviewChecklistTemplate> {
  const res = await authFetch(`${API_BASE}/review-checklists/templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: payload.title,
      description: payload.description ?? "",
      periodTypes: payload.periodTypes ?? ["year"],
      sourceTemplateId: payload.sourceTemplateId,
      sections: payload.sections,
    }),
  });
  if (!res.ok) throw new Error("チェックリストの作成に失敗しました");
  return res.json();
}

export async function updateReviewChecklistTemplate(
  templateId: string,
  template: Partial<ReviewChecklistTemplate>,
): Promise<ReviewChecklistTemplate> {
  const res = await authFetch(
    `${API_BASE}/review-checklists/templates/${encodeURIComponent(templateId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(template),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (body.detail === "global_template_readonly") {
      throw new Error("公式テンプレートは直接編集できません。複製してから編集してください。");
    }
    throw new Error("チェックリストの保存に失敗しました");
  }
  return res.json();
}

export async function deleteReviewChecklistTemplate(templateId: string): Promise<void> {
  const res = await authFetch(
    `${API_BASE}/review-checklists/templates/${encodeURIComponent(templateId)}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error("チェックリストの削除に失敗しました");
}

export async function setDefaultReviewChecklistTemplate(templateId: string): Promise<ReviewChecklistCatalog> {
  const res = await authFetch(`${API_BASE}/review-checklists/templates/default`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template_id: templateId }),
  });
  if (!res.ok) throw new Error("デフォルトの変更に失敗しました");
  return res.json();
}

export async function fetchReviewChecklistPrefill(
  clientId: string,
  periodKey: string,
): Promise<Record<string, string>> {
  const url = new URL(`${API_BASE}/review-checklists/prefill`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("period_key", periodKey);
  const res = await authFetch(url.toString());
  if (!res.ok) throw new Error("ヘッダの自動入力に失敗しました");
  const body = await res.json();
  return body.header ?? {};
}

export async function fetchReviewChecklistBundle(
  clientId: string,
  periodKey: string,
  templateId?: string,
): Promise<{ template: ReviewChecklistTemplate; instance: ReviewChecklistInstance }> {
  const url = new URL(`${API_BASE}/review-checklists/instance`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("period_key", periodKey);
  if (templateId) url.searchParams.set("template_id", templateId);
  const res = await authFetch(url.toString());
  if (!res.ok) throw new Error("チェックリストの取得に失敗しました");
  return res.json();
}

export type SaveReviewChecklistPayload = {
  client_id: string;
  period_key: string;
  template_id?: string;
  header?: Record<string, string>;
  itemStates?: Record<string, Record<string, string>>;
  workflowStatus?: string;
  circulationMemo?: string;
  checks?: Record<string, { checked: boolean; note?: string }>;
};

export async function saveReviewChecklistInstance(
  payload: SaveReviewChecklistPayload,
): Promise<ReviewChecklistInstance> {
  const res = await authFetch(`${API_BASE}/review-checklists/instance`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("チェックリストの保存に失敗しました");
  return res.json();
}

export async function exportReviewChecklistPdf(
  clientId: string,
  periodKey: string,
  templateId?: string,
): Promise<Blob> {
  const res = await authFetch(`${API_BASE}/review-checklists/export-pdf`, {
    method: "POST",
    headers: { ...buildAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      period_key: periodKey,
      template_id: templateId,
    }),
  });
  if (!res.ok) throw new Error("PDF の出力に失敗しました");
  return res.blob();
}
