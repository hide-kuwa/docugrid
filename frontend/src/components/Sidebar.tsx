"use client";

import { useRef, useEffect, useCallback } from "react";
import { PERIODS } from "./mockData";
import { AuthNavButtons } from "@/components/AuthNavButtons";
import { PERIOD_INDEX_DATA, PERIOD_INDEX_PERM } from "@/lib/period-nav";

interface SidebarProps {
  activeMode: "year" | "month";
  activePeriodIdx: number;
  onPeriodChange: (idx: number) => void;
  onModeSwitch: () => void;
}

type DrumItem =
  | { kind: "data" }
  | { kind: "perm" }
  | { kind: "period"; label: string };

export default function Sidebar({
  activeMode,
  activePeriodIdx,
  onPeriodChange,
  onModeSwitch,
}: SidebarProps) {
  const vScrollerRef = useRef<HTMLDivElement>(null);
  const isAutoScrolling = useRef(false);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);
  const lastWheelTime = useRef(0);
  const wheelAccumulator = useRef(0);

  const drumItems: DrumItem[] = [
    { kind: "data" },
    { kind: "perm" },
    ...PERIODS[activeMode].map((label) => ({ kind: "period" as const, label })),
  ];

  useEffect(() => {
    const el = vScrollerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        wheelAccumulator.current += e.deltaX;

        const now = Date.now();
        if (Math.abs(wheelAccumulator.current) > 50 && now - lastWheelTime.current > 500) {
          onModeSwitch();
          lastWheelTime.current = now;
          wheelAccumulator.current = 0;
        }
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [onModeSwitch]);

  useEffect(() => {
    const container = vScrollerRef.current;
    if (!container) return;

    isAutoScrolling.current = true;
    const items = container.querySelectorAll(".v-item");
    const targetEl = items[activePeriodIdx] as HTMLElement;

    if (targetEl) {
      const offset =
        targetEl.offsetTop -
        container.clientHeight / 2 +
        targetEl.clientHeight / 2;
      container.scrollTo({ top: offset, behavior: "smooth" });
    }

    const t = setTimeout(() => {
      isAutoScrolling.current = false;
    }, 500);
    return () => clearTimeout(t);
  }, [activePeriodIdx]);

  const handleScroll = useCallback(() => {
    if (isAutoScrolling.current) return;
    const container = vScrollerRef.current;
    if (!container) return;

    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);

    scrollTimeout.current = setTimeout(() => {
      const center = container.scrollTop + container.clientHeight / 2;
      const items = container.querySelectorAll(".v-item");

      let closestIdx = activePeriodIdx;
      let minDiff = Infinity;

      items.forEach((item, idx) => {
        const el = item as HTMLElement;
        const itemCenter = el.offsetTop + el.clientHeight / 2;
        const diff = Math.abs(center - itemCenter);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = idx;
        }
      });

      if (closestIdx !== activePeriodIdx) {
        onPeriodChange(closestIdx);
      }
    }, 100);
  }, [activePeriodIdx, onPeriodChange]);

  return (
    <aside
      onDoubleClick={onModeSwitch}
      className="relative z-20 flex h-full w-24 flex-shrink-0 cursor-pointer select-none flex-col items-center justify-center border-r border-slate-700 bg-slate-900 shadow-2xl transition-transform duration-300"
    >
      <div className="pointer-events-none absolute left-0 top-1/2 z-0 h-20 w-full -translate-y-1/2 border-y border-white/10 bg-white/5" />

      <div className="absolute left-1/2 top-4 z-50 -translate-x-1/2 opacity-100 transition-all duration-300">
        <span
          className={`text-[9px] font-black tracking-widest ${activeMode === "year" ? "text-blue-500" : "text-green-500"}`}
        >
          {activeMode.toUpperCase()}
        </span>
      </div>

      <div
        ref={vScrollerRef}
        onScroll={handleScroll}
        className="v-drum-scroller no-scrollbar relative z-10 flex h-full w-full flex-col items-center gap-6 py-[calc(50vh-80px)]"
      >
        <div className="h-1/2 flex-shrink-0" />
        {drumItems.map((item, idx) => (
          <div
            key={item.kind === "period" ? item.label : item.kind}
            onClick={(e) => {
              e.stopPropagation();
              onPeriodChange(idx);
            }}
            className={`v-item w-full py-4 text-center ${idx === activePeriodIdx ? "active" : ""} ${
              item.kind === "data"
                ? "text-violet-400"
                : item.kind === "perm"
                  ? "text-yellow-400"
                  : "text-white"
            }`}
          >
            {item.kind === "data" ? (
              <>
                <div className="text-2xl font-black">データ</div>
                <div className="text-[9px] font-bold opacity-60">DATA</div>
              </>
            ) : item.kind === "perm" ? (
              <>
                <div className="text-2xl font-black">永続</div>
                <div className="text-[9px] font-bold opacity-60">PERMANENT</div>
              </>
            ) : (
              <>
                <div className="text-2xl font-black tracking-tighter">{item.label}</div>
                {activeMode === "year" ? (
                  <div className="text-[9px] font-bold opacity-60">YEAR</div>
                ) : (
                  <div className="text-[9px] font-bold opacity-60">MONTH</div>
                )}
              </>
            )}
          </div>
        ))}
        <div className="h-1/2 flex-shrink-0" />
      </div>

      <div className="mask-v-top pointer-events-none absolute left-0 top-0 z-20 h-24 w-full" />
      <div className="mask-v-bottom pointer-events-none absolute bottom-0 left-0 z-20 h-24 w-full" />

      <div className="absolute bottom-3 left-0 right-0 z-50 px-2" onClick={(e) => e.stopPropagation()}>
        <AuthNavButtons variant="sidebar" />
      </div>
    </aside>
  );
}

// Re-export for consumers that need constants
export { PERIOD_INDEX_DATA, PERIOD_INDEX_PERM };
