"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { AuthPageShell } from "@/features/auth/auth-page-shell";
import { fetchWithTimeout, useAuthFlow } from "@/features/auth/use-auth-flow";
import { parseApiErrorBody } from "@/lib/parse-api-error";
import { API_BASE } from "@/config/api";

function RegisterForm() {
  const { configError, configLoading, googleClientId, completeLogin } = useAuthFlow();
  const [displayName, setDisplayName] = useState("");
  const [firmLabel, setFirmLabel] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const formReady = displayName.trim().length > 0 && firmLabel.trim().length > 0;

  const handleGoogleRegister = async (credentialResponse: { credential?: string }) => {
    setError("");
    if (!displayName.trim()) {
      setError("お名前を入力してください");
      return;
    }
    if (!firmLabel.trim()) {
      setError("税理士事務所名を入力してください");
      return;
    }
    const credential = credentialResponse.credential;
    if (!credential) {
      setError("Google 認証に失敗しました");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetchWithTimeout(`${API_BASE}/auth/register-firm`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential,
          firm_label: firmLabel.trim(),
          display_name: displayName.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        access_token?: string;
        detail?: unknown;
      };
      if (!res.ok || !data.access_token) {
        setError(parseApiErrorBody(data, "登録に失敗しました"));
        return;
      }
      await completeLogin(data.access_token);
    } catch {
      setError("登録処理中にエラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthPageShell
      title="新規登録"
      subtitle="税理士事務所の代表の方。事務所を作成して DocuGrid を使い始めます。"
    >
      {configError ? (
        <p className="text-center text-xs font-bold text-amber-600">{configError}</p>
      ) : null}

      <div className="space-y-4">
        <label className="block text-xs font-bold text-slate-600">
          お名前（代表者）
          <input
            type="text"
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="例）山田 太郎"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
          />
        </label>

        <label className="block text-xs font-bold text-slate-600">
          税理士事務所名
          <input
            type="text"
            value={firmLabel}
            onChange={(e) => setFirmLabel(e.target.value)}
            placeholder="例）〇〇税理士法人"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
          />
        </label>

        <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
          最後に <strong>Google アカウント</strong> で本人確認します。ログインにも同じメールを使います。
        </p>
      </div>

      {configLoading ? (
        <p className="text-center text-[11px] text-slate-400">認証設定を確認中…</p>
      ) : null}

      {googleClientId ? (
        <div className="flex flex-col items-center gap-3">
          {formReady ? (
            <GoogleOAuthProvider clientId={googleClientId}>
              <GoogleLogin
                onSuccess={handleGoogleRegister}
                onError={() => setError("Google 認証がキャンセルされました")}
                useOneTap={false}
                theme="filled_blue"
                size="large"
                text="signup_with"
                shape="rectangular"
                width="320"
              />
            </GoogleOAuthProvider>
          ) : (
            <button
              type="button"
              disabled
              className="w-full max-w-[320px] cursor-not-allowed rounded-md bg-slate-300 py-3 text-sm font-bold text-white"
            >
              Google で登録
            </button>
          )}
          {!formReady ? (
            <p className="text-center text-[11px] text-slate-500">
              お名前と事務所名を入力すると Google 登録が有効になります
            </p>
          ) : null}
        </div>
      ) : !configLoading ? (
        <p className="text-center text-xs text-slate-600">
          Google ログインが未設定です。管理者に <code className="text-[10px]">GOOGLE_OAUTH_CLIENT_ID</code>{" "}
          の設定を依頼してください。
        </p>
      ) : null}

      {error ? (
        <p className="text-center text-xs font-bold leading-relaxed text-red-600">{error}</p>
      ) : null}
      {submitting ? <p className="text-center text-xs text-slate-500">登録中…</p> : null}

      <div className="space-y-2 border-t border-slate-100 pt-4 text-center text-xs">
        <p className="text-slate-500">
          すでに登録済みの方は{" "}
          <Link href="/login" className="font-bold text-blue-600 hover:underline">
            ログイン
          </Link>
        </p>
        <p className="text-slate-500">
          スタッフの方（事務所コードをお持ちの方）は{" "}
          <Link href="/register/join" className="font-bold text-emerald-700 hover:underline">
            事務所に参加
          </Link>
        </p>
      </div>
    </AuthPageShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-400">
          読み込み中…
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
