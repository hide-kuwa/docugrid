"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { UploadStatus } from "@/features/pdf-viewer/types";
import { useViewerUiStore } from "@/features/pdf-viewer/state/viewer-ui-store";
import { useAutoVouchBridgeStore } from "@/features/pdf-viewer/state/auto-vouch-bridge-store";
import { useOrgDirectory } from "@/features/org/useOrgDirectory";
import { API_ENDPOINTS } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";
import { hasPermission } from "@/lib/authorization";
import { resolvePersonaId } from "@/lib/persona";
import { MatrixShellLayout } from "@/features/matrix/MatrixShellLayout";
import { MatrixPeriodContent } from "@/features/matrix/MatrixPeriodContent";
import { useMatrixPeriodContentProps } from "@/features/matrix/hooks/useMatrixPeriodContentProps";
import { MatrixViewerHost } from "@/features/matrix/MatrixViewerHost";
import { useMatrixShellState } from "@/features/matrix/hooks/useMatrixShellState";
import { useMatrixAuthBootstrap } from "@/features/matrix/hooks/useMatrixAuthBootstrap";
import { useMatrixSlotLayout } from "@/features/matrix/hooks/useMatrixSlotLayout";
import { useMatrixClientStatus } from "@/features/matrix/hooks/useMatrixClientStatus";
import { useMatrixViewerSession } from "@/features/matrix/hooks/useMatrixViewerSession";
import { useMatrixActiveSlotMeta } from "@/features/matrix/hooks/useMatrixActiveSlotMeta";
import { useMatrixPdfOperations } from "@/features/matrix/hooks/useMatrixPdfOperations";
import { useMatrixRelatedDocuments } from "@/features/matrix/hooks/useMatrixRelatedDocuments";
import { useSlotDocuments } from "@/features/matrix/hooks/useSlotDocuments";
import { useSlotClassify } from "@/features/matrix/hooks/useSlotClassify";
import { DataWorkspace, profileFillPercent } from "@/features/client-data/DataWorkspace";
import { hasInsightsPanel, InsightsPanel } from "@/features/matrix/InsightsPanel";
import { FeatureTourHost } from "@/features/onboarding/FeatureTourHost";
import { WorkAssistantFab } from "@/features/assistant/WorkAssistantFab";
import { BillingGatePanel } from "@/features/billing/BillingGatePanel";
import { parseSlotKey } from "@/features/docugrid/lib/slot-scope";
import { useDocugridAutoSync } from "@/features/docugrid/hooks/useDocugridAutoSync";
import { useSyncDocugrid } from "@/features/docugrid/hooks/useSyncDocugrid";
import { useDocugridStore } from "@/features/docugrid/state/docugrid-store";
import {
  classifyDocument,
  toClassifyPersistMetadata,
} from "@/features/docugrid/lib/classify";
import { classifyCandidates } from "@/lib/slot-ids";
import { slotIdAtIndex, slotIndexFromLayoutSlotId } from "@/lib/slot-layout-ops";
import { isDataPeriodIndex, isPermPeriodIndex } from "@/lib/period-nav";
import { defaultYearPeriodIndex } from "@/lib/fiscal-year-drum";
import type { ExtractionReviewPayload } from "@/features/client-data/lib/extraction-api";

export function MatrixHomePage() {
  const { authChecked, currentUser, billingMe, reloadBilling } =
    useMatrixAuthBootstrap();

  const [file, setFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [viewerSession, setViewerSession] = useState(0);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [isLoading, setIsLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [statusNonce, setStatusNonce] = useState(0);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [insightsPinned, setInsightsPinned] = useState(false);
  const [extractionReviewCtx, setExtractionReviewCtx] = useState<{
    periodKey: string;
    slotId: string;
    slotLabel: string;
    review: ExtractionReviewPayload;
  } | null>(null);

  const viewerMode = useViewerUiStore((s) => s.mode);
  const pdfWorkspaceBind = useViewerUiStore((s) => s.pdfWorkspaceBind);
  const docugridPageCount = useDocugridStore((s) => s.pageOrder.length);

  const { clients: orgClients, groups: orgGroups, loaded: orgClientsLoaded } = useOrgDirectory();
  const canViewDocument = hasPermission(currentUser, "document.view");
  const canUseWorkAssistant =
    Boolean(currentUser) &&
    (canViewDocument || hasPermission(currentUser, "dashboard.view"));

  const shell = useMatrixShellState({
    currentUser,
    orgClients,
    orgGroups,
    authChecked,
    canViewDocument,
    statusNonce,
  });
  const {
    activeClientIdx,
    setActiveClientIdx,
    clientScopeMode,
    onClientScopeModeChange,
    activeMode,
    setActiveMode,
    activePeriodIdx,
    setActivePeriodIdx,
    matrixViewMode,
    toggleMatrixViewMode,
    docCategories,
    activeDocCategoryIdx,
    setActiveDocCategoryIdx,
    activeDocCategory,
    docHistoryItems,
    docHistoryLoading,
    oldArchiveItems,
    oldArchiveLoading,
    yearDrumMeta,
    matrixPeriods,
    periodKey,
    karteDefaultPeriodKey,
    navClients,
    allNavClients,
    currentClient,
    canToggleScope,
    assignedClientIds,
    assignedClientIdSet,
    allVisibleClientIds,
    onJumpToPeriod,
    onYearMonthModeSwitch,
  } = shell;

  const canUploadDocument = hasPermission(currentUser, "document.upload");
  const canPurgeDocument = hasPermission(currentUser, "document.purge");
  const isClientPortalUser = currentUser?.appRoleId === "client_uploader";
  const canShareWithClient = canUploadDocument && !isClientPortalUser;
  const canAnnotateDocument = hasPermission(currentUser, "document.annotate");
  const canApproveAudit = hasPermission(currentUser, "audit.approve");
  const canEditClientData = hasPermission(currentUser, "settings.manage");
  const personaId = resolvePersonaId(currentUser);
  const showInsights = hasInsightsPanel(personaId);

  const slotLayout = useMatrixSlotLayout({
    currentClientId: currentClient.id,
    periodKey,
    activePeriodIdx,
    activeMode,
    navClients,
    assignedClientIds,
    allVisibleClientIds,
  });

  const assignPreviewFromFile = useCallback((source: File) => {
    const next = URL.createObjectURL(source);
    setPdfUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return next;
    });
  }, []);

  const uploadFile = useCallback(
    async (selectedFile: File): Promise<{ ok: boolean; pageCount: number | null }> => {
      if (!canUploadDocument) {
        alert("アップロード権限がありません。");
        return { ok: false, pageCount: null };
      }
      setUploadStatus("uploading");
      setIsLoading(true);
      try {
        const formData = new FormData();
        formData.append("file", selectedFile);
        const response = await authFetch(API_ENDPOINTS.UPLOAD, {
          method: "POST",
          body: formData,
          headers: buildAuthHeaders(
            currentClient.id !== "unknown" ? currentClient.id : undefined,
          ),
        });
        if (!response.ok) throw new Error("Upload failed");
        const data = await response.json();
        const count = data.page_count ?? data.pageCount;
        const n = typeof count === "number" ? count : null;
        setUploadStatus("success");
        return { ok: true, pageCount: n };
      } catch (error) {
        console.error("Upload Error:", error);
        setUploadStatus("error");
        return { ok: false, pageCount: null };
      } finally {
        setIsLoading(false);
      }
    },
    [canUploadDocument, currentClient.id],
  );

  const { loadFromCloud } = useSyncDocugrid();

  const slots = useSlotDocuments({
    clientId: currentClient.id,
    periodKey,
    canViewDocument,
    canUploadDocument,
    canPurgeDocument,
    canShareWithClient,
    currentSlotLayout: slotLayout.currentSlotLayout,
    slotKeyFor: slotLayout.slotKeyFor,
    slotLabels: slotLayout.slotLabels,
    applySlotLayout: slotLayout.applySlotLayout,
    uploadFile,
    assignPreviewFromFile,
    loadFromCloud,
    setFile,
    setPdfUrl,
    setPageCount,
    setViewerSession,
    setExtractionReviewCtx,
    statusNonce,
    setStatusNonce,
  });
  const {
    slotDocs,
    setSlotDocs,
    unassignedDocs,
    deletedDocs,
    activeSlotKey,
    setActiveSlotKey,
    isHydratingSlots,
    slotNotice,
    setSlotNotice,
    clientSlotCatalog,
    activateDoc,
    handleClearSlot,
    handleSoftDeleteDocument,
    handlePurgeDocument,
    handleRestoreDocument,
    handleShareWithClient,
    handleUnshareWithClient,
    handleRemoveSlot,
    handleAddCustomSlot,
    handleAddPresetSlots,
    persistFileToSlot,
    handleOpenUnassigned,
    handleOpenDeleted,
    handleAssignUnassigned,
    handleRelocateDocument,
    onOpenSlot,
    onOpenSlotForAudit,
  } = slots;

  const viewer = useMatrixViewerSession({
    file,
    setFile,
    pdfUrl,
    setPdfUrl,
    assignPreviewFromFile,
    pageCount,
    setViewerSession,
    setViewerError,
    activeSlotKey,
    setActiveSlotKey,
    slotDocs,
    setSlotDocs,
    currentClientId: currentClient.id,
    periodKey,
    navClients,
    setActiveClientIdx,
    pdfWorkspaceBind,
  });

  const activeSlot = useMatrixActiveSlotMeta({
    activeSlotKey,
    setActiveSlotKey,
    periodKey,
    slotLabels: slotLayout.slotLabels,
    slotDocs,
    unassignedDocs,
    deletedDocs,
    currentClientId: currentClient.id,
    pdfWorkspaceBind,
    setSlotDocs,
    setFile,
    assignPreviewFromFile,
    setPdfUrl,
    setViewerSession,
    setStatusNonce,
  });

  const pdfOps = useMatrixPdfOperations({
    file,
    setFile,
    assignPreviewFromFile,
    rememberWorkingFile: viewer.rememberWorkingFile,
    setIsLoading,
    setViewerError,
    setViewerSession,
    setStatusNonce,
    setPageCount,
    scopedAuthHeaders: viewer.scopedAuthHeaders,
    canAnnotateDocument,
    activeSlotKey,
    periodKey,
    slotLabels: slotLayout.slotLabels,
    setSlotDocs,
    onVersionCreated: activeSlot.onVersionCreated,
  });

  const related = useMatrixRelatedDocuments({
    authChecked,
    currentUser,
    canViewDocument,
    currentClientId: currentClient.id,
    periodKey,
    slotDocs,
    activeSlotKey,
    isHydratingSlots,
    matrixPeriods,
    currentClient,
    allNavClients,
    assignedClientIds,
    assignedClientIdSet,
    allVisibleClientIds,
    canToggleScope,
    clientScopeMode,
    setActiveClientIdx,
    onClientScopeModeChange,
    setActiveMode,
    setActivePeriodIdx,
    activateDoc,
    setSlotNotice,
  });

  const classify = useSlotClassify({
    canUploadDocument,
    canViewDocument,
    currentClientId: currentClient.id,
    periodKey,
    slotLabels: slotLayout.slotLabels,
    layoutSlotIds: slotLayout.layoutSlotIds,
    currentSlotLayout: slotLayout.currentSlotLayout,
    slotDocs,
    slotKeyFor: slotLayout.slotKeyFor,
    persistFileToSlot,
    activateDoc,
    setSlotNotice,
    setIsLoading,
    setUploadStatus,
  });

  const { docStatus, timelineEvents, timelineLoading } = useMatrixClientStatus(
    canViewDocument,
    currentClient.id,
    periodKey,
    statusNonce,
  );

  useEffect(() => {
    useAutoVouchBridgeStore.getState().resetAuditSession();
  }, [currentClient.id]);

  const currentOrgClient = useMemo(
    () => orgClients.find((c) => c.id === currentClient.id) ?? null,
    [orgClients, currentClient.id],
  );

  const onDocugridSaved = useCallback(
    (documentId: string) => {
      if (!activeSlotKey) return;
      setSlotDocs((prev) => {
        const cur = prev[activeSlotKey];
        if (!cur) return prev;
        return { ...prev, [activeSlotKey]: { ...cur, docugridDocumentId: documentId } };
      });
    },
    [activeSlotKey, setSlotDocs],
  );

  const activeDocugridScope = useMemo(() => {
    if (!activeSlotKey) return null;
    return parseSlotKey(activeSlotKey);
  }, [activeSlotKey]);

  const { saveNow: saveDocugridNow } = useDocugridAutoSync(activeDocugridScope, {
    enabled: canAnnotateDocument,
    onSaved: onDocugridSaved,
  });

  const unassignedDocsView = useMemo(
    () =>
      Object.values(unassignedDocs).map((d) => ({
        docId: d.docId,
        label: d.label,
        fileName: d.file.name,
      })),
    [unassignedDocs],
  );

  const deletedDocsView = useMemo(
    () =>
      Object.values(deletedDocs).map((d) => ({
        docId: d.docId,
        label: d.deletedFromSlotLabel ?? d.label,
        fileName: d.file.name,
      })),
    [deletedDocs],
  );

  const onAssignPackageToSlot = useCallback(
    async (pkgFile: File, slotId: string, label: string) => {
      const slotIndex = slotIndexFromLayoutSlotId(
        slotLayout.currentSlotLayout,
        periodKey,
        slotId,
      );
      if (!Number.isInteger(slotIndex) || slotIndex < 0) {
        setSlotNotice(`スロット「${label}」への配置に失敗しました。`);
        return;
      }
      let classifyMeta;
      try {
        const candidates = classifyCandidates(
          periodKey,
          slotLayout.slotLabels,
          slotLayout.layoutSlotIds,
        );
        const result = await classifyDocument(pkgFile, candidates, currentClient.id, {
          periodKey,
          slotId,
        });
        classifyMeta = toClassifyPersistMetadata(result);
      } catch {
        /* 分類失敗時もスロット保存は続行 */
      }
      await persistFileToSlot(
        pkgFile,
        slotIndex,
        slotLayout.slotLabels[slotIndex] ?? label,
        false,
        classifyMeta,
      );
      setSlotNotice(`「${slotLayout.slotLabels[slotIndex] ?? label}」に配置しました。`);
    },
    [periodKey, slotLayout, persistFileToSlot, currentClient.id, setSlotNotice],
  );

  const slotCount = slotLayout.slotLabels.length;

  const assistantExpectedSlots = useMemo(
    () =>
      slotLayout.slotLabels.map((label, idx) => ({
        slotId: slotIdAtIndex(slotLayout.currentSlotLayout, periodKey, idx),
        label,
      })),
    [slotLayout.slotLabels, slotLayout.currentSlotLayout, periodKey],
  );
  const filledInView = Array.from({ length: slotCount }, (_, i) =>
    slotLayout.slotKeyFor(i),
  ).filter((k) => slotDocs[k]).length;
  const progressPercent = isDataPeriodIndex(activePeriodIdx)
    ? currentOrgClient
      ? profileFillPercent(currentOrgClient)
      : 0
    : isPermPeriodIndex(activePeriodIdx)
      ? 100
      : slotCount > 0
        ? Math.round((filledInView / slotCount) * 100)
        : 0;

  const periodContentProps = useMatrixPeriodContentProps({
    matrixViewMode,
    activePeriodIdx,
    periodKey,
    activeMode,
    currentClient,
    navClients,
    docHistoryItems,
    docHistoryLoading,
    activeDocCategoryLabel: activeDocCategory?.label,
    oldArchiveItems,
    oldArchiveLoading,
    matrixPeriods,
    yearDrumMeta,
    extractionReviewCtx,
    setExtractionReviewCtx,
    setStatusNonce,
    slotLayout,
    canUploadDocument,
    canPurgeDocument,
    canShareWithClient,
    canViewDocument,
    canApproveAudit,
    slotDocs,
    slotNotice,
    setSlotNotice,
    handleClearSlot,
    handleRemoveSlot,
    handleAddCustomSlot,
    handleAddPresetSlots,
    unassignedDocsView,
    handleOpenUnassigned,
    handleAssignUnassigned,
    handleRelocateDocument,
    handleSoftDeleteDocument,
    deletedDocsView,
    handleOpenDeleted,
    handleRestoreDocument,
    handlePurgeDocument,
    progressPercent,
    onOpenSlot,
    onOpenSlotForAudit,
    relatedClients: related.relatedClients,
    onSelectRelatedClient: related.onSelectRelatedClient,
    classify,
    docStatus,
    onJumpToPeriod,
    saveDocugridNow,
    onPdfExported: pdfOps.logExportPdfReview,
    timelineEvents,
    timelineLoading,
    onAssignPackageToSlot,
    persistFileToSlot,
    onPeriodChange: setActivePeriodIdx,
  });

  if (!authChecked) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-slate-100 text-slate-500">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600"
          aria-hidden
        />
        <p className="text-sm font-medium">読み込み中…</p>
      </div>
    );
  }

  if (billingMe?.requiresAttention) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-100">
        <BillingGatePanel
          billing={billingMe}
          user={currentUser}
          onRefresh={() => void reloadBilling()}
        />
      </div>
    );
  }

  return (
    <>
      <MatrixShellLayout
        viewMode={matrixViewMode}
        onViewModeToggle={toggleMatrixViewMode}
        navClients={navClients}
        currentClient={currentClient}
        activeClientIdx={activeClientIdx}
        onClientChange={setActiveClientIdx}
        docCategories={docCategories}
        activeDocCategoryIdx={activeDocCategoryIdx}
        onDocCategoryChange={setActiveDocCategoryIdx}
        clientScopeMode={clientScopeMode}
        canToggleClientScope={canToggleScope}
        onClientScopeModeChange={onClientScopeModeChange}
        clientsLoaded={orgClientsLoaded}
        firmLabel={currentUser?.firmLabel}
        userName={currentUser?.name}
        activeMode={activeMode}
        activePeriodIdx={activePeriodIdx}
        onPeriodChange={setActivePeriodIdx}
        onModeSwitch={onYearMonthModeSwitch}
        matrixPeriods={matrixPeriods}
        periodKey={periodKey}
        onGoHome={() => {
          setActiveClientIdx(0);
          setActiveMode("year");
          setActivePeriodIdx(
            defaultYearPeriodIndex(
              yearDrumMeta,
              new Date(),
              navClients[0]?.fiscal ?? currentClient.fiscal,
              navClients[0]?.category ?? currentClient.category,
            ),
          );
          window.dispatchEvent(
            new CustomEvent("docugrid:select-workspace", { detail: { id: "doc" } }),
          );
        }}
        renderDataWorkspace={({ activeTab, onTabChange }) =>
          currentOrgClient ? (
            <DataWorkspace
              client={currentOrgClient}
              canEdit={canEditClientData}
              editor={
                canEditClientData && currentUser
                  ? {
                      email: currentUser.email,
                      name: currentUser.name,
                      stakeholderId: currentUser.stakeholderId,
                    }
                  : undefined
              }
              filledSlotKeys={clientSlotCatalog}
              onOpenRelatedDocument={related.onOpenRelatedDocument}
              onOpenMetricVouch={related.onOpenMetricVouch}
              docStatus={docStatus}
              docStatusLoading={!docStatus && canViewDocument}
              defaultPeriodKey={karteDefaultPeriodKey}
              activeTab={activeTab}
              onTabChange={onTabChange}
              hideTabDrum
              onSelectRelatedClient={related.onSelectRelatedClient}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-12 text-sm text-slate-500">
              顧客データを読み込み中…
            </div>
          )
        }
        showInsightsToggle={showInsights}
        insightsOpen={insightsOpen}
        onInsightsOpenChange={setInsightsOpen}
        insightsPinned={insightsPinned}
        onInsightsPinnedChange={setInsightsPinned}
        insights={
          showInsights ? (
            <InsightsPanel
              personaId={personaId}
              user={currentUser}
              onSelectClient={(clientId) => {
                related.onSelectRelatedClient(clientId);
                setInsightsOpen(false);
              }}
            />
          ) : undefined
        }
        footer={
          isHydratingSlots ? (
            <div className="pointer-events-none fixed bottom-4 left-4 z-20 flex items-center gap-2 rounded-full bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              保存済みの資料を復元中…
            </div>
          ) : null
        }
      >
        <MatrixPeriodContent {...periodContentProps} />
      </MatrixShellLayout>
      <FeatureTourHost
        user={currentUser}
        triggerTourId={classify.tourTriggerId}
        onTriggerConsumed={classify.clearTourTrigger}
      />
      <WorkAssistantFab
        enabled={canUseWorkAssistant}
        clientId={currentClient.id !== "unknown" ? currentClient.id : null}
        clientLabel={currentClient.name || currentClient.id}
        periodKey={periodKey}
        expectedSlots={assistantExpectedSlots}
      />
      <MatrixViewerHost
        isOpen={viewer.isViewerOpen}
        onClose={viewer.closeViewer}
        viewerMode={viewerMode}
        file={file!}
        pdfUrl={pdfUrl}
        viewerSession={viewerSession}
        pageCount={pageCount}
        uploadStatus={uploadStatus}
        isLoading={isLoading}
        operationError={viewerError}
        onDismissOperationError={() => setViewerError(null)}
        canAnnotate={canAnnotateDocument}
        canApprove={canApproveAudit}
        syncWithDocugrid={docugridPageCount > 0}
        slotIdentity={activeSlot.slotIdentity}
        slotLabel={activeSlot.activeSlotLabel}
        slotWorkflowStatus={activeSlot.activeSlotWorkflowStatus}
        persistedDocId={activeSlot.activePersistedDocId}
        activeSlotKey={activeSlotKey}
        activeClientSharedAt={activeSlot.activeClientSharedAt}
        canUploadDocument={canUploadDocument}
        canPurgeDocument={canPurgeDocument}
        canShareWithClient={canShareWithClient}
        classifyMeta={activeSlot.activeClassifyMeta}
        clientProfile={currentOrgClient?.profile}
        clientProfileMeta={currentOrgClient?.profileMeta}
        historyRevision={statusNonce}
        onHighlight={pdfOps.handleHighlight}
        onReorder={pdfOps.handleReorder}
        onMerge={pdfOps.handleMerge}
        onGetThumbnails={pdfOps.handleGetThumbnails}
        onRenderPage={pdfOps.handleRenderPage}
        onReplaceFile={pdfOps.handleReplaceFile}
        onVersionCreated={activeSlot.onVersionCreated}
        onVersionDeleted={activeSlot.onVersionDeleted}
        onAuditStateChange={activeSlot.onAuditStateChange}
        onSoftDeleteDocument={handleSoftDeleteDocument}
        onPurgeDocument={handlePurgeDocument}
        onRestoreDocument={handleRestoreDocument}
        onShareWithClient={handleShareWithClient}
        onUnshareWithClient={handleUnshareWithClient}
      />
    </>
  );
}
