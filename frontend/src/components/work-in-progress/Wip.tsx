"use client";

import type { ReactNode } from "react";
import { Construction } from "lucide-react";

/** mock = サンプル/デモデータ、partial = 一部のみ実装、planned = これから */
export type WipKind = "mock" | "partial" | "planned";

const META: Record<WipKind, { badge: string; defaultTitle: string }> = {
  mock: { badge: "モック", defaultTitle: "デモ・サンプルデータ" },
  partial: { badge: "一部未完成", defaultTitle: "開発中の機能" },
  planned: { badge: "工事中", defaultTitle: "準備中" },
};

export function WipBadge({
  kind = "planned",
  className = "",
}: {
  kind?: WipKind;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-amber-300/90 bg-amber-50 px-2 py-0.5 text-[10px] font-bold tracking-wide text-amber-900 ${className}`}
    >
      <Construction className="h-3 w-3 shrink-0" aria-hidden />
      {META[kind].badge}
    </span>
  );
}

export function WipBanner({
  kind = "planned",
  title,
  message,
  className = "",
}: {
  kind?: WipKind;
  title?: string;
  message?: string;
  className?: string;
}) {
  const meta = META[kind];
  return (
    <div
      role="status"
      className={`flex gap-2.5 rounded-lg border border-dashed border-amber-300 bg-amber-50/70 px-3 py-2.5 ${className}`}
      style={{
        backgroundImage:
          "repeating-linear-gradient(-45deg, transparent, transparent 10px, rgba(251,191,36,0.07) 10px, rgba(251,191,36,0.07) 20px)",
      }}
    >
      <Construction className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
      <div className="min-w-0 text-xs text-amber-950">
        <div className="flex flex-wrap items-center gap-2">
          <WipBadge kind={kind} />
          <span className="font-bold">{title ?? meta.defaultTitle}</span>
        </div>
        {message ? (
          <p className="mt-1 leading-relaxed text-amber-900/90">{message}</p>
        ) : null}
      </div>
    </div>
  );
}

/** セクション全体が未完成のとき — 上部に工事中バナーを付けて中身を包む */
export function WipSection({
  kind = "planned",
  title,
  message,
  children,
  className = "",
  bodyClassName = "",
}: {
  kind?: WipKind;
  title?: string;
  message?: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-2xl border border-amber-200/90 shadow-sm ${className}`}
    >
      <WipBanner
        kind={kind}
        title={title}
        message={message}
        className="rounded-none border-0 border-b border-amber-200/80"
      />
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
