"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Presentation } from "lucide-react";
import { DevConsoleChrome } from "@/components/dev/DevConsoleChrome";
import { RoleDemoCard } from "@/features/demo/RoleDemoCard";
import { checkSession, loadCurrentUser } from "@/lib/auth";
import { canAccessDevConsole, canAccessFirmSettings } from "@/lib/app-surface";
import { audienceLabel, inScopePersonas } from "@/lib/product-scope";

type Gate = "loading" | "ready" | "denied" | "offline";

export function RoleDemoHub() {
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
        router.replace("/login");
        return;
      }
      const user = loadCurrentUser();
      if (!canAccessDevConsole(user)) {
        if (canAccessFirmSettings(user)) {
          router.replace("/settings");
          return;
        }
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
          <Link href="/dev" className="mt-4 inline-block text-xs font-bold text-blue-400 hover:underline">
            開発コンソールへ
          </Link>
        </div>
      </div>
    );
  }

  const personas = inScopePersonas();
  const firm = personas.filter((p) => p.audience === "firm");
  const client = personas.filter((p) => p.audience === "client");
  const platform = personas.filter((p) => p.audience === "platform");

  return (
    <>
      <DevConsoleChrome
        title="ロール画面デモ"
        subtitle="営業・説明会用 — カードを選んで各役割の画面をプレビュー"
      />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        <section className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-950/40 to-slate-900 p-5 text-amber-50">
          <div className="flex items-start gap-3">
            <Presentation className="mt-0.5 h-6 w-6 shrink-0 text-amber-400" />
            <div>
              <h2 className="text-sm font-bold text-white">使い方</h2>
              <p className="mt-1 text-xs leading-relaxed text-amber-100/90">
                資料マトリクスと同じ「枠を選ぶ」感覚でロールを切り替えられます。事務所ロールはサンプルデータのマトリクス、
                クライアントロールは実際のワークスペース UI をプレビューします（ログイン中のアカウントは変わりません）。
              </p>
            </div>
          </div>
        </section>

        {[
          { title: audienceLabel("firm"), items: firm },
          { title: audienceLabel("client"), items: client },
          { title: audienceLabel("platform"), items: platform },
        ].map((group) =>
          group.items.length === 0 ? null : (
            <section key={group.title}>
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">{group.title}</h3>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {group.items.map((persona) => (
                  <RoleDemoCard key={persona.id} persona={persona} href={`/dev/demo/${persona.id}`} />
                ))}
              </div>
            </section>
          ),
        )}
      </main>
    </>
  );
}
