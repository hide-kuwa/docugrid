import { loadAccessToken, loadCurrentUser } from "./auth";

const CLIENT_SCOPE_KEY = "docugrid.currentClientId";
const CSRF_COOKIE_NAME = "docugrid_csrf";
const CSRF_HEADER_NAME = "X-CSRF-Token";

export const getCsrfTokenFromCookie = (): string => {
  if (typeof document === "undefined") return "";
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    if (trimmed.slice(0, eq) === CSRF_COOKIE_NAME) {
      return decodeURIComponent(trimmed.slice(eq + 1));
    }
  }
  return "";
};

let clientScopeMemory = "";

export const setClientScope = (clientId: string): void => {
  if (typeof window === "undefined") return;
  clientScopeMemory = clientId;
  localStorage.setItem(CLIENT_SCOPE_KEY, clientId);
};

const loadClientScope = (): string => {
  if (typeof window === "undefined") return "";
  if (clientScopeMemory) return clientScopeMemory;
  const stored = localStorage.getItem(CLIENT_SCOPE_KEY) ?? "";
  if (stored) clientScopeMemory = stored;
  return stored;
};

/**
 * API 認証ヘッダ。JWT がある場合は Bearer（Cookie 併用時は Cookie のみでも可）。
 * ヘッダフォールバックは未ログイン/開発用テスト向け。
 * @param clientIdOverride マトリクス上の顧問先 ID（localStorage より優先）
 */
export const buildAuthHeaders = (clientIdOverride?: string): HeadersInit => {
  const token = loadAccessToken();
  const clientId = (clientIdOverride || "").trim() || loadClientScope();
  const headers: Record<string, string> = {};

  if (clientId) {
    headers["X-Docugrid-Client"] = clientId;
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  const csrf = getCsrfTokenFromCookie();
  if (csrf) {
    headers[CSRF_HEADER_NAME] = csrf;
  }

  const user = loadCurrentUser();
  headers["X-Docugrid-Role"] = user?.appRoleId ?? "";
  headers["X-Docugrid-User"] = user?.email ?? "";
  headers["X-Docugrid-Stakeholder"] = user?.stakeholderId ?? "";
  return headers;
};

/** Cookie セッション向け: 常に credentials: include */
export function mergeAuthInit(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  const auth = buildAuthHeaders() as Record<string, string>;
  for (const [key, value] of Object.entries(auth)) {
    if (value) headers.set(key, value);
  }
  return { ...init, credentials: "include", headers };
}

export function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, mergeAuthInit(init));
}
