/** 書類種別マスタ API クライアント */

import { API_BASE } from "@/config/api";
import { authFetch } from "@/lib/api-auth";

export type DocumentTypeFlags = {
  ocr: boolean;
  dashboard: boolean;
  alert: boolean;
};

export type DocumentTypeCatalog = {
  enabled: boolean;
  default_period_key?: string;
  sort_fields?: { id: string; label: string }[];
  metrics?: Record<string, string>;
};

export type DocumentType = {
  id: string;
  label: string;
  flags: DocumentTypeFlags;
  catalog: DocumentTypeCatalog;
};

export type DocumentTypeListResponse = {
  version: number;
  type_count: number;
  config_path: string;
  types: DocumentType[];
};

/** organization.ts DocumentCategoryConfig 互換 */
export type DocumentCategoryConfig = {
  id: string;
  label: string;
  ocrTarget: boolean;
  dashboardTarget: boolean;
  alertTarget: boolean;
};

export function toDocumentCategoryConfig(t: DocumentType): DocumentCategoryConfig {
  return {
    id: t.id,
    label: t.label,
    ocrTarget: t.flags.ocr,
    dashboardTarget: t.flags.dashboard,
    alertTarget: t.flags.alert,
  };
}

async function parseJson(res: Response): Promise<DocumentTypeListResponse> {
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchDocumentTypes(): Promise<DocumentTypeListResponse> {
  const res = await authFetch(`${API_BASE}/document-types`);
  return parseJson(res);
}

export async function fetchDevDocumentTypes(): Promise<DocumentTypeListResponse> {
  const res = await authFetch(`${API_BASE}/dev/document-types`);
  return parseJson(res);
}

export async function reloadDevDocumentTypes(): Promise<DocumentTypeListResponse> {
  const res = await authFetch(`${API_BASE}/dev/document-types/reload`, {
    method: "POST",
  });
  return parseJson(res);
}
