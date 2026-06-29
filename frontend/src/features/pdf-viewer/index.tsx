"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AuditLinksRail } from "./components/AuditLinksRail";
import { AuditSplitToolbar } from "./components/AuditSplitToolbar";
import { AutoVouchPanel } from "./components/AutoVouchPanel";
import { API_BASE } from "@/config/api";
import { APP_ROLES, STAKEHOLDER_MASTER } from "@/config/organization";
import { loadCurrentUser } from "@/lib/auth";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";
import { AuditSplitPane } from "./components/AuditSplitPane";
import { ClientSlotDocsRail } from "./components/ClientSlotDocsRail";
import { AuditWorkflowGuide } from "./components/AuditWorkflowGuide";
import { HistoryPanel } from "./components/HistoryPanel";
import { MainCanvas } from "./components/MainCanvas";
import { VersionCompareView } from "./components/VersionCompareView";
import { ViewerHeader } from "./components/ViewerHeader";
import { useAuditWorkflow, type WorkflowEventInput } from "./hooks/useAuditWorkflow";
import { usePageViewAudit } from "./hooks/usePageViewAudit";
import { useFileBlobUrl } from "./hooks/useFileBlobUrl";
import { usePdfEditor } from "./hooks/usePdfEditor";
import { useViewerKeyboardShortcuts } from "./hooks/useViewerKeyboardShortcuts";
import { useViewerUiStore } from "./state/viewer-ui-store";
import { useAutoVouchBridgeStore } from "./state/auto-vouch-bridge-store";
import {
  createDocumentVersionSnapshot,
  deleteDocumentVersion,
  fetchDocumentVersionFile,
  listDocumentVersions,
  versionSourceLabel,
  type DocumentVersionItem,
  type VersionBump,
} from "./lib/document-versions";
import {
  createReviewEvent,
  listReviewEvents,
  type ReviewEventItem,
} from "./lib/review-events";
import { buildPaneMarkers, sortAuditLinksChronological } from "./lib/audit-link-markers";
import type { AutoVouchMatchedCoordinate } from "./lib/auto-vouch-api";
import {
  AuditCheckLink,
  AuditCheckPoint,
  AuditSide,
  EnhancedDocVersion,
  isPersistedDocumentVersionId,
  ViewerMode,
  ViewerModalProps,
  WorkflowStatus,
} from "./types";

const resolveActorName = (stakeholderId: string | null, email: string | null): string => {
  if (stakeholderId) {
    const match = STAKEHOLDER_MASTER.find((item) => item.id === stakeholderId);
    if (match) return match.displayName;
  }
  return email || stakeholderId || "操作者";
};

const formatEventDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const sha256OfFile = async (target: File | null): Promise<string | undefined> => {
  if (!target) return undefined;
  const buffer = await target.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const HISTORY_META_EVENT_TYPES = new Set([
  "document_delete",
  "version_delete",
  "client_share",
  "client_unshare",
]);

const reviewEventToVersion = (event: ReviewEventItem): EnhancedDocVersion => ({
  ver:
    event.version_label ||
    (HISTORY_META_EVENT_TYPES.has(event.event_type) ? "—" : "v1.0.0"),
  date: formatEventDate(event.created_at),
  user: resolveActorName(event.actor_stakeholder_id, event.actor_email),
  action: event.action_title || event.event_type,
  status: (event.status as WorkflowStatus) || "draft",
  actionsLog: event.reason ? [event.reason] : [],
  isMajor: event.is_major,
  versionId: event.document_version_id || event.id,
  isDeletion: event.event_type === "document_delete" || event.event_type === "version_delete",
  metaEventType:
    event.event_type === "client_share"
      ? "client_share"
      : event.event_type === "client_unshare"
        ? "client_unshare"
        : undefined,
});

const buildHistoryFromVersions = (
  versions: DocumentVersionItem[],
  events: ReviewEventItem[],
): EnhancedDocVersion[] => {
  type Row = EnhancedDocVersion & { sortAt: string };
  const rows: Row[] = versions.map((v) => {
    const ev = events.find((e) => e.document_version_id === v.id);
    return {
      ver: v.version_label,
      date: formatEventDate(v.created_at),
      user: resolveActorName(v.created_by_stakeholder_id, v.created_by_email),
      action: ev?.action_title || versionSourceLabel(v.source),
      status: (ev?.status as WorkflowStatus) || "draft",
      actionsLog: ev?.reason ? [ev.reason] : [],
      isMajor: ev?.is_major ?? /\.0\.0$/.test(v.version_label),
      versionId: v.id,
      sortAt: v.created_at,
    };
  });
  for (const e of events) {
    if (!HISTORY_META_EVENT_TYPES.has(e.event_type)) continue;
    rows.push({ ...reviewEventToVersion(e), sortAt: e.created_at });
  }
  return rows
    .sort((a, b) => b.sortAt.localeCompare(a.sortAt))
    .map(({ sortAt: _sortAt, ...rest }) => rest);
};

const WORKFLOW_BUMP: Partial<Record<string, VersionBump>> = {
  work_save: "minor",
  audit_start: "audit_start",
  approve: "major",
};

const fallbackActiveVersion: EnhancedDocVersion = {
  ver: "---",
  date: "",
  user: "",
  action: "",
  status: "draft",
  actionsLog: [],
  isMajor: false,
  versionId: "fallback",
};

export default function ViewerModal({
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
  canAnnotate = true,
  canApprove = true,
  syncWithDocugrid = false,
  viewerMode = "preview",
  onViewerModeChange,
  slotIdentity,
  slotLabel,
  onVersionCreated,
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
}: ViewerModalProps) {
  const [currentUser, setCurrentUser] = useState("demo-user");
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
  const auditCheckMode = useAutoVouchBridgeStore((s) =>
    Boolean(s.activeContext?.fromMetricVouch),
  );
  const clearOpenIntent = useViewerUiStore((s) => s.clearOpenIntent);
  const isReadOnly = viewerMode === "preview";

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
    const openType = viewerMode === "edit" ? "viewer_open_edit" : "viewer_open_preview";
    const openTitle = viewerMode === "edit" ? "編集ビューアを開く" : "プレビューを開く";
    void createReviewEvent(slotIdentity, {
      event_type: openType,
      status: "draft",
      action_title: openTitle,
    }).catch((err) => console.warn("viewer_open audit failed:", err));

    return () => {
      void createReviewEvent(slotIdentity, {
        event_type: "viewer_close",
        status: "draft",
        action_title: "ビューアを閉じる",
      }).catch((err) => console.warn("viewer_close audit failed:", err));
    };
  }, [isOpen, slotIdentity, viewerMode]);

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
        const sha = await sha256OfFile(file);
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

  const activeFile = activeVerIdx === 0 ? file : historyFile ?? file;
  const localBlobUrl = useFileBlobUrl(activeFile, viewerSession, isOpen);
  const previewUrl = localBlobUrl ?? pdfUrl;

  const editorKey = history[activeVerIdx]?.versionId ?? "initial";

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
    undoPageOrder,
    redoPageOrder,
    currentPage,
    pageCountSafe,
    canGoPrev,
    canGoNext,
    goPrevPage,
    goNextPage,
    goFirstPage,
    goLastPage,
    selectAllSlots,
    thumbnails,
    thumbnailsReady,
    activeTool,
    setActiveTool,
    editPageImage,
    pendingOverlay,
    isDrawing,
    currentRect,
    currentStrokePath,
    canvasRef,
    getRootProps,
    getInputProps,
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
    syncWithDocugrid,
  });

  useViewerKeyboardShortcuts({
    enabled: isOpen,
    isReadOnly,
    canAnnotate,
    isLoading,
    isHistoryOpen,
    setIsHistoryOpen,
    isReordering,
    setIsReordering,
    isSplitView,
    setIsSplitView,
    canUndo,
    canRedo,
    undoPageOrder,
    redoPageOrder,
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
    handleWorkSave,
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

  // 複数版があるときは履歴パネルを開く
  useEffect(() => {
    if (!isOpen || !persistedHistory || persistedHistory.length <= 1) return;
    setIsHistoryOpen(true);
  }, [isOpen, persistedHistory?.length]);

  const handleCompareWithCurrent = useCallback(
    async (idx: number) => {
      if (!file || idx <= 0) return;
      const ver = history[idx];
      if (!ver?.versionId || ver.versionId === "initial" || ver.versionId === "fallback") return;
      setCompareLoadingIdx(idx);
      try {
        let rightFile =
          idx === activeVerIdx && historyFile ? historyFile : null;
        if (!rightFile) {
          rightFile = await fetchDocumentVersionFile(ver.versionId, file.name);
        }
        setVersionCompare({
          leftFile: file,
          rightFile,
          leftLabel: history[0]?.ver ?? "最新",
          rightLabel: ver.ver,
        });
      } catch (err) {
        console.warn("Version compare failed:", err);
      } finally {
        setCompareLoadingIdx(null);
      }
    },
    [file, history, activeVerIdx, historyFile],
  );

  const handleToggleSplitView = useCallback(() => {
    setIsSplitView((prev) => {
      const next = !prev;
      if (next) {
        setActiveTool("check");
        setLeftFile((f) => f ?? file);
        setLeftSlotDocId((id) => id ?? persistedDocId ?? null);
        setPendingCheckPoint(null);
      }
      return next;
    });
  }, [file, persistedDocId, setActiveTool]);

  const activeVersionId = history[activeVerIdx]?.versionId;
  const activeVersionLabel = history[activeVerIdx]?.ver;

  usePageViewAudit({
    enabled: isOpen && !!slotIdentity,
    slotIdentity,
    currentPage,
    documentVersionId: activeVersionId !== "fallback" ? activeVersionId : undefined,
    versionLabel: activeVersionLabel !== "---" ? activeVersionLabel : undefined,
  });

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
        const deletedIdx = history.findIndex((h) => h.versionId === versionId);
        setHistoryRefreshKey((k) => k + 1);
        if (deletedIdx >= 0 && deletedIdx === activeVerIdx) {
          setActiveVerIdx(0);
          setHistoryFile(null);
        } else if (deletedIdx >= 0 && deletedIdx < activeVerIdx) {
          setActiveVerIdx((idx) => Math.max(0, idx - 1));
        }
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
      history,
      activeVerIdx,
      setActiveVerIdx,
      onAuditStateChange,
    ],
  );

  // 履歴パネルで旧版を選択したとき immutable PDF を取得
  useEffect(() => {
    if (!isOpen || activeVerIdx === 0) {
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
  }, [isOpen, activeVerIdx, history, file?.name]);

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

  const hashFile = async (target: File | null): Promise<string | undefined> => {
    if (!target) return undefined;
    const buffer = await target.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  };

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
    setLeftPageJump(left.page);
    setRightPageJump(right.page);
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
    },
    [leftFile, rightFile, pendingCheckPoint, currentUser, persistAuditLinks],
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

  const focusAuditLink = (link: AuditCheckLink) => {
    setSelectedLinkId(link.id);
    setLeftPageJump(link.left.page);
    setRightPageJump(link.right.page);
  };

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

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex select-none overflow-hidden bg-slate-950">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col animate-fade-in-up transition-all duration-300">
        <ViewerHeader
          fileName={activeFile ? activeFile.name : "Document"}
          activeVersion={activeVersion}
          workflowStatus={currentStatus}
          unsavedCount={actionsLog.length}
          isReordering={isReordering}
          activeTool={activeTool}
          isLoading={isLoading}
          isHistoryOpen={isHistoryOpen}
          isSplitView={isSplitView}
          onClose={onClose}
          onToggleHistory={() => setIsHistoryOpen(!isHistoryOpen)}
          onToggleSplitView={handleToggleSplitView}
          splitViewHint={isSplitView ? "2画面照合 ON" : "2画面照合"}
          setActiveTool={setActiveTool}
          setIsReordering={setIsReordering}
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
          canApprove={canApprove}
          viewerMode={viewerMode}
          onStartEdit={() => onViewerModeChange?.("edit")}
          highlightAuditStart={highlightAuditStart}
          canSoftDeleteDocument={canSoftDeleteDocument && !!persistedDocId && !!onSoftDelete}
          onSoftDelete={onSoftDelete}
          canPurgeDocument={canPurgeDocument && !!persistedDocId && !!onPurge}
          onPurge={onPurge}
          onRestore={onRestore}
          canShareWithClient={canShareWithClient && !!onShareWithClient}
          clientSharedAt={clientSharedAt}
          onShareWithClient={onShareWithClient}
          onUnshareWithClient={onUnshareWithClient}
        />

        {(!guideDismissed && (!isSplitView || auditCheckMode)) && (
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

        <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-slate-100">
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
                  selectedLinkId={selectedLinkId}
                  pendingOnThisSide={pendingCheckPoint?.side === "left"}
                  clientId={slotIdentity?.clientId}
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
                  selectedLinkId={selectedLinkId}
                  pendingOnThisSide={pendingCheckPoint?.side === "right"}
                  emptyClickOpensSavedPicker
                  clientId={slotIdentity?.clientId}
                />
                {linksRailOpen ? (
                  <AuditLinksRail
                    links={orderedAuditLinks}
                    selectedLinkId={selectedLinkId}
                    isSavingLinks={isSavingLinks}
                    isLoadingLinks={isLoadingLinks}
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
              clearSlotSelection={clearSlotSelection}
              removeSelectedSlots={removeSelectedSlots}
              keepOnlySelectedSlots={keepOnlySelectedSlots}
              canUndo={canUndo}
              canRedo={canRedo}
              undoPageOrder={undoPageOrder}
              redoPageOrder={redoPageOrder}
              currentPage={currentPage}
              pageCountSafe={pageCountSafe}
              canGoPrev={canGoPrev}
              canGoNext={canGoNext}
              goPrevPage={goPrevPage}
              goNextPage={goNextPage}
              thumbnails={thumbnails}
              thumbnailsReady={thumbnailsReady}
              getRootProps={getRootProps}
              getInputProps={getInputProps}
              isDragActive={isDragActive}
              handleSaveReorder={handleSaveReorder}
              draggingSlotIndex={draggingSlotIndex}
              handleDragStart={handleDragStart}
              handleDragOverSlot={handleDragOverSlot}
              handleDropSlot={handleDropSlot}
              handleDragEnd={handleDragEnd}
              activeTool={activeTool}
              editPageImage={editPageImage}
              pendingOverlay={pendingOverlay}
              canvasRef={canvasRef}
              handlePointerDown={handlePointerDown}
              handlePointerMove={handlePointerMove}
              handlePointerUp={handlePointerUp}
              handlePointerCancel={handlePointerCancel}
              isDrawing={isDrawing}
              currentRect={currentRect}
              currentStrokePath={currentStrokePath}
            />
          )}
        </div>
      </div>

      {!isSplitView ? (
      <HistoryPanel
        isHistoryOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={history}
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
      />
      ) : null}

      {versionCompare ? (
        <VersionCompareView
          leftFile={versionCompare.leftFile}
          rightFile={versionCompare.rightFile}
          leftLabel={versionCompare.leftLabel}
          rightLabel={versionCompare.rightLabel}
          onClose={() => setVersionCompare(null)}
        />
      ) : null}
    </div>,
    document.body,
  );
}
