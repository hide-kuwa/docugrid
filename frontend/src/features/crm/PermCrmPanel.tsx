"use client";

import Link from "next/link";
import { Briefcase, FileStack, ShieldCheck } from "lucide-react";
import type { PermCrmTabId } from "@/features/crm/perm-crm-tabs";

type Props = {
  tab: Exclude<PermCrmTabId, "docs">;
  clientName: string;
};

const COPY: Record<
  Exclude<PermCrmTabId, "docs">,
  { title: string; body: string; icon: typeof ShieldCheck }
> = {
  held: {
    title: "保有",
    body: "この顧問先がいま入っている保険（将来は物件なども）を一覧する場所です。証券・約款は資料タブのスロットと紐づきます。",
    icon: ShieldCheck,
  },
  proposal: {
    title: "提案",
    body: "提案中の見積・設計・提案書をまとめて見る場所です。進捗の本体は「案件」タブの商談に置きます。",
    icon: FileStack,
  },
  deals: {
    title: "案件",
    body: "進捗中の商談一覧です。保険・不動産など商材パック共通の箱。成立すると保有側へつながります。",
    icon: Briefcase,
  },
};

/** C0: API 未接続の空状態骨格。 */
export function PermCrmPanel({ tab, clientName }: Props) {
  const meta = COPY[tab];
  const Icon = meta.icon;

  return (
    <div
      className="rounded-xl border border-dashed border-amber-200 bg-amber-50/40 px-5 py-8"
      role="tabpanel"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white border border-amber-100 text-amber-700">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700/80">
            {clientName}
          </p>
          <h2 className="mt-0.5 text-base font-bold text-slate-800">{meta.title}</h2>
          <p className="mt-2 max-w-xl text-[12px] leading-relaxed text-slate-600">
            {meta.body}
          </p>
          <p className="mt-3 text-[11px] text-slate-500">
            データ連携はこれから（CRM パック構想の C1 以降）。いまは画面の骨格だけです。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-400">
              一覧（準備中）
            </span>
            <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-400">
              新規（準備中）
            </span>
            <Link
              href="/help?id=crm-perm"
              className="rounded-md border border-amber-200 bg-white px-2.5 py-1 text-[10px] font-bold text-amber-800 hover:bg-amber-50"
            >
              ヘルプ
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
