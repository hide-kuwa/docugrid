"use client";

import type { ReactNode } from "react";
import { DocuGridLogo } from "@/components/brand";

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

/** ログイン / 新規登録 共通のカード枠 */
export function AuthPageShell({ title, subtitle, children }: Props) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4 font-sans">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="relative overflow-hidden bg-neutral-900 p-8 text-center">
          <div className="absolute left-0 top-0 h-2 w-full bg-primary" />
          <div className="mb-2 flex justify-center">
            <DocuGridLogo size="md" surface="dark" />
          </div>
          <p className="text-sm text-slate-400">税務ドキュメント管理システム</p>
        </div>

        <div className="space-y-5 p-8">
          <div className="text-center">
            <h1 className="text-lg font-black text-slate-900">{title}</h1>
            {subtitle ? (
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{subtitle}</p>
            ) : null}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
