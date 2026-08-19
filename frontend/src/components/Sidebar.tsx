"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { PERIODS } from "./mockData";
import type { PeriodLists } from "@/lib/fiscal-year-drum";
import { PERIOD_INDEX_PERM } from "@/lib/period-nav";
import type { MatrixViewMode } from "@/lib/matrix-view-mode";
import type { NavClient } from "@/lib/client-nav";
import type { DataWorkspaceTab } from "@/features/client-data/data-workspace-tabs";

interface SidebarProps {
  viewMode: MatrixViewMode;
  activeMode: "year" | "month";
  activePeriodIdx: number;
  onPeriodChange: (idx: number) => void;
  onModeSwitch: () => void;
  clients: NavClient[];
  activeClientIdx: number;
  onClientChange: (idx: number) => void;
  matrixPeriods?: PeriodLists;
  /** カルテ面: R8/R7 の代わりにセクションを縦ドラム表示 */
  karteSections?: DataWorkspaceTab[];
  activeKarteSectionIdx?: number;
  onKarteSectionChange?: (idx: number) => void;
}

type DrumItem =
  | { kind: "perm" }
  | { kind: "period"; label: string };

/** 中央スナップ用。アイテム半高の目安（永続/期ラベル） */
const DRUM_ITEM_HALF_PX = 40;

function clientDrumDisplay(name: string): string {
  const stripped = name
    .trim()
    .replace(/^株式会社\s*/, "")
    .replace(/^合同会社\s*/, "")
    .replace(/^有限会社\s*/, "")
    .trim();
  if (stripped.length <= 8) return stripped;
  return `${stripped.slice(0, 7)}…`;
}

export default function Sidebar({
  viewMode,
  activeMode,
  activePeriodIdx,
  onPeriodChange,
  onModeSwitch,
  clients,
  activeClientIdx,
  onClientChange,
  matrixPeriods = PERIODS,
  karteSections,
  activeKarteSectionIdx = 0,
  onKarteSectionChange,
}: SidebarProps) {
  const vScrollerRef = useRef<HTMLDivElement>(null);
  const isAutoScrolling = useRef(false);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWheelTime = useRef(0);
  const wheelAccumulator = useRef(0);
  const [spacerPx, setSpacerPx] = useState(240);

  const isDocMode = viewMode === "document-client";
  const isKarteMode = Boolean(karteSections && karteSections.length > 0 && onKarteSectionChange);

  const periodDrumItems: DrumItem[] = [
    { kind: "perm" },
    ...matrixPeriods[activeMode].map((label) => ({ kind: "period" as const, label })),
  ];

  /** ドラム表示 index → period index（0=データは廃止。永続=1, 期=2+） */
  const periodIdxFromDrum = (drumIdx: number) => drumIdx + PERIOD_INDEX_PERM;
  const drumIdxFromPeriod = (periodIdx: number) =>
    Math.max(0, periodIdx - PERIOD_INDEX_PERM);

  const activeDrumIdx = isKarteMode
    ? activeKarteSectionIdx
    : isDocMode
      ? activeClientIdx
      : drumIdxFromPeriod(activePeriodIdx);
  const drumItemCount = isKarteMode
    ? karteSections!.length
    : isDocMode
      ? clients.length
      : periodDrumItems.length;
  const onDrumChange = isKarteMode
    ? onKarteSectionChange!
    : isDocMode
      ? onClientChange
      : (drumIdx: number) => onPeriodChange(periodIdxFromDrum(drumIdx));

  const lockAutoScroll = useCallback((ms: number) => {
    isAutoScrolling.current = true;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      isAutoScrolling.current = false;
    }, ms);
  }, []);

  const scrollActiveToCenter = useCallback(
    (behavior: ScrollBehavior) => {
      const container = vScrollerRef.current;
      if (!container || drumItemCount === 0) return;
      const items = container.querySelectorAll(".v-item");
      const targetEl = items[activeDrumIdx] as HTMLElement | undefined;
      if (!targetEl) return;
      lockAutoScroll(behavior === "smooth" ? 520 : 160);
      const offset =
        targetEl.offsetTop - container.clientHeight / 2 + targetEl.clientHeight / 2;
      container.scrollTo({ top: Math.max(0, offset), behavior });
    },
    [activeDrumIdx, drumItemCount, lockAutoScroll],
  );

  // スペーサーは % だと flex+overflow で 0 になり、先頭「永続」が中央に来ず MONTH に吸い寄る
  useEffect(() => {
    const container = vScrollerRef.current;
    if (!container) return;

    const syncSpacer = () => {
      const next = Math.max(80, Math.round(container.clientHeight / 2 - DRUM_ITEM_HALF_PX));
      setSpacerPx((prev) => (prev === next ? prev : next));
    };
    syncSpacer();
    const ro = new ResizeObserver(syncSpacer);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = vScrollerRef.current;
    if (!el || isKarteMode) return;

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
  }, [onModeSwitch, isKarteMode]);

  useEffect(() => {
    scrollActiveToCenter("smooth");
  }, [scrollActiveToCenter, spacerPx]);

  useEffect(() => {
    return () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    };
  }, []);

  const handleScroll = useCallback(() => {
    if (isAutoScrolling.current) return;
    const container = vScrollerRef.current;
    if (!container) return;

    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);

    scrollTimeout.current = setTimeout(() => {
      if (isAutoScrolling.current) return;
      const center = container.scrollTop + container.clientHeight / 2;
      const items = container.querySelectorAll(".v-item");

      let closestIdx = activeDrumIdx;
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

      // 隣接アイテムとの差が小さいときは現状維持（永続↔最初の MONTH のハンチング防止）
      if (closestIdx === activeDrumIdx) return;
      const activeEl = items[activeDrumIdx] as HTMLElement | undefined;
      if (activeEl) {
        const activeCenter = activeEl.offsetTop + activeEl.clientHeight / 2;
        const activeDiff = Math.abs(center - activeCenter);
        if (activeDiff - minDiff < 28) return;
      }

      onDrumChange(closestIdx);
    }, 120);
  }, [activeDrumIdx, onDrumChange]);

  const handleDoubleClick = isKarteMode ? undefined : onModeSwitch;

  const onPerm = !isKarteMode && !isDocMode && activePeriodIdx === PERIOD_INDEX_PERM;
  const headerLabel = isKarteMode ? "KARTE" : onPerm ? "PERM" : activeMode.toUpperCase();
  const headerClass = isKarteMode
    ? "text-violet-400"
    : onPerm
      ? "text-yellow-400"
      : activeMode === "year"
        ? "text-blue-500"
        : "text-green-500";

  return (
    <aside
      data-tour="sidebar-drum"
      onDoubleClick={handleDoubleClick}
      className={`relative z-20 flex h-full flex-shrink-0 cursor-pointer select-none flex-col items-center justify-center border-r border-slate-700 bg-slate-900 shadow-2xl transition-transform duration-300 ${
        isDocMode && !isKarteMode ? "w-32" : "w-24"
      }`}
    >
      <div className="pointer-events-none absolute left-0 top-1/2 z-0 h-24 w-full -translate-y-1/2 bg-gradient-to-b from-transparent via-white/[0.07] to-transparent" />

      <div className="pointer-events-none absolute left-1/2 top-4 z-50 -translate-x-1/2">
        <span className={`text-[9px] font-black tracking-widest ${headerClass}`}>
          {headerLabel}
        </span>
      </div>

      <div
        ref={vScrollerRef}
        onScroll={handleScroll}
        className="v-drum-scroller no-scrollbar relative z-10 flex h-full w-full flex-col items-center gap-6"
      >
        <div className="w-full flex-shrink-0" style={{ height: spacerPx }} aria-hidden />
        {isKarteMode
          ? karteSections!.map((section, idx) => {
              const Icon = section.icon;
              const active = idx === activeKarteSectionIdx;
              return (
                <div
                  key={section.id}
                  data-tour={`karte-section-${section.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onKarteSectionChange?.(idx);
                  }}
                  className={`v-item w-full px-1 py-3 text-center ${active ? "active" : ""} ${
                    active ? "text-violet-200" : "text-white"
                  }`}
                  title={section.description}
                >
                  <Icon
                    className={`mx-auto h-4 w-4 ${active ? "text-violet-300" : "text-slate-400"}`}
                    strokeWidth={active ? 2.25 : 1.75}
                  />
                  <div className="mt-1 text-sm font-black leading-snug tracking-tight">
                    {section.label}
                  </div>
                  <div className="mt-0.5 text-[8px] font-bold tracking-widest opacity-50">
                    {section.subLabel}
                  </div>
                </div>
              );
            })
          : isDocMode
            ? clients.map((client, idx) => (
                <div
                  key={client.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClientChange(idx);
                  }}
                  className={`v-item v-item-client w-full px-1 py-3 text-center ${
                    idx === activeClientIdx ? "active" : ""
                  } ${client.isAssigned ? "text-white" : "text-amber-200"}`}
                  title={client.name}
                >
                  <div className="text-sm font-black leading-snug tracking-tight">
                    {clientDrumDisplay(client.name)}
                  </div>
                  {client.fiscal ? (
                    <div className="mt-1 text-[9px] font-bold opacity-50">{client.fiscal}月</div>
                  ) : null}
                </div>
              ))
            : periodDrumItems.map((item, drumIdx) => (
                <div
                  key={item.kind === "period" ? item.label : item.kind}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPeriodChange(periodIdxFromDrum(drumIdx));
                  }}
                  className={`v-item w-full py-4 text-center ${
                    drumIdx === drumIdxFromPeriod(activePeriodIdx) ? "active" : ""
                  } ${
                    item.kind === "perm"
                      ? "text-yellow-400"
                      : item.kind === "period" && item.label === "OLD"
                        ? "text-amber-300"
                        : "text-white"
                  }`}
                >
                  {item.kind === "perm" ? (
                    <>
                      <div className="text-2xl font-black">永続</div>
                      <div className="text-[9px] font-bold opacity-60">PERMANENT</div>
                    </>
                  ) : item.kind === "period" && item.label === "OLD" ? (
                    <>
                      <div className="text-xl font-black tracking-tighter">OLD</div>
                      <div className="text-[9px] font-bold opacity-60">ARCHIVE</div>
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
        <div className="w-full flex-shrink-0" style={{ height: spacerPx }} aria-hidden />
      </div>

      <div className="mask-v-top pointer-events-none absolute left-0 top-0 z-20 h-24 w-full" />
      <div className="mask-v-bottom pointer-events-none absolute bottom-0 left-0 z-20 h-24 w-full" />
    </aside>
  );
}

export { PERIOD_INDEX_PERM };
