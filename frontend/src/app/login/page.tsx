"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import {
  checkSession,
  clearAuthSession,
  fetchMeWithToken,
  loadCurrentUser,
  saveAccessToken,
  saveCurrentUser,
  setSessionCookiePreferred,
} from "@/lib/auth";
import { parseApiErrorBody } from "@/lib/parse-api-error";
import { STAKEHOLDER_MASTER, type AppPermission, type AppRoleId } from "@/config/organization";
import { API_BASE } from "@/config/api";
import type { PersonaId } from "@/config/personas";
import { getPostLoginPath } from "@/lib/persona";

type AuthConfig = {
  google_client_id: string;
  password_login_enabled: boolean;
  session_cookie?: boolean;
};

async function fetchWithTimeout(
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

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const sessionNotice =
    reason === "session"
      ? "セッションの有効期限が切れました。再度ログインしてください。"
      : reason === "offline"
        ? "サーバーに接続できません。バックエンド（ポート 8000）が起動しているか確認してください。"
        : "";

  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [configError, setConfigError] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("admin@tax.co.jp");
  const [password, setPassword] = useState("password");

  useEffect(() => {
    void (async () => {
      if (reason === "session") {
        clearAuthSession();
        return;
      }
      const session = await checkSession();
      if (session === "ok") {
        const dest = getPostLoginPath(loadCurrentUser());
        router.replace(dest);
      }
    })();
  }, [reason, router]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetchWithTimeout(`${API_BASE}/auth/config`);
        if (!res.ok) {
          setConfigError("認証設定を取得できませんでした（パスワードログインは試せます）");
          return;
        }
        const data = (await res.json()) as AuthConfig;
        setSessionCookiePreferred(data.session_cookie !== false);
        setAuthConfig(data);
      } catch {
        setConfigError("バックエンドに接続できません（ポート 8000）。起動後にログインしてください。");
      }
    })();
  }, []);

  const navigateAfterLogin = useCallback(
    (path: string) => {
      router.replace(path);
      window.setTimeout(() => {
        if (window.location.pathname === "/login") {
          window.location.assign(path);
        }
      }, 300);
    },
    [router],
  );

  const completeLogin = useCallback(
    async (accessToken: string, fallbackEmail = "") => {
      if (accessToken) {
        saveAccessToken(accessToken);
      }
      const me = await fetchMeWithToken(accessToken);
      const loginEmail = me?.email || fallbackEmail || "user@local";
      const matched = STAKEHOLDER_MASTER.find((item) => item.id === me?.stakeholder_id);
      const name = loginEmail.split("@")[0] || loginEmail;
      const savedUser = me
        ? {
            email: loginEmail,
            name: matched?.displayName || name,
            stakeholderId: me.stakeholder_id || matched?.id,
            appRoleId: (me.role as AppRoleId) || matched?.appRoleId,
            firmId: me.firm_id,
            firmLabel: me.firm_label,
            visibleClientIds: Array.isArray(me.visible_client_ids) ? me.visible_client_ids : undefined,
            permissions: Array.isArray(me.permissions) ? (me.permissions as AppPermission[]) : undefined,
            personaId: me.persona_id as PersonaId | undefined,
            personaLabel: me.persona_label,
          }
        : {
            email: loginEmail,
            name,
          };
      saveCurrentUser(savedUser);
      navigateAfterLogin(getPostLoginPath(savedUser));
    },
    [navigateAfterLogin],
  );

  const handleGoogleSuccess = async (credentialResponse: { credential?: string }) => {
    setError("");
    setSubmitting(true);
    try {
      if (!credentialResponse.credential) {
        setError("Google 認証に失敗しました");
        return;
      }
      const res = await fetchWithTimeout(`${API_BASE}/auth/google`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: credentialResponse.credential }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        access_token?: string;
        detail?: unknown;
      };
      if (!res.ok || !data.access_token) {
        setError(parseApiErrorBody(data, "Google ログインに失敗しました"));
        return;
      }
      await completeLogin(data.access_token);
    } catch {
      setError("Google ログイン中にエラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordLogin = async () => {
    setError("");
    setSubmitting(true);
    try {
      const res = await fetchWithTimeout(`${API_BASE}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, stakeholder_id: "" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        access_token?: string;
        detail?: unknown;
      };
      if (!res.ok || !data.access_token) {
        setError(parseApiErrorBody(data, "ログインに失敗しました"));
        return;
      }
      await completeLogin(data.access_token, email);
    } catch {
      setError("サーバーに接続できませんでした。バックエンド（ポート 8000）を確認してください。");
    } finally {
      setSubmitting(false);
    }
  };

  const googleClientId =
    authConfig?.google_client_id ||
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    "";
  const configLoading = authConfig === null && !configError;
  const passwordLoginEnabled = authConfig?.password_login_enabled ?? true;
  const usePasswordAsPrimary = passwordLoginEnabled && !googleClientId;

  const passwordForm = (
    <div className="space-y-3">
      <label className="block text-xs font-bold text-slate-600">
        メールアドレス
        <input
          type="email"
          autoComplete="username"
          className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handlePasswordLogin();
          }}
          placeholder="admin@tax.co.jp"
        />
      </label>
      <label className="block text-xs font-bold text-slate-600">
        パスワード
        <input
          type="password"
          autoComplete="current-password"
          className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handlePasswordLogin();
          }}
        />
      </label>
      <button
        type="button"
        disabled={submitting}
        onClick={() => void handlePasswordLogin()}
        className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-60"
      >
        {submitting ? "ログイン中…" : "ログイン"}
      </button>
      {usePasswordAsPrimary ? (
        <p className="text-center text-[11px] leading-relaxed text-slate-500">
          ローカル開発用です。初期値: <code className="text-slate-600">admin@tax.co.jp</code> /{" "}
          <code className="text-slate-600">password</code>
        </p>
      ) : null}
    </div>
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4 font-sans">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="relative overflow-hidden bg-slate-800 p-8 text-center">
          <div className="absolute left-0 top-0 h-2 w-full bg-gradient-to-r from-blue-500 to-indigo-600" />
          <h1 className="mb-2 text-3xl font-black italic tracking-tighter text-white">
            <span className="text-blue-500">Docu</span>Grid
          </h1>
          <p className="text-sm text-slate-400">税務ドキュメント管理システム</p>
        </div>

        <div className="space-y-6 p-8">
          {(sessionNotice || configError) && (
            <p className="text-center text-xs font-bold text-amber-600">{sessionNotice || configError}</p>
          )}

          {configLoading ? (
            <p className="text-center text-[11px] text-slate-400">認証設定を確認中…（ログインはそのまま試せます）</p>
          ) : null}

          {usePasswordAsPrimary ? (
            <div>
              <p className="mb-4 text-center text-sm font-bold text-slate-700">開発用ログイン</p>
              {passwordForm}
            </div>
          ) : null}

          {googleClientId ? (
            <div className="flex flex-col items-center gap-3">
              <GoogleOAuthProvider clientId={googleClientId}>
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => setError("Google ログインがキャンセルされました")}
                  useOneTap={false}
                  theme="filled_blue"
                  size="large"
                  text="signin_with"
                  shape="rectangular"
                  width="320"
                />
              </GoogleOAuthProvider>
              <p className="text-center text-[11px] leading-relaxed text-slate-500">
                事務所の Google アカウントでサインインしてください。
                <br />
                未登録のメールアドレスはアクセスできません。
              </p>
            </div>
          ) : null}

          {passwordLoginEnabled && googleClientId ? (
            <div className="border-t border-slate-200 pt-4">
              <p className="mb-3 text-center text-xs font-bold text-slate-500">または開発用パスワード</p>
              {passwordForm}
            </div>
          ) : null}

          {!configLoading && !passwordLoginEnabled && !googleClientId ? (
            <p className="text-center text-sm text-slate-600">
              ログイン方法が設定されていません。
              <br />
              バックエンドの起動と <code className="text-xs">GOOGLE_OAUTH_CLIENT_ID</code> を確認してください。
            </p>
          ) : null}

          {error && <p className="text-center text-xs font-bold text-red-600">{error}</p>}

          <p className="text-center text-xs text-slate-500">
            <Link href="/welcome" className="font-semibold text-blue-600 hover:underline">
              製品デモを見る
            </Link>
          </p>

          <p className="text-center text-xs text-slate-400">Authorized Personnel Only</p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-400">
          読み込み中…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
