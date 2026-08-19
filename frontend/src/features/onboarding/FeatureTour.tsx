"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  getTourById,
  markTourSeen,
  type FeatureTourDefinition,
  type FeatureTourStep,
} from "@/lib/feature-tours";

type Props = {
  tourId: string | null;
  onClose: () => void;
};

type Hole = { top: number; left: number; width: number; height: number };

function isElementSpotlightable(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (Number(style.opacity) === 0) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  if (
    rect.bottom < 0 ||
    rect.top > window.innerHeight ||
    rect.right < 0 ||
    rect.left > window.innerWidth
  ) {
    return false;
  }
  return true;
}

function resolveTarget(step: FeatureTourStep): HTMLElement | null {
  const selectors = [step.target, step.fallbackTarget].filter(
    (s): s is string => Boolean(s && s.trim()),
  );
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && isElementSpotlightable(el)) return el;
  }
  return null;
}

function runStepPrepare(step: FeatureTourStep) {
  if (step.prepare === "pin-workspace-rail") {
    window.dispatchEvent(new CustomEvent("docugrid:pin-workspace-rail"));
  }
  if (step.prepare === "open-workspace-rail") {
    window.dispatchEvent(new CustomEvent("docugrid:open-workspace-rail"));
  }
  if (step.prepare === "settings-clients") {
    if (!window.location.pathname.startsWith("/settings")) {
      window.location.assign("/settings?tab=clients&tour=go_live_setup");
      return;
    }
    window.dispatchEvent(
      new CustomEvent("docugrid:settings-tab", { detail: { id: "clients" } }),
    );
  }
  if (step.prepare === "settings-drive") {
    if (!window.location.pathname.startsWith("/settings")) {
      window.location.assign("/settings?tab=drive&tour=go_live_setup");
      return;
    }
    window.dispatchEvent(
      new CustomEvent("docugrid:settings-tab", { detail: { id: "drive" } }),
    );
  }
  if (step.workspace) {
    window.dispatchEvent(
      new CustomEvent("docugrid:select-workspace", {
        detail: { id: step.workspace },
      }),
    );
  }
  if (step.karteSection) {
    window.dispatchEvent(
      new CustomEvent("docugrid:select-karte-section", {
        detail: { id: step.karteSection },
      }),
    );
  }
}

function tooltipPosition(hole: Hole | null, cardW = 320, cardH = 240) {
  const margin = 16;
  const gap = 14;
  if (!hole) {
    return {
      top: Math.max(margin, window.innerHeight / 2 - cardH / 2),
      left: Math.max(margin, window.innerWidth / 2 - cardW / 2),
    };
  }
  const below = hole.top + hole.height + gap;
  const above = hole.top - gap - cardH;
  const preferBelow = below + cardH < window.innerHeight - margin;
  const top = preferBelow
    ? Math.min(below, window.innerHeight - cardH - margin)
    : Math.max(margin, above);
  const left = Math.min(
    Math.max(margin, hole.left),
    window.innerWidth - cardW - margin,
  );
  return { top, left };
}

/** ゲーム風: 全体を暗くし、ターゲットだけ穴あけで明るく残す */
export function FeatureTour({ tourId, onClose }: Props) {
  const [tour, setTour] = useState<FeatureTourDefinition | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);

  const step = tour?.steps[stepIndex] ?? null;

  const refreshRect = useCallback(() => {
    if (!step) return;
    const primary = step.target
      ? document.querySelector(step.target)
      : null;
    const primaryOk = primary ? isElementSpotlightable(primary) : false;
    const el = resolveTarget(step);
    if (el) {
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      setTargetRect(el.getBoundingClientRect());
      setUsingFallback(Boolean(step.fallbackTarget && !primaryOk && el));
    } else {
      setTargetRect(null);
      setUsingFallback(false);
    }
  }, [step]);

  useEffect(() => {
    if (!tourId) {
      setTour(null);
      return;
    }
    const def = getTourById(tourId);
    if (!def) {
      onClose();
      return;
    }
    setTour(def);
    setStepIndex(0);
    // onClose を deps に入れると親の再レンダーでステップがリセットされるため tourId のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [tourId]);

  useEffect(() => {
    if (!step) return;
    runStepPrepare(step);
    const delays = [40, 120, 280, 520, 900, 1400];
    const timers = delays.map((ms) => window.setTimeout(refreshRect, ms));
    const obs = new MutationObserver(() => refreshRect());
    obs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-tour"],
    });
    return () => {
      for (const t of timers) window.clearTimeout(t);
      obs.disconnect();
    };
  }, [step, refreshRect]);

  useEffect(() => {
    refreshRect();
    const onResize = () => refreshRect();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    const timer = window.setInterval(refreshRect, 400);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      window.clearInterval(timer);
    };
  }, [refreshRect]);

  const finish = useCallback(() => {
    if (tour) markTourSeen(tour.id);
    onClose();
  }, [tour, onClose]);

  const goNext = useCallback(() => {
    if (!tour) return;
    if (stepIndex >= tour.steps.length - 1) {
      finish();
      return;
    }
    setStepIndex((i) => i + 1);
  }, [tour, stepIndex, finish]);

  const pad = 10;
  const hole: Hole | null = useMemo(() => {
    if (!targetRect) return null;
    return {
      top: Math.max(0, targetRect.top - pad),
      left: Math.max(0, targetRect.left - pad),
      width: targetRect.width + pad * 2,
      height: targetRect.height + pad * 2,
    };
  }, [targetRect]);

  const tip = useMemo(() => tooltipPosition(hole), [hole]);

  if (!tour || !step) return null;

  const isLast = stepIndex >= tour.steps.length - 1;
  const allowClick = step.allowTargetClick !== false;
  const dim = "absolute bg-slate-950/75";
  /** 暗い所クリックで終了しない（誤タップで「すぐ終わる」のを防ぐ） */
  const ignoreDimClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal aria-label={tour.label}>
      {/* 4 パネルで穴を開け、穴の下は実UIが明るく・クリック可能 */}
      {hole ? (
        <>
          <div
            className={`${dim} left-0 right-0 top-0`}
            style={{ height: hole.top }}
            onClick={ignoreDimClick}
          />
          <div
            className={`${dim} left-0`}
            style={{ top: hole.top, height: hole.height, width: hole.left }}
            onClick={ignoreDimClick}
          />
          <div
            className={`${dim} right-0`}
            style={{
              top: hole.top,
              height: hole.height,
              left: hole.left + hole.width,
            }}
            onClick={ignoreDimClick}
          />
          <div
            className={`${dim} bottom-0 left-0 right-0`}
            style={{ top: hole.top + hole.height }}
            onClick={ignoreDimClick}
          />
          <div
            className={[
              "pointer-events-none absolute rounded-xl",
              "ring-4 ring-amber-300/90",
              "shadow-[0_0_0_2px_rgba(251,191,36,0.5),0_0_32px_rgba(251,191,36,0.35)]",
              "animate-pulse",
            ].join(" ")}
            style={{
              top: hole.top,
              left: hole.left,
              width: hole.width,
              height: hole.height,
            }}
          />
          {!allowClick ? (
            <div
              className="absolute"
              style={{
                top: hole.top,
                left: hole.left,
                width: hole.width,
                height: hole.height,
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : null}
        </>
      ) : (
        <div className="absolute inset-0 bg-slate-950/75" onClick={ignoreDimClick} />
      )}

      <div
        className="pointer-events-auto absolute z-10 w-[min(100%-2rem,20rem)] rounded-2xl border border-amber-200/40 bg-white p-5 shadow-2xl"
        style={{ top: tip.top, left: tip.left }}
      >
        <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">
          チュートリアル · {tour.label}
        </p>
        <h3 className="mt-1 text-base font-bold text-slate-800">{step.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.body}</p>
        <p className="mt-2 text-[10px] leading-snug text-slate-400">
          {isLast
            ? "最後のステップです。「完了」で閉じます。"
            : `あと ${tour.steps.length - stepIndex - 1} ステップあります。「次へ」で進みます。`}
        </p>
        {!hole ? (
          <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] leading-snug text-amber-900">
            いま光る場所が見つかりません。レールを開く・Doc に戻るなど画面を合わせてから「次へ」を押してください。
          </p>
        ) : null}
        {usingFallback && hole ? (
          <p className="mt-2 rounded-lg bg-slate-50 px-2 py-1.5 text-[10px] leading-snug text-slate-500">
            本来の場所が空／非表示のため、近いエリアを照らしています。
          </p>
        ) : null}
        {step.helpId ? (
          <p className="mt-2 text-[10px] text-slate-400">
            詳しく:{" "}
            <a
              href={`/help?id=${encodeURIComponent(step.helpId)}`}
              className="font-semibold text-teal-700 underline decoration-teal-200 underline-offset-2 hover:text-teal-800"
            >
              ヘルプ「{step.helpId}」
            </a>
          </p>
        ) : null}
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-500">
            {stepIndex + 1} / {tour.steps.length}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={finish}
              className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100"
            >
              スキップ
            </button>
            {stepIndex > 0 ? (
              <button
                type="button"
                onClick={() => setStepIndex((i) => i - 1)}
                className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                戻る
              </button>
            ) : null}
            <button
              type="button"
              onClick={goNext}
              className="rounded-lg bg-amber-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-400"
            >
              {isLast ? "完了" : "次へ"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
