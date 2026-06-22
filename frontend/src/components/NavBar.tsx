"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Search as SearchIcon, Folder, Link as LinkIcon, Settings, ListTodo, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { loadCurrentUser } from "@/lib/auth";
import {
  formatClientSubtitle,
  type ClientScopeMode,
  type NavClient,
} from "@/lib/client-nav";
import { canShowDevConsoleNav, canShowFirmSettingsNav, canShowTasksNav } from "@/lib/nav-policy";

interface NavBarProps {
  clients: NavClient[];
  currentClient: NavClient;
  activeClientIdx: number;
  onClientChange: (idx: number) => void;
  scopeMode: ClientScopeMode;
  canToggleScope: boolean;
  onScopeModeChange: (mode: ClientScopeMode) => void;
}

export default function NavBar({
  clients,
  activeClientIdx,
  onClientChange,
  scopeMode,
  canToggleScope,
  onScopeModeChange,
}: NavBarProps) {
  const router = useRouter();
  const hScrollerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showTasksNav, setShowTasksNav] = useState(false);
  const [showDevConsoleNav, setShowDevConsoleNav] = useState(false);
  const [showFirmSettingsNav, setShowFirmSettingsNav] = useState(false);
  const isAutoScrolling = useRef(false);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const user = loadCurrentUser();
    setShowTasksNav(canShowTasksNav(user));
    setShowDevConsoleNav(canShowDevConsoleNav(user));
    setShowFirmSettingsNav(canShowFirmSettingsNav(user));
  }, []);

  useEffect(() => {
    const container = hScrollerRef.current;
    if (!container) return;

    isAutoScrolling.current = true;
    const items = container.querySelectorAll(".h-item");
    const targetEl = items[activeClientIdx] as HTMLElement;

    if (targetEl) {
      const offset =
        targetEl.offsetLeft -
        container.clientWidth / 2 +
        targetEl.clientWidth / 2;
      container.scrollTo({ left: offset, behavior: "smooth" });
    }

    const t = setTimeout(() => {
      isAutoScrolling.current = false;
    }, 500);
    return () => clearTimeout(t);
  }, [activeClientIdx, clients.length]);

  const handleScroll = useCallback(() => {
    if (isAutoScrolling.current) return;
    const container = hScrollerRef.current;
    if (!container) return;

    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);

    scrollTimeout.current = setTimeout(() => {
      const center = container.scrollLeft + container.clientWidth / 2;
      const items = container.querySelectorAll(".h-item");

      let closestIdx = activeClientIdx;
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

      if (closestIdx !== activeClientIdx) {
        onClientChange(closestIdx);
      }
    }, 100);
  }, [activeClientIdx, onClientChange]);

  const toggleSearch = () => {
    setIsSearchOpen((prev) => !prev);
    if (!isSearchOpen) setTimeout(() => searchInputRef.current?.focus(), 300);
  };

  const scopeButtonClass = (mode: ClientScopeMode) =>
    `rounded-full px-2.5 py-1 transition-colors ${
      scopeMode === mode
        ? "bg-blue-600 text-white"
        : "text-slate-400 hover:text-white"
    }`;

  return (
    <nav className="relative z-30 flex h-[4.5rem] flex-shrink-0 flex-col border-b border-slate-700 bg-slate-900 shadow-xl select-none">
      <div className="absolute bottom-0 left-1/2 z-0 h-full w-[200px] -translate-x-1/2 border-x border-white/10 bg-white/5 pointer-events-none"></div>

      <div
        className={`absolute top-full right-0 w-full max-w-sm bg-slate-800 border-b border-slate-700 p-4 shadow-2xl z-40 rounded-bl-2xl transition-all duration-300 transform ${
          isSearchOpen ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0 pointer-events-none"
        }`}
      >
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3 h-3" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="書類名で検索..."
            className="w-full bg-slate-900 border border-slate-600 text-white text-xs rounded-lg py-2 pl-8 pr-3 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
      </div>

      <div
        ref={hScrollerRef}
        onScroll={handleScroll}
        className="h-drum-scroller no-scrollbar relative z-10 h-full w-full"
      >
        <div className="w-[40vw] flex-shrink-0" />
        {clients.map((client, idx) => (
          <div
            key={client.id}
            onClick={() => onClientChange(idx)}
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
            {client.groupLabels && client.groupLabels.length > 0 && (
              <div className="mt-1 flex max-w-[260px] flex-wrap items-center justify-center gap-1">
                {client.groupLabels.slice(0, 2).map((label, gIdx) => (
                  <span
                    key={`${client.id}-g-${gIdx}`}
                    className="rounded-full border border-blue-400/40 bg-blue-500/15 px-2 py-0.5 text-[9px] font-bold text-blue-200"
                  >
                    {label}
                  </span>
                ))}
                {client.groupLabels.length > 2 && (
                  <span className="text-[9px] text-slate-300">+{client.groupLabels.length - 2}</span>
                )}
              </div>
            )}
          </div>
        ))}
        <div className="w-[40vw] flex-shrink-0" />
      </div>

      <div className="mask-h-left pointer-events-none absolute left-0 top-0 z-20 h-full w-32"></div>
      <div className="mask-h-right pointer-events-none absolute right-0 top-0 z-20 h-full w-32"></div>

      <div className="absolute left-6 top-1/2 z-50 flex -translate-y-1/2 flex-col gap-2">
        <div className="text-xl font-black italic tracking-tighter text-white">
          <span className="text-brand-500">Docu</span>Grid
        </div>
        {canToggleScope && (
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

      <div className="absolute right-4 top-1/2 z-50 -translate-y-1/2 flex items-center gap-2">
        {showDevConsoleNav && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              router.push("/dev");
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-500/30 bg-slate-800 text-amber-300 shadow-lg transition-all hover:text-amber-100"
            title="開発コンソール"
          >
            <Wrench className="h-4 w-4" />
          </button>
        )}
        {showFirmSettingsNav && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              router.push("/settings");
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-slate-800 text-slate-400 shadow-lg transition-all hover:text-white"
            title="事務所設定"
          >
            <Settings className="h-4 w-4" />
          </button>
        )}
        {showTasksNav && (
          <button
            data-tour="tasks-nav"
            onClick={(e) => {
              e.stopPropagation();
              router.push("/tasks");
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-slate-800 text-slate-400 shadow-lg transition-all hover:text-white"
            title="今日やること"
          >
            <ListTodo className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleSearch();
          }}
          className={`flex h-10 w-10 items-center justify-center rounded-full border bg-slate-800 shadow-lg transition-all hover:text-white ${
            isSearchOpen ? "border-blue-500 text-blue-500" : "border-white/10 text-slate-400"
          }`}
        >
          <SearchIcon className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
