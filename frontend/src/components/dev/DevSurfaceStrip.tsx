"use client";

import Link from "next/link";
import { Wrench } from "lucide-react";

/** 設定画面など「業務＋開発」混在ページの上部ストリップ */
export function DevSurfaceStrip({ consoleLabel }: { consoleLabel: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/80 bg-amber-950/90 px-4 py-1.5 text-[11px] text-amber-100">
      <span className="inline-flex items-center gap-1.5 font-bold">
        <Wrench className="h-3 w-3 text-amber-400" />
        {consoleLabel}
      </span>
      <Link href="/" className="font-bold text-amber-200 hover:underline">
        業務画面へ →
      </Link>
    </div>
  );
}
