"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LayoutDashboard, Pin, PinOff, X } from "lucide-react";
import NavBar from "@/components/NavBar";
import Sidebar from "@/components/Sidebar";
import { AppWorkspaceRail } from "@/features/workspace/AppWorkspaceRail";
import { WorkspaceDmColumn, WorkspaceDmMain } from "@/features/workspace/WorkspaceDmPanel";
import { WorkspacePdfMain } from "@/features/workspace/WorkspacePdfPanel";
import { TaxProgressMain } from "@/features/tax-progress/TaxProgressBoard";
import {
  loadWorkspaceSurface,
  saveWorkspaceSurface,
  isDataWorkspaceSurface,
  isWorkspaceSurfaceId,
  normalizeWorkspaceSurface,
  type WorkspaceSurfaceId,
} from "@/features/workspace/workspace-surface";
import type { DataWorkspaceTabId } from "@/features/client-data/data-workspace-tabs";
import { KARTE_SECTION_TABS } from "@/features/client-data/data-workspace-tabs";
import type { ClientScopeMode, NavClient } from "@/lib/client-nav";
import type { PeriodLists } from "@/lib/fiscal-year-drum";
import type { MatrixViewMode } from "@/lib/matrix-view-mode";
import type { CatalogCategoryFields } from "@/features/docugrid/lib/document-catalog-api";
import { PERIOD_INDEX_PERM, isPermPeriodIndex } from "@/lib/period-nav";
import {
  loadKarteSection,
  saveKarteSection,
} from "@/features/workspace/workspace-surface";
import { PermCrmStrip } from "@/features/crm/PermCrmStrip";
import { usePermCrmUiStore } from "@/features/crm/perm-crm-ui-store";

type Props = {
  viewMode: MatrixViewMode;
  onViewModeToggle: () => void;
  navClients: NavClient[];
  currentClient: NavClient;
  activeClientIdx: number;
  onClientChange: (idx: number) => void;
  docCategories: CatalogCategoryFields[];
  activeDocCategoryIdx: number;
  onDocCategoryChange: (idx: number) => void;
  clientScopeMode: ClientScopeMode;
  canToggleClientScope: boolean;
  onClientScopeModeChange: (mode: ClientScopeMode) => void;
  activeMode: "year" | "month";
  activePeriodIdx: number;
  onPeriodChange: (idx: number) => void;
  onModeSwitch: () => void;
  matrixPeriods?: PeriodLists;
  /** 現在のマトリクス期間キー（PDF 作業枠の保存先に使う） */
  periodKey: string;
  insights?: ReactNode;
  showInsightsToggle?: boolean;
  insightsOpen?: boolean;
  onInsightsOpenChange?: (open: boolean) => void;
  insightsPinned?: boolean;
  onInsightsPinnedChange?: (pinned: boolean) => void;
  children: ReactNode;
  footer?: ReactNode;
  /** マスタ・カルテ等（Doc/PDF/DM と同階層のレール） */
  renderDataWorkspace?: (ctx: {
    activeTab: DataWorkspaceTabId;
    onTabChange: (tab: DataWorkspaceTabId) => void;
  }) => ReactNode;
};

export function MatrixShellLayout({
  viewMode,
  onViewModeToggle,
  navClients,
  currentClient,
  activeClientIdx,
  onClientChange,
  docCategories,
  activeDocCategoryIdx,
  onDocCategoryChange,
  clientScopeMode,
  canToggleClientScope,
  onClientScopeModeChange,
  activeMode,
  activePeriodIdx,
  onPeriodChange,
  onModeSwitch,
  matrixPeriods,
  periodKey,
  insights,
  showInsightsToggle = false,
  insightsOpen = false,
  onInsightsOpenChange,
  insightsPinned = false,
  onInsightsPinnedChange,
  children,
  footer,
  renderDataWorkspace,
}: Props) {
  const drawerOpen = insightsOpen || insightsPinned;
  const [workspace, setWorkspace] = useState<WorkspaceSurfaceId>("doc");
  const [karteSection, setKarteSection] = useState<DataWorkspaceTabId>("karte");
  const permCrmTab = usePermCrmUiStore((s) => s.tab);
  const setPermCrmTab = usePermCrmUiStore((s) => s.setTab);
  const resetPermCrmTab = usePermCrmUiStore((s) => s.reset);

  useEffect(() => {
    setWorkspace(loadWorkspaceSurface());
    setKarteSection(loadKarteSection());
  }, []);

  const showPermCrmStrip =
    workspace === "doc" && isPermPeriodIndex(activePeriodIdx);

  useEffect(() => {
    if (!showPermCrmStrip) resetPermCrmTab();
  }, [showPermCrmStrip, resetPermCrmTab]);

  const selectWorkspace = (id: WorkspaceSurfaceId) => {
    const next = normalizeWorkspaceSurface(id);
    setWorkspace(next);
    saveWorkspaceSurface(next);
    // Doc に戻るとき、万一「データ」index にいたら永続へ（ドラムからデータ行は廃止）
    if (next === "doc" && activePeriodIdx === 0) {
      onPeriodChange(PERIOD_INDEX_PERM);
    }
  };

  const selectKarteSection = (idx: number) => {
    const tab = KARTE_SECTION_TABS[idx];
    if (!tab) return;
    setKarteSection(tab.id);
    saveKarteSection(tab.id);
  };

  useEffect(() => {
    const onSelectWorkspace = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (!id || !isWorkspaceSurfaceId(id)) return;
      selectWorkspace(normalizeWorkspaceSurface(id));
    };
    const onSelectKarteSection = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (!id) return;
      const idx = KARTE_SECTION_TABS.findIndex((t) => t.id === id);
      if (idx < 0) return;
      setWorkspace("karte");
      saveWorkspaceSurface("karte");
      selectKarteSection(idx);
    };
    window.addEventListener("docugrid:select-workspace", onSelectWorkspace);
    window.addEventListener("docugrid:select-karte-section", onSelectKarteSection);
    return () => {
      window.removeEventListener("docugrid:select-workspace", onSelectWorkspace);
      window.removeEventListener("docugrid:select-karte-section", onSelectKarteSection);
    };
    // selectWorkspace closes over activePeriodIdx; re-bind when period changes
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tour events only
  }, [activePeriodIdx, onPeriodChange]);

  const karteSectionIdx = Math.max(
    0,
    KARTE_SECTION_TABS.findIndex((t) => t.id === karteSection),
  );

  const showDm = workspace === "dm";
  const showDocMain = workspace === "doc";
  const showPdfMain = workspace === "pdf";
  const showTaxMain = workspace === "tax";
  const showDataMain = isDataWorkspaceSurface(workspace);
  const showDocSidebar = workspace === "doc" || showDataMain;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-100 font-sans text-slate-600">
      <NavBar
        viewMode={viewMode}
        onViewModeToggle={onViewModeToggle}
        clients={navClients}
        currentClient={currentClient}
        activeClientIdx={activeClientIdx}
        onClientChange={onClientChange}
        docCategories={docCategories}
        activeDocCategoryIdx={activeDocCategoryIdx}
        onDocCategoryChange={onDocCategoryChange}
        scopeMode={clientScopeMode}
        canToggleScope={canToggleClientScope}
        onScopeModeChange={onClientScopeModeChange}
      />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <AppWorkspaceRail active={workspace} onChange={selectWorkspace} />

        {showDocSidebar ? (
          <Sidebar
            viewMode={viewMode}
            activeMode={activeMode}
            activePeriodIdx={activePeriodIdx}
            onPeriodChange={onPeriodChange}
            onModeSwitch={onModeSwitch}
            clients={navClients}
            activeClientIdx={activeClientIdx}
            onClientChange={onClientChange}
            matrixPeriods={matrixPeriods}
            karteSections={showDataMain ? KARTE_SECTION_TABS : undefined}
            activeKarteSectionIdx={karteSectionIdx}
            onKarteSectionChange={showDataMain ? selectKarteSection : undefined}
          />
        ) : null}
        {showDm ? <WorkspaceDmColumn clientId={currentClient.id} /> : null}

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {showPermCrmStrip ? (
            <PermCrmStrip value={permCrmTab} onChange={setPermCrmTab} />
          ) : null}
          <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
              {showDm ? (
                <WorkspaceDmMain
                  clientId={currentClient.id}
                  clientName={currentClient.name}
                />
              ) : null}
              {showPdfMain ? (
                <WorkspacePdfMain clients={navClients} periodKey={periodKey} />
              ) : null}
              {showTaxMain ? <TaxProgressMain /> : null}
              {showDataMain && renderDataWorkspace && isDataWorkspaceSurface(workspace)
                ? renderDataWorkspace({
                    activeTab: karteSection,
                    onTabChange: (tab) => {
                      setKarteSection(tab);
                      saveKarteSection(tab);
                    },
                  })
                : null}
              {showDocMain ? children : null}
            </div>
            {showInsightsToggle && insights && showDocMain ? (
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
            ) : null}
          </div>
        </div>
      </div>
      {footer}
    </div>
  );
}
