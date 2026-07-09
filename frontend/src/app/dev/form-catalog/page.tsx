"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { DevConsoleChrome } from "@/components/dev/DevConsoleChrome";
import { FormCatalogPanel } from "@/features/dev/components/FormCatalogPanel";
import { checkSession, loadCurrentUser } from "@/lib/auth";
import { canAccessPlatformSettings } from "@/lib/app-surface";

type Gate = "loading" | "ready" | "denied" | "offline";

export default function FormCatalogPage() {
  const router = useRouter();
  const [gate, setGate] = useState<Gate>("loading");

  useEffect(() => {
    void (async () => {
      const session = await checkSession();
      if (session === "offline") {
        setGate("offline");
        return;
      }
      if (session === "missing" || session === "invalid") {
        router.replace(session === "invalid" ? "/login?reason=session" : "/login");
        return;
      }
      const user = loadCurrentUser();
      if (!canAccessPlatformSettings(user)) {
        setGate("denied");
        return;
      }
      setGate("ready");
    })();
  }, [router]);

  if (gate === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (gate === "offline") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 text-center">
          <p className="text-sm font-bold text-white">サーバーに接続できません</p>
          <Link href="/dev" className="mt-4 inline-block text-xs text-amber-400 hover:underline">
            開発コンソールへ
          </Link>
        </div>
      </div>
    );
  }

  if (gate === "denied") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 text-center">
          <p className="text-sm font-bold text-white">プラットフォーム設定権限が必要です</p>
          <Link href="/dev" className="mt-4 inline-block text-xs text-amber-400 hover:underline">
            開発コンソールへ
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <DevConsoleChrome
        title="書類の覚え方（AI 分類）"
        subtitle="実際の PDF を見ながら様式を教える · 自動でプロンプト化 · 非エンジニアでも設計可能"
      />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <FormCatalogPanel />
      </main>
    </>
  );
}
