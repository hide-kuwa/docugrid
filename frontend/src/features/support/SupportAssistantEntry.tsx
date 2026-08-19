"use client";

import { useState } from "react";
import { Headset, Mail, Phone, Sparkles, X } from "lucide-react";
import {
  SUPPORT_ASSISTANT_STATUS,
  SUPPORT_ESCALATION_COPY,
} from "@/features/support/support-types";

type Props = {
  /** Compact entry next to tour guide */
  className?: string;
  /** FeatureTourHost のドック内に置く（独自 fixed をやめる） */
  embedded?: boolean;
};

/**
 * Placeholder shell for the future AI support chatbot.
 * Does not call a model yet — explains the funnel and points at help docs.
 */
export function SupportAssistantEntry({ className, embedded = false }: Props) {
  const [open, setOpen] = useState(false);
  const planned = SUPPORT_ASSISTANT_STATUS === "planned";

  return (
    <div
      className={[
        embedded ? "relative" : "fixed bottom-4 left-36 z-20",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-bold text-slate-700 shadow-lg transition hover:bg-slate-50"
        title="サポート（AIチャット準備中）"
      >
        <Headset className="h-3 w-3 text-teal-600" />
        サポート
        {planned ? (
          <span className="rounded bg-amber-100 px-1 text-[8px] font-black uppercase text-amber-700">
            準備中
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute bottom-[calc(100%+0.5rem)] left-0 w-[min(calc(100vw-12rem),22rem)] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-teal-600">
                Support
              </p>
              <h3 className="text-sm font-bold text-slate-800">困ったときの流れ</h3>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="閉じる"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <ol className="space-y-2 text-xs leading-relaxed text-slate-600">
            <li className="flex gap-2">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
              <span>
                左下の <strong>ガイド</strong> からチュートリアル一覧を選び、光る誘導を再生
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[10px] font-black text-slate-400">
                2
              </span>
              <span>
                使い方はアプリ内{" "}
                <a href="/help" className="font-bold text-teal-700 underline">
                  ヘルプ
                </a>
                （記事の正本は <code className="text-[10px]">docs/help</code>）
              </span>
            </li>
            <li className="flex gap-2">
              <Headset className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600" />
              <span>
                <strong>AI チャット</strong>で質問・不具合報告（準備中）。解決できなければ CS へ
              </span>
            </li>
            <li className="flex gap-2">
              <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
              <span>{SUPPORT_ESCALATION_COPY.emailFirst}</span>
            </li>
            <li className="flex gap-2">
              <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
              <span>{SUPPORT_ESCALATION_COPY.phoneOnlyWhenNeeded}</span>
            </li>
          </ol>

          <p className="mt-3 rounded-lg bg-slate-50 px-2.5 py-2 text-[10px] text-slate-500">
            開発向け構想: <span className="font-mono">docs/help/support-bot-vision.md</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
