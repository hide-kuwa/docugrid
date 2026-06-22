"use client";

import { useCallback, useEffect, useRef } from "react";
import { DATA_WORKSPACE_TABS, type DataWorkspaceTabId } from "@/features/client-data/data-workspace-tabs";

type Props = {
  activeTab: DataWorkspaceTabId;
  onTabChange: (tab: DataWorkspaceTabId) => void;
};

export function DataContextGrid({ activeTab, onTabChange }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const isAutoScrolling = useRef(false);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeIdx = DATA_WORKSPACE_TABS.findIndex((tab) => tab.id === activeTab);

  useEffect(() => {
    const container = scrollerRef.current;
    if (!container) return;

    isAutoScrolling.current = true;
    const items = container.querySelectorAll(".data-context-item");
    const targetEl = items[activeIdx] as HTMLElement | undefined;

    if (targetEl) {
      const offset =
        targetEl.offsetLeft - container.clientWidth / 2 + targetEl.clientWidth / 2;
      container.scrollTo({ left: offset, behavior: "smooth" });
    }

    const t = setTimeout(() => {
      isAutoScrolling.current = false;
    }, 500);
    return () => clearTimeout(t);
  }, [activeIdx]);

  const handleScroll = useCallback(() => {
    if (isAutoScrolling.current) return;
    const container = scrollerRef.current;
    if (!container) return;

    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);

    scrollTimeout.current = setTimeout(() => {
      const center = container.scrollLeft + container.clientWidth / 2;
      const items = container.querySelectorAll(".data-context-item");

      let closestIdx = activeIdx;
      let minDiff = Infinity;

      items.forEach((item, idx) => {
        const el = item as HTMLElement;
        const itemCenter = el.offsetLeft + el.clientWidth / 2;
        const diff = Math.abs(center - itemCenter);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = idx;
        }
      });

      const next = DATA_WORKSPACE_TABS[closestIdx];
      if (next && next.id !== activeTab) {
        onTabChange(next.id);
      }
    }, 100);
  }, [activeIdx, activeTab, onTabChange]);

  return (
    <div className="relative z-20 shrink-0 border-b border-violet-900/30 bg-gradient-to-r from-slate-900 via-slate-900 to-violet-950 shadow-md select-none">
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="data-context-drum no-scrollbar relative h-[3.75rem] w-full overflow-x-scroll"
      >
        <div className="w-[35vw] shrink-0" />
        {DATA_WORKSPACE_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`data-context-item ${isActive ? "active" : ""}`}
              title={tab.description}
            >
              <Icon
                className={`mx-auto h-4 w-4 ${isActive ? "text-violet-300" : "text-slate-500"}`}
              />
              <span className="data-context-item-label mt-1 block">{tab.label}</span>
              <span className="mt-0.5 block text-[8px] font-bold tracking-widest text-slate-500">
                {tab.subLabel}
              </span>
            </button>
          );
        })}
        <div className="w-[35vw] shrink-0" />
      </div>
      <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-24 bg-gradient-to-r from-slate-900 to-transparent" />
      <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-24 bg-gradient-to-l from-violet-950 to-transparent" />
    </div>
  );
}
