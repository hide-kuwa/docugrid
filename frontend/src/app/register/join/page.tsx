"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { AuthPageShell } from "@/features/auth/auth-page-shell";
import { fetchWithTimeout, useAuthFlow } from "@/features/auth/use-auth-flow";
import { parseApiErrorBody } from "@/lib/parse-api-error";
import { API_BASE } from "@/config/api";

function JoinForm() {
  const { configError, configLoading, googleClientId } = useAuthFlow();
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const formReady = joinCode.trim().length >= 4;

  const handleGoogleJoin = async (credentialResponse: { credential?: string }) => {
    setError("");
    setInfo("");
    if (!joinCode.trim()) {
      setError("事務所コードを入力してください");
      return;
    }
    const credential = credentialResponse.credential;
    if (!credential) {
      setError("Google 認証に失敗しました");
      return;
    }

    setSubmitting(true);
    try {
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
          setInfo(
            parseApiErrorBody(
              data,
              "参加申請を送信しました。代表税理士の承認後、ログインできます。",
            ),
          );
          return;
        }
      }
      if (!res.ok) {
        setError(parseApiErrorBody(data, "参加申請に失敗しました"));
        return;
      }
    } catch {
      setError("参加申請中にエラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthPageShell
      title="事務所に参加"
      subtitle="代表から共有された事務所コードで参加申請します。承認後にログインできます。"
    >
      {configError ? (
        <p className="text-center text-xs font-bold text-amber-600">{configError}</p>
      ) : null}

      <label className="block text-xs font-bold text-slate-600">
        事務所コード
        <input
          type="text"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          placeholder="代表から共有されたコード"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm uppercase tracking-widest"
        />
      </label>

      {configLoading ? (
        <p className="text-center text-[11px] text-slate-400">認証設定を確認中…</p>
      ) : null}

      {googleClientId ? (
        <div className="flex flex-col items-center gap-3">
          {formReady ? (
            <GoogleOAuthProvider clientId={googleClientId}>
              <GoogleLogin
                onSuccess={handleGoogleJoin}
                onError={() => setError("Google 認証がキャンセルされました")}
                useOneTap={false}
                theme="filled_blue"
                size="large"
                text="continue_with"
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
              Google で参加申請
            </button>
          )}
          {!formReady ? (
            <p className="text-center text-[11px] text-slate-500">
              事務所コードを入力すると Google 認証が有効になります
            </p>
          ) : null}
        </div>
      ) : null}

      {info ? <p className="text-center text-xs font-bold text-emerald-700">{info}</p> : null}
      {error ? (
        <p className="text-center text-xs font-bold leading-relaxed text-red-600">{error}</p>
      ) : null}
      {submitting ? <p className="text-center text-xs text-slate-500">送信中…</p> : null}

      <div className="space-y-2 border-t border-slate-100 pt-4 text-center text-xs">
        <p className="text-slate-500">
          事務所を新規作成する方は{" "}
          <Link href="/register" className="font-bold text-blue-600 hover:underline">
            新規登録
          </Link>
        </p>
        <p className="text-slate-500">
          承認済みの方は{" "}
          <Link href="/login" className="font-bold text-blue-600 hover:underline">
            ログイン
          </Link>
        </p>
      </div>
    </AuthPageShell>
  );
}

export default function RegisterJoinPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-400">
          読み込み中…
        </div>
      }
    >
      <JoinForm />
    </Suspense>
  );
}
