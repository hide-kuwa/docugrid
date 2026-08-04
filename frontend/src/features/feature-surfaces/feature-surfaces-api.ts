import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";

export type FeatureSurfaceMode = "live" | "preview" | "planned" | "partial";

export type FeatureSurface = {
  id: string;
  label: string;
  description: string;
  default_mode: FeatureSurfaceMode;
  group: string;
  mode: FeatureSurfaceMode;
  source: "catalog" | "platform" | "firm";
  badge: string;
  title: string;
  wip_kind: "mock" | "partial" | "planned" | null;
  writes_allowed: boolean;
  show_sample: boolean;
};

export type FeatureSurfacesResolved = {
  version: number;
  firmId: string;
  surfaces: FeatureSurface[];
  modesById: Record<string, FeatureSurfaceMode>;
};

export type FeatureSurfacesEditor = {
  resolved: FeatureSurfacesResolved;
  platform: { modes?: Record<string, string> };
  firm: { modes?: Record<string, string> };
  canEditPlatform: boolean;
  canEditFirm: boolean;
  allowedModes: FeatureSurfaceMode[];
};

export async function fetchFeatureSurfaces(): Promise<FeatureSurfacesResolved> {
  const res = await authFetch(`${API_BASE}/feature-surfaces`, {
    headers: buildAuthHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchFeatureSurfacesEditor(): Promise<FeatureSurfacesEditor> {
  const res = await authFetch(`${API_BASE}/feature-surfaces/editor`, {
    headers: buildAuthHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function saveFeatureSurfacesLayer(
  layer: "platform" | "firm",
  modes: Record<string, FeatureSurfaceMode>,
): Promise<void> {
  const res = await authFetch(`${API_BASE}/feature-surfaces/${layer}`, {
    method: "PUT",
    headers: { ...buildAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ modes }),
  });
  if (!res.ok) throw new Error(await res.text());
}
