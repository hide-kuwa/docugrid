"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, GitBranch, LayoutTemplate } from "lucide-react";
import { AuthNavButtons } from "@/components/AuthNavButtons";
import type { ReactNode } from "react";

type Props = {
  title: string;
  description: string;
  children: ReactNode;
};

export function AuthoringWorkspaceChrome({ title, description, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const onTemplates = pathname.startsWith("/templates");
  const onFlowchart = pathname.startsWith("/flowchart");

  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              マトリクス
            </button>
            <div>
              <h1 className="text-lg font-black text-slate-800">{title}</h1>
              <p className="text-[11px] text-slate-500">{description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <nav className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <Link
                href="/templates"
                className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold ${
                  onTemplates ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"
                }`}
              >
                <LayoutTemplate className="h-3.5 w-3.5" />
                ひな形
              </Link>
              <Link
                href="/flowchart"
                className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold ${
                  onFlowchart ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"
                }`}
              >
                <GitBranch className="h-3.5 w-3.5" />
                判定
              </Link>
            </nav>
            <AuthNavButtons variant="light" />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
