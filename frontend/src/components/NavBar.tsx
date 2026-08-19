"use client";

import { useRef, useEffect, useCallback } from "react";
import { Folder, Link as LinkIcon } from "lucide-react";
import { DocuGridLogo } from "@/components/brand";
import {
  formatClientSubtitle,
  type ClientScopeMode,
  type NavClient,
} from "@/lib/client-nav";
import type { MatrixViewMode } from "@/lib/matrix-view-mode";
import type { CatalogCategoryFields } from "@/features/docugrid/lib/document-catalog-api";

interface NavBarProps {
  viewMode: MatrixViewMode;
  onViewModeToggle: () => void;
  clients: NavClient[];
  currentClient: NavClient;
  activeClientIdx: number;
  onClientChange: (idx: number) => void;
  docCategories: CatalogCategoryFields[];
  activeDocCategoryIdx: number;
  onDocCategoryChange: (idx: number) => void;
  scopeMode: ClientScopeMode;
  canToggleScope: boolean;
  onScopeModeChange: (mode: ClientScopeMode) => void;
}

export default function NavBar({
  viewMode,
  onViewModeToggle,
  clients,
  activeClientIdx,
  onClientChange,
  docCategories,
  activeDocCategoryIdx,
  onDocCategoryChange,
  scopeMode,
  canToggleScope,
  onScopeModeChange,
}: NavBarProps) {
  const hScrollerRef = useRef<HTMLDivElement>(null);
  const isAutoScrolling = useRef(false);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);
  const drumChangeSource = useRef<"click" | "scroll" | "external">("external");
  const lastWheelTime = useRef(0);
  const wheelAccumulator = useRef(0);

  const isDocMode = viewMode === "document-client";
  const drumCount = isDocMode ? docCategories.length : clients.length;
  const activeDrumIdx = isDocMode ? activeDocCategoryIdx : activeClientIdx;
  const onDrumChange = isDocMode ? onDocCategoryChange : onClientChange;

  useEffect(() => {
    const container = hScrollerRef.current;
    if (!container || drumCount === 0) return;

    if (drumChangeSource.current === "scroll") {
      drumChangeSource.current = "external";
      return;
    }

    isAutoScrolling.current = true;
    const items = container.querySelectorAll(".h-item");
    const targetEl = items[activeDrumIdx] as HTMLElement;

    if (targetEl) {
      const offset =
        targetEl.offsetLeft -
        container.clientWidth / 2 +
        targetEl.clientWidth / 2;
      container.scrollTo({ left: offset, behavior: "auto" });
    }

    const t = setTimeout(() => {
      isAutoScrolling.current = false;
    }, 120);
    return () => clearTimeout(t);
  }, [activeDrumIdx, drumCount, isDocMode]);

  useEffect(() => {
    const el = hScrollerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      wheelAccumulator.current += e.deltaY;

      const now = Date.now();
      if (Math.abs(wheelAccumulator.current) > 50 && now - lastWheelTime.current > 500) {
        onViewModeToggle();
        lastWheelTime.current = now;
        wheelAccumulator.current = 0;
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [onViewModeToggle]);

  const handleScroll = useCallback(() => {
    if (isAutoScrolling.current) return;
    const container = hScrollerRef.current;
    if (!container) return;

    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);

    scrollTimeout.current = setTimeout(() => {
      const center = container.scrollLeft + container.clientWidth / 2;
      const items = container.querySelectorAll(".h-item");

      let closestIdx = activeDrumIdx;
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

      if (closestIdx !== activeDrumIdx) {
        drumChangeSource.current = "scroll";
        onDrumChange(closestIdx);
      }
    }, 100);
  }, [activeDrumIdx, onDrumChange]);

  const scopeButtonClass = (mode: ClientScopeMode) =>
    `rounded-full px-2.5 py-1 transition-colors ${
      scopeMode === mode
        ? "bg-blue-600 text-white"
        : "text-slate-400 hover:text-white"
    }`;

  return (
    <nav
      className="relative z-30 flex h-[4.5rem] flex-shrink-0 flex-col border-b border-slate-700 bg-slate-900 shadow-xl select-none"
      onDoubleClick={onViewModeToggle}
      title={isDocMode ? "ダブルクリックで通常表示に戻る" : "ダブルクリックで書類別表示"}
    >
      <div className="absolute bottom-0 left-1/2 z-0 h-full w-[220px] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent pointer-events-none" />

      <div className="absolute left-40 top-1.5 z-50 pointer-events-none">
        <span
          className={`text-[9px] font-black tracking-widest ${
            isDocMode ? "text-indigo-400" : "text-slate-500"
          }`}
        >
          {isDocMode ? "DOC TYPE" : "CLIENT"}
        </span>
      </div>

      <div
        ref={hScrollerRef}
        data-tour="client-nav"
        onScroll={handleScroll}
        className={`h-drum-scroller no-scrollbar relative z-10 h-full w-full ${isDocMode ? "pt-3" : ""}`}
      >
        <div className="w-[40vw] flex-shrink-0" />
        {isDocMode
          ? docCategories.map((cat, idx) => (
              <div
                key={cat.category_id}
                onClick={(e) => {
                  e.stopPropagation();
                  drumChangeSource.current = "click";
                  onDocCategoryChange(idx);
                }}
                className={`h-item h-item-doc ${idx === activeDocCategoryIdx ? "active" : ""} flex cursor-pointer flex-col items-center justify-center text-indigo-100`}
              >
                <span className="h-item-name text-center text-xs font-bold leading-snug">{cat.label}</span>
              </div>
            ))
          : clients.map((client, idx) => (
              <div
                key={client.id}
                onClick={(e) => {
                  e.stopPropagation();
                  drumChangeSource.current = "click";
                  onClientChange(idx);
                }}
                className={`h-item ${idx === activeClientIdx ? "active" : ""} group-member flex cursor-pointer flex-col items-center justify-center`}
              >
                <div className="flex max-w-full items-start justify-center gap-1">
                  {client.role === "main" ? (
                    <Folder className="mt-0.5 shrink-0 text-blue-400 w-4 h-4" />
                  ) : (
                    <LinkIcon className="mt-0.5 shrink-0 text-slate-400 w-4 h-4" />
                  )}
                  <span className="h-item-name text-center">{client.name}</span>
                </div>
                <div className="mt-0.5 text-[9px] text-slate-300">{formatClientSubtitle(client)}</div>
                {!client.isAssigned && (
                  <span className="mt-1 rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[8px] font-bold text-amber-200">
                    担当外
                  </span>
                )}
              </div>
            ))}
        <div className="w-[40vw] flex-shrink-0" />
      </div>

      <div className="mask-h-left pointer-events-none absolute left-0 top-0 z-20 h-full w-32" />
      <div className="mask-h-right pointer-events-none absolute right-0 top-0 z-20 h-full w-32" />

      <div
        className="absolute left-6 top-1/2 z-50 flex -translate-y-1/2 flex-col gap-2"
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <DocuGridLogo size="sm" surface="dark" showSubtitle={false} />
        {canToggleScope && !isDocMode && (
          <div
            className="flex rounded-full border border-white/10 bg-slate-800 p-0.5 text-[9px] font-bold shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className={scopeButtonClass("assigned")}
              onClick={() => onScopeModeChange("assigned")}
            >
              担当分
            </button>
            <button
              type="button"
              className={scopeButtonClass("all")}
              onClick={() => onScopeModeChange("all")}
            >
              すべて
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
