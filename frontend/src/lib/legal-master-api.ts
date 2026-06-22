import { API_BASE } from "@/config/api";
import { authFetch } from "@/lib/api-auth";

export type LegalMasterEntry = {
  id: string;
  domain: string;
  master_key: string;
  label_ja: string;
  value_numeric: number | null;
  value_text: string | null;
  jurisdiction: string | null;
  valid_from: string;
  valid_to: string | null;
  source_law: string | null;
  attributes: Record<string, unknown> | null;
  master_version_id: string | null;
  created_at: string;
  updated_at: string;
};

export type LegalMasterListResponse = {
  entry_count: number;
  db_path: string;
  domains: { domain: string; count: number }[];
  entries: LegalMasterEntry[];
};

export type LegalMasterWriteBody = {
  domain: string;
  master_key: string;
  label_ja: string;
  value_numeric?: number | null;
  value_text?: string | null;
  jurisdiction?: string | null;
  valid_from: string;
  valid_to?: string | null;
  source_law?: string | null;
  attributes?: Record<string, unknown> | null;
  master_version_id?: string | null;
};

export type ImportMode = "replace" | "merge";

export const DOMAIN_LABELS: Record<string, string> = {
  consumption_tax: "消費税",
  deduction_amount: "控除額",
  income_tax_bracket: "所得税累進",
  income_tax_surcharge: "所得税加算",
};

async function parseError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return (body as { detail?: string }).detail || res.statusText;
}

export async function fetchLegalMasterEntries(opts?: {
  domain?: string;
  asOf?: string;
}): Promise<LegalMasterListResponse> {
  const q = new URLSearchParams();
  if (opts?.domain) q.set("domain", opts.domain);
  if (opts?.asOf) q.set("as_of", opts.asOf);
  const suffix = q.toString() ? `?${q}` : "";
  const res = await authFetch(`${API_BASE}/dev/legal-master${suffix}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<LegalMasterListResponse>;
}

export async function exportLegalMasterCsv(domain?: string): Promise<{
  entry_count: number;
  csv_text: string;
}> {
  const q = domain ? `?domain=${encodeURIComponent(domain)}` : "";
  const res = await authFetch(`${API_BASE}/dev/legal-master/export${q}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function validateLegalMasterCsv(csvText: string): Promise<{
  valid: boolean;
  errors: string[];
  row_count: number;
}> {
  const res = await authFetch(`${API_BASE}/dev/legal-master/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ csv_text: csvText }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function importLegalMasterCsv(
  csvText: string,
  mode: ImportMode,
): Promise<{ imported: number; total: number }> {
  const res = await authFetch(`${API_BASE}/dev/legal-master/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ csv_text: csvText, mode }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function seedLegalMaster(): Promise<{ imported: number; total: number }> {
  const res = await authFetch(`${API_BASE}/dev/legal-master/seed`, { method: "POST" });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function createLegalMasterEntry(
  body: LegalMasterWriteBody,
): Promise<LegalMasterEntry> {
  const res = await authFetch(`${API_BASE}/dev/legal-master`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<LegalMasterEntry>;
}

export async function deleteLegalMasterEntry(id: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/dev/legal-master/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function lookupLegalMasterRate(
  masterKey: string,
  asOf: string,
): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({ master_key: masterKey, as_of: asOf });
  const res = await authFetch(`${API_BASE}/v1/legal-master/rates?${q}`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<Record<string, unknown>>;
}

export function domainLabel(domain: string): string {
  return DOMAIN_LABELS[domain] || domain;
}

export function formatValue(entry: LegalMasterEntry): string {
  if (entry.value_numeric != null) {
    if (entry.value_numeric > 0 && entry.value_numeric < 1) {
      return `${(entry.value_numeric * 100).toFixed(1)}%`;
    }
    return entry.value_numeric.toLocaleString("ja-JP");
  }
  return entry.value_text || "—";
}
