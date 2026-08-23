"use client";

import { AuditLinksRail } from "./components/AuditLinksRail";
import { AuditSplitToolbar } from "./components/AuditSplitToolbar";
import { AutoVouchPanel } from "./components/AutoVouchPanel";
import { AuditSplitPane } from "./components/AuditSplitPane";
import { ClientSlotDocsRail } from "./components/ClientSlotDocsRail";
import { AuditWorkflowGuide } from "./components/AuditWorkflowGuide";
import { HistoryPanel } from "./components/HistoryPanel";
import { MainCanvas } from "./components/MainCanvas";
import { ViewerOcrFieldsPanel } from "./components/ViewerOcrFieldsPanel";
import { DocumentIndexRail } from "./components/DocumentIndexRail";
import { VersionCompareView } from "./components/VersionCompareView";
import { ViewerHeader } from "./components/ViewerHeader";
import { ViewerToolsRail } from "./components/ViewerToolsRail";
import { listDocumentVersions } from "./lib/document-versions";
import type { usePdfViewerSession } from "./hooks/usePdfViewerSession";

export type PdfViewerViewModel = ReturnType<typeof usePdfViewerSession>;

export function PdfViewerShellLayout({ vm }: { vm: PdfViewerViewModel }) {
  const {
    isOpen,
    onClose,
    file,
    pdfUrl,
    viewerSession,
    pageCount,
    uploadStatus,
    isLoading,
    onHighlight,
    onReorder,
    onMerge,
    onGetThumbnails,
    onRenderPage,
    onReplaceFile,
    canAnnotate,
    canApprove,
    syncWithDocugrid,
    viewerMode,
    onViewerModeChange,
    operationError,
    onDismissOperationError,
    slotIdentity,
    slotLabel,
    onVersionCreated,
    onVersionDeleted,
    onAuditStateChange,
    slotWorkflowStatus,
    persistedDocId,
    canSoftDeleteDocument,
    onSoftDelete,
    canPurgeDocument,
    onPurge,
    onRestore,
    canShareWithClient,
    clientSharedAt,
    onShareWithClient,
    onUnshareWithClient,
    historyRevision,
    classifyMeta,
    clientProfile,
    clientProfileMeta,
    history,
    activeVerIdx,
    setActiveVerIdx,
    actionsLog,
    currentStatus,
    expandedHistoryIdx,
    setExpandedHistoryIdx,
    isHistoryOpen,
    setIsHistoryOpen,
    historyTab,
    setHistoryTab,
    trail,
    stampBusy,
    alreadyAcknowledged,
    alreadyAgreed,
    handleAcknowledge,
    handleAgree,
    recordAction,
    popLastAction,
    handleWorkSave,
    handleRequestReview,
    handleStartAudit,
    handleAuditSuspend,
    handleRemand,
    handleApprove,
    isReordering,
    setIsReordering,
    pageOrder,
    selectedSlots,
    toggleSlotSelection,
    clearSlotSelection,
    removeSelectedSlots,
    keepOnlySelectedSlots,
    canUndo,
    canRedo,
    undo,
    redo,
    currentPage,
    pageCountSafe,
    canGoPrev,
    canGoNext,
    goPrevPage,
    goNextPage,
    goFirstPage,
    goLastPage,
    goToPage,
    selectAllSlots,
    thumbnails,
    thumbnailsReady,
    activeTool,
    setActiveTool,
    textDraft,
    setTextDraft,
    commitTextDraft,
    cancelTextDraft,
    pageImages,
    ensurePageImage,
    preparePageForAnnotation,
    pendingOverlay,
    isDrawing,
    currentRect,
    currentStrokePath,
    getRootProps,
    getInputProps,
    openDropzone,
    isDragActive,
    handleSaveReorder,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    draggingSlotIndex,
    handleDragStart,
    handleDragOverSlot,
    handleDropSlot,
    handleDragEnd,
    currentUser,
    persistedHistory,
    historyFile,
    historyLoadError,
    isSplitView,
    leftFile,
    rightFile,
    leftSlotDocId,
    rightSlotDocId,
    pendingCheckPoint,
    auditCheckLinks,
    selectedLinkId,
    leftPageJump,
    rightPageJump,
    leftPageJumpToken,
    rightPageJumpToken,
    leftFileHash,
    rightFileHash,
    linkSaveStatus,
    isSavingLinks,
    isLoadingLinks,
    guideDismissed,
    highlightAuditStart,
    linksRailOpen,
    versionCompare,
    compareLoadingIdx,
    versionDeleteBusyId,
    historyRefreshKey,
    localMode,
    openIntent,
    pdfWorkspaceBind,
    auditCheckMode,
    clearOpenIntent,
    storeIsOpen,
    storeMode,
    handleStartEdit,
    isReadOnly,
    actorLabel,
    handleWorkflowEvent,
    handleStoreToDocugrid,
    latestVersionIdx,
    openVersionSnapRef,
    activeFile,
    localBlobUrl,
    previewUrl,
    handleDownloadPdf,
    editorKey,
    handleSetReordering,
    handleCompareWithCurrent,
    handleToggleSplitView,
    activeVersionId,
    activeVersionLabel,
    auditVersionId,
    auditVersionLabel,
    sharedAtRefreshRef,
    handleDeleteVersion,
    handleSwapSplitSources,
    handleRailLoadDoc,
    hashFile,
    jumpPaneToPage,
    activeVersion,
    persistedVersionId,
    auditLinksEndpoint,
    scopedClientId,
    persistAuditLinks,
    handleSplitCheckPoint,
    handleAutoVouchMatch,
    orderedAuditLinks,
    leftMarkers,
    rightMarkers,
    updateLinkComment,
    flushAuditLinkComments,
    focusAuditLink,
    handleSaveAuditLinks,
    handleExportAuditLinks,
    setHighlightAuditStart,
    setGuideDismissed,
    setLinksRailOpen,
    setPersistedHistory,
    setLeftFile,
    setLeftSlotDocId,
    setRightFile,
    setRightSlotDocId,
    setVersionCompare,
    displayMode,
    pdfSimpleChrome,
  } = vm;

  return (
    <div className="fixed inset-0 z-[9999] flex animate-fade-in-up flex-col select-none overflow-hidden bg-slate-950">
        <ViewerHeader
          fileName={activeFile ? activeFile.name : "Document"}
          activeVersion={activeVersion}
          workflowStatus={currentStatus}
          unsavedCount={actionsLog.length}
          isLoading={isLoading}
          isHistoryOpen={isHistoryOpen}
          isSplitView={isSplitView}
          onClose={onClose}
          onToggleHistory={() => setIsHistoryOpen(!isHistoryOpen)}
          trailAgreement={trail.agreement}
          onToggleSplitView={handleToggleSplitView}
          splitViewHint={isSplitView ? "2画面照合 ON" : "2画面照合"}
          handleWorkSave={handleWorkSave}
          handleRequestReview={handleRequestReview}
          handleStartAudit={() => {
            setHighlightAuditStart(false);
            handleStartAudit();
          }}
          handleAuditSuspend={handleAuditSuspend}
          handleRemand={handleRemand}
          handleApprove={handleApprove}
          canAnnotate={canAnnotate && !isReadOnly}
          canEnterEditMode={canAnnotate}
          canApprove={canApprove}
          viewerMode={displayMode}
          onStartEdit={handleStartEdit}
          highlightAuditStart={highlightAuditStart}
          chromeMode={pdfSimpleChrome ? "pdfSimple" : "full"}
          onDownloadPdf={handleDownloadPdf}
          onStoreToDocugrid={
            pdfSimpleChrome && slotIdentity ? handleStoreToDocugrid : undefined
          }
          canStoreToDocugrid={Boolean(slotIdentity)}
          canSoftDeleteDocument={canSoftDeleteDocument && !!persistedDocId && !!onSoftDelete}
          onSoftDelete={onSoftDelete}
          canPurgeDocument={canPurgeDocument && !!persistedDocId && !!onPurge}
          onPurge={onPurge}
          onRestore={onRestore}
          canShareWithClient={canShareWithClient && !!onShareWithClient}
          clientSharedAt={clientSharedAt}
          onShareWithClient={onShareWithClient}
          onUnshareWithClient={onUnshareWithClient}
          isReordering={isReordering}
          selectedSlotCount={selectedSlots.length}
          canUndo={canUndo}
          canRedo={canRedo}
          onRemoveSelectedSlots={removeSelectedSlots}
          onKeepOnlySelectedSlots={keepOnlySelectedSlots}
          onClearSlotSelection={clearSlotSelection}
          onUndo={undo}
          onRedo={redo}
          onSaveReorder={handleSaveReorder}
          onExitReorder={() => handleSetReordering(false)}
        />

        {operationError ? (
          <div
            className="pointer-events-none absolute inset-x-0 top-[3.75rem] z-[10050] flex justify-center px-4"
            role="alert"
          >
            <div className="pointer-events-auto flex w-full max-w-2xl items-start gap-3 rounded-xl border border-rose-500/80 bg-rose-950/95 px-4 py-3 text-sm font-semibold text-rose-100 shadow-2xl">
              <p className="min-w-0 flex-1 whitespace-pre-wrap break-words">{operationError}</p>
              {onDismissOperationError ? (
                <button
                  type="button"
                  onClick={onDismissOperationError}
                  className="shrink-0 rounded-md px-1.5 py-0.5 text-lg leading-none text-rose-300 transition hover:bg-rose-900 hover:text-white"
                  aria-label="閉じる"
                >
                  ×
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {!pdfSimpleChrome && !guideDismissed && (!isSplitView || auditCheckMode) && (
          <AuditWorkflowGuide
            status={currentStatus}
            serverStatus={slotWorkflowStatus}
            canApprove={canApprove}
            isReadOnly={isReadOnly}
            highlightAuditStart={highlightAuditStart}
            variant={auditCheckMode ? "check" : "formal"}
            onDismiss={() => setGuideDismissed(true)}
          />
        )}

        <div className="flex min-h-0 flex-1 overflow-hidden">
        {!isSplitView && !isReordering ? (
          <DocumentIndexRail
            file={activeFile}
            enabled={isOpen}
            analysisKey={`${viewerSession}:${editorKey}`}
            currentPage={currentPage}
            documentLabel={classifyMeta?.best?.label ?? slotLabel}
            onJumpToPage={goToPage}
          />
        ) : null}
        {!isReadOnly ? (
          <ViewerToolsRail
            activeTool={activeTool}
            isReordering={isReordering}
            isLoading={isLoading}
            canAnnotate={canAnnotate && !isReadOnly}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={undo}
            onRedo={redo}
            setActiveTool={setActiveTool}
            setIsReordering={handleSetReordering}
          />
        ) : null}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-slate-100">
          {isSplitView ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {scopedClientId ? (
                <ClientSlotDocsRail
                  clientId={scopedClientId}
                  currentDocId={persistedDocId}
                  leftDocId={leftSlotDocId}
                  rightDocId={rightSlotDocId}
                  onLoadDoc={handleRailLoadDoc}
                />
              ) : null}
              <AuditSplitToolbar
                pendingCheckPoint={pendingCheckPoint}
                linksCount={orderedAuditLinks.length}
                linksRailOpen={linksRailOpen}
                onToggleLinksRail={() => setLinksRailOpen((v) => !v)}
                onSwapSides={handleSwapSplitSources}
                linkSaveStatus={linkSaveStatus}
                autoVouchSlot={
                  <AutoVouchPanel
                    versionId={persistedVersionId}
                    userId={currentUser}
                    clientId={scopedClientId}
                    defaultFieldId={slotLabel ? `slot.${slotLabel}` : "acct.amount"}
                    onMatchApplied={(side, match) => void handleAutoVouchMatch(side, match)}
                    onVersionCreated={() => {
                      if (!slotIdentity) return;
                      void listDocumentVersions(slotIdentity).then((versions) => {
                        if (versions.length > 0) {
                          setPersistedHistory(
                            versions.map((v) => ({
                              ver: v.version_label,
                              date: v.created_at,
                              user: v.created_by_email || v.created_by_stakeholder_id || "—",
                              action: v.source,
                              status: currentStatus,
                              versionId: v.id,
                              actionsLog: [],
                              isMajor: false,
                            })),
                          );
                        }
                      });
                    }}
                  />
                }
              />
              <div className="flex min-h-0 flex-1">
                <AuditSplitPane
                  side="left"
                  title="左"
                  file={leftFile}
                  workingFile={file}
                  onFileChange={(next) => {
                    setLeftFile(next);
                    setLeftSlotDocId(null);
                  }}
                  onRenderPage={onRenderPage}
                  markers={leftMarkers}
                  onCheckPoint={handleSplitCheckPoint}
                  activeTool={activeTool}
                  pageJump={leftPageJump}
                  pageJumpToken={leftPageJumpToken}
                  selectedLinkId={selectedLinkId}
                  pendingOnThisSide={pendingCheckPoint?.side === "left"}
                  clientId={slotIdentity?.clientId}
                  onSelectLink={(linkId) => {
                    const link = orderedAuditLinks.find((l) => l.id === linkId);
                    if (link) focusAuditLink(link);
                  }}
                />
                <AuditSplitPane
                  side="right"
                  title="右"
                  file={rightFile}
                  workingFile={file}
                  onFileChange={(next) => {
                    setRightFile(next);
                    setRightSlotDocId(null);
                  }}
                  onRenderPage={onRenderPage}
                  markers={rightMarkers}
                  onCheckPoint={handleSplitCheckPoint}
                  activeTool={activeTool}
                  pageJump={rightPageJump}
                  pageJumpToken={rightPageJumpToken}
                  selectedLinkId={selectedLinkId}
                  pendingOnThisSide={pendingCheckPoint?.side === "right"}
                  emptyClickOpensSavedPicker
                  clientId={slotIdentity?.clientId}
                  onSelectLink={(linkId) => {
                    const link = orderedAuditLinks.find((l) => l.id === linkId);
                    if (link) focusAuditLink(link);
                  }}
                />
                {linksRailOpen ? (
                  <AuditLinksRail
                    links={orderedAuditLinks}
                    selectedLinkId={selectedLinkId}
                    isSavingLinks={isSavingLinks}
                    isLoadingLinks={isLoadingLinks}
                    leftLoadedName={leftFile?.name}
                    rightLoadedName={rightFile?.name}
                    leftLoadedHash={leftFileHash}
                    rightLoadedHash={rightFileHash}
                    onFocusLink={focusAuditLink}
                    onCommentChange={updateLinkComment}
                    onCommentBlur={flushAuditLinkComments}
                    onSave={handleSaveAuditLinks}
                    onExport={handleExportAuditLinks}
                  />
                ) : null}
              </div>
            </div>
          ) : (
            <MainCanvas
              file={activeFile}
              pdfUrl={previewUrl}
              isSplitView={isSplitView}
              isReordering={isReordering}
              isLoading={isLoading}
              pageOrder={pageOrder}
              selectedSlots={selectedSlots}
              toggleSlotSelection={toggleSlotSelection}
              currentPage={currentPage}
              pageCountSafe={pageCountSafe}
              goToPage={goToPage}
              thumbnails={thumbnails}
              thumbnailsReady={thumbnailsReady}
              getRootProps={getRootProps}
              getInputProps={getInputProps}
              openFileDialog={openDropzone}
              isDragActive={isDragActive}
              draggingSlotIndex={draggingSlotIndex}
              handleDragStart={handleDragStart}
              handleDragOverSlot={handleDragOverSlot}
              handleDropSlot={handleDropSlot}
              handleDragEnd={handleDragEnd}
              activeTool={activeTool}
              pageImages={pageImages}
              ensurePageImage={ensurePageImage}
              preparePageForAnnotation={preparePageForAnnotation}
              pendingOverlay={pendingOverlay}
              handlePointerDown={handlePointerDown}
              handlePointerMove={handlePointerMove}
              handlePointerUp={handlePointerUp}
              handlePointerCancel={handlePointerCancel}
              isDrawing={isDrawing}
              currentRect={currentRect}
              currentStrokePath={currentStrokePath}
              textDraft={textDraft}
              onTextDraftChange={setTextDraft}
              onCommitTextDraft={commitTextDraft}
              onCancelTextDraft={cancelTextDraft}
            />
          )}
        </div>

      {!isSplitView && slotIdentity ? (
        <ViewerOcrFieldsPanel
          classifyMeta={classifyMeta}
          slotId={slotIdentity.slotId}
          slotLabel={slotLabel}
          clientId={slotIdentity.clientId}
          periodKey={slotIdentity.periodKey}
          clientProfile={clientProfile}
          clientProfileMeta={clientProfileMeta}
        />
      ) : null}

      {!isSplitView && !pdfSimpleChrome ? (
        <HistoryPanel
          isHistoryOpen={isHistoryOpen}
          onClose={() => setIsHistoryOpen(false)}
          history={history}
          latestVersionIdx={latestVersionIdx}
          activeVerIdx={activeVerIdx}
          setActiveVerIdx={setActiveVerIdx}
          unsavedActions={actionsLog}
          expandedHistoryIdx={expandedHistoryIdx}
          setExpandedHistoryIdx={setExpandedHistoryIdx}
          onCompareWithCurrent={handleCompareWithCurrent}
          compareLoadingIdx={compareLoadingIdx}
          canDeleteVersion={canSoftDeleteDocument}
          onDeleteVersion={handleDeleteVersion}
          versionDeleteBusyId={versionDeleteBusyId}
          trail={trail}
          stampBusy={stampBusy}
          alreadyAcknowledged={alreadyAcknowledged}
          alreadyAgreed={alreadyAgreed}
          onAcknowledge={() => void handleAcknowledge()}
          onAgree={() => void handleAgree()}
          historyTab={historyTab}
          onHistoryTabChange={setHistoryTab}
        />
      ) : null}
        </div>

      {versionCompare ? (
        <VersionCompareView
          leftFile={versionCompare.leftFile}
          rightFile={versionCompare.rightFile}
          leftLabel={versionCompare.leftLabel}
          rightLabel={versionCompare.rightLabel}
          onClose={() => setVersionCompare(null)}
        />
      ) : null}
    </div>
  );
}
