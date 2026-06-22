"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Wrench } from "lucide-react";
import { loadCurrentUser } from "@/lib/auth";
import { getBusinessHomePath } from "@/lib/persona";

type Props = {
  title?: string;
  subtitle?: string;
};

/** 開発コンソール系画面の共通ヘッダー */
export function DevConsoleChrome({ title = "開発コンソール", subtitle }: Props) {
  const pathname = usePathname();
  const user = loadCurrentUser();
  const backHref = pathname.startsWith("/dev") ? getBusinessHomePath(user) : "/dev";

  return (
    <header className="border-b border-slate-700 bg-slate-900 text-slate-100">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            業務画面
          </Link>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-400">
              <Wrench className="h-3 w-3" />
              開発用
            </p>
            <h1 className="truncate text-sm font-black text-white">{title}</h1>
            {subtitle ? <p className="truncate text-xs text-slate-400">{subtitle}</p> : null}
          </div>
        </div>
        <p className="text-[10px] text-slate-500">
          エンドユーザー向けの業務 UI とは別エリアです
        </p>
      </div>
    </header>
  );
}
