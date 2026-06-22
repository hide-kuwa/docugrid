import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";

import type {
  AuthoringRenderResult,
  AuthoringTemplate,
  AuthoringTemplateListResponse,
} from "./types";

const BASE = `${API_BASE}/authoring-templates`;

export async function listAuthoringTemplates(
  clientId?: string,
): Promise<AuthoringTemplateListResponse> {
  const res = await authFetch(BASE, { headers: buildAuthHeaders(clientId) });
  if (!res.ok) throw new Error(`list-authoring-templates:${res.status}`);
  return (await res.json()) as AuthoringTemplateListResponse;
}

export async function createAuthoringTemplate(
  payload: {
    title: string;
    body: string;
    description?: string;
    category?: string;
    scope?: "local" | "global";
  },
): Promise<AuthoringTemplate> {
  const res = await authFetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...buildAuthHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`create-authoring-template:${res.status}`);
  return (await res.json()) as AuthoringTemplate;
}

export async function updateAuthoringTemplate(
  id: string,
  payload: { title?: string; body?: string; description?: string; category?: string },
): Promise<AuthoringTemplate> {
  const res = await authFetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...buildAuthHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`update-authoring-template:${res.status}`);
  return (await res.json()) as AuthoringTemplate;
}

export async function deleteAuthoringTemplate(id: string): Promise<void> {
  const res = await authFetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: buildAuthHeaders(),
  });
  if (!res.ok) throw new Error(`delete-authoring-template:${res.status}`);
}

export async function parseAuthoringBody(body: string): Promise<string[]> {
  const res = await authFetch(`${BASE}/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...buildAuthHeaders() },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new Error(`parse-authoring-body:${res.status}`);
  const data = (await res.json()) as { variables: string[] };
  return data.variables;
}

export async function renderAuthoringTemplate(
  templateId: string,
  clientId: string,
  values: Record<string, string>,
): Promise<AuthoringRenderResult> {
  const res = await authFetch(`${BASE}/${encodeURIComponent(templateId)}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...buildAuthHeaders(clientId) },
    body: JSON.stringify({ client_id: clientId, values }),
  });
  if (!res.ok) throw new Error(`render-authoring-template:${res.status}`);
  return (await res.json()) as AuthoringRenderResult;
}

export function downloadRenderedText(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportAuthoringPdf(args: {
  clientId: string;
  title: string;
  body: string;
}): Promise<Blob> {
  const res = await authFetch(`${BASE}/export-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...buildAuthHeaders(args.clientId) },
    body: JSON.stringify({
      client_id: args.clientId,
      title: args.title,
      body: args.body,
    }),
  });
  if (!res.ok) throw new Error(`export-authoring-pdf:${res.status}`);
  return await res.blob();
}
