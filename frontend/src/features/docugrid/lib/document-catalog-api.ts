import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";

export type CatalogSortField = {
  id: string;
  label: string;
};

export type CatalogCategoryFields = {
  category_id: string;
  label: string;
  default_period_key: string;
  sort_fields: CatalogSortField[];
};

export type CatalogRow = {
  client_id: string;
  client_name: string;
  period_key: string;
  category_id: string;
  submitted: boolean;
  logical_status?: string | null;
  metadata_status?: string | null;
  slot_document_id?: string | null;
  slot_label?: string | null;
  original_name?: string | null;
  page_count?: number | null;
  current_version_id?: string | null;
  uploaded_at?: string | null;
  version_label?: string | null;
  fields: Record<string, number | null>;
};

export type CatalogPayload = {
  category_id: string;
  category_label: string;
  period_key: string;
  fiscal_label: string;
  sort: string;
  order: "asc" | "desc";
  rows: CatalogRow[];
  submitted_count: number;
  client_count: number;
};

export async function fetchCatalogCategories(
  signal?: AbortSignal,
): Promise<CatalogCategoryFields[]> {
  const res = await authFetch(`${API_BASE}/document-catalog/fields`, {
    headers: buildAuthHeaders(),
    signal,
  });
  if (!res.ok) throw new Error(`catalog-fields-failed:${res.status}`);
  const data = (await res.json()) as { categories: CatalogCategoryFields[] };
  return data.categories;
}

export async function fetchDocumentCatalog(
  params: {
    categoryId: string;
    periodKey?: string;
    sort?: string;
    order?: "asc" | "desc";
    metadataStatus?: string;
  },
  signal?: AbortSignal,
): Promise<CatalogPayload> {
  const url = new URL(`${API_BASE}/document-catalog`);
  url.searchParams.set("category_id", params.categoryId);
  if (params.periodKey) url.searchParams.set("period_key", params.periodKey);
  if (params.sort) url.searchParams.set("sort", params.sort);
  if (params.order) url.searchParams.set("order", params.order);
  if (params.metadataStatus) url.searchParams.set("metadata_status", params.metadataStatus);
  const res = await authFetch(url.toString(), { headers: buildAuthHeaders(), signal });
  if (!res.ok) throw new Error(`catalog-fetch-failed:${res.status}`);
  return (await res.json()) as CatalogPayload;
}
