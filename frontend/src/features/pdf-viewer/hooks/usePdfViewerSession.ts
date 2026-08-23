"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { API_BASE } from "@/config/api";
import { APP_ROLES } from "@/config/organization";
import { loadCurrentUser } from "@/lib/auth";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";
import { useAuditWorkflow, type WorkflowEventInput } from "../hooks/useAuditWorkflow";
import { usePageViewAudit } from "../hooks/usePageViewAudit";
import { useFileBlobUrl } from "../hooks/useFileBlobUrl";
import { usePdfEditor } from "../hooks/usePdfEditor";
import { useViewerKeyboardShortcuts } from "../hooks/useViewerKeyboardShortcuts";
import { useViewerUiStore } from "../state/viewer-ui-store";
import { useAutoVouchBridgeStore } from "../state/auto-vouch-bridge-store";
import {
  createDocumentVersionSnapshot,
  deleteDocumentVersion,
  fetchDocumentVersionFile,
  listDocumentVersions,
  type DocumentVersionItem,
} from "../lib/document-versions";
import {
  createReviewEvent,
  listReviewEvents,
  type ReviewEventItem,
} from "../lib/review-events";
import { buildPaneMarkers, sortAuditLinksChronological } from "../lib/audit-link-markers";
import {
  actorAlreadyStamped,
  summarizeDocumentTrail,
} from "../lib/document-trail";
import { sha256HexFromFile } from "@/lib/sha256";
import type { AutoVouchMatchedCoordinate } from "../lib/auto-vouch-api";
import {
  AuditCheckLink,
  AuditCheckPoint,
  AuditSide,
  EnhancedDocVersion,
  isPersistedDocumentVersionId,
  ViewerMode,
  ViewerModalProps,
  WorkflowStatus,
} from "../types";

import {
  buildHistoryFromVersions,
  fallbackActiveVersion,
  findLatestVersionEntryIndex,
  isHistoryMetaEntry,
  reviewEventToVersion,
  WORKFLOW_BUMP,
} from "../lib/viewer-history";

export function usePdfViewerSession({
  isOpen,
  onClose,
  file,
  pdfUrl,
  viewerSession = 0,
  pageCount,
  uploadStatus,
  isLoading,
  onHighlight,
  onReorder,
  onMerge,
  onGetThumbnails,
  onRenderPage,
  onReplaceFile,
  canAnnotate = true,
  canApprove = true,
  syncWithDocugrid = false,
  viewerMode = "preview",
  onViewerModeChange,
  chromeMode: chromeModeProp,
  operationError = null,
  onDismissOperationError,
  slotIdentity,
  slotLabel,
  onVersionCreated,
  onVersionDeleted,
  onAuditStateChange,
  slotWorkflowStatus,
  persistedDocId,
  canSoftDeleteDocument = false,
  onSoftDelete,
  canPurgeDocument = false,
  onPurge,
  onRestore,
  canShareWithClient = false,
  clientSharedAt = null,
  onShareWithClient,
  onUnshareWithClient,
  historyRevision = 0,
  classifyMeta = null,
  clientProfile,
  clientProfileMeta,
}: ViewerModalProps) {
  const [currentUser, setCurrentUser] = useState("demo-user");
  const [reviewEvents, setReviewEvents] = useState<ReviewEventItem[]>([]);
  const [stampBusy, setStampBusy] = useState(false);
  const [historyTab, setHistoryTab] = useState<"trail" | "versions">("trail");
  const [persistedHistory, setPersistedHistory] = useState<EnhancedDocVersion[] | null>(null);
  const [historyFile, setHistoryFile] = useState<File | null>(null);
  const [historyLoadError, setHistoryLoadError] = useState<string | null>(null);
  const [isSplitView, setIsSplitView] = useState(false);
  const [leftFile, setLeftFile] = useState<File | null>(null);
  const [rightFile, setRightFile] = useState<File | null>(null);
  const [leftSlotDocId, setLeftSlotDocId] = useState<string | null>(null);
  const [rightSlotDocId, setRightSlotDocId] = useState<string | null>(null);
  const [pendingCheckPoint, setPendingCheckPoint] = useState<AuditCheckPoint | null>(null);
  const [auditCheckLinks, setAuditCheckLinks] = useState<AuditCheckLink[]>([]);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [leftPageJump, setLeftPageJump] = useState<number | undefined>(undefined);
  const [rightPageJump, setRightPageJump] = useState<number | undefined>(undefined);
  const [leftPageJumpToken, setLeftPageJumpToken] = useState(0);
  const [rightPageJumpToken, setRightPageJumpToken] = useState(0);
  const [leftFileHash, setLeftFileHash] = useState<string | null>(null);
  const [rightFileHash, setRightFileHash] = useState<string | null>(null);
  const [linkSaveStatus, setLinkSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [isSavingLinks, setIsSavingLinks] = useState(false);
  const [isLoadingLinks, setIsLoadingLinks] = useState(false);
  const [guideDismissed, setGuideDismissed] = useState(false);
  const [highlightAuditStart, setHighlightAuditStart] = useState(false);
  const [linksRailOpen, setLinksRailOpen] = useState(false);
  const [versionCompare, setVersionCompare] = useState<{
    leftFile: File;
    rightFile: File;
    leftLabel: string;
    rightLabel: string;
  } | null>(null);
  const [compareLoadingIdx, setCompareLoadingIdx] = useState<number | null>(null);
  const [versionDeleteBusyId, setVersionDeleteBusyId] = useState<string | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const openIntent = useViewerUiStore((s) => s.openIntent);
  const pdfWorkspaceBind = useViewerUiStore((s) => s.pdfWorkspaceBind);
  const pdfSimpleChrome =
    chromeModeProp === "pdfSimple" || Boolean(pdfWorkspaceBind?.fromPdfWorkspace);
  const auditCheckMode = useAutoVouchBridgeStore((s) =>
    Boolean(s.activeContext?.fromMetricVouch),
  );
  const clearOpenIntent = useViewerUiStore((s) => s.clearOpenIntent);
  const storeIsOpen = useViewerUiStore((s) => s.isOpen);
  const storeMode = useViewerUiStore((s) => s.mode);
  const [localMode, setLocalMode] = useState<ViewerMode>(viewerMode);

  useEffect(() => {
    if (!storeIsOpen) setLocalMode(viewerMode);
  }, [storeIsOpen, viewerMode]);

  useEffect(() => {
    if (!isOpen) setLocalMode("preview");
  }, [isOpen]);

  const displayMode: ViewerMode = storeIsOpen ? storeMode : localMode;

  const handleStartEdit = useCallback(() => {
    if (storeIsOpen) {
      useViewerUiStore.getState().setMode("edit");
    } else {
      setLocalMode("edit");
    }
    onViewerModeChange?.("edit");
  }, [storeIsOpen, onViewerModeChange]);

  const isReadOnly = displayMode === "preview";

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !slotIdentity) return;
    void createReviewEvent(slotIdentity, {
      event_type: displayMode === "edit" ? "viewer_open_edit" : "viewer_open_preview",
      status: "draft",
      action_title: displayMode === "edit" ? "編集ビューアを開く" : "プレビューを開く",
    }).catch((err) => console.warn("viewer_open audit failed:", err));

    return () => {
      void createReviewEvent(slotIdentity, {
        event_type: "viewer_close",
        status: "draft",
        action_title: "ビューアを閉じる",
      }).catch((err) => console.warn("viewer_close audit failed:", err));
    };
    // displayMode の切替では open/close を再送しない（編集↔プレビュー切替の連打防止）
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sessionKey only
  }, [isOpen, slotIdentity?.clientId, slotIdentity?.periodKey, slotIdentity?.slotId]);

  const actorLabel = useMemo(() => {
    const u = loadCurrentUser();
    if (!u) return "操作者";
    const roleLabel = APP_ROLES.find((r) => r.id === u.appRoleId)?.label;
    return roleLabel ? `${u.name} (${roleLabel})` : u.name;
  }, []);

  const handleWorkflowEvent = useCallback(
    async (event: WorkflowEventInput) => {
      if (!slotIdentity) return;
      try {
        const sha = await sha256HexFromFile(file);
        let documentVersionId: string | undefined;
        let logicalDocumentId: string | undefined;
        let versionLabel = event.versionLabel;

        const bump = WORKFLOW_BUMP[event.eventType];
        if (bump && file) {
          const snap = await createDocumentVersionSnapshot(
            slotIdentity,
            file,
            bump,
            slotLabel,
          );
          documentVersionId = snap.id;
          logicalDocumentId = snap.logical_document_id;
          versionLabel = snap.version_label;
          onVersionCreated?.({
            versionId: snap.id,
            versionLabel: snap.version_label,
            logicalDocumentId: snap.logical_document_id,
            workflowStatus: event.status,
            file,
          });
        }

        await createReviewEvent(slotIdentity, {
          event_type: event.eventType,
          status: event.status,
          action_title: event.actionTitle,
          version_label: versionLabel,
          reason: event.reason,
          content_sha256: sha,
          is_major: event.isMajor,
          logical_document_id: logicalDocumentId,
          document_version_id: documentVersionId,
        });

        const [events, versions] = await Promise.all([
          listReviewEvents(slotIdentity),
          listDocumentVersions(slotIdentity),
        ]);
        if (versions.length > 0) {
          setPersistedHistory(buildHistoryFromVersions(versions, events));
        } else if (events.length > 0) {
          setPersistedHistory(events.map(reviewEventToVersion));
        }
        onAuditStateChange?.();
      } catch (err) {
        console.warn("Failed to persist review event:", err);
      }
    },
    [slotIdentity, file, slotLabel, onVersionCreated, onAuditStateChange],
  );

  const {
    history,
    activeVerIdx,
    setActiveVerIdx,
    actionsLog,
    currentStatus,
    expandedHistoryIdx,
    setExpandedHistoryIdx,
    isHistoryOpen,
    setIsHistoryOpen,
    recordAction,
    popLastAction,
    handleWorkSave,
    handleRequestReview,
    handleStartAudit,
    handleAuditSuspend,
    handleRemand,
    handleApprove,
  } = useAuditWorkflow({
    file,
    pdfUrl,
    isOpen,
    onAuditStart: () => setIsSplitView(true),
    onAuditEnd: () => setIsSplitView(false),
    actorLabel,
    initialHistory: persistedHistory,
    slotWorkflowStatus,
    onEvent: handleWorkflowEvent,
  });

  const handleStoreToDocugrid = useCallback(() => {
    if (!slotIdentity) {
      window.alert("DocuGrid に格納するには、開く前に顧問先を選んでください。");
      return;
    }
    handleWorkSave();
  }, [slotIdentity, handleWorkSave]);

  const latestVersionIdx = useMemo(() => findLatestVersionEntryIndex(history), [history]);
  const viewingLatestVersion =
    latestVersionIdx >= 0 && activeVerIdx === latestVersionIdx;

  const openVersionSnapRef = useRef(false);
  useEffect(() => {
    if (!isOpen) {
      openVersionSnapRef.current = false;
      return;
    }
    if (!openVersionSnapRef.current && latestVersionIdx >= 0) {
      openVersionSnapRef.current = true;
      setActiveVerIdx(latestVersionIdx);
    }
  }, [isOpen, latestVersionIdx, setActiveVerIdx]);

  useEffect(() => {
    if (!isOpen || latestVersionIdx < 0) return;
    const current = history[activeVerIdx];
    if (!current || isHistoryMetaEntry(current)) {
      setActiveVerIdx(latestVersionIdx);
    }
  }, [isOpen, history, activeVerIdx, latestVersionIdx, setActiveVerIdx]);

  const activeFile = viewingLatestVersion ? file : historyFile ?? file;
  const localBlobUrl = useFileBlobUrl(activeFile, viewerSession, isOpen);
  const previewUrl = localBlobUrl ?? pdfUrl;

  const handleDownloadPdf = useCallback(() => {
    if (!activeFile) return;
    const url = URL.createObjectURL(activeFile);
    const a = document.createElement("a");
    a.href = url;
    a.download = activeFile.name.toLowerCase().endsWith(".pdf")
      ? activeFile.name
      : `${activeFile.name}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [activeFile]);

  const editorKey = useMemo(() => {
    const cur = history[activeVerIdx];
    if (cur && !isHistoryMetaEntry(cur) && isPersistedDocumentVersionId(cur.versionId)) {
      return cur.versionId;
    }
    if (latestVersionIdx >= 0) {
      const latest = history[latestVersionIdx];
      if (latest && isPersistedDocumentVersionId(latest.versionId)) return latest.versionId;
    }
    return persistedDocId ?? "initial";
  }, [history, activeVerIdx, latestVersionIdx, persistedDocId]);

  const {
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
  } = usePdfEditor({
    file: activeFile,
    pdfUrl: previewUrl,
    viewerSession,
    editorKey,
    pageCount,
    onHighlight,
    onReorder,
    onMerge,
    onGetThumbnails,
    onRenderPage,
    recordAction,
    popLastAction,
    onReplaceFile,
    syncWithDocugrid,
  });

  const handleSetReordering = useCallback(
    (open: boolean) => {
      if (open) {
        setIsSplitView(false);
        setActiveTool("none");
      }
      setIsReordering(open);
    },
    [setActiveTool, setIsReordering],
  );

  useViewerKeyboardShortcuts({
    enabled: isOpen,
    isReadOnly,
    canAnnotate,
    isLoading,
    isHistoryOpen,
    setIsHistoryOpen,
    isReordering,
    setIsReordering: handleSetReordering,
    isSplitView,
    setIsSplitView,
    canUndo,
    canRedo,
    undo,
    redo,
    canGoPrev,
    canGoNext,
    goPrevPage,
    goNextPage,
    goFirstPage,
    goLastPage,
    pageCountSafe,
    selectedSlots,
    selectAllSlots,
    removeSelectedSlots,
    setActiveTool,
    handleWorkSave:
      pdfSimpleChrome && slotIdentity ? handleStoreToDocugrid : handleWorkSave,
    onClose,
  });

  useEffect(() => {
    if (!isOpen) {
      setGuideDismissed(false);
      setHighlightAuditStart(false);
      return;
    }
    if (openIntent === "audit-check") {
      setIsSplitView(true);
      setActiveTool("check");
      setLeftFile((prev) => prev ?? file);
      setGuideDismissed(false);
      clearOpenIntent();
    } else if (openIntent === "audit-start") {
      setHighlightAuditStart(true);
      setGuideDismissed(false);
      clearOpenIntent();
    } else if (openIntent === "audit-continue") {
      setIsSplitView(true);
      setActiveTool("check");
      setLeftFile((prev) => prev ?? file);
      clearOpenIntent();
    }
  }, [isOpen, openIntent, file, setActiveTool, clearOpenIntent]);

  useEffect(() => {
    if (currentStatus === "auditing") {
      setIsSplitView(true);
      setActiveTool("check");
      setLeftFile((prev) => prev ?? file);
    }
  }, [currentStatus, file, setActiveTool]);

  useEffect(() => {
    if (isSplitView) {
      setIsHistoryOpen(false);
      setGuideDismissed(true);
    }
  }, [isSplitView, setIsHistoryOpen]);

  useEffect(() => {
    if (!isOpen) {
      setVersionCompare(null);
      setCompareLoadingIdx(null);
    }
  }, [isOpen]);

  const handleCompareWithCurrent = useCallback(
    async (idx: number) => {
      const latestIdx = findLatestVersionEntryIndex(history);
      if (!file || latestIdx < 0 || idx === latestIdx) return;
      const ver = history[idx];
      const latestVer = history[latestIdx];
      if (!ver?.versionId || ver.versionId === "initial" || ver.versionId === "fallback") return;
      setCompareLoadingIdx(idx);
      try {
        let rightFile =
          idx === activeVerIdx && historyFile ? historyFile : null;
        if (!rightFile) {
          rightFile = await fetchDocumentVersionFile(ver.versionId, file.name);
        }
        let leftFile = file;
        if (latestVer?.versionId && latestVer.versionId !== ver.versionId && !viewingLatestVersion) {
          leftFile = await fetchDocumentVersionFile(latestVer.versionId, file.name);
        }
        setVersionCompare({
          leftFile,
          rightFile,
          leftLabel: latestVer?.ver ?? "最新",
          rightLabel: ver.ver,
        });
      } catch (err) {
        console.warn("Version compare failed:", err);
      } finally {
        setCompareLoadingIdx(null);
      }
    },
    [file, history, activeVerIdx, historyFile, viewingLatestVersion],
  );

  const handleToggleSplitView = useCallback(() => {
    setIsSplitView((prev) => {
      const next = !prev;
      if (next) {
        setIsReordering(false);
        setActiveTool("check");
        setLeftFile((f) => f ?? file);
        setLeftSlotDocId((id) => id ?? persistedDocId ?? null);
        setPendingCheckPoint(null);
      }
      return next;
    });
  }, [file, persistedDocId, setActiveTool, setIsReordering]);

  const activeVersionId = history[activeVerIdx]?.versionId;
  const activeVersionLabel = history[activeVerIdx]?.ver;
  const auditVersionId = isPersistedDocumentVersionId(editorKey) ? editorKey : undefined;
  const auditVersionLabel = useMemo(() => {
    if (auditVersionId) {
      const match = history.find(
        (h) => !isHistoryMetaEntry(h) && h.versionId === auditVersionId,
      );
      if (match?.ver && match.ver !== "---") return match.ver;
    }
    return activeVersionLabel !== "---" ? activeVersionLabel : undefined;
  }, [auditVersionId, history, activeVersionLabel]);

  usePageViewAudit({
    enabled: isOpen && !!slotIdentity,
    slotIdentity,
    currentPage,
    documentVersionId: auditVersionId,
    versionLabel: auditVersionLabel,
    suspend: isReordering,
  });

  const sharedAtRefreshRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!isOpen) {
      sharedAtRefreshRef.current = undefined;
      return;
    }
    if (sharedAtRefreshRef.current === undefined) {
      sharedAtRefreshRef.current = clientSharedAt;
      return;
    }
    if (sharedAtRefreshRef.current !== clientSharedAt) {
      sharedAtRefreshRef.current = clientSharedAt;
      setHistoryRefreshKey((k) => k + 1);
    }
  }, [isOpen, clientSharedAt]);

  useEffect(() => {
    const user = loadCurrentUser();
    if (user?.email) {
      setCurrentUser(user.email);
    }
  }, []);

  // 開いたスロットの版一覧＋監査タイムラインをサーバーから復元
  useEffect(() => {
    if (!isOpen || !slotIdentity) {
      setPersistedHistory(null);
      setReviewEvents([]);
      return;
    }
    const controller = new AbortController();
    let active = true;
    void (async () => {
      try {
        const [events, versions] = await Promise.all([
          listReviewEvents(slotIdentity, controller.signal),
          listDocumentVersions(slotIdentity, controller.signal),
        ]);
        if (!active) return;
        setReviewEvents(events);
        if (versions.length > 0) {
          setPersistedHistory(buildHistoryFromVersions(versions, events));
        } else if (events.length > 0) {
          setPersistedHistory(events.map(reviewEventToVersion));
        } else {
          setPersistedHistory(null);
        }
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          console.warn("Failed to load version history:", err);
        }
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [isOpen, slotIdentity, historyRefreshKey, historyRevision]);

  const handleDeleteVersion = useCallback(
    async (versionId: string, versionLabel: string) => {
      if (!slotIdentity || !canSoftDeleteDocument) return;
      const ok = window.confirm(
        `版 ${versionLabel} を削除します。この版の PDF は表示できなくなりますが、誰が削除したかの記録は残ります（ファイル名は記録しません）。よろしいですか？`,
      );
      if (!ok) return;
      setVersionDeleteBusyId(versionId);
      try {
        await deleteDocumentVersion(versionId, slotIdentity.clientId);
        const [events, versions] = await Promise.all([
          listReviewEvents(slotIdentity),
          listDocumentVersions(slotIdentity),
        ]);
        const newHistory =
          versions.length > 0
            ? buildHistoryFromVersions(versions, events)
            : events.length > 0
              ? events.map(reviewEventToVersion)
              : [];
        setPersistedHistory(newHistory.length > 0 ? newHistory : null);
        setHistoryRefreshKey((k) => k + 1);
        setHistoryFile(null);

        if (versions.length === 0) {
          setActiveVerIdx(0);
          onVersionDeleted?.({ file: null, versionId: null, versionLabel: null });
          onAuditStateChange?.();
          return;
        }

        const latest = versions[0];
        const latestFile = await fetchDocumentVersionFile(
          latest.id,
          file?.name || latest.original_name || "document.pdf",
        );
        const latestIdx = findLatestVersionEntryIndex(newHistory);
        setActiveVerIdx(latestIdx >= 0 ? latestIdx : 0);
        onVersionDeleted?.({
          file: latestFile,
          versionId: latest.id,
          versionLabel: latest.version_label,
        });
        onAuditStateChange?.();
      } catch (err) {
        console.error("Version delete failed:", err);
        window.alert("版の削除に失敗しました。");
      } finally {
        setVersionDeleteBusyId(null);
      }
    },
    [
      slotIdentity,
      canSoftDeleteDocument,
      file?.name,
      setActiveVerIdx,
      onVersionDeleted,
      onAuditStateChange,
    ],
  );

  // 履歴パネルで旧版を選択したとき immutable PDF を取得
  useEffect(() => {
    if (!isOpen || viewingLatestVersion) {
      setHistoryFile(null);
      setHistoryLoadError(null);
      return;
    }
    const ver = history[activeVerIdx];
    if (!ver?.versionId || ver.versionId === "initial" || ver.versionId === "fallback") return;
    const controller = new AbortController();
    let active = true;
    void (async () => {
      try {
        setHistoryLoadError(null);
        const loaded = await fetchDocumentVersionFile(
          ver.versionId,
          file?.name || "document.pdf",
          controller.signal,
        );
        if (active) setHistoryFile(loaded);
      } catch (err) {
        if ((err as Error)?.name !== "AbortError" && active) {
          setHistoryLoadError("旧版の読み込みに失敗しました");
        }
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [isOpen, activeVerIdx, history, file?.name, viewingLatestVersion]);

  useEffect(() => {
    if (!isOpen) return;
    setLeftFile(file);
    setRightFile(null);
    setLeftSlotDocId(persistedDocId ?? null);
    setRightSlotDocId(null);
    setPendingCheckPoint(null);
    setSelectedLinkId(null);
  }, [isOpen, file, persistedDocId]);

  const handleSwapSplitSources = () => {
    setLeftFile(rightFile);
    setRightFile(leftFile);
    setLeftSlotDocId(rightSlotDocId);
    setRightSlotDocId(leftSlotDocId);
    setPendingCheckPoint(null);
  };

  const handleRailLoadDoc = useCallback((picked: File, docId: string, side: AuditSide) => {
    if (side === "left") {
      setLeftFile(picked);
      setLeftSlotDocId(docId);
    } else {
      setRightFile(picked);
      setRightSlotDocId(docId);
    }
    setPendingCheckPoint(null);
  }, []);

  const hashFile = sha256HexFromFile;

  useEffect(() => {
    let active = true;
    void (async () => {
      const h = await hashFile(leftFile);
      if (active) setLeftFileHash(h ?? null);
    })();
    return () => {
      active = false;
    };
  }, [leftFile]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const h = await hashFile(rightFile);
      if (active) setRightFileHash(h ?? null);
    })();
    return () => {
      active = false;
    };
  }, [rightFile]);

  const jumpPaneToPage = useCallback((side: AuditSide, page: number) => {
    if (side === "left") {
      setLeftPageJump(page);
      setLeftPageJumpToken((n) => n + 1);
    } else {
      setRightPageJump(page);
      setRightPageJumpToken((n) => n + 1);
    }
  }, []);

  const activeVersion = history[activeVerIdx] || fallbackActiveVersion;

  const persistedVersionId = isPersistedDocumentVersionId(activeVersion.versionId)
    ? activeVersion.versionId
    : null;
  const auditLinksEndpoint = persistedVersionId
    ? `${API_BASE}/audit-links/${encodeURIComponent(persistedVersionId)}`
    : null;

  const scopedClientId = slotIdentity?.clientId;

  const persistAuditLinks = useCallback(
    async (links: AuditCheckLink[], options?: { silent?: boolean }) => {
      if (!auditLinksEndpoint) {
        if (!options?.silent) {
          alert("版が確定するまで監査リンクは保存できません。");
        }
        return;
      }
      setLinkSaveStatus("saving");
      setIsSavingLinks(true);
      try {
        const res = await authFetch(auditLinksEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...buildAuthHeaders(scopedClientId) },
          body: JSON.stringify(links),
        });
        if (!res.ok) throw new Error("save failed");
        if (slotIdentity && links.length > 0) {
          await createReviewEvent(slotIdentity, {
            event_type: "audit_link_create",
            status: currentStatus,
            action_title: "監査リンクを保存",
            document_version_id:
              activeVersion.versionId !== "fallback" ? activeVersion.versionId : undefined,
            version_label: activeVersion.ver !== "---" ? activeVersion.ver : undefined,
            detail: JSON.stringify({ count: links.length, versionId: activeVersion.versionId }),
          });
        }
        setLinkSaveStatus("saved");
        if (!options?.silent) {
          alert("監査リンクを保存しました。");
        }
      } catch {
        setLinkSaveStatus("error");
        if (!options?.silent) {
          alert("監査リンク保存に失敗しました。");
        }
      } finally {
        setIsSavingLinks(false);
      }
    },
    [auditLinksEndpoint, slotIdentity, currentStatus, activeVersion],
  );

  const handleSplitCheckPoint = async (side: AuditSide, point: Omit<AuditCheckPoint, "side">) => {
    const sideFile = side === "left" ? leftFile : rightFile;
    const nextPoint: AuditCheckPoint = {
      side,
      ...point,
      fileName: point.fileName || sideFile?.name,
      fileHash: await hashFile(sideFile),
    };
    if (!pendingCheckPoint || pendingCheckPoint.side === side) {
      setPendingCheckPoint(nextPoint);
      return;
    }
    const left = pendingCheckPoint.side === "left" ? pendingCheckPoint : nextPoint;
    const right = pendingCheckPoint.side === "right" ? pendingCheckPoint : nextPoint;
    const link: AuditCheckLink = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      createdBy: currentUser,
      left,
      right,
    };
    setAuditCheckLinks((prev) => {
      const next = sortAuditLinksChronological([...prev, link]);
      void persistAuditLinks(next, { silent: true });
      return next;
    });
    setLinksRailOpen(true);
    setPendingCheckPoint(null);
    setSelectedLinkId(link.id);
    jumpPaneToPage("left", left.page);
    jumpPaneToPage("right", right.page);
  };

  const handleAutoVouchMatch = useCallback(
    async (side: AuditSide, match: AutoVouchMatchedCoordinate) => {
      const sideFile = side === "left" ? leftFile : rightFile;
      const pageIndex = Math.max(0, match.page - 1);
      const nextPoint: AuditCheckPoint = {
        side,
        page: pageIndex,
        x: match.x_norm ?? 0.5,
        y: match.y_norm ?? 0.5,
        fileName: sideFile?.name,
        fileHash: await hashFile(sideFile),
      };
      if (side === "left") setLeftPageJump(pageIndex);
      else setRightPageJump(pageIndex);
      setActiveTool("check");

      if (!pendingCheckPoint || pendingCheckPoint.side === side) {
        setPendingCheckPoint(nextPoint);
        return;
      }
      const left = pendingCheckPoint.side === "left" ? pendingCheckPoint : nextPoint;
      const right = pendingCheckPoint.side === "right" ? pendingCheckPoint : nextPoint;
      const link: AuditCheckLink = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        createdBy: currentUser,
        comment: `自動紐づけ: ${match.matched_text}`,
        left,
        right,
      };
      setAuditCheckLinks((prev) => {
        const next = sortAuditLinksChronological([...prev, link]);
        void persistAuditLinks(next, { silent: true });
        return next;
      });
      setLinksRailOpen(true);
      setPendingCheckPoint(null);
      setSelectedLinkId(link.id);
      jumpPaneToPage("left", left.page);
      jumpPaneToPage("right", right.page);
    },
    [leftFile, rightFile, pendingCheckPoint, currentUser, persistAuditLinks, jumpPaneToPage],
  );

  const orderedAuditLinks = useMemo(
    () => sortAuditLinksChronological(auditCheckLinks),
    [auditCheckLinks],
  );

  const leftMarkers = useMemo(
    () => buildPaneMarkers("left", orderedAuditLinks, pendingCheckPoint),
    [orderedAuditLinks, pendingCheckPoint],
  );
  const rightMarkers = useMemo(
    () => buildPaneMarkers("right", orderedAuditLinks, pendingCheckPoint),
    [orderedAuditLinks, pendingCheckPoint],
  );

  const updateLinkComment = useCallback((linkId: string, comment: string) => {
    setAuditCheckLinks((prev) =>
      prev.map((l) => (l.id === linkId ? { ...l, comment: comment || undefined } : l)),
    );
  }, []);

  const flushAuditLinkComments = useCallback(() => {
    setAuditCheckLinks((prev) => {
      void persistAuditLinks(prev, { silent: true });
      return prev;
    });
  }, [persistAuditLinks]);

  const focusAuditLink = useCallback(
    (link: AuditCheckLink, side?: AuditSide) => {
      setSelectedLinkId(link.id);
      setLinksRailOpen(true);

      const leftHash = link.left.fileHash;
      const rightHash = link.right.fileHash;
      const leftOnLeft = !leftHash || leftHash === leftFileHash;
      const rightOnRight = !rightHash || rightHash === rightFileHash;
      const leftOnRight = Boolean(leftHash) && leftHash === rightFileHash;
      const rightOnLeft = Boolean(rightHash) && rightHash === leftFileHash;
      const shouldSwap =
        (!leftOnLeft || !rightOnRight) && (leftOnRight || rightOnLeft);

      if (shouldSwap) {
        setLeftFile(rightFile);
        setRightFile(leftFile);
        setLeftSlotDocId(rightSlotDocId);
        setRightSlotDocId(leftSlotDocId);
        setLeftFileHash(rightFileHash);
        setRightFileHash(leftFileHash);
        setPendingCheckPoint(null);
      }

      if (!side || side === "left") jumpPaneToPage("left", link.left.page);
      if (!side || side === "right") jumpPaneToPage("right", link.right.page);
    },
    [
      leftFile,
      rightFile,
      leftFileHash,
      rightFileHash,
      leftSlotDocId,
      rightSlotDocId,
      jumpPaneToPage,
    ],
  );

  useEffect(() => {
    let mounted = true;
    const loadAuditLinks = async () => {
      if (!isOpen || !auditLinksEndpoint) {
        if (mounted) {
          setAuditCheckLinks([]);
          setIsLoadingLinks(false);
        }
        return;
      }
      setIsLoadingLinks(true);
      try {
        const res = await authFetch(auditLinksEndpoint, { headers: buildAuthHeaders(scopedClientId) });
        if (!res.ok) throw new Error("failed");
        const data = (await res.json()) as AuditCheckLink[];
        if (mounted) {
          setAuditCheckLinks(
            Array.isArray(data) ? sortAuditLinksChronological(data) : [],
          );
        }
      } catch {
        if (mounted) {
          setAuditCheckLinks([]);
        }
      } finally {
        if (mounted) setIsLoadingLinks(false);
      }
    };
    void loadAuditLinks();
    return () => {
      mounted = false;
    };
  }, [auditLinksEndpoint, isOpen, scopedClientId]);

  const handleSaveAuditLinks = () => void persistAuditLinks(auditCheckLinks);

  const handleExportAuditLinks = () => {
    const payload = {
      versionId: activeVersion.versionId,
      exportedAt: new Date().toISOString(),
      links: auditCheckLinks,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-links-${activeVersion.versionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const trail = useMemo(
    () => summarizeDocumentTrail(reviewEvents, slotLabel),
    [reviewEvents, slotLabel],
  );
  const alreadyAcknowledged = actorAlreadyStamped(reviewEvents, "acknowledge", currentUser);
  const alreadyAgreed = actorAlreadyStamped(reviewEvents, "agree", currentUser);

  const handleAcknowledge = useCallback(async () => {
    if (!slotIdentity || stampBusy) return;
    setStampBusy(true);
    try {
      await createReviewEvent(slotIdentity, {
        event_type: "acknowledge",
        status: currentStatus,
        action_title: "確認した",
        is_major: false,
      });
      setHistoryRefreshKey((k) => k + 1);
      onAuditStateChange?.();
    } catch (err) {
      console.warn("acknowledge failed:", err);
    } finally {
      setStampBusy(false);
    }
  }, [slotIdentity, stampBusy, currentStatus, onAuditStateChange]);

  const handleAgree = useCallback(async () => {
    if (!slotIdentity || stampBusy) return;
    setStampBusy(true);
    try {
      await createReviewEvent(slotIdentity, {
        event_type: "agree",
        status: currentStatus,
        action_title: trail.isContract ? "契約に同意した" : "同意した",
        is_major: true,
      });
      setHistoryRefreshKey((k) => k + 1);
      onAuditStateChange?.();
    } catch (err) {
      console.warn("agree failed:", err);
    } finally {
      setStampBusy(false);
    }
  }, [slotIdentity, stampBusy, currentStatus, trail.isContract, onAuditStateChange]);

  return {
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
  };
}
