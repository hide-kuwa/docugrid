"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Headset, HelpCircle, Sparkles, X } from "lucide-react";
import { loadCurrentUser } from "@/lib/auth";
import {
  eligibleTours,
  isTourSeen,
  unseenTours,
  type FeatureTourDefinition,
} from "@/lib/feature-tours";
import {
  SUPPORT_ASSISTANT_STATUS,
} from "@/features/support/support-types";
import { SupportChatPanel } from "@/features/support/SupportChatPanel";

type PanelTab = "home" | "guide" | "support";

type Props = {
  /** レールを開いたままにする */
  onOpenChange?: (open: boolean) => void;
  /** レール内の util ボタン見た目 */
  compactLabel?: boolean;
};

/**
 * 左レールの「ヘルプ」にホバー／フォーカスすると、
 * ガイド・サポート・ヘルプセンターを出すサイドパネル。
 */
export function HelpAssistFlyout({ onOpenChange, compactLabel = true }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PanelTab>("home");
  const [unseenCount, setUnseenCount] = useState(0);
  const [tours, setTours] = useState<FeatureTourDefinition[]>([]);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const refreshTourMeta = () => {
    const user = loadCurrentUser();
    setUnseenCount(user ? unseenTours(user).length : 0);
    setTours(eligibleTours(user));
  };

  useEffect(() => {
    refreshTourMeta();
  }, [open]);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  const clearClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const openPanel = () => {
    clearClose();
    setOpen(true);
  };

  const scheduleClose = () => {
    clearClose();
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      setTab("home");
    }, 280);
  };

  const startTour = (tourId: string) => {
    if (
      tourId === "go_live_setup" &&
      typeof window !== "undefined" &&
      !window.location.pathname.startsWith("/settings")
    ) {
      window.location.assign("/settings?tab=clients&tour=go_live_setup");
      return;
    }
    window.dispatchEvent(
      new CustomEvent("docugrid:start-tour", { detail: { id: tourId } }),
    );
    setOpen(false);
    setTab("home");
  };

  const planned = SUPPORT_ASSISTANT_STATUS === "planned";
  const onHelpPage = pathname.startsWith("/help");

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={openPanel}
      onMouseLeave={scheduleClose}
      onFocusCapture={openPanel}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          scheduleClose();
        }
      }}
    >
      <button
        type="button"
        title="ヘルプ・ガイド・サポート"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          if (open) {
            setOpen(false);
            setTab("home");
          } else {
            openPanel();
          }
        }}
        className={[
          "flex w-11 flex-col items-center gap-0.5 rounded-xl px-1 py-2 transition-colors duration-300",
          open || onHelpPage
            ? "bg-teal-950/50 text-teal-300 ring-1 ring-teal-500/40"
            : "text-slate-400 hover:bg-slate-900 hover:text-slate-200",
        ].join(" ")}
      >
        <span className="relative">
          <HelpCircle className="h-4 w-4" />
          {unseenCount > 0 ? (
            <span className="absolute -right-1.5 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-violet-500 px-0.5 text-[8px] font-black text-white">
              {unseenCount > 9 ? "9+" : unseenCount}
            </span>
          ) : null}
        </span>
        {compactLabel ? (
          <span className="text-[9px] font-bold leading-none">ヘルプ</span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="ヘルプ・ガイド・サポート"
          className="absolute bottom-0 left-[calc(100%+0.35rem)] z-[80] w-[18rem] rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_12px_40px_rgba(15,23,42,0.28)]"
          onMouseEnter={openPanel}
          onMouseLeave={scheduleClose}
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-teal-700">
                Help
              </p>
              <h3 className="text-sm font-bold text-slate-900">ヘルプ＆サポート</h3>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTab("home");
              }}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="閉じる"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {tab === "home" ? (
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => {
                  router.push("/help");
                  setOpen(false);
                }}
                className="flex w-full items-start gap-2.5 rounded-xl border border-transparent px-2.5 py-2.5 text-left transition hover:border-slate-200 hover:bg-slate-50"
              >
                <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
                <span>
                  <span className="block text-xs font-bold text-slate-900">ヘルプセンター</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-slate-600">
                    使い方の記事を読む
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setTab("guide")}
                className="flex w-full items-start gap-2.5 rounded-xl border border-transparent px-2.5 py-2.5 text-left transition hover:border-slate-200 hover:bg-slate-50"
              >
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                <span>
                  <span className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                    ガイド
                    {unseenCount > 0 ? (
                      <span className="rounded bg-violet-100 px-1 text-[8px] font-black text-violet-700">
                        未読 {unseenCount}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-slate-600">
                    画面の押し所を光らせて案内
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setTab("support")}
                className="flex w-full items-start gap-2.5 rounded-xl border border-transparent px-2.5 py-2.5 text-left transition hover:border-slate-200 hover:bg-slate-50"
              >
                <Headset className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
                <span>
                  <span className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                    サポート
                    {planned ? (
                      <span className="rounded bg-amber-100 px-1 text-[8px] font-black text-amber-800">
                        準備中
                      </span>
                    ) : SUPPORT_ASSISTANT_STATUS === "preview" ? (
                      <span className="rounded bg-teal-100 px-1 text-[8px] font-black text-teal-800">
                        プレビュー
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-slate-600">
                    ヘルプを手がかりに質問（モック応答）
                  </span>
                </span>
              </button>
            </div>
          ) : null}

          {tab === "guide" ? (
            <div>
              <button
                type="button"
                onClick={() => setTab("home")}
                className="mb-2 text-[11px] font-bold text-slate-500 hover:text-slate-800"
              >
                ← 戻る
              </button>
              <p className="mb-2 text-[11px] leading-snug text-slate-600">
                レイアウトは変えず、押す場所だけ光ります。
              </p>
              <ul className="max-h-[min(40vh,18rem)] space-y-1 overflow-y-auto">
                {tours.length === 0 ? (
                  <li className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-600">
                    いま選べるガイドはありません（ログイン／権限を確認）。
                  </li>
                ) : (
                  tours.map((tour) => {
                    const seen = isTourSeen(tour.id);
                    return (
                      <li key={tour.id}>
                        <button
                          type="button"
                          onClick={() => startTour(tour.id)}
                          className="flex w-full flex-col rounded-xl border border-transparent px-2.5 py-2 text-left transition hover:border-violet-200 hover:bg-violet-50"
                        >
                          <span className="flex items-center gap-2 text-xs font-bold text-slate-900">
                            {tour.label}
                            {!seen ? (
                              <span className="rounded bg-amber-100 px-1 text-[8px] font-black text-amber-800">
                                未読
                              </span>
                            ) : null}
                          </span>
                          {tour.summary ? (
                            <span className="mt-0.5 text-[11px] leading-snug text-slate-600">
                              {tour.summary}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          ) : null}

          {tab === "support" ? <SupportChatPanel onBack={() => setTab("home")} /> : null}
        </div>
      ) : null}
    </div>
  );
}
