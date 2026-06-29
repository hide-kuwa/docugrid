"use client";

import Link from "next/link";
import { Building2, LayoutGrid, Monitor, Sparkles } from "lucide-react";
import type { PersonaDefinition } from "@/config/personas";
import { resolvePersonaHome } from "@/features/persona/homes";
import { audienceLabel } from "@/lib/product-scope";

type Props = {
  persona: PersonaDefinition;
  active?: boolean;
  compact?: boolean;
  href?: string;
  onSelect?: () => void;
};

export function RoleDemoCard({ persona, active = false, compact = false, href, onSelect }: Props) {
  const hasDedicatedHome = Boolean(resolvePersonaHome(persona.id));
  const ShellIcon = persona.shell === "matrix" ? LayoutGrid : Monitor;

  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
            persona.audience === "client"
              ? "bg-emerald-100 text-emerald-800"
              : persona.audience === "firm"
                ? "bg-blue-100 text-blue-800"
                : "bg-amber-100 text-amber-900"
          }`}
        >
          <Building2 className="h-2.5 w-2.5" />
          {audienceLabel(persona.audience)}
        </span>
        {hasDedicatedHome ? (
          <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[8px] font-bold text-violet-700">
            実装済
          </span>
        ) : persona.shell === "matrix" ? (
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[8px] font-bold text-slate-600">
            デモマトリクス
          </span>
        ) : null}
      </div>
      <div className={`mt-2 flex items-center gap-2 ${compact ? "" : "mt-3"}`}>
        <span
          className={`flex shrink-0 items-center justify-center rounded-lg ${
            active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
          } ${compact ? "h-8 w-8" : "h-10 w-10"}`}
        >
          <ShellIcon className={compact ? "h-4 w-4" : "h-5 w-5"} />
        </span>
        <div className="min-w-0">
          <p className={`truncate font-black text-slate-800 ${compact ? "text-xs" : "text-sm"}`}>
            {persona.shortLabel}
          </p>
          {!compact ? (
            <p className="line-clamp-2 text-[11px] leading-snug text-slate-500">{persona.description}</p>
          ) : null}
        </div>
      </div>
      {!compact ? (
        <p className="mt-3 flex items-center gap-1 text-[10px] font-bold text-blue-600">
          <Sparkles className="h-3 w-3" />
          クリックしてプレビュー
        </p>
      ) : null}
    </>
  );

  const className = `${
    compact ? "min-w-[140px] shrink-0 snap-start p-3" : "min-h-[168px] p-4"
  } rounded-xl border-2 text-left transition-all ${
    active
      ? "border-blue-500 bg-blue-50 shadow-md ring-2 ring-blue-200"
      : "border-dashed border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/40 hover:shadow-sm"
  }`;

  if (href) {
    return (
      <Link href={href} className={`block ${className}`}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onSelect} className={className}>
      {inner}
    </button>
  );
}
