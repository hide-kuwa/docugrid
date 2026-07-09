import { API_BASE } from "@/config/api";
import { authFetch } from "@/lib/api-auth";

export type FormCatalogRole = "body" | "skip";

export type FormCatalogAnchor = {
  region: string;
  any_of: string[];
};

export type FormCatalogMapsTo = {
  tax_type?: string | null;
  slot_label?: string | null;
};

export type FormCatalogPageScan = {
  skip_in_package?: boolean;
  continuation?: boolean;
};

export type FormCatalogForm = {
  form_id: string;
  label_ja: string;
  role: FormCatalogRole | string;
  maps_to: FormCatalogMapsTo;
  anchors: FormCatalogAnchor[];
  must_not: string[];
  page_scan: FormCatalogPageScan;
  filename_hints: string[];
  notes: string;
};

export type FormCatalogListResponse = {
  version: number;
  form_count: number;
  config_path: string;
  max_scan_pages: number;
  forms: FormCatalogForm[];
};

export type FormCatalogWriteBody = {
  form_id: string;
  label_ja: string;
  role?: string;
  maps_to?: FormCatalogMapsTo;
  anchors?: FormCatalogAnchor[];
  must_not?: string[];
  page_scan?: FormCatalogPageScan;
  filename_hints?: string[];
  notes?: string;
};

export type FormCatalogScanPage = {
  page: number;
  form_id: string | null;
  label_ja: string | null;
  role?: string | null;
  confidence: number;
  engine: string;
  matched?: string[];
  reasons?: string[];
  maps_to?: FormCatalogMapsTo | null;
};

export type FormCatalogScanSegment = {
  form_id: string;
  label_ja?: string | null;
  start_page: number;
  end_page: number;
  page_count: number;
  confidence: number;
  maps_to?: FormCatalogMapsTo | null;
};

export type FormCatalogScanResult = {
  page_count_scanned: number;
  max_scan_pages: number;
  filename?: string | null;
  pages: FormCatalogScanPage[];
  segments: FormCatalogScanSegment[];
  package_forms: FormCatalogScanSegment[];
};

export const EMPTY_FORM: FormCatalogWriteBody = {
  form_id: "",
  label_ja: "",
  role: "body",
  maps_to: { tax_type: null, slot_label: null },
  anchors: [{ region: "any", any_of: [""] }],
  must_not: [],
  page_scan: { continuation: true, skip_in_package: false },
  filename_hints: [],
  notes: "",
};

export function formToWriteBody(form: FormCatalogForm): FormCatalogWriteBody {
  return {
    form_id: form.form_id,
    label_ja: form.label_ja,
    role: form.role,
    maps_to: form.maps_to ?? {},
    anchors: form.anchors?.length ? form.anchors : [{ region: "any", any_of: [""] }],
    must_not: form.must_not ?? [],
    page_scan: form.page_scan ?? {},
    filename_hints: form.filename_hints ?? [],
    notes: form.notes ?? "",
  };
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `request-failed:${res.status}`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export async function fetchFormCatalog(): Promise<FormCatalogListResponse> {
  const res = await authFetch(`${API_BASE}/dev/form-catalog`);
  return parseJson(res);
}

export async function createFormCatalogEntry(body: FormCatalogWriteBody): Promise<FormCatalogForm> {
  const res = await authFetch(`${API_BASE}/dev/form-catalog/forms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function updateFormCatalogEntry(
  formId: string,
  body: FormCatalogWriteBody,
): Promise<FormCatalogForm> {
  const res = await authFetch(`${API_BASE}/dev/form-catalog/forms/${encodeURIComponent(formId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function deleteFormCatalogEntry(formId: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/dev/form-catalog/forms/${encodeURIComponent(formId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`delete-failed:${res.status}`);
}

export async function exportFormCatalogYaml(): Promise<{ yaml_text: string }> {
  const res = await authFetch(`${API_BASE}/dev/form-catalog/export`);
  return parseJson(res);
}

export async function importFormCatalogYaml(
  yaml_text: string,
  mode: "merge" | "replace" = "merge",
): Promise<void> {
  const res = await authFetch(`${API_BASE}/dev/form-catalog/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ yaml_text, mode }),
  });
  if (!res.ok) throw new Error(`import-failed:${res.status}`);
}

export async function reloadFormCatalog(): Promise<void> {
  const res = await authFetch(`${API_BASE}/dev/form-catalog/reload`, { method: "POST" });
  if (!res.ok) throw new Error(`reload-failed:${res.status}`);
}

export async function scanFormCatalogPdf(
  file: File,
  maxPages?: number,
): Promise<FormCatalogScanResult> {
  const form = new FormData();
  form.append("file", file, file.name);
  if (maxPages != null) form.append("max_pages", String(maxPages));
  const res = await authFetch(`${API_BASE}/dev/form-catalog/scan`, {
    method: "POST",
    body: form,
  });
  return parseJson(res);
}

// --- 参考資料で学習（非エンジニア向け） ---

export type FormPreset = {
  form_id: string;
  form_name: string;
  slot_label: string | null;
  tax_type: string | null;
  is_cover: boolean;
};

export type TextMarker = {
  id?: string;
  phrase: string;
  region: string;
  note?: string;
};

export type PageAnnotation = {
  id: string;
  page: number;
  form_name: string;
  form_id?: string | null;
  slot_label?: string | null;
  tax_type?: string | null;
  is_cover?: boolean;
  markers: TextMarker[];
  exclude_phrases?: string[];
  notes?: string;
  source_filename?: string;
};

export type FormCatalogSample = {
  id: string;
  original_filename: string;
  page_count: number;
  uploaded_at: string;
  notes?: string;
  annotations: PageAnnotation[];
};

export type FormCatalogSamplesResponse = {
  sample_count: number;
  annotation_count: number;
  samples: FormCatalogSample[];
  presets: FormPreset[];
  slot_options: { slot_label: string; tax_type: string }[];
};

export type PageTextResponse = {
  page: number;
  full_text: string;
  lines: string[];
  phrases: string[];
  engine?: string;
  ai_used?: boolean;
  detected_form?: string;
  suggested_form?: {
    form_id?: string | null;
    label_ja?: string | null;
    confidence?: number;
  };
};

export type CompileFromSamplesResult = {
  forms_updated: number;
  form_ids: string[];
  learning_summary: string[];
  prompt_preview: string;
};

export async function fetchFormCatalogSamples(): Promise<FormCatalogSamplesResponse> {
  const res = await authFetch(`${API_BASE}/dev/form-catalog/samples`);
  return parseJson(res);
}

export async function uploadFormCatalogSample(file: File, notes = ""): Promise<FormCatalogSample> {
  const form = new FormData();
  form.append("file", file, file.name);
  if (notes.trim()) form.append("notes", notes.trim());
  const res = await authFetch(`${API_BASE}/dev/form-catalog/samples`, {
    method: "POST",
    body: form,
  });
  return parseJson(res);
}

export async function deleteFormCatalogSample(sampleId: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/dev/form-catalog/samples/${encodeURIComponent(sampleId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`delete-failed:${res.status}`);
}

export async function fetchSamplePageImageBlob(sampleId: string, page: number): Promise<Blob> {
  const res = await authFetch(
    `${API_BASE}/dev/form-catalog/samples/${encodeURIComponent(sampleId)}/pages/${page}/image`,
  );
  if (!res.ok) throw new Error(`image-failed:${res.status}`);
  return res.blob();
}

export async function fetchSamplePageText(
  sampleId: string,
  page: number,
  useAi = false,
): Promise<PageTextResponse> {
  const qs = useAi ? "?use_ai=true" : "";
  const res = await authFetch(
    `${API_BASE}/dev/form-catalog/samples/${encodeURIComponent(sampleId)}/pages/${page}/text${qs}`,
  );
  return parseJson(res);
}

export async function savePageAnnotation(
  sampleId: string,
  body: {
    id?: string;
    page: number;
    form_name: string;
    form_id?: string | null;
    slot_label?: string | null;
    tax_type?: string | null;
    is_cover?: boolean;
    markers: TextMarker[];
    exclude_phrases?: string[];
    notes?: string;
  },
): Promise<PageAnnotation> {
  const res = await authFetch(
    `${API_BASE}/dev/form-catalog/samples/${encodeURIComponent(sampleId)}/annotations`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return parseJson(res);
}

export async function deletePageAnnotation(sampleId: string, annotationId: string): Promise<void> {
  const res = await authFetch(
    `${API_BASE}/dev/form-catalog/samples/${encodeURIComponent(sampleId)}/annotations/${encodeURIComponent(annotationId)}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(`delete-annotation-failed:${res.status}`);
}

export async function compileFormCatalogFromSamples(): Promise<CompileFromSamplesResult> {
  const res = await authFetch(`${API_BASE}/dev/form-catalog/compile-from-samples`, {
    method: "POST",
  });
  return parseJson(res);
}

export async function fetchFormCatalogPromptPreview(): Promise<{
  prompt_preview: string;
  annotation_count: number;
  sample_count: number;
}> {
  const res = await authFetch(`${API_BASE}/dev/form-catalog/prompt-preview`);
  return parseJson(res);
}
