import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";
import type {
  ResolvedScreenDesign,
  ScreenDesignEditorPayload,
  ScreenDesignLayerFile,
  ScreenDesignPersona,
} from "@/config/screen-design-types";
import type { PersonaId } from "@/config/personas";

export async function fetchResolvedScreenDesign(
  personaId?: PersonaId,
): Promise<ResolvedScreenDesign> {
  const q = personaId ? `?persona_id=${encodeURIComponent(personaId)}` : "";
  const res = await authFetch(`${API_BASE}/screen-design/resolved${q}`, {
    headers: buildAuthHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as ResolvedScreenDesign;
}

export async function fetchScreenDesignEditor(
  personaId?: PersonaId,
): Promise<ScreenDesignEditorPayload> {
  const q = personaId ? `?persona_id=${encodeURIComponent(personaId)}` : "";
  const res = await authFetch(`${API_BASE}/screen-design/editor${q}`, {
    headers: buildAuthHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as ScreenDesignEditorPayload;
}

export async function saveScreenDesignLayer(
  layer: "platform" | "firm" | "member",
  personaId: PersonaId,
  patch: ScreenDesignPersona,
): Promise<ScreenDesignLayerFile> {
  const body = { version: 1, personas: { [personaId]: patch } };
  const res = await authFetch(`${API_BASE}/screen-design/${layer}`, {
    method: "PUT",
    headers: { ...buildAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as ScreenDesignLayerFile;
}
