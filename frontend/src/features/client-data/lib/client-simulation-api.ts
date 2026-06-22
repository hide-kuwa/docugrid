import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";

export type SimulationPanelKey = "charts" | "valuation";

export type SimulationOverlayResponse<T> = {
  client_id: string;
  panel_key: SimulationPanelKey;
  payload: T | null;
  updated_at?: string;
};

export async function fetchSimulationOverlay<T>(
  clientId: string,
  panelKey: SimulationPanelKey,
  signal?: AbortSignal,
): Promise<SimulationOverlayResponse<T> | null> {
  const res = await authFetch(
    `${API_BASE}/clients/${encodeURIComponent(clientId)}/simulation/${panelKey}`,
    { headers: buildAuthHeaders(clientId), signal },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`simulation-fetch-failed:${res.status}`);
  return (await res.json()) as SimulationOverlayResponse<T>;
}

export async function saveSimulationOverlay<T>(
  clientId: string,
  panelKey: SimulationPanelKey,
  payload: T,
): Promise<SimulationOverlayResponse<T>> {
  const res = await authFetch(
    `${API_BASE}/clients/${encodeURIComponent(clientId)}/simulation/${panelKey}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(clientId),
      },
      body: JSON.stringify({ payload }),
    },
  );
  if (!res.ok) throw new Error(`simulation-save-failed:${res.status}`);
  return (await res.json()) as SimulationOverlayResponse<T>;
}

export async function deleteSimulationOverlay(
  clientId: string,
  panelKey: SimulationPanelKey,
): Promise<void> {
  const res = await authFetch(
    `${API_BASE}/clients/${encodeURIComponent(clientId)}/simulation/${panelKey}`,
    {
      method: "DELETE",
      headers: buildAuthHeaders(clientId),
    },
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`simulation-delete-failed:${res.status}`);
  }
}
