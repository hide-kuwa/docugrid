"use client";

import { useEffect, useState } from "react";
import type { PersonaDefinition, PersonaId } from "@/config/personas";
import type { ScreenDesignPersona } from "@/config/screen-design-types";
import { WipBadge, WipBanner } from "@/components/work-in-progress";
import { resolvePersonaHome } from "@/features/persona/homes";
import { PersonaWorkspaceLayout } from "@/features/persona/PersonaWorkspaceLayout";
import { fetchResolvedScreenDesign } from "@/features/screen-design/screen-design-api";
import type { DocugridUser } from "@/lib/auth";
import { resolvePersonaId } from "@/lib/persona";

type Props = {
  persona: PersonaDefinition;
  user: DocugridUser | null;
  /** 画面設計の解決に使うペルソナ（デモプレビュー用） */
  designPersonaId?: PersonaId;
  /** 営業デモ — ログアウトの代わりにデモ終了リンク */
  demoMode?: boolean;
};

/** Fallback shell for personas without a dedicated home implementation yet. */
function PersonaPlaceholderHome({
  persona,
  user,
  design,
  demoMode,
}: {
  persona: PersonaDefinition;
  user: DocugridUser | null;
  design: ScreenDesignPersona | null;
  demoMode?: boolean;
}) {
  const accent = design?.accentColor || "#2563eb";
  const widgets =
    design?.widgets?.filter((w) => w.enabled) ||
    persona.plannedFeatures.map((label, i) => ({
      id: `planned-${i}`,
      label,
      enabled: true,
      order: i,
    }));

  return (
    <PersonaWorkspaceLayout persona={persona} user={user} design={design} demoMode={demoMode}>
      <WipBanner
        kind="planned"
        title={`${persona.label} ワークスペース`}
        message="このペルソナ専用ホームは工事中です。下のリストは予定ウィジェットの枠です。"
        className="mb-4"
      />
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-800">
          ウィジェット（枠）
          <WipBadge kind="planned" />
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          業務要件は <code className="text-[10px]">docs/persona-work-requirements.md</code>{" "}
          を参照。実装順は client_accounting から。
        </p>
        <ul className="mt-4 space-y-2">
          {widgets.map((w) => (
            <li
              key={w.id}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
              {w.label}
            </li>
          ))}
        </ul>
      </section>
    </PersonaWorkspaceLayout>
  );
}

export function PersonaHomeShell({ persona, user, designPersonaId, demoMode }: Props) {
  const [design, setDesign] = useState<ScreenDesignPersona | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const pid = designPersonaId ?? resolvePersonaId(user);
        const resolved = await fetchResolvedScreenDesign(pid);
        setDesign(resolved.merged);
      } catch {
        setDesign(null);
      }
    })();
  }, [user, designPersonaId]);

  const DedicatedHome = resolvePersonaHome(persona.id);
  if (DedicatedHome) {
    return (
      <DedicatedHome persona={persona} user={user} design={design} demoMode={demoMode} />
    );
  }

  return (
    <PersonaPlaceholderHome persona={persona} user={user} design={design} demoMode={demoMode} />
  );
}
