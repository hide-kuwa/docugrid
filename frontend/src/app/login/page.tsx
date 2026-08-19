"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { AuthPageShell } from "@/features/auth/auth-page-shell";
import { fetchWithTimeout, useAuthFlow } from "@/features/auth/use-auth-flow";
import { parseApiErrorBody } from "@/lib/parse-api-error";
import { API_BASE } from "@/config/api";
import {
  fetchInvitePreview,
  type InvitePreview,
} from "@/features/org/firm-onboarding-api";

function LoginForm() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const inviteToken = (searchParams.get("invite") ?? "").trim();
  const sessionNotice =
    reason === "session"
      ? "セッションの有効期限が切れました。再度ログインしてください。"
      : reason === "offline"
        ? "サーバーに接続できません。バックエンド（ポート 8000）が起動しているか確認してください。"
        : "";

  const {
    configError,
    configLoading,
    googleClientId,
    passwordLoginEnabled,
    completeLogin,
  } = useAuthFlow({ sessionReason: reason });

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [invitePreview, setInvitePreview] = useState<InvitePreview | null>(null);
  const [email, setEmail] = useState("admin@taxx.jp");
  const [password, setPassword] = useState("password");
  const [showPasswordLogin, setShowPasswordLogin] = useState(false);

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

  const handleGoogleLogin = async (credentialResponse: { credential?: string }) => {
    setError("");
    setSubmitting(true);
    try {
      const credential = credentialResponse.credential;
      if (!credential) {
        setError("Google 認証に失敗しました");
        return;
      }

      const res = await fetchWithTimeout(`${API_BASE}/auth/google`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential,
          ...(inviteToken ? { invite_token: inviteToken } : {}),
        }),
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
      setError("ログイン処理中にエラーが発生しました");
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

  const usePasswordAsPrimary = passwordLoginEnabled && !googleClientId;

  return (
    <AuthPageShell
      title="ログイン"
      subtitle="登録済みの Google アカウントでサインインしてください。"
    >
      {(sessionNotice || configError) && (
        <p className="text-center text-xs font-bold text-amber-600">{sessionNotice || configError}</p>
      )}

      {inviteToken && invitePreview ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <p className="font-bold">事務所への招待</p>
          <p className="mt-1">
            {invitePreview.firmLabel} からの招待（{invitePreview.emailHint}）
          </p>
          <p className="mt-1 text-xs text-blue-700">Google でサインインすると参加できます。</p>
        </div>
      ) : null}

      {configLoading ? (
        <p className="text-center text-[11px] text-slate-400">認証設定を確認中…</p>
      ) : null}

      {usePasswordAsPrimary ? (
        <div className="space-y-3">
          <label className="block text-xs font-bold text-slate-600">
            メールアドレス
            <input
              type="email"
              autoComplete="username"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@taxx.jp"
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
          <p className="text-center text-[11px] text-slate-500">
            ローカル開発用: admin@taxx.jp / password
          </p>
        </div>
      ) : null}

      {googleClientId ? (
        <div className="flex flex-col items-center gap-3">
          <GoogleOAuthProvider clientId={googleClientId}>
            <GoogleLogin
              onSuccess={handleGoogleLogin}
              onError={() => setError("Google ログインがキャンセルされました")}
              useOneTap={false}
              theme="filled_blue"
              size="large"
              text="signin_with"
              shape="rectangular"
              width="320"
            />
          </GoogleOAuthProvider>
        </div>
      ) : null}

      {passwordLoginEnabled && googleClientId ? (
        <div className="border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={() => setShowPasswordLogin((v) => !v)}
            className="mb-3 w-full text-center text-xs font-bold text-slate-500 hover:text-slate-700"
          >
            {showPasswordLogin ? "開発用パスワードを閉じる" : "開発用パスワードログイン"}
          </button>
          {showPasswordLogin ? (
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-600">
                メールアドレス
                <input
                  type="email"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="block text-xs font-bold text-slate-600">
                パスワード
                <input
                  type="password"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handlePasswordLogin()}
                className="w-full rounded-lg bg-slate-800 py-2.5 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-60"
              >
                ログイン
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="text-center text-xs font-bold leading-relaxed text-red-600">{error}</p>
      ) : null}
      {submitting ? <p className="text-center text-xs text-slate-500">処理中…</p> : null}

      {!inviteToken ? (
        <div className="space-y-2 border-t border-slate-100 pt-4 text-center text-xs">
          <p className="text-slate-600">
            はじめての方は{" "}
            <Link href="/register" className="font-bold text-blue-600 hover:underline">
              新規登録
            </Link>
          </p>
          <p className="text-slate-500">
            スタッフの方は{" "}
            <Link href="/register/join" className="font-bold text-emerald-700 hover:underline">
              事務所コードで参加
            </Link>
          </p>
        </div>
      ) : null}

      <p className="text-center text-xs text-slate-500">
        <Link href="/pdf" className="font-semibold text-teal-600 hover:underline">
          ログインせずに PDF を編集
        </Link>
        {" · "}
        <Link href="/welcome" className="font-semibold text-blue-600 hover:underline">
          製品デモを見る
        </Link>
      </p>
    </AuthPageShell>
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
