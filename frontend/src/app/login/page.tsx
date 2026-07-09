"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { Building2, UserPlus, Users } from "lucide-react";
import {
  checkSession,
  clearAuthSession,
  fetchMeWithToken,
  loadCurrentUser,
  saveAccessToken,
  saveCurrentUser,
  setSessionCookiePreferred,
} from "@/lib/auth";
import { parseApiErrorBody, parseApiErrorResponse } from "@/lib/parse-api-error";
import { STAKEHOLDER_MASTER, type AppPermission, type AppRoleId } from "@/config/organization";
import { API_BASE } from "@/config/api";
import type { PersonaId } from "@/config/personas";
import { getPostLoginPath } from "@/lib/persona";
import {
  fetchInvitePreview,
  type InvitePreview,
} from "@/features/org/firm-onboarding-api";

type AuthConfig = {
  google_client_id: string;
  session_cookie?: boolean;
};

type TopMode = "signin" | "onboarding";
type OnboardingKind = "create" | "join";

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
  const inviteToken = (searchParams.get("invite") ?? "").trim();
  const sessionNotice =
    reason === "session"
      ? "セッションの有効期限が切れました。再度ログインしてください。"
      : reason === "offline"
        ? "サーバーに接続できません。バックエンド（ポート 8000）が起動しているか確認してください。"
        : "";

  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [configError, setConfigError] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [clientReady, setClientReady] = useState(false);
  const [topMode, setTopMode] = useState<TopMode>(inviteToken ? "signin" : "signin");
  const [onboardingKind, setOnboardingKind] = useState<OnboardingKind>("create");
  const [invitePreview, setInvitePreview] = useState<InvitePreview | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [firmLabel, setFirmLabel] = useState("");

  useEffect(() => {
    setClientReady(true);
  }, []);

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

  useEffect(() => {
    if (!inviteToken) {
      setInvitePreview(null);
      return;
    }
    void (async () => {
      try {
        setInvitePreview(await fetchInvitePreview(inviteToken));
        setError("");
      } catch {
        setInvitePreview(null);
        setError("招待リンクが無効または期限切れです。");
      }
    })();
  }, [inviteToken]);

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
    setInfo("");
    setSubmitting(true);
    try {
      const credential = credentialResponse.credential;
      if (!credential) {
        setError("Google 認証に失敗しました");
        return;
      }

      if (inviteToken) {
        const res = await fetchWithTimeout(`${API_BASE}/auth/google`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential, invite_token: inviteToken }),
        });
        const data = (await res.json().catch(() => ({}))) as { access_token?: string; detail?: unknown };
        if (!res.ok || !data.access_token) {
          setError(
            res.ok
              ? parseApiErrorBody(data, "招待の受け入れに失敗しました")
              : await parseApiErrorResponse(res, "招待の受け入れに失敗しました"),
          );
          return;
        }
        await completeLogin(data.access_token);
        return;
      }

      if (topMode === "onboarding" && onboardingKind === "create") {
        if (!firmLabel.trim()) {
          setError("事務所名を入力してください");
          return;
        }
        const res = await fetchWithTimeout(`${API_BASE}/auth/register-firm`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential, firm_label: firmLabel.trim() }),
        });
        const data = (await res.json().catch(() => ({}))) as { access_token?: string; detail?: unknown };
        if (!res.ok || !data.access_token) {
          setError(
            res.ok
              ? parseApiErrorBody(data, "事務所の登録に失敗しました")
              : await parseApiErrorResponse(res, "事務所の登録に失敗しました"),
          );
          return;
        }
        await completeLogin(data.access_token);
        return;
      }

      if (topMode === "onboarding" && onboardingKind === "join") {
        if (!joinCode.trim()) {
          setError("事務所コードを入力してください");
          return;
        }
        const res = await fetchWithTimeout(`${API_BASE}/auth/join-request`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential, join_code: joinCode.trim() }),
        });
        const data = (await res.json().catch(() => ({}))) as { detail?: unknown };
        if (res.status === 403) {
          const detail = data.detail;
          if (
            detail &&
            typeof detail === "object" &&
            (detail as { code?: string }).code === "pending_approval"
          ) {
            setInfo(parseApiErrorBody(data, "参加申請を送信しました。代表税理士の承認をお待ちください。"));
            return;
          }
        }
        if (!res.ok) {
          setError(await parseApiErrorResponse(res, "参加申請に失敗しました"));
          return;
        }
        return;
      }

      const res = await fetchWithTimeout(`${API_BASE}/auth/google`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        access_token?: string;
        detail?: unknown;
      };
      if (!res.ok || !data.access_token) {
        setError(
          res.ok
            ? parseApiErrorBody(data, "Google ログインに失敗しました")
            : await parseApiErrorResponse(res, "Google ログインに失敗しました"),
        );
        return;
      }
      await completeLogin(data.access_token);
    } catch {
      setError("ログイン処理中にエラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  };

  const googleClientId = clientReady
    ? authConfig?.google_client_id || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ""
    : "";
  const configLoading = authConfig === null && !configError;

  const googleHint = inviteToken
    ? "招待されたメールアドレスの Google アカウントでサインインしてください。"
    : topMode === "onboarding" && onboardingKind === "create"
      ? "代表税理士の Google アカウントでサインインしてください。"
      : topMode === "onboarding" && onboardingKind === "join"
        ? "参加申請は代表税理士の承認後にログインできます。"
        : "登録済みの Google アカウントでサインインしてください。";

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

        <div className="space-y-5 p-8">
          {(sessionNotice || configError) && (
            <p className="text-center text-xs font-bold text-amber-600">{sessionNotice || configError}</p>
          )}

          {inviteToken && invitePreview ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              <p className="font-bold">事務所への招待</p>
              <p className="mt-1">
                {invitePreview.firmLabel} からの招待（{invitePreview.emailHint}）
              </p>
              <p className="mt-1 text-xs text-blue-700">下の Google ボタンでサインインすると参加できます。</p>
            </div>
          ) : null}

          {!inviteToken ? (
            <>
              <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-sm font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setTopMode("signin");
                    setError("");
                    setInfo("");
                  }}
                  className={`flex-1 rounded-lg px-3 py-2.5 transition ${
                    topMode === "signin" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                  }`}
                >
                  ログイン
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTopMode("onboarding");
                    setError("");
                    setInfo("");
                  }}
                  className={`flex-1 rounded-lg px-3 py-2.5 transition ${
                    topMode === "onboarding" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                  }`}
                >
                  新規登録
                </button>
              </div>

              {topMode === "signin" ? (
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
                  <p className="font-bold text-slate-800">すでに登録済みの方</p>
                  <p className="mt-1 text-xs leading-relaxed">
                    事務所に登録されている Google アカウントでサインインしてください。
                  </p>
                  <button
                    type="button"
                    onClick={() => setTopMode("onboarding")}
                    className="mt-2 text-xs font-bold text-blue-600 hover:underline"
                  >
                    初めての方は新規登録へ →
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-bold text-slate-800">はじめての方</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      ご自身の状況に合わせて選んでください。
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setOnboardingKind("create");
                        setError("");
                        setInfo("");
                      }}
                      className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
                        onboardingKind === "create"
                          ? "border-blue-300 bg-blue-50/60 ring-1 ring-blue-200"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <Building2
                        className={`mt-0.5 h-5 w-5 shrink-0 ${
                          onboardingKind === "create" ? "text-blue-600" : "text-slate-400"
                        }`}
                      />
                      <span>
                        <span className="block text-sm font-bold text-slate-800">事務所を新規登録</span>
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">
                          税理士事務所の代表の方。事務所の作成とプラン契約を行います。
                        </span>
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setOnboardingKind("join");
                        setError("");
                        setInfo("");
                      }}
                      className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
                        onboardingKind === "join"
                          ? "border-emerald-300 bg-emerald-50/60 ring-1 ring-emerald-200"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <Users
                        className={`mt-0.5 h-5 w-5 shrink-0 ${
                          onboardingKind === "join" ? "text-emerald-600" : "text-slate-400"
                        }`}
                      />
                      <span>
                        <span className="block text-sm font-bold text-slate-800">事務所に参加</span>
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">
                          スタッフの方。代表から共有された事務所コードで参加申請します。
                        </span>
                      </span>
                    </button>
                  </div>

                  <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
                    <UserPlus className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    招待メールのリンクをお持ちの方は、そのリンクから開いてください。
                  </p>

                  {onboardingKind === "create" ? (
                    <div>
                      <label className="text-xs font-bold text-slate-600">税理士事務所名</label>
                      <input
                        type="text"
                        value={firmLabel}
                        onChange={(e) => setFirmLabel(e.target.value)}
                        placeholder="例）〇〇税理士事務所"
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="text-xs font-bold text-slate-600">事務所コード</label>
                      <input
                        type="text"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                        placeholder="代表から共有されたコード"
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase tracking-widest"
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          ) : null}

          {configLoading ? (
            <p className="text-center text-[11px] text-slate-400">認証設定を確認中…</p>
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
              <p className="text-center text-[11px] leading-relaxed text-slate-500">{googleHint}</p>
            </div>
          ) : null}

          {!configLoading && !googleClientId ? (
            <p className="text-center text-sm leading-relaxed text-slate-600">
              Google ログインが未設定です。
              <br />
              バックエンドの <code className="text-xs">GOOGLE_OAUTH_CLIENT_ID</code> と
              フロントの <code className="text-xs">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> を同じ値に設定してください。
            </p>
          ) : null}

          {info && <p className="text-center text-xs font-bold text-emerald-700">{info}</p>}
          {error && <p className="text-center text-xs font-bold leading-relaxed text-red-600">{error}</p>}
          {submitting ? (
            <p className="text-center text-xs text-slate-500">処理中…</p>
          ) : null}

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
