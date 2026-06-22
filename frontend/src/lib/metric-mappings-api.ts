import { API_BASE } from "@/config/api";
import { authFetch } from "@/lib/api-auth";

export type MetricMappingStatus = "active" | "planned" | "deprecated";

export type MetricMappingItem = {
  metric_key: string;
  label_ja: string;
  field_id: string;
  account_code: string;
  account_name: string;
  slot_id: string;
  period_key: string;
  document_label: string;
  status: MetricMappingStatus;
  notes: string;
};

export type MetricMappingsListResponse = {
  version: number;
  mapping_count: number;
  config_path: string;
  mappings: MetricMappingItem[];
};

export type MetricMappingWriteBody = {
  metric_key: string;
  label_ja: string;
  field_id: string;
  account_code?: string;
  account_name?: string;
  slot_id?: string;
  period_key?: string;
  document_label?: string;
  status?: MetricMappingStatus;
  notes?: string;
};

export type ImportMode = "replace" | "merge";

async function parseError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return (body as { detail?: string }).detail || res.statusText;
}

export async function fetchMetricMappings(opts?: {
  status?: string;
}): Promise<MetricMappingsListResponse> {
  const q = opts?.status ? `?status=${encodeURIComponent(opts.status)}` : "";
  const res = await authFetch(`${API_BASE}/dev/metric-mappings${q}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<MetricMappingsListResponse>;
}

export async function createMetricMapping(
  body: MetricMappingWriteBody,
): Promise<MetricMappingItem> {
  const res = await authFetch(`${API_BASE}/dev/metric-mappings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<MetricMappingItem>;
}

export async function updateMetricMapping(
  metricKey: string,
  body: MetricMappingWriteBody,
): Promise<MetricMappingItem> {
  const res = await authFetch(
    `${API_BASE}/dev/metric-mappings/${encodeURIComponent(metricKey)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<MetricMappingItem>;
}

export async function deleteMetricMapping(metricKey: string): Promise<void> {
  const res = await authFetch(
    `${API_BASE}/dev/metric-mappings/${encodeURIComponent(metricKey)}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(await parseError(res));
}

export async function exportMetricMappings(): Promise<{
  yaml_text: string;
  csv_text: string;
}> {
  const res = await authFetch(`${API_BASE}/dev/metric-mappings/export`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function validateMetricMappingsYaml(yamlText: string) {
  const res = await authFetch(`${API_BASE}/dev/metric-mappings/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ yaml_text: yamlText }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<{ valid: boolean; errors: string[]; row_count: number }>;
}

export async function validateMetricMappingsCsv(csvText: string) {
  const res = await authFetch(`${API_BASE}/dev/metric-mappings/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ csv_text: csvText }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<{ valid: boolean; errors: string[]; row_count: number }>;
}

export async function importMetricMappingsYaml(yamlText: string, mode: ImportMode) {
  const res = await authFetch(`${API_BASE}/dev/metric-mappings/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ yaml_text: yamlText, mode }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function importMetricMappingsCsv(csvText: string, mode: ImportMode) {
  const res = await authFetch(`${API_BASE}/dev/metric-mappings/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ csv_text: csvText, mode }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function reloadMetricMappings() {
  const res = await authFetch(`${API_BASE}/dev/metric-mappings/reload`, { method: "POST" });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export function statusLabel(status: MetricMappingStatus): string {
  switch (status) {
    case "active":
      return "稼働中";
    case "planned":
      return "計画";
    case "deprecated":
      return "廃止";
    default:
      return status;
  }
}

export function statusTone(status: MetricMappingStatus): string {
  switch (status) {
    case "active":
      return "text-emerald-300 bg-emerald-950/50 border-emerald-700";
    case "planned":
      return "text-amber-300 bg-amber-950/50 border-amber-700";
    case "deprecated":
      return "text-slate-400 bg-slate-800 border-slate-600";
    default:
      return "text-slate-300 bg-slate-800 border-slate-600";
  }
}

export const EMPTY_MAPPING_FORM: MetricMappingWriteBody = {
  metric_key: "",
  label_ja: "",
  field_id: "",
  account_code: "",
  account_name: "",
  slot_id: "",
  period_key: "",
  document_label: "",
  status: "planned",
  notes: "",
};

export function mappingToForm(m: MetricMappingItem): MetricMappingWriteBody {
  return { ...m };
}
