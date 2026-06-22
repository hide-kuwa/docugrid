"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AuthCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [message, setMessage] = useState("認証処理中です…");

  useEffect(() => {
    const token = searchParams.get("token");
    if (token) {
      localStorage.setItem("accessToken", token);
      setMessage("ログインに成功しました。ダッシュボードへ移動します…");

      const timer = setTimeout(() => {
        router.push("/dashboard");
      }, 2000);

      return () => clearTimeout(timer);
    }

    setMessage("エラー: トークンが見つかりません。");
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <p className="rounded-md bg-white px-6 py-4 text-sm text-slate-700 shadow">
        {message}
      </p>
    </div>
  );
}
