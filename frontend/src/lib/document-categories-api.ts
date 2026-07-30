/** 書類カテゴリ（中分類）マスタ API クライアント */

import { API_BASE } from "@/config/api";
import { authFetch } from "@/lib/api-auth";

export type DocumentCategoryFormRef = {
  form_id: string;
  label_ja: string;
};

export type DocumentCategory = {
  id: string;
  label: string;
  group: string;
  type_id?: string | null;
  form_count: number;
  forms: DocumentCategoryFormRef[];
};

export type DocumentCategoryListResponse = {
  version: number;
  category_count: number;
  config_path: string;
  categories: DocumentCategory[];
  unmatched: DocumentCategoryFormRef[];
  unmatched_count: number;
};

async function parseJson(res: Response): Promise<DocumentCategoryListResponse> {
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchDevDocumentCategories(): Promise<DocumentCategoryListResponse> {
  const res = await authFetch(`${API_BASE}/dev/document-categories`);
  return parseJson(res);
}

export async function reloadDevDocumentCategories(): Promise<DocumentCategoryListResponse> {
  const res = await authFetch(`${API_BASE}/dev/document-categories/reload`, {
    method: "POST",
  });
  return parseJson(res);
}
