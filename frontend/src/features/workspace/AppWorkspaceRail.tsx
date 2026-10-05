"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ClipboardList,
  Construction,
  FileText,
  Files,
  GitBranch,
  LayoutTemplate,
  ListTodo,
  MessageSquare,
  Pin,
  PinOff,
  Search as SearchIcon,
  Settings,
  Wrench,
} from "lucide-react";
import { AuthNavButtons } from "@/components/AuthNavButtons";
import { checkSession, loadCurrentUser } from "@/lib/auth";
import {
  canShowDevConsoleNav,
  canShowFirmSettingsNav,
  canShowPreviewWorkspaceNav,
  canShowTasksNav,
} from "@/lib/nav-policy";
import { DATA_WORKSPACE_TABS } from "@/features/client-data/data-workspace-tabs";
import {
  WORKSPACE_SURFACES,
  type WorkspaceSurfaceId,
} from "@/features/workspace/workspace-surface";
import { HelpAssistFlyout } from "@/features/help/HelpAssistFlyout";

const CORE_ICONS = {
  doc: Files,
  pdf: FileText,
  dm: MessageSquare,
  tax: ClipboardList,
} as const;

const DATA_ICONS = Object.fromEntries(
  DATA_WORKSPACE_TABS.map((tab) => [tab.id, tab.icon]),
) as Record<string, (typeof DATA_WORKSPACE_TABS)[number]["icon"]>;

function surfaceIcon(id: WorkspaceSurfaceId) {
  if (id === "doc" || id === "pdf" || id === "dm" || id === "tax") return CORE_ICONS[id];
  return DATA_ICONS[id] ?? Files;
}

const PIN_KEY = "docugrid.workspaceRailPinned.v1";
const OPEN_MS = 420;
const CLOSE_DELAY_MS = 480;

type Props = {
  active: WorkspaceSurfaceId;
  onChange: (id: WorkspaceSurfaceId) => void;
};

/**
 * Slim hamburger strip stays put; Doc/PDF/DM + utility nav fades/slides over gently on hover.
 */
export function AppWorkspaceRail({ active, onChange }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [onTemplatesPage, setOnTemplatesPage] = useState(false);
  const [onFlowchartPage, setOnFlowchartPage] = useState(false);
  const onSettingsPage = pathname.startsWith("/settings");

  useEffect(() => {
    setOnTemplatesPage(pathname.startsWith("/templates"));
    setOnFlowchartPage(pathname.startsWith("/flowchart"));
  }, [pathname]);
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpAssistOpen, setHelpAssistOpen] = useState(false);
  const [previewMenuOpen, setPreviewMenuOpen] = useState(false);
  const [showTasksNav, setShowTasksNav] = useState(false);
  const [showDevConsoleNav, setShowDevConsoleNav] = useState(false);
  const [showFirmSettingsNav, setShowFirmSettingsNav] = useState(false);
  const [showPreviewWorkspaceNav, setShowPreviewWorkspaceNav] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      setPinned(window.localStorage.getItem(PIN_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const pin = () => {
      setPinned(true);
      setHovered(true);
      try {
        window.localStorage.setItem(PIN_KEY, "1");
      } catch {
        /* ignore */
      }
    };
    const open = () => {
      setHovered(true);
    };
    window.addEventListener("docugrid:pin-workspace-rail", pin);
    window.addEventListener("docugrid:open-workspace-rail", open);
    return () => {
      window.removeEventListener("docugrid:pin-workspace-rail", pin);
      window.removeEventListener("docugrid:open-workspace-rail", open);
    };
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      // Wait for /auth/me sync so stale localStorage permissions do not flash nav.
      await checkSession();
      if (!active) return;
      const user = loadCurrentUser();
      setShowTasksNav(canShowTasksNav(user));
      setShowDevConsoleNav(canShowDevConsoleNav(user));
      setShowFirmSettingsNav(canShowFirmSettingsNav(user));
      setShowPreviewWorkspaceNav(canShowPreviewWorkspaceNav(user));
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const t = setTimeout(() => searchInputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [searchOpen]);

  const open = hovered || pinned || searchOpen || helpAssistOpen || previewMenuOpen;

  const clearCloseTimer = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const handleEnter = () => {
    clearCloseTimer();
    setHovered(true);
  };

  const handleLeave = () => {
    if (searchOpen || helpAssistOpen || previewMenuOpen || pinned) return;
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setHovered(false), CLOSE_DELAY_MS);
  };

  const togglePin = () => {
    setPinned((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(PIN_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      if (next) setHovered(true);
      return next;
    });
  };

  const go = (href: string) => {
    router.push(href);
    setPreviewMenuOpen(false);
    if (!pinned) setHovered(false);
  };

  const selectSurface = (id: WorkspaceSurfaceId) => {
    onChange(id);
    setPreviewMenuOpen(false);
    if (!pinned) setHovered(false);
  };

  const onPreviewPage =
    onTemplatesPage ||
    onFlowchartPage ||
    pathname.startsWith("/tasks") ||
    active === "dm" ||
    active === "tax";

  const ActiveIcon = surfaceIcon(active);
  const activeLabel = WORKSPACE_SURFACES.find((s) => s.id === active)?.shortLabel ?? "";

  const utilBtn = (opts: {
    title: string;
    active?: boolean;
    activeClass?: string;
    onClick: () => void;
    children: ReactNode;
    label: string;
    dataTour?: string;
  }) => (
    <button
      type="button"
      title={opts.title}
      data-tour={opts.dataTour}
      onClick={opts.onClick}
      className={[
        "flex w-11 flex-col items-center gap-0.5 rounded-xl px-1 py-2 transition-colors duration-300",
        opts.active
          ? opts.activeClass ?? "bg-slate-800 text-white"
          : "text-slate-400 hover:bg-slate-900 hover:text-slate-200",
      ].join(" ")}
    >
      {opts.children}
      <span className="text-[9px] font-bold leading-none">{opts.label}</span>
    </button>
  );

  return (
    <div
      className="relative z-40 flex h-full w-10 shrink-0"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocusCapture={handleEnter}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          handleLeave();
        }
      }}
    >
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-slate-950/40 md:hidden"
          aria-label="メニューを閉じる"
          onClick={() => {
            if (!pinned) setHovered(false);
            setSearchOpen(false);
          }}
        />
      ) : null}
      <div className="relative z-40 flex h-full w-10 flex-col items-center border-r border-slate-800 bg-slate-950 py-2">
        <button
          type="button"
          className="absolute inset-0 z-10 md:hidden"
          aria-label={open ? "メニューを閉じる" : "メニューを開く"}
          aria-expanded={open}
          onClick={() => {
            clearCloseTimer();
            setHovered((prev) => !prev);
          }}
        />
        <div
          className={[
            "pointer-events-none mt-2 flex flex-col items-center gap-1 transition-opacity duration-500",
            open ? "opacity-0" : "opacity-100",
          ].join(" ")}
          aria-hidden={open}
        >
          <ActiveIcon className="h-4 w-4 text-slate-500" />
          <span className="text-[8px] font-bold uppercase tracking-wide text-slate-500">
            {activeLabel}
          </span>
        </div>
      </div>

      <nav
        aria-label="ワークスペース"
        aria-hidden={!open}
        className={[
          "absolute left-0 top-0 z-40 flex h-full w-[3.5rem] flex-col items-center border-r border-slate-800 bg-slate-950/98 py-3 shadow-[8px_0_24px_rgba(0,0,0,0.25)] backdrop-blur-[2px]",
          "transition-[opacity,transform] ease-[cubic-bezier(0.22,1,0.36,1)]",
          open
            ? "pointer-events-auto translate-x-0 opacity-100"
            : "pointer-events-none -translate-x-1 opacity-0",
        ].join(" ")}
        style={{ transitionDuration: `${OPEN_MS}ms` }}
      >
        <button
          type="button"
          onClick={togglePin}
          title={pinned ? "固定を解除" : "開いたままにする"}
          aria-pressed={pinned}
          className={[
            "mb-2 rounded-lg p-1.5 transition-colors duration-300",
            pinned
              ? "bg-teal-600/25 text-teal-300"
              : "text-slate-400 hover:bg-slate-800 hover:text-white",
          ].join(" ")}
        >
          {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
        </button>

        <div className="mb-1 px-1 text-center text-[8px] font-black uppercase tracking-[0.2em] text-slate-500">
          DG
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto no-scrollbar">
          {WORKSPACE_SURFACES.filter(
            (s) => s.group === "core" && (s.id === "doc" || s.id === "pdf"),
          ).map((surface) => {
            const Icon = surfaceIcon(surface.id);
            const isActive = active === surface.id;
            const planned = surface.status === "planned";
            return (
              <button
                key={surface.id}
                type="button"
                title={`${surface.label} — ${surface.description}`}
                aria-current={isActive ? "page" : undefined}
                data-tour={`workspace-${surface.id}`}
                onClick={() => selectSurface(surface.id)}
                className={[
                  "group relative flex w-11 shrink-0 flex-col items-center gap-0.5 rounded-xl px-1 py-2 transition-colors duration-300",
                  isActive
                    ? "bg-slate-800 text-white shadow-inner"
                    : "text-slate-400 hover:bg-slate-900 hover:text-slate-200",
                ].join(" ")}
              >
                {isActive ? (
                  <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r bg-teal-400" />
                ) : null}
                <Icon className="h-5 w-5" strokeWidth={isActive ? 2.25 : 1.75} />
                <span className="text-[9px] font-bold leading-none">{surface.shortLabel}</span>
                {planned ? (
                  <span className="rounded bg-amber-500/20 px-1 text-[7px] font-bold uppercase tracking-wide text-amber-300">
                    工事中
                  </span>
                ) : null}
              </button>
            );
          })}

          <div className="my-1 h-px w-8 shrink-0 bg-slate-800" />
          <div className="px-1 text-center text-[7px] font-black uppercase tracking-widest text-slate-600">
            Data
          </div>

          {WORKSPACE_SURFACES.filter((s) => s.group === "data").map((surface) => {
            const Icon = surfaceIcon(surface.id);
            const isActive = active === surface.id;
            return (
              <button
                key={surface.id}
                type="button"
                title={`${surface.label} — ${surface.description}`}
                aria-current={isActive ? "page" : undefined}
                data-tour={`workspace-${surface.id}`}
                onClick={() => selectSurface(surface.id)}
                className={[
                  "group relative flex w-11 shrink-0 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition-colors duration-300",
                  isActive
                    ? "bg-violet-950/80 text-violet-100 shadow-inner ring-1 ring-violet-500/40"
                    : "text-slate-400 hover:bg-slate-900 hover:text-slate-200",
                ].join(" ")}
              >
                {isActive ? (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-violet-400" />
                ) : null}
                <Icon className="h-4 w-4" strokeWidth={isActive ? 2.25 : 1.75} />
                <span className="max-w-[2.75rem] truncate text-[8px] font-bold leading-none">
                  {surface.shortLabel}
                </span>
              </button>
            );
          })}
        </div>

        <div className="my-2 h-px w-8 shrink-0 bg-slate-800" />

        <div className="flex shrink-0 flex-col items-center gap-0.5">
          <HelpAssistFlyout onOpenChange={setHelpAssistOpen} />
          {showDevConsoleNav
            ? utilBtn({
                title: "開発コンソール",
                label: "開発",
                active: pathname.startsWith("/dev"),
                activeClass: "bg-amber-950/50 text-amber-300 ring-1 ring-amber-500/40",
                onClick: () => go("/dev"),
                children: <Wrench className="h-4 w-4" />,
              })
            : null}
          <div className="relative">
            {utilBtn({
              title: "開発中の画面",
              label: "開発中",
              active: onPreviewPage || previewMenuOpen,
              activeClass: "bg-amber-950/40 text-amber-200 ring-1 ring-amber-500/35",
              onClick: () => setPreviewMenuOpen((v) => !v),
              children: <Construction className="h-4 w-4" />,
            })}
            {previewMenuOpen ? (
              <div
                className="absolute bottom-0 left-[3.25rem] z-50 w-40 rounded-xl border border-slate-700 bg-slate-900 p-1.5 shadow-2xl"
                onMouseEnter={handleEnter}
              >
                <p className="px-2 pb-1 pt-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  開発中
                </p>
                <button
                  type="button"
                  data-tour="workspace-dm"
                  onClick={() => selectSurface("dm")}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] font-bold transition-colors ${
                    active === "dm"
                      ? "bg-slate-800 text-white"
                      : "text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                  DM
                </button>
                <button
                  type="button"
                  data-tour="workspace-tax"
                  onClick={() => selectSurface("tax")}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] font-bold transition-colors ${
                    active === "tax"
                      ? "bg-slate-800 text-white"
                      : "text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  <ClipboardList className="h-3.5 w-3.5 shrink-0" />
                  Tax
                </button>
                {showPreviewWorkspaceNav ? (
                  <button
                    type="button"
                    onClick={() => go("/templates")}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] font-bold transition-colors ${
                      onTemplatesPage
                        ? "bg-indigo-950/60 text-indigo-200"
                        : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    <LayoutTemplate className="h-3.5 w-3.5 shrink-0" />
                    ひな形
                  </button>
                ) : null}
                {showPreviewWorkspaceNav ? (
                  <button
                    type="button"
                    onClick={() => go("/flowchart")}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] font-bold transition-colors ${
                      onFlowchartPage
                        ? "bg-violet-950/60 text-violet-200"
                        : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    <GitBranch className="h-3.5 w-3.5 shrink-0" />
                    判定
                  </button>
                ) : null}
                {showTasksNav ? (
                  <button
                    type="button"
                    data-tour="tasks-nav"
                    onClick={() => go("/tasks")}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] font-bold transition-colors ${
                      pathname.startsWith("/tasks")
                        ? "bg-slate-800 text-white"
                        : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    <ListTodo className="h-3.5 w-3.5 shrink-0" />
                    タスク
                  </button>
                ) : null}
                <button
                  type="button"
                  className="mt-0.5 w-full rounded-lg px-2 py-1 text-right text-[9px] font-bold text-slate-500 hover:text-slate-300"
                  onClick={() => setPreviewMenuOpen(false)}
                >
                  閉じる
                </button>
              </div>
            ) : null}
          </div>
          {showFirmSettingsNav
            ? utilBtn({
                title: "事務所設定",
                label: "設定",
                active: onSettingsPage,
                activeClass: "bg-slate-800 text-white ring-1 ring-slate-500",
                onClick: () => go("/settings"),
                children: <Settings className="h-4 w-4" />,
              })
            : null}
          {utilBtn({
            title: "検索",
            label: "検索",
            active: searchOpen,
            activeClass: "bg-blue-950/60 text-blue-300 ring-1 ring-blue-500/50",
            onClick: () => setSearchOpen((v) => !v),
            children: <SearchIcon className="h-4 w-4" />,
          })}
        </div>

        <div className="mt-auto w-full px-1 pt-2">
          <AuthNavButtons variant="sidebar" />
        </div>
      </nav>

      {searchOpen ? (
        <div
          className="absolute left-[3.5rem] top-24 z-50 w-[min(16rem,calc(100vw-4rem))] rounded-r-xl border border-slate-700 border-l-0 bg-slate-900 p-3 shadow-2xl"
          onMouseEnter={handleEnter}
        >
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="書類名で検索..."
              className="w-full rounded-lg border border-slate-600 bg-slate-950 py-2 pl-8 pr-3 text-xs text-white focus:border-blue-500 focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Escape") setSearchOpen(false);
              }}
            />
          </div>
          <button
            type="button"
            className="mt-2 w-full text-right text-[10px] font-bold text-slate-500 hover:text-slate-300"
            onClick={() => setSearchOpen(false)}
          >
            閉じる
          </button>
        </div>
      ) : null}
    </div>
  );
}
