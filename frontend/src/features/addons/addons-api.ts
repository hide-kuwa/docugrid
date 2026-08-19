import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";

export type AddonStatus = "draft" | "pilot" | "official" | "internal";
export type AddonInstaller = "firm" | "platform";

export type FirmAddon = {
  id: string;
  title: string;
  summary: string;
  group: string;
  status: AddonStatus;
  installableBy: AddonInstaller;
  provides: string[];
  builtin: boolean;
  source: "builtin" | "custom";
  installed: boolean;
  canInstall: boolean;
  canUninstall: boolean;
  locked: boolean;
  lockedReason: string;
};

export type AdminAddon = Omit<
  FirmAddon,
  "installed" | "canInstall" | "canUninstall" | "locked" | "lockedReason"
> & {
  pilotFirmIds: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  installedFirmIds: string[];
};

async function readError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const body = JSON.parse(text) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
    if (body.detail) return JSON.stringify(body.detail);
  } catch {
    /* raw */
  }
  return text || `HTTP ${res.status}`;
}

export async function fetchFirmAddons(): Promise<{ firmId: string; addons: FirmAddon[] }> {
  const res = await authFetch(`${API_BASE}/addons`, { headers: buildAuthHeaders() });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function installFirmAddon(addonId: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/addons/${encodeURIComponent(addonId)}/install`, {
    method: "POST",
    headers: buildAuthHeaders(),
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function uninstallFirmAddon(addonId: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/addons/${encodeURIComponent(addonId)}/uninstall`, {
    method: "POST",
    headers: buildAuthHeaders(),
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function fetchAdminAddons(): Promise<{ addons: AdminAddon[] }> {
  const res = await authFetch(`${API_BASE}/addons/admin`, { headers: buildAuthHeaders() });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function createAdminAddon(body: {
  id?: string;
  title: string;
  summary?: string;
  group?: string;
  installableBy?: AddonInstaller;
  provides?: string[];
  pilotFirmIds?: string[];
}): Promise<AdminAddon> {
  const res = await authFetch(`${API_BASE}/addons`, {
    method: "POST",
    headers: { ...buildAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function promoteAdminAddon(addonId: string): Promise<AdminAddon> {
  const res = await authFetch(`${API_BASE}/addons/${encodeURIComponent(addonId)}/promote`, {
    method: "POST",
    headers: { ...buildAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ installableBy: "firm" }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function assignAdminAddon(
  addonId: string,
  firmId: string,
  installed: boolean,
): Promise<void> {
  const res = await authFetch(`${API_BASE}/addons/${encodeURIComponent(addonId)}/assign`, {
    method: "POST",
    headers: { ...buildAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ firmId, installed }),
  });
  if (!res.ok) throw new Error(await readError(res));
}
