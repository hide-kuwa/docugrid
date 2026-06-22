"use client";

import type { ReactNode } from "react";
import { LayoutDashboard, Pin, PinOff, X } from "lucide-react";
import NavBar from "@/components/NavBar";
import Sidebar from "@/components/Sidebar";
import type { ClientScopeMode, NavClient } from "@/lib/client-nav";

type Props = {
  navClients: NavClient[];
  currentClient: NavClient;
  activeClientIdx: number;
  onClientChange: (idx: number) => void;
  clientScopeMode: ClientScopeMode;
  canToggleClientScope: boolean;
  onClientScopeModeChange: (mode: ClientScopeMode) => void;
  activeMode: "year" | "month";
  activePeriodIdx: number;
  onPeriodChange: (idx: number) => void;
  onModeSwitch: () => void;
  insights?: ReactNode;
  showInsightsToggle?: boolean;
  insightsOpen?: boolean;
  onInsightsOpenChange?: (open: boolean) => void;
  insightsPinned?: boolean;
  onInsightsPinnedChange?: (pinned: boolean) => void;
  children: ReactNode;
  footer?: ReactNode;
};

export function MatrixShellLayout({
  navClients,
  currentClient,
  activeClientIdx,
  onClientChange,
  clientScopeMode,
  canToggleClientScope,
  onClientScopeModeChange,
  activeMode,
  activePeriodIdx,
  onPeriodChange,
  onModeSwitch,
  insights,
  showInsightsToggle = false,
  insightsOpen = false,
  onInsightsOpenChange,
  insightsPinned = false,
  onInsightsPinnedChange,
  children,
  footer,
}: Props) {
  const drawerOpen = insightsOpen || insightsPinned;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-100 font-sans text-slate-600">
      <NavBar
        clients={navClients}
        currentClient={currentClient}
        activeClientIdx={activeClientIdx}
        onClientChange={onClientChange}
        scopeMode={clientScopeMode}
        canToggleScope={canToggleClientScope}
        onScopeModeChange={onClientScopeModeChange}
      />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <Sidebar
          activeMode={activeMode}
          activePeriodIdx={activePeriodIdx}
          onPeriodChange={onPeriodChange}
          onModeSwitch={onModeSwitch}
        />
        <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
            {children}
          </div>
          {showInsightsToggle && insights && (
            <>
              {!drawerOpen && (
                <button
                  type="button"
                  onClick={() => onInsightsOpenChange?.(true)}
                  className="absolute right-4 top-4 z-20 flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-700 shadow-md hover:bg-indigo-50"
                  title="インサイトを開く"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  インサイト
                </button>
              )}
              <aside
                className={`absolute right-0 top-0 z-30 flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-300 ${
                  drawerOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
                }`}
                aria-hidden={!drawerOpen}
              >
                <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
                  <span className="text-xs font-black uppercase tracking-widest text-indigo-600">
                    インサイト
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onInsightsPinnedChange?.(!insightsPinned)}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
                      title={insightsPinned ? "ピン留め解除" : "ピン留め"}
                    >
                      {insightsPinned ? (
                        <PinOff className="h-4 w-4" />
                      ) : (
                        <Pin className="h-4 w-4" />
                      )}
                    </button>
                    {!insightsPinned && (
                      <button
                        type="button"
                        onClick={() => onInsightsOpenChange?.(false)}
                        className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
                        title="閉じる"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">{insights}</div>
              </aside>
              {drawerOpen && !insightsPinned && (
                <button
                  type="button"
                  className="absolute inset-0 z-20 bg-slate-900/20"
                  aria-label="インサイトを閉じる"
                  onClick={() => onInsightsOpenChange?.(false)}
                />
              )}
            </>
          )}
        </div>
      </div>
      {footer}
    </div>
  );
}
