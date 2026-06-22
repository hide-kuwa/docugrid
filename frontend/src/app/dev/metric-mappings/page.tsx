"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { DevConsoleChrome } from "@/components/dev/DevConsoleChrome";
import { MetricMappingsPanel } from "@/features/dev/components/MetricMappingsPanel";
import { checkSession, loadCurrentUser } from "@/lib/auth";
import { canAccessPlatformSettings } from "@/lib/app-surface";

type Gate = "loading" | "ready" | "denied";

export default function MetricMappingsPage() {
  const router = useRouter();
  const [gate, setGate] = useState<Gate>("loading");

  useEffect(() => {
    void (async () => {
      const session = await checkSession();
      if (session === "offline" || session === "missing" || session === "invalid") {
        router.replace(session === "invalid" ? "/login?reason=session" : "/login");
        return;
      }
      if (!canAccessPlatformSettings(loadCurrentUser())) {
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

  if (gate === "denied") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6 text-center">
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
        title="指標マップ"
        subtitle="metric_key ↔ 勘定科目 / field_id / スロット"
      />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <MetricMappingsPanel />
      </main>
    </>
  );
}
