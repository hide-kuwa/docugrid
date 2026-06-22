"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getTourById,
  markTourSeen,
  type FeatureTourDefinition,
} from "@/lib/feature-tours";

type Props = {
  tourId: string | null;
  onClose: () => void;
};

function getTargetRect(selector: string): DOMRect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  return el.getBoundingClientRect();
}

export function FeatureTour({ tourId, onClose }: Props) {
  const [tour, setTour] = useState<FeatureTourDefinition | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const refreshRect = useCallback(() => {
    if (!tour) return;
    const step = tour.steps[stepIndex];
    if (!step) return;
    setTargetRect(getTargetRect(step.target));
  }, [tour, stepIndex]);

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
  }, [tourId, onClose]);

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

  if (!tour || !tour.steps[stepIndex]) return null;

  const step = tour.steps[stepIndex];
  const isLast = stepIndex >= tour.steps.length - 1;
  const pad = 8;
  const spotlight = targetRect
    ? {
        top: targetRect.top - pad,
        left: targetRect.left - pad,
        width: targetRect.width + pad * 2,
        height: targetRect.height + pad * 2,
      }
    : null;

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal aria-label={tour.label}>
      <div className="absolute inset-0 bg-slate-900/50" onClick={finish} />
      {spotlight && (
        <div
          className="pointer-events-none absolute rounded-xl ring-4 ring-blue-400 ring-offset-2 ring-offset-transparent shadow-[0_0_0_9999px_rgba(15,23,42,0.55)]"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
          }}
        />
      )}
      <div
        className="absolute z-10 w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
        style={
          spotlight
            ? {
                top: Math.min(spotlight.top + spotlight.height + 12, window.innerHeight - 200),
                left: Math.min(
                  Math.max(16, spotlight.left),
                  window.innerWidth - 320,
                ),
              }
            : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }
        }
      >
        <p className="text-[10px] font-black uppercase tracking-widest text-blue-500">
          新機能 · {tour.label}
        </p>
        <h3 className="mt-1 text-base font-bold text-slate-800">{step.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-xs text-slate-400">
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
            <button
              type="button"
              onClick={() => {
                if (isLast) finish();
                else setStepIndex((i) => i + 1);
              }}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-500"
            >
              {isLast ? "完了" : "次へ"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
