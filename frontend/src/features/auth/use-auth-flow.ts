"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  checkSession,
  clearAuthSession,
  fetchMeWithToken,
  loadCurrentUser,
  saveAccessToken,
  saveCurrentUser,
  setSessionCookiePreferred,
} from "@/lib/auth";
import { STAKEHOLDER_MASTER, type AppPermission, type AppRoleId } from "@/config/organization";
import { API_BASE } from "@/config/api";
import type { PersonaId } from "@/config/personas";
import { getPostLoginPath } from "@/lib/persona";

export type AuthConfig = {
  google_client_id: string;
  password_login_enabled?: boolean;
  session_cookie?: boolean;
};

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export function useAuthFlow(options?: { skipSessionRedirect?: boolean; sessionReason?: string | null }) {
  const router = useRouter();
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [configError, setConfigError] = useState("");
  const [clientReady, setClientReady] = useState(false);

  useEffect(() => {
    setClientReady(true);
  }, []);

  useEffect(() => {
    if (options?.skipSessionRedirect) return;
    void (async () => {
      if (options?.sessionReason === "session") {
        clearAuthSession();
        return;
      }
      const session = await checkSession();
      if (session === "ok") {
        const dest = getPostLoginPath(loadCurrentUser());
        router.replace(dest);
      }
    })();
  }, [options?.sessionReason, options?.skipSessionRedirect, router]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetchWithTimeout(`${API_BASE}/auth/config`);
        if (!res.ok) {
          setConfigError("認証設定を取得できませんでした。");
          return;
        }
        const data = (await res.json()) as AuthConfig;
        setSessionCookiePreferred(data.session_cookie !== false);
        setAuthConfig(data);
      } catch {
        setConfigError("バックエンドに接続できません（ポート 8000）。起動後に再度お試しください。");
      }
    })();
  }, []);

  const completeLogin = useCallback(
    async (accessToken: string, fallbackEmail = "") => {
      if (accessToken) {
        saveAccessToken(accessToken);
      }
      const me = await fetchMeWithToken(accessToken);
      const loginEmail = me?.email || fallbackEmail || "user@local";
      const matched = STAKEHOLDER_MASTER.find((item) => item.id === me?.stakeholder_id);
      const nameFromMe = (me?.display_name || "").trim();
      const name =
        nameFromMe ||
        matched?.displayName ||
        loginEmail.split("@")[0] ||
        loginEmail;
      const savedUser = me
        ? {
            email: loginEmail,
            name,
            stakeholderId: me.stakeholder_id || matched?.id,
            appRoleId: (me.role as AppRoleId) || matched?.appRoleId,
            firmId: me.firm_id,
            firmLabel: me.firm_label,
            visibleClientIds: Array.isArray(me.visible_client_ids) ? me.visible_client_ids : undefined,
            assignedClientIds: Array.isArray(me.assigned_client_ids) ? me.assigned_client_ids : undefined,
            permissions: Array.isArray(me.permissions) ? (me.permissions as AppPermission[]) : undefined,
            personaId: me.persona_id as PersonaId | undefined,
            personaLabel: me.persona_label,
          }
        : {
            email: loginEmail,
            name,
          };
      saveCurrentUser(savedUser);
      const path = getPostLoginPath(savedUser);
      router.replace(path);
      window.setTimeout(() => {
        if (window.location.pathname.startsWith("/login") || window.location.pathname.startsWith("/register")) {
          window.location.assign(path);
        }
      }, 300);
    },
    [router],
  );

  const googleClientId = clientReady
    ? authConfig?.google_client_id || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ""
    : "";

  return {
    authConfig,
    configError,
    configLoading: authConfig === null && !configError,
    clientReady,
    googleClientId,
    passwordLoginEnabled: authConfig?.password_login_enabled === true,
    completeLogin,
  };
}
