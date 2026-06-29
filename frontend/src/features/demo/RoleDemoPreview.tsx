"use client";

import { useRouter } from "next/navigation";
import { getPersonaById, type PersonaId } from "@/config/personas";
import { DevConsoleChrome } from "@/components/dev/DevConsoleChrome";
import { DemoMatrix } from "@/features/marketing/DemoMatrix";
import { PersonaHomeShell } from "@/features/persona/PersonaHomeShell";
import { resolvePersonaHome } from "@/features/persona/homes";
import { inScopePersonas } from "@/lib/product-scope";
import { buildDemoUser } from "@/features/demo/build-demo-user";
import { RoleDemoCard } from "@/features/demo/RoleDemoCard";

type Props = {
  personaId: PersonaId;
};

export function RoleDemoPreview({ personaId }: Props) {
  const router = useRouter();
  const persona = getPersonaById(personaId);
  const personas = inScopePersonas();
  const demoUser = buildDemoUser(personaId);

  if (!persona) {
    return (
      <>
        <DevConsoleChrome title="ロール画面デモ" subtitle="ペルソナが見つかりません" />
        <main className="mx-auto max-w-lg px-4 py-12 text-center text-sm text-slate-500">
          <button
            type="button"
            onClick={() => router.push("/dev/demo")}
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white"
          >
            一覧へ戻る
          </button>
        </main>
      </>
    );
  }

  const renderPreview = () => {
    if (persona.shell === "matrix") {
      return (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-inner">
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-[11px] font-bold text-amber-900">
            事務所向け · 資料マトリクス（サンプルデータ）— {persona.shortLabel} として表示
          </div>
          <DemoMatrix />
        </div>
      );
    }

    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <PersonaHomeShell persona={persona} user={demoUser} designPersonaId={personaId} demoMode />
      </div>
    );
  };

  const dedicated = resolvePersonaHome(persona.id);

  return (
    <>
      <DevConsoleChrome
        title="ロール画面デモ"
        subtitle={`${persona.label} · 営業・説明用プレビュー（本番データは変更しません）`}
      />

      <div className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50/95 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              ロール切替（マトリクスと同じカード感覚）
            </p>
            <button
              type="button"
              onClick={() => router.push("/dev/demo")}
              className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
            >
              一覧グリッド
            </button>
          </div>
          <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1">
            {personas.map((p) => (
              <RoleDemoCard
                key={p.id}
                persona={p}
                compact
                active={p.id === personaId}
                href={`/dev/demo/${p.id}`}
              />
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <div className="rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-3 text-xs text-blue-900">
          <span className="font-bold">{persona.shortLabel}</span>
          {" · "}
          {persona.description}
          {dedicated ? (
            <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-800">
              実画面プレビュー
            </span>
          ) : persona.shell === "workspace" ? (
            <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
              ウィジェット枠プレビュー
            </span>
          ) : null}
        </div>

        {renderPreview()}
      </main>
    </>
  );
}
