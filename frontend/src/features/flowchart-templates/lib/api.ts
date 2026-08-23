import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";
import type {
  FlowchartInstanceSummary,
  FlowchartOverride,
  FlowchartRunPayload,
  FlowchartTemplate,
} from "./types";

export async function listFlowchartTemplates(): Promise<{
  global: FlowchartTemplate[];
  local: FlowchartTemplate[];
}> {
  const res = await authFetch(`${API_BASE}/flowchart-templates`, {
    headers: buildAuthHeaders(),
  });
  if (!res.ok) throw new Error(`flowchart-templates:${res.status}`);
  return (await res.json()) as { global: FlowchartTemplate[]; local: FlowchartTemplate[] };
}

export async function createFlowchartTemplate(body: {
  title: string;
  description?: string;
  category?: string;
  definition?: Record<string, unknown>;
  family_id?: string;
  valid_from?: string;
  valid_to?: string | null;
  law_label?: string;
}): Promise<FlowchartTemplate> {
  const res = await authFetch(`${API_BASE}/flowchart-templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...buildAuthHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`flowchart-template-create:${res.status}`);
  return (await res.json()) as FlowchartTemplate;
}

export async function updateFlowchartTemplate(
  id: string,
  body: {
    title: string;
    description?: string;
    category?: string;
    definition?: Record<string, unknown>;
    family_id?: string;
    valid_from?: string;
    valid_to?: string | null;
    law_label?: string;
  },
): Promise<FlowchartTemplate> {
  const res = await authFetch(`${API_BASE}/flowchart-templates/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...buildAuthHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`flowchart-template-update:${res.status}`);
  return (await res.json()) as FlowchartTemplate;
}

export async function deleteFlowchartTemplate(id: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/flowchart-templates/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: buildAuthHeaders(),
  });
  if (!res.ok) throw new Error(`flowchart-template-delete:${res.status}`);
}

export async function fetchFlowchartRun(
  clientId: string,
  opts: { templateId?: string; familyId?: string; asOf?: string },
  signal?: AbortSignal,
): Promise<FlowchartRunPayload> {
  const url = new URL(
    `${API_BASE}/clients/${encodeURIComponent(clientId)}/flowchart-run`,
  );
  if (opts.templateId) url.searchParams.set("template_id", opts.templateId);
  if (opts.familyId) url.searchParams.set("family_id", opts.familyId);
  if (opts.asOf) url.searchParams.set("as_of", opts.asOf);
  const res = await authFetch(url.toString(), {
    headers: buildAuthHeaders(clientId),
    signal,
  });
  if (!res.ok) throw new Error(`flowchart-run:${res.status}`);
  return (await res.json()) as FlowchartRunPayload;
}

export async function persistFlowchartRun(
  clientId: string,
  templateId: string,
  body: {
    result_override: FlowchartOverride;
    input_overrides: Record<string, unknown>;
    family_id?: string;
    as_of?: string;
  },
): Promise<FlowchartRunPayload> {
  const res = await authFetch(
    `${API_BASE}/flowchart-templates/${encodeURIComponent(templateId)}/run`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(clientId),
      },
      body: JSON.stringify({
        client_id: clientId,
        persist_draft: true,
        ...body,
      }),
    },
  );
  if (!res.ok) throw new Error(`flowchart-run-save:${res.status}`);
  return (await res.json()) as FlowchartRunPayload;
}

export async function listFlowchartInstances(
  clientId: string,
  opts?: { templateId?: string; familyId?: string },
): Promise<FlowchartInstanceSummary[]> {
  const url = new URL(
    `${API_BASE}/clients/${encodeURIComponent(clientId)}/flowchart-instances`,
  );
  if (opts?.templateId) url.searchParams.set("template_id", opts.templateId);
  if (opts?.familyId) url.searchParams.set("family_id", opts.familyId);
  const res = await authFetch(url.toString(), { headers: buildAuthHeaders(clientId) });
  if (!res.ok) throw new Error(`flowchart-instances:${res.status}`);
  const data = (await res.json()) as { items: FlowchartInstanceSummary[] };
  return data.items ?? [];
}

export async function saveFlowchartInstance(
  clientId: string,
  body: {
    template_id: string;
    family_id?: string;
    title: string;
    result_override: FlowchartOverride;
    input_overrides: Record<string, unknown>;
    as_of?: string;
  },
): Promise<{ id: string }> {
  const res = await authFetch(
    `${API_BASE}/clients/${encodeURIComponent(clientId)}/flowchart-instances`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...buildAuthHeaders(clientId) },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(`flowchart-instance-save:${res.status}`);
  return (await res.json()) as { id: string };
}

export async function fetchFlowchartInstance(
  clientId: string,
  instanceId: string,
): Promise<{ snapshot: FlowchartRunPayload; title: string; saved_at: string; frozen?: boolean }> {
  const res = await authFetch(
    `${API_BASE}/clients/${encodeURIComponent(clientId)}/flowchart-instances/${encodeURIComponent(instanceId)}`,
    { headers: buildAuthHeaders(clientId) },
  );
  if (!res.ok) throw new Error(`flowchart-instance:${res.status}`);
  return (await res.json()) as { snapshot: FlowchartRunPayload; title: string; saved_at: string; frozen?: boolean };
}

export async function deleteFlowchartInstance(clientId: string, instanceId: string): Promise<void> {
  const res = await authFetch(
    `${API_BASE}/clients/${encodeURIComponent(clientId)}/flowchart-instances/${encodeURIComponent(instanceId)}`,
    { method: "DELETE", headers: buildAuthHeaders(clientId) },
  );
  if (!res.ok) throw new Error(`flowchart-instance-delete:${res.status}`);
}

export async function downloadFlowchartInstancePdf(clientId: string, instanceId: string, filename: string): Promise<void> {
  const res = await authFetch(
    `${API_BASE}/clients/${encodeURIComponent(clientId)}/flowchart-instances/${encodeURIComponent(instanceId)}/pdf`,
    { headers: buildAuthHeaders(clientId) },
  );
  if (!res.ok) throw new Error(`flowchart-instance-pdf:${res.status}`);
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}
