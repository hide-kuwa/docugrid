"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  PERM_CRM_TABS,
  type PermCrmTabId,
} from "@/features/crm/perm-crm-tabs";

type Props = {
  value: PermCrmTabId;
  onChange: (id: PermCrmTabId) => void;
};

/**
 * 永続専用の横ドラム。顧問先 NavBar と同系（data-context-drum）で、
 * スクロール／クリックで中央寄せ切替。
 */
export function PermCrmStrip({ value, onChange }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const isAutoScrolling = useRef(false);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changeSource = useRef<"click" | "scroll" | "external">("external");

  const activeIdx = PERM_CRM_TABS.findIndex((tab) => tab.id === value);

  useEffect(() => {
    const container = scrollerRef.current;
    if (!container || activeIdx < 0) return;

    if (changeSource.current === "scroll") {
      changeSource.current = "external";
      return;
    }

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
    }, 450);
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

      const next = PERM_CRM_TABS[closestIdx];
      if (next && next.id !== value) {
        changeSource.current = "scroll";
        onChange(next.id);
      }
    }, 100);
  }, [activeIdx, onChange, value]);

  return (
    <div
      className="relative z-20 shrink-0 border-b border-amber-900/25 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 shadow-md select-none"
      data-tour="perm-crm-tabs"
    >
      <div className="pointer-events-none absolute left-4 top-1 z-50">
        <span className="text-[9px] font-black tracking-widest text-amber-500/80">
          永続
        </span>
      </div>
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="data-context-drum no-scrollbar relative h-[3.75rem] w-full overflow-x-scroll"
        role="tablist"
        aria-label="永続の表示切替"
      >
        <div className="w-[40vw] shrink-0" aria-hidden />
        {PERM_CRM_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.id === value;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              title={tab.hint}
              onClick={() => {
                changeSource.current = "click";
                onChange(tab.id);
              }}
              className={`data-context-item perm-crm-item ${isActive ? "active" : ""}`}
            >
              <Icon
                className={`mx-auto h-4 w-4 ${
                  isActive ? "text-amber-300" : "text-slate-500"
                }`}
              />
              <span className="data-context-item-label mt-1 block">{tab.label}</span>
              <span className="mt-0.5 block text-[8px] font-bold tracking-widest text-slate-500">
                {tab.subLabel}
              </span>
            </button>
          );
        })}
        <div className="w-[40vw] shrink-0" aria-hidden />
      </div>
      <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-24 bg-gradient-to-r from-slate-900 to-transparent" />
      <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-24 bg-gradient-to-l from-slate-950 to-transparent" />
    </div>
  );
}
