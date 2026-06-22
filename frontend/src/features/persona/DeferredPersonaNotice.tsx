"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PersonaDefinition } from "@/config/personas";
import { clearAuthSession } from "@/lib/auth";

type Props = {
  persona: PersonaDefinition;
};

/** 銀行・税務署などスコープ外ペルソナ向けの案内 */
export function DeferredPersonaNotice({ persona }: Props) {
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          スコープ外
        </p>
        <h1 className="mt-2 text-lg font-black text-slate-800">{persona.label}</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          外部向け（銀行・税務署など）の画面は当面の開発対象外です。優先は
          <strong className="text-slate-800"> 税理士事務所</strong>・
          <strong className="text-slate-800">クライアント</strong>・
          <strong className="text-slate-800">開発コンソール</strong> です。
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/login"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500"
          >
            別アカウントでログイン
          </Link>
          <button
            type="button"
            onClick={() => {
              clearAuthSession();
              router.push("/login");
            }}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
          >
            ログアウト
          </button>
        </div>
      </div>
    </div>
  );
}
