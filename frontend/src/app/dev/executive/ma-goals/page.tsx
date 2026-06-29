"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { DevConsoleChrome } from "@/components/dev/DevConsoleChrome";
import { MaGoalsPanel } from "@/features/platform-executive/components/MaGoalsPanel";
import { checkSession, loadCurrentUser } from "@/lib/auth";
import { canAccessPlatformSettings } from "@/lib/app-surface";

type Gate = "loading" | "ready" | "denied" | "offline";

export default function MaGoalsPage() {
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
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (gate === "offline" || gate === "denied") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
        <div className="max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 text-center">
          <p className="text-sm font-bold text-white">
            {gate === "offline" ? "サーバーに接続できません" : "アクセス権がありません"}
          </p>
          <Link href="/dev" className="mt-4 inline-block text-xs text-blue-400 hover:underline">
            開発コンソールへ
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <DevConsoleChrome
        title="MA ロードマップ"
        subtitle="10億円 ARR 達成に向けた逆算プラン"
      />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <MaGoalsPanel />
      </main>
    </>
  );
}
