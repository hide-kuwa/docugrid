import { AppPermission, AppRoleId } from "@/config/organization";
import type { PersonaId } from "@/config/personas";
import { firmLabel } from "@/config/tenancy";
import { API_BASE } from "@/config/api";
import { mergeAuthInit } from "./api-auth";

export type SessionStatus = "ok" | "missing" | "invalid" | "offline";

export const DOCUGRID_USER_KEY = "docugrid.currentUser";
export const DOCUGRID_ACCESS_TOKEN_KEY = "docugrid.accessToken";

let sessionCookiePreferred = true;

export function isSessionCookiePreferred(): boolean {
  return sessionCookiePreferred;
}

export function setSessionCookiePreferred(value: boolean): void {
  sessionCookiePreferred = value;
}

export const saveAccessToken = (token: string): void => {
  if (typeof window === "undefined" || !token.trim()) return;
  localStorage.setItem(DOCUGRID_ACCESS_TOKEN_KEY, token.trim());
};

export const loadAccessToken = (): string | null => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(DOCUGRID_ACCESS_TOKEN_KEY);
};

export const clearAccessToken = (): void => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(DOCUGRID_ACCESS_TOKEN_KEY);
};

export const clearCurrentUser = (): void => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(DOCUGRID_USER_KEY);
};

export const clearAuthSession = (): void => {
  if (typeof window === "undefined") return;
  clearAccessToken();
  clearCurrentUser();
  localStorage.removeItem("docugrid.currentClientId");
  void fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" }).catch(
    () => undefined,
  );
};

export type DocugridUser = {
  email: string;
  name: string;
  stakeholderId?: string;
  appRoleId?: AppRoleId;
  firmId?: string;
  firmLabel?: string;
  visibleClientIds?: string[];
  permissions?: AppPermission[];
  personaId?: PersonaId;
  personaLabel?: string;
};

export const saveCurrentUser = (user: DocugridUser): void => {
  if (typeof window === "undefined") return;
  localStorage.setItem(DOCUGRID_USER_KEY, JSON.stringify(user));
};

export const loadCurrentUser = (): DocugridUser | null => {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(DOCUGRID_USER_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DocugridUser>;
    if (!parsed.email) return null;
    return {
      email: parsed.email,
      name: parsed.name || parsed.email,
      stakeholderId: parsed.stakeholderId,
      appRoleId: parsed.appRoleId,
      firmId: parsed.firmId,
      firmLabel: parsed.firmLabel,
      visibleClientIds: Array.isArray(parsed.visibleClientIds)
        ? parsed.visibleClientIds
        : undefined,
      permissions: Array.isArray(parsed.permissions)
        ? (parsed.permissions as AppPermission[])
        : undefined,
      personaId: parsed.personaId as PersonaId | undefined,
      personaLabel: parsed.personaLabel,
    };
  } catch {
    return null;
  }
};

export type MeResponse = {
  email: string;
  role: string;
  stakeholder_id: string;
  firm_id?: string;
  firm_label?: string;
  persona_id?: string;
  persona_label?: string;
  visible_client_ids?: string[];
  permissions?: string[];
};

function applyMeToUser(user: DocugridUser | null, me: MeResponse): DocugridUser {
  const base = user ?? { email: me.email, name: me.email.split("@")[0] || me.email };
  return {
    ...base,
    email: me.email || base.email,
    appRoleId: (me.role as AppRoleId) || base.appRoleId,
    firmId: me.firm_id || base.firmId,
    firmLabel: me.firm_label || firmLabel(me.firm_id) || base.firmLabel,
    visibleClientIds: Array.isArray(me.visible_client_ids)
      ? me.visible_client_ids
      : base.visibleClientIds,
    permissions: Array.isArray(me.permissions)
      ? (me.permissions as AppPermission[])
      : base.permissions,
    personaId: (me.persona_id as PersonaId) || base.personaId,
    personaLabel: me.persona_label || base.personaLabel,
  };
}

/** 保存済み JWT / Cookie がまだ有効か確認 */
export async function checkSession(): Promise<SessionStatus> {
  const user = loadCurrentUser();
  const token = loadAccessToken();
  if (!user && !token) return "missing";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      ...mergeAuthInit(),
      signal: controller.signal,
    });
    if (res.status === 401 || res.status === 403) return "invalid";
    if (!res.ok) return "offline";
    const me = (await res.json()) as MeResponse;
    saveCurrentUser(applyMeToUser(user, me));
    return "ok";
  } catch {
    return "offline";
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchMeWithToken(token: string): Promise<MeResponse | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${trimmed}` },
      credentials: "include",
    });
    if (!res.ok) return null;
    return (await res.json()) as MeResponse;
  } catch {
    return null;
  }
}
