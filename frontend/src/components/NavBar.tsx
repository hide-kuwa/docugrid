"use client";

import { useRef, useEffect, useCallback, useMemo, useState } from "react";
import { Folder, Link as LinkIcon, Search, X } from "lucide-react";
import { DocuGridLogo } from "@/components/brand";
import {
  formatClientSubtitle,
  type ClientScopeMode,
  type NavClient,
} from "@/lib/client-nav";
import type { MatrixViewMode } from "@/lib/matrix-view-mode";
import type { CatalogCategoryFields } from "@/features/docugrid/lib/document-catalog-api";
import { matchesSearchQuery } from "@/lib/japanese-search";

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
  /** 顧客マスタ取得済みか（未取得時は空メッセージを出さない） */
  clientsLoaded?: boolean;
  firmLabel?: string;
  userName?: string;
  /** ロゴ押下で Doc トップ（顧客の最初のドキュメント画面）へ */
  onGoHome?: () => void;
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
  clientsLoaded = true,
  firmLabel,
  userName,
  onGoHome,
}: NavBarProps) {
  const hScrollerRef = useRef<HTMLDivElement>(null);
  const isAutoScrolling = useRef(false);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);
  const drumChangeSource = useRef<"click" | "scroll" | "external">("external");
  const lastWheelTime = useRef(0);
  const wheelAccumulator = useRef(0);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isDocMode = viewMode === "document-client";

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setQuery("");
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const t = window.setTimeout(() => searchInputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSearch();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen, closeSearch]);

  const filteredClients = useMemo(() => {
    const q = query.trim();
    const entries = clients.map((client, index) => ({ client, index }));
    if (!q || isDocMode) return entries;
    return entries.filter(({ client }) =>
      matchesSearchQuery(
        `${client.name} ${client.id} ${client.fiscal ?? ""} ${client.nameKana ?? ""}`,
        q,
      ),
    );
  }, [clients, query, isDocMode]);

  const filteredCategories = useMemo(() => {
    const q = query.trim();
    const entries = docCategories.map((cat, index) => ({ cat, index }));
    if (!q || !isDocMode) return entries;
    return entries.filter(({ cat }) =>
      matchesSearchQuery(`${cat.label} ${cat.category_id}`, q),
    );
  }, [docCategories, query, isDocMode]);

  const drumCount = isDocMode ? filteredCategories.length : filteredClients.length;

  const activeDrumIdx = useMemo(() => {
    if (isDocMode) {
      const i = filteredCategories.findIndex((e) => e.index === activeDocCategoryIdx);
      return i >= 0 ? i : 0;
    }
    const i = filteredClients.findIndex((e) => e.index === activeClientIdx);
    return i >= 0 ? i : 0;
  }, [
    isDocMode,
    filteredCategories,
    filteredClients,
    activeDocCategoryIdx,
    activeClientIdx,
  ]);

  const onDrumChange = useCallback(
    (drumIdx: number) => {
      if (isDocMode) {
        const entry = filteredCategories[drumIdx];
        if (entry) onDocCategoryChange(entry.index);
        return;
      }
      const entry = filteredClients[drumIdx];
      if (entry) onClientChange(entry.index);
    },
    [isDocMode, filteredCategories, filteredClients, onDocCategoryChange, onClientChange],
  );

  useEffect(() => {
    if (!query.trim() || isDocMode) return;
    if (filteredClients.some((e) => e.index === activeClientIdx)) return;
    if (filteredClients[0]) onClientChange(filteredClients[0].index);
  }, [query, filteredClients, activeClientIdx, onClientChange, isDocMode]);

  useEffect(() => {
    if (!query.trim() || !isDocMode) return;
    if (filteredCategories.some((e) => e.index === activeDocCategoryIdx)) return;
    if (filteredCategories[0]) onDocCategoryChange(filteredCategories[0].index);
  }, [query, filteredCategories, activeDocCategoryIdx, onDocCategoryChange, isDocMode]);

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
  }, [activeDrumIdx, drumCount, isDocMode, query]);

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
      className="relative z-30 flex shrink-0 flex-col border-b border-slate-700 bg-slate-900 shadow-xl select-none pt-[env(safe-area-inset-top)]"
      onDoubleClick={onViewModeToggle}
      title={isDocMode ? "ダブルクリックで通常表示に戻る" : "ダブルクリックで書類別表示"}
    >
      <div className="relative h-[3.75rem] md:h-[4.5rem]">
        <div className="absolute bottom-0 left-1/2 z-0 hidden h-full w-[220px] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent pointer-events-none md:block" />

        {/* 左: ロゴ + 担当分トグル */}
        <div
          className="absolute left-2.5 top-1/2 z-40 flex -translate-y-1/2 flex-col gap-1 md:left-6"
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {onGoHome ? (
            <button
              type="button"
              onClick={onGoHome}
              title="トップ（ドキュメント）へ戻る"
              aria-label="トップへ戻る"
              className="rounded-lg text-left transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60"
            >
              <DocuGridLogo size="sm" surface="dark" showSubtitle={false} />
            </button>
          ) : (
            <DocuGridLogo size="sm" surface="dark" showSubtitle={false} />
          )}
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

        <div className="absolute left-3 top-1 z-50 hidden pointer-events-none md:left-40 md:top-1.5 md:block">
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
          <div className="w-[42vw] flex-shrink-0 md:w-[28vw]" />
          {isDocMode
            ? filteredCategories.length === 0
              ? (
                <div className="flex h-full min-w-[220px] items-center justify-center px-6 text-center text-[11px] leading-snug text-slate-400">
                  「{query.trim()}」に一致する書類種別はありません。
                </div>
              )
              : filteredCategories.map(({ cat, index }) => (
                <div
                  key={cat.category_id}
                  onClick={(e) => {
                    e.stopPropagation();
                    drumChangeSource.current = "click";
                    onDocCategoryChange(index);
                  }}
                  className={`h-item h-item-doc ${index === activeDocCategoryIdx ? "active" : ""} flex cursor-pointer flex-col items-center justify-center text-indigo-100`}
                >
                  <span className="h-item-name text-center text-xs font-bold leading-snug">{cat.label}</span>
                </div>
              ))
            : clients.length === 0
              ? (
                <div className="flex h-full min-w-[220px] items-center justify-center px-6 text-center text-[11px] leading-snug text-slate-400">
                  {!clientsLoaded
                    ? "顧問先を読み込み中…"
                    : "担当の顧問先がありません。顧客マスタと担当割当を確認してください。"}
                </div>
              )
              : filteredClients.length === 0
                ? (
                  <div className="flex h-full min-w-[220px] items-center justify-center px-6 text-center text-[11px] leading-snug text-slate-400">
                    「{query.trim()}」に一致する顧問先はありません。
                  </div>
                )
              : filteredClients.map(({ client, index }) => (
                <div
                  key={client.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    drumChangeSource.current = "click";
                    onClientChange(index);
                  }}
                  className={`h-item ${index === activeClientIdx ? "active" : ""} group-member flex cursor-pointer flex-col items-center justify-center`}
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
          <div className="w-[28vw] flex-shrink-0 md:w-[22vw]" />
        </div>

        <div className="mask-h-left pointer-events-none absolute left-0 top-0 z-20 h-full w-20 md:w-36" />
        <div className="mask-h-right pointer-events-none absolute right-0 top-0 z-20 h-full w-16 md:w-28" />

        {/* 右: 会社・ユーザー + 丸い検索 */}
        <div
          className="absolute right-2 top-1/2 z-40 flex -translate-y-1/2 items-center gap-1.5 md:right-4"
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {(firmLabel || userName) && !searchOpen ? (
            <div className="mr-0.5 hidden max-w-[11rem] flex-col items-end leading-tight md:flex lg:max-w-[14rem]">
              {firmLabel ? (
                <span className="truncate text-[9px] font-bold text-teal-300/90" title={firmLabel}>
                  {firmLabel}
                </span>
              ) : null}
              {userName ? (
                <span className="truncate text-[10px] font-semibold text-slate-200" title={userName}>
                  {userName}
                </span>
              ) : null}
            </div>
          ) : null}
          {searchOpen ? (
            <>
              <label className="relative block w-[min(15rem,58vw)]">
                <span className="sr-only">
                  {isDocMode ? "書類種別を検索" : "顧問先を検索"}
                </span>
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  inputMode="search"
                  autoComplete="off"
                  spellCheck={false}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={isDocMode ? "種別・ID" : "名前・かな・ID"}
                  className="w-full rounded-full border border-slate-300 bg-white py-2 pl-8 pr-8 text-[11px] font-medium text-slate-900 caret-slate-900 shadow-lg outline-none placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/25 md:py-1.5 [&::-webkit-search-cancel-button]:hidden [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_#fff] [&:-webkit-autofill]:[-webkit-text-fill-color:#0f172a]"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    aria-label="検索語をクリア"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </label>
              <button
                type="button"
                onClick={closeSearch}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-slate-800 text-slate-200 shadow-md hover:bg-slate-700"
                aria-label="検索を閉じる"
                title="閉じる"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-slate-800 text-slate-100 shadow-md hover:border-teal-400/50 hover:bg-slate-700 hover:text-white"
              aria-label={isDocMode ? "書類種別を検索" : "顧問先を検索"}
              title="検索"
              data-tour="client-nav-search"
            >
              <Search className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
