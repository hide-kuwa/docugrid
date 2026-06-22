import { API_BASE } from "@/config/api";
import { authFetch } from "@/lib/api-auth";

export type IntegrationPortStatus = "active" | "planned" | "deprecated";
export type ManualPolicy = "ssot_only" | "staging_only" | "forbidden" | "";
export type PortDirection = "ingress" | "egress" | "";

export type IntegrationPortItem = {
  port_id: string;
  label_ja: string;
  ssot_owner: string;
  ssot_owner_label: string;
  manual_policy: string | null;
  manual_policy_label: string;
  direction: string | null;
  source: string;
  target: string;
  api_method: string;
  api_path: string;
  idempotency_key_template: string;
  status: IntegrationPortStatus;
  notes: string;
};

export type IntegrationPortWriteBody = {
  port_id: string;
  label_ja: string;
  ssot_owner?: string;
  ssot_owner_label?: string;
  manual_policy?: string | null;
  manual_policy_label?: string;
  direction?: string | null;
  source?: string;
  target?: string;
  api_method?: string;
  api_path?: string;
  idempotency_key_template?: string;
  status?: IntegrationPortStatus;
  notes?: string;
};

export type IntegrationPortsListResponse = {
  version: number;
  port_count: number;
  config_path: string;
  ports: IntegrationPortItem[];
};

export type IntegrationPortsValidateResponse = {
  valid: boolean;
  errors: string[];
  version?: number;
  port_count?: number;
};

export type ImportMode = "replace" | "merge";

export type IntegrationPortSampleResponse = {
  port_id: string;
  http_method: string;
  url: string;
  idempotency_key: string;
  payload: Record<string, unknown>;
  target_base_url_hint?: string | null;
};

export type IntegrationPortTestResult = {
  port_id: string;
  dry_run: boolean;
  status: "simulated" | "validated" | "sent" | "error";
  message: string;
  http_method: string;
  url: string;
  request_body: Record<string, unknown>;
  response_status?: number | null;
  response_body?: unknown;
  validation_errors: string[];
  idempotency_key: string;
  tested_at: string;
};

export type IntegrationPortHealthResponse = {
  port_id: string;
  last_test: IntegrationPortTestResult | null;
};

async function parseError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return (
    (body as { detail?: string; message?: string }).detail ||
    (body as { message?: string }).message ||
    res.statusText
  );
}

export async function fetchIntegrationPorts(): Promise<IntegrationPortsListResponse> {
  const res = await authFetch(`${API_BASE}/dev/integration-ports`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<IntegrationPortsListResponse>;
}

export async function createIntegrationPort(
  body: IntegrationPortWriteBody,
): Promise<IntegrationPortItem> {
  const res = await authFetch(`${API_BASE}/dev/integration-ports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<IntegrationPortItem>;
}

export async function updateIntegrationPort(
  portId: string,
  body: IntegrationPortWriteBody,
): Promise<IntegrationPortItem> {
  const res = await authFetch(`${API_BASE}/dev/integration-ports/${encodeURIComponent(portId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<IntegrationPortItem>;
}

export async function deleteIntegrationPort(portId: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/dev/integration-ports/${encodeURIComponent(portId)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function reloadIntegrationPorts(): Promise<{
  version: number;
  port_count: number;
  message: string;
}> {
  const res = await authFetch(`${API_BASE}/dev/integration-ports/reload`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function exportIntegrationPortsYaml(): Promise<{
  version: number;
  port_count: number;
  yaml_text: string;
}> {
  const res = await authFetch(`${API_BASE}/dev/integration-ports/export`);
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function validateIntegrationPortsYaml(
  yamlText: string,
): Promise<IntegrationPortsValidateResponse> {
  const res = await authFetch(`${API_BASE}/dev/integration-ports/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ yaml_text: yamlText }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<IntegrationPortsValidateResponse>;
}

export async function importIntegrationPortsYaml(
  yamlText: string,
  mode: ImportMode,
): Promise<{ version: number; port_count: number; message: string }> {
  const res = await authFetch(`${API_BASE}/dev/integration-ports/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ yaml_text: yamlText, mode }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function fetchIntegrationPortSample(
  portId: string,
  opts?: { clientId?: string; periodKey?: string; targetBaseUrl?: string },
): Promise<IntegrationPortSampleResponse> {
  const q = new URLSearchParams();
  if (opts?.clientId) q.set("client_id", opts.clientId);
  if (opts?.periodKey) q.set("period_key", opts.periodKey);
  if (opts?.targetBaseUrl) q.set("target_base_url", opts.targetBaseUrl);
  const suffix = q.toString() ? `?${q}` : "";
  const res = await authFetch(
    `${API_BASE}/dev/integration-ports/${encodeURIComponent(portId)}/sample${suffix}`,
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<IntegrationPortSampleResponse>;
}

export async function fetchIntegrationPortHealth(
  portId: string,
): Promise<IntegrationPortHealthResponse> {
  const res = await authFetch(
    `${API_BASE}/dev/integration-ports/${encodeURIComponent(portId)}/health`,
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<IntegrationPortHealthResponse>;
}

export async function runIntegrationPortTest(
  portId: string,
  body: {
    dry_run?: boolean;
    payload?: Record<string, unknown>;
    client_id?: string;
    period_key?: string;
    target_base_url?: string;
    batch_id?: string;
    journal_id?: string;
    user_id?: string;
  },
): Promise<IntegrationPortTestResult> {
  const res = await authFetch(
    `${API_BASE}/dev/integration-ports/${encodeURIComponent(portId)}/test`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<IntegrationPortTestResult>;
}

export function statusLabel(status: IntegrationPortStatus): string {
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

export function statusTone(status: IntegrationPortStatus): string {
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

export const EMPTY_PORT_FORM: IntegrationPortWriteBody = {
  port_id: "",
  label_ja: "",
  ssot_owner: "",
  ssot_owner_label: "",
  manual_policy: null,
  manual_policy_label: "",
  direction: null,
  source: "",
  target: "",
  api_method: "",
  api_path: "",
  idempotency_key_template: "",
  status: "planned",
  notes: "",
};

export function portToForm(port: IntegrationPortItem): IntegrationPortWriteBody {
  return {
    port_id: port.port_id,
    label_ja: port.label_ja,
    ssot_owner: port.ssot_owner,
    ssot_owner_label: port.ssot_owner_label,
    manual_policy: port.manual_policy,
    manual_policy_label: port.manual_policy_label,
    direction: port.direction,
    source: port.source,
    target: port.target,
    api_method: port.api_method,
    api_path: port.api_path,
    idempotency_key_template: port.idempotency_key_template,
    status: port.status,
    notes: port.notes,
  };
}
