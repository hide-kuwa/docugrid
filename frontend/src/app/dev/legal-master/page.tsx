"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { DevConsoleChrome } from "@/components/dev/DevConsoleChrome";
import { LegalMasterPanel } from "@/features/dev/components/LegalMasterPanel";
import { checkSession, loadCurrentUser } from "@/lib/auth";
import { canAccessPlatformSettings } from "@/lib/app-surface";

type Gate = "loading" | "ready" | "denied" | "offline";

export default function LegalMasterPage() {
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
        title="法定マスタ"
        subtitle="Temporal Master — 税率・控除・累進（valid_from / valid_to）"
      />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <LegalMasterPanel />
      </main>
    </>
  );
}
