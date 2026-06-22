"use client";

import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { UploadStatus } from "@/features/pdf-viewer/types";
import { useViewerUiStore } from "@/features/pdf-viewer/state/viewer-ui-store";
import {
  buildNavClients,
  canToggleClientScope,
  DEFAULT_NAV_CLIENTS,
  loadClientScopeMode,
  resolveAllVisibleClientIds,
  resolveAssignedClientIds,
  saveClientScopeMode,
  type ClientScopeMode,
  type NavClient,
} from "@/lib/client-nav";
import { useOrgDirectory } from "@/features/org/useOrgDirectory";
import { propagateSlotNormalizeResult } from "@/features/org/org-directory-events";
import MatrixGrid from "@/components/MatrixGrid";
import ViewerModal from "@/features/pdf-viewer";
import { API_BASE, API_ENDPOINTS } from "@/config/api";
import { checkSession, clearAuthSession, loadAccessToken, loadCurrentUser } from "@/lib/auth";
import { authFetch, buildAuthHeaders, setClientScope } from "@/lib/api-auth";
import { canAccessClient, hasPermission, resolveStakeholder } from "@/lib/authorization";
import { getPostLoginPath, resolvePersonaId, usesMatrixShell } from "@/lib/persona";
import { parseMatrixDeepLink } from "@/lib/matrix-deep-link";
import { fetchAutoVouchSuggest } from "@/features/pdf-viewer/lib/auto-vouch-api";
import { useAutoVouchBridgeStore } from "@/features/pdf-viewer/state/auto-vouch-bridge-store";
import { metricAuditLabel } from "@/features/audit/lib/metric-audit-labels";
import {
  resolveAuditOpenIntent,
  shouldOpenAuditEdit,
} from "@/features/audit/lib/resolve-audit-open-intent";
import { MatrixShellLayout } from "@/features/matrix/MatrixShellLayout";
import {
  slotCatalogKey,
  type RelatedDocumentRef,
} from "@/config/client-field-sources";
import {
  DataWorkspace,
  profileFillPercent,
} from "@/features/client-data/DataWorkspace";
import { hasInsightsPanel, InsightsPanel } from "@/features/matrix/InsightsPanel";
import { FeatureTourHost } from "@/features/onboarding/FeatureTourHost";
import { hydrateDocugridForSlot } from "@/features/docugrid/lib/hydrate-docugrid-slot";
import { parseSlotKey } from "@/features/docugrid/lib/slot-scope";
import { useDocugridAutoSync } from "@/features/docugrid/hooks/useDocugridAutoSync";
import { useSyncDocugrid } from "@/features/docugrid/hooks/useSyncDocugrid";
import { useDocugridStore } from "@/features/docugrid/state/docugrid-store";
import {
  fetchSlotDocumentFile,
  listSlotDocuments,
  persistSlotDocument,
} from "@/features/docugrid/lib/slot-documents";
import { createReviewEvent, listReviewTimeline, type ReviewTimelineItem } from "@/features/pdf-viewer/lib/review-events";
import { createDocumentVersionSnapshot } from "@/features/pdf-viewer/lib/document-versions";
import {
  classifyDocument,
  describeClassifyCapabilities,
  toClassifyPersistMetadata,
  type ClassifyPersistMetadata,
  type ClassifyRankedItem,
} from "@/features/docugrid/lib/classify";
import {
  createPendingClassify,
  deletePendingClassify,
  fetchPendingClassifyFile,
  listPendingClassify,
} from "@/features/docugrid/lib/pending-classify";
import {
  fetchDocumentStatus,
  type DocumentStatusSummary,
} from "@/features/docugrid/lib/document-status";
import {
  loadAllSlotLayouts,
  resolveSlotLayout,
  type SlotLayout,
} from "@/lib/slot-layout-storage";
import {
  applySlotLayoutWithScope,
  type SlotLayoutScope,
} from "@/lib/slot-layout-scope";
import {
  buildSlotStorageKey,
  buildSlotStorageKeyFromSlotId,
  classifyCandidates,
  normalizeSlotId,
  slotIndexFromSlotKey,
  slotIndexFromStableId,
  stableSlotId,
} from "@/lib/slot-ids";
import {
  isDataPeriodIndex,
  isPermPeriodIndex,
  periodKeyFromIndex,
  periodIndexFromKey,
} from "@/lib/period-nav";

type PendingReview = {
  id: string;
  file: File;
  fileName: string;
  confidence: number;
  engine: string;
  suggestedIndex: number | null;
  ranked: ClassifyRankedItem[];
  classifyMeta?: ClassifyPersistMetadata;
};

const AUTO_SORT_THRESHOLD = 0.6;

type SlotDoc = {
  file: File;
  pageCount: number | null;
  docId?: string;
  persisted?: boolean;
  logicalDocumentId?: string;
  currentVersionId?: string;
  currentVersionLabel?: string;
  versionCount?: number;
  workflowStatus?: string;
  logicalStatus?: string;
  docugridDocumentId?: string;
  classifyMeta?: ClassifyPersistMetadata;
};

export default function DocuGridPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState<ReturnType<typeof loadCurrentUser>>(null);
  const [activeClientIdx, setActiveClientIdx] = useState(0);
  const [clientScopeMode, setClientScopeMode] = useState<ClientScopeMode>("assigned");
  const [activeMode, setActiveMode] = useState<"year" | "month">("year");
  const [activePeriodIdx, setActivePeriodIdx] = useState(2);

  const [file, setFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [viewerSession, setViewerSession] = useState(0);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [isLoading, setIsLoading] = useState(false);
  const [slotNotice, setSlotNotice] = useState<string | null>(null);
  const isViewerOpen = useViewerUiStore((s) => s.isOpen);
  const viewerMode = useViewerUiStore((s) => s.mode);
  const viewerSourceFile = useViewerUiStore((s) => s.sourceFile);
  const fileRef = useRef<File | null>(null);
  const [slotDocs, setSlotDocs] = useState<Record<string, SlotDoc>>({});
  const [activeSlotKey, setActiveSlotKey] = useState<string | null>(null);
  const [isHydratingSlots, setIsHydratingSlots] = useState(false);
  const [pendingReview, setPendingReview] = useState<PendingReview[]>([]);
  const [isClassifying, setIsClassifying] = useState(false);
  const [docStatus, setDocStatus] = useState<DocumentStatusSummary | null>(null);
  const [clientSlotCatalog, setClientSlotCatalog] = useState<Set<string>>(new Set());
  const pendingRelatedOpenRef = useRef<RelatedDocumentRef | null>(null);
  const matrixDeepLinkHandled = useRef(false);
  const [statusNonce, setStatusNonce] = useState(0);
  const [timelineEvents, setTimelineEvents] = useState<ReviewTimelineItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const annotationSnapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleAnnotationSnapshotRef = useRef<(file: File) => void>(() => {});

  const { clients: orgClients, groups: orgGroups } = useOrgDirectory();

  useEffect(() => {
    setClientScopeMode(loadClientScopeMode());
  }, []);

  const assignedClientIds = useMemo(
    () => resolveAssignedClientIds(currentUser),
    [currentUser],
  );
  const assignedClientIdSet = useMemo(() => new Set(assignedClientIds), [assignedClientIds]);
  const allVisibleClientIds = useMemo(
    () => resolveAllVisibleClientIds(currentUser, orgClients.map((client) => client.id)),
    [currentUser, orgClients],
  );
  const canToggleScope = useMemo(
    () => canToggleClientScope(currentUser, assignedClientIds, allVisibleClientIds),
    [currentUser, assignedClientIds, allVisibleClientIds],
  );
  const drumClientIds = useMemo(
    () => (clientScopeMode === "all" ? allVisibleClientIds : assignedClientIds),
    [clientScopeMode, allVisibleClientIds, assignedClientIds],
  );
  const navClients = useMemo(
    () =>
      drumClientIds.length > 0
        ? buildNavClients(orgClients, orgGroups, drumClientIds, assignedClientIdSet)
        : DEFAULT_NAV_CLIENTS,
    [drumClientIds, orgClients, orgGroups, assignedClientIdSet],
  );
  const allNavClients = useMemo(
    () =>
      allVisibleClientIds.length > 0
        ? buildNavClients(orgClients, orgGroups, allVisibleClientIds, assignedClientIdSet)
        : navClients,
    [allVisibleClientIds, orgClients, orgGroups, assignedClientIdSet, navClients],
  );
  const currentClient: NavClient = navClients[activeClientIdx] ?? navClients[0] ?? DEFAULT_NAV_CLIENTS[0]!;
  const stakeholder = resolveStakeholder(currentUser);
  const canViewDocument = hasPermission(currentUser, "document.view");
  const canUploadDocument = hasPermission(currentUser, "document.upload");
  const canAnnotateDocument = hasPermission(currentUser, "document.annotate");
  const canApproveAudit = hasPermission(currentUser, "audit.approve");
  const canEditClientData = hasPermission(currentUser, "settings.manage");
  const personaId = resolvePersonaId(currentUser);
  const showInsights = hasInsightsPanel(personaId);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [insightsPinned, setInsightsPinned] = useState(false);
  const [tourTriggerId, setTourTriggerId] = useState<string | null>(null);
  const [classifyHint, setClassifyHint] = useState<string | null>(null);
  const scopedClientId = useMemo(() => {
    if (activeSlotKey) {
      const scope = parseSlotKey(activeSlotKey);
      if (scope?.clientId) return scope.clientId;
    }
    if (currentClient?.id && currentClient.id !== "unknown") return currentClient.id;
    return undefined;
  }, [activeSlotKey, currentClient?.id]);
  const scopedAuthHeaders = useCallback(
    () => buildAuthHeaders(scopedClientId),
    [scopedClientId],
  );
  const currentGroups = currentClient.groupLabels ?? [];
  const relatedClients = allNavClients
    .filter((client) => {
      if (client.id === currentClient.id) return false;
      if (!client.groupLabels?.length || currentGroups.length === 0) return false;
      return client.groupLabels.some((group) => currentGroups.includes(group));
    })
    .map((client) => ({
      id: client.id,
      name: client.name,
      relation: Array.from(new Set(client.relationLabels ?? [])).join(" / "),
    }));

  const assignPreviewFromFile = useCallback((source: File) => {
    const next = URL.createObjectURL(source);
    setPdfUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return next;
    });
  }, []);

  const docugridPageCount = useDocugridStore((s) => s.pageOrder.length);
  const { loadFromCloud } = useSyncDocugrid();

  useEffect(() => {
    fileRef.current = file;
  }, [file]);

  useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      const user = loadCurrentUser();
      const status = await checkSession();
      if (!active) return;

      if (status === "missing") {
        clearAuthSession();
        router.replace("/welcome");
        return;
      }
      if (status === "invalid") {
        clearAuthSession();
        router.replace("/login?reason=session");
        return;
      }
      if (status === "offline") {
        const cached = loadCurrentUser();
        if (cached && loadAccessToken()) {
          setCurrentUser(cached);
          setAuthChecked(true);
          return;
        }
        router.replace("/login?reason=offline");
        return;
      }
      const synced = loadCurrentUser() ?? user;
      if (synced && !usesMatrixShell(synced)) {
        router.replace(getPostLoginPath(synced));
        return;
      }
      if (synced) setCurrentUser(synced);
      setAuthChecked(true);
    };
    void bootstrap();
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!isViewerOpen || !viewerSourceFile) return;
    fileRef.current = viewerSourceFile;
    setFile(viewerSourceFile);
    assignPreviewFromFile(viewerSourceFile);
  }, [isViewerOpen, viewerSourceFile, assignPreviewFromFile]);

  useEffect(() => {
    if (!file && isViewerOpen) {
      useViewerUiStore.getState().close();
    }
  }, [file, isViewerOpen]);

  useEffect(() => {
    if (isViewerOpen && file && !pdfUrl) {
      assignPreviewFromFile(file);
    }
  }, [isViewerOpen, file, pdfUrl, assignPreviewFromFile]);

  useEffect(() => {
    if (!activeSlotKey || !file) return;
    setSlotDocs((prev) => {
      const cur = prev[activeSlotKey];
      if (cur && cur.file === file) return prev;
      return {
        ...prev,
        [activeSlotKey]: { ...cur, file, pageCount: cur?.pageCount ?? pageCount },
      };
    });
  }, [file, activeSlotKey, pageCount]);

  useEffect(() => {
    if (activeClientIdx >= navClients.length) {
      setActiveClientIdx(0);
    }
  }, [activeClientIdx, navClients.length]);

  useEffect(() => {
    if (!canToggleScope && clientScopeMode === "all") {
      setClientScopeMode("assigned");
      saveClientScopeMode("assigned");
    }
  }, [canToggleScope, clientScopeMode]);

  useLayoutEffect(() => {
    if (scopedClientId) setClientScope(scopedClientId);
  }, [scopedClientId]);

  const onClientScopeModeChange = useCallback(
    (mode: ClientScopeMode) => {
      setClientScopeMode(mode);
      saveClientScopeMode(mode);
      if (mode === "assigned") {
        const currentId = navClients[activeClientIdx]?.id;
        if (currentId && !assignedClientIdSet.has(currentId)) {
          setActiveClientIdx(0);
        }
      }
    },
    [activeClientIdx, assignedClientIdSet, navClients],
  );

  const onSelectRelatedClient = useCallback(
    (clientId: string) => {
      if (!canAccessClient(stakeholder, clientId, currentUser?.visibleClientIds)) return;

      const inAssigned = assignedClientIdSet.has(clientId);
      if (!inAssigned && canToggleScope) {
        setClientScopeMode("all");
        saveClientScopeMode("all");
        const idx = allVisibleClientIds.indexOf(clientId);
        if (idx >= 0) setActiveClientIdx(idx);
      } else {
        const ids = clientScopeMode === "all" ? allVisibleClientIds : assignedClientIds;
        const idx = ids.indexOf(clientId);
        if (idx >= 0) setActiveClientIdx(idx);
      }
      setClientScope(clientId);
    },
    [
      allVisibleClientIds,
      assignedClientIdSet,
      assignedClientIds,
      canToggleScope,
      clientScopeMode,
      currentUser?.visibleClientIds,
      stakeholder,
    ],
  );

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
          headers: scopedAuthHeaders(),
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
    [canUploadDocument, scopedAuthHeaders],
  );

  const periodKey = periodKeyFromIndex(activePeriodIdx, activeMode);

  const currentOrgClient = useMemo(
    () => orgClients.find((c) => c.id === currentClient.id) ?? null,
    [orgClients, currentClient.id],
  );

  useEffect(() => {
    useAutoVouchBridgeStore.getState().resetAuditSession();
  }, [currentClient.id]);

  const defaultSlotLabels = useMemo(() => {
    if (isDataPeriodIndex(activePeriodIdx)) return [];
    if (isPermPeriodIndex(activePeriodIdx))
      return ["定款", "履歴事項全部証明書", "株主名簿", "設立届出書"];
    if (activeMode === "year")
      return [
        "税務代理権限証書",
        "法人税申告書",
        "勘定科目内訳明細書",
        "法人事業概況説明書",
        "決算報告書",
        "総勘定元帳",
        "消費税申告書",
      ];
    return ["月次試算表", "通帳コピー", "請求書綴り", "給与台帳"];
  }, [activePeriodIdx, activeMode]);

  const slotLayoutKey = `${currentClient.id}:${periodKey}`;
  const [slotLayoutStore, setSlotLayoutStore] = useState<Record<string, SlotLayout>>(() =>
    typeof window !== "undefined" ? loadAllSlotLayouts() : {},
  );
  const [layoutEditScope, setLayoutEditScope] = useState<SlotLayoutScope>("current");
  const [selectedLayoutClientIds, setSelectedLayoutClientIds] = useState<string[]>([]);

  const layoutScopeStaffClients = useMemo(
    () => navClients.map((c) => ({ id: c.id, name: c.name })),
    [navClients],
  );

  const { labels: slotLabels, order: slotDisplayOrder } = useMemo(
    () => resolveSlotLayout(slotLayoutKey, defaultSlotLabels, slotLayoutStore),
    [slotLayoutKey, defaultSlotLabels, slotLayoutStore],
  );

  const slotKeyFor = useCallback(
    (slotIndex: number) => buildSlotStorageKey(currentClient.id, periodKey, slotIndex),
    [currentClient.id, periodKey],
  );

  const applySlotLayout = useCallback(
    (layout: SlotLayout) => {
      const updated = applySlotLayoutWithScope(
        layoutEditScope,
        {
          currentClientId: currentClient.id,
          periodKey,
          staffClientIds: assignedClientIds,
          orgClientIds: allVisibleClientIds,
          selectedClientIds: selectedLayoutClientIds,
        },
        layout,
      );
      setSlotLayoutStore(updated);
    },
    [
      layoutEditScope,
      currentClient.id,
      periodKey,
      assignedClientIds,
      allVisibleClientIds,
      selectedLayoutClientIds,
    ],
  );

  const handleClearSlot = useCallback(
    (slotIndex: number) => {
      const key = slotKeyFor(slotIndex);
      setSlotDocs((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setSlotNotice(`「${slotLabels[slotIndex] ?? "枠"}」から資料を外しました。`);
    },
    [slotKeyFor, slotLabels],
  );

  const onDocugridSaved = useCallback(
    (documentId: string) => {
      if (!activeSlotKey) return;
      setSlotDocs((prev) => {
        const cur = prev[activeSlotKey];
        if (!cur) return prev;
        return {
          ...prev,
          [activeSlotKey]: { ...cur, docugridDocumentId: documentId },
        };
      });
    },
    [activeSlotKey],
  );

  const activeDocugridScope = useMemo(() => {
    if (!activeSlotKey) return null;
    return parseSlotKey(activeSlotKey);
  }, [activeSlotKey]);

  const { saveNow: saveDocugridNow } = useDocugridAutoSync(activeDocugridScope, {
    enabled: canAnnotateDocument,
    onSaved: onDocugridSaved,
  });

  const activateDoc = useCallback(
    async (
      targetFile: File,
      count: number | null,
      slotKey: string,
      docugridDocumentId?: string,
    ) => {
      await hydrateDocugridForSlot(targetFile, count, loadFromCloud, docugridDocumentId);
      setActiveSlotKey(slotKey);
      setFile(targetFile);
      setPageCount(count);
      assignPreviewFromFile(targetFile);
      setViewerSession((s) => s + 1);
    },
    [assignPreviewFromFile, loadFromCloud],
  );

  // 顧客/期が変わったら Docugrid セッションをリセット
  useEffect(() => {
    useDocugridStore.getState().resetDocugrid();
    setActiveSlotKey(null);
  }, [currentClient.id, periodKey]);

  /** 1ファイルをスロットへ永続化（失敗時はローカルfallback）。activate=true で編集対象として開く。 */
  const persistFileToSlot = useCallback(
    async (
      selectedFile: File,
      slotIndex: number,
      slotLabel: string,
      activate: boolean,
      classifyMeta?: ClassifyPersistMetadata,
    ): Promise<{ persisted: boolean }> => {
      const slotKey = slotKeyFor(slotIndex);
      const replacing = !!slotDocs[slotKey]?.docId;
      if (replacing) {
        setSlotDocs((prev) => ({
          ...prev,
          [slotKey]: {
            ...prev[slotKey],
            logicalStatus: "processing",
          },
        }));
      }
      try {
        const item = await persistSlotDocument({
          clientId: currentClient.id,
          periodKey,
          slotId: stableSlotId(periodKey, slotIndex),
          slotLabel,
          file: selectedFile,
          classifyMetadata: classifyMeta,
        });
        const n = item.page_count ?? null;
        setSlotDocs((prev) => ({
          ...prev,
          [slotKey]: {
            file: selectedFile,
            pageCount: n,
            docId: item.id,
            persisted: true,
            logicalDocumentId: item.logical_document_id ?? undefined,
            currentVersionId: item.current_version_id ?? undefined,
            currentVersionLabel: item.current_version_label ?? undefined,
            versionCount: item.version_count ?? undefined,
            workflowStatus: item.workflow_status ?? undefined,
            logicalStatus: item.logical_status ?? undefined,
            classifyMeta: item.classify_metadata ?? classifyMeta,
          },
        }));
        if (replacing) {
          const ver = item.current_version_label ? ` (${item.current_version_label})` : "";
          const hist =
            (item.version_count ?? 0) > 1 ? ` — 履歴 ${item.version_count} 件` : "";
          setSlotNotice(`「${slotLabel}」に新版を保存しました${ver}${hist}`);
        }
        const norm = item.normalize_result;
        if (propagateSlotNormalizeResult(currentClient.id, norm)) {
          const nApplied = norm?.applied?.length ?? 0;
          const nMetrics = norm?.metrics_applied?.length ?? 0;
          if (nApplied > 0 || nMetrics > 0) {
            const parts: string[] = [];
            if (nApplied > 0) parts.push(`マスタ ${nApplied} 項目`);
            if (nMetrics > 0) parts.push(`指標 ${nMetrics} 件`);
            setSlotNotice((prev) =>
              prev
                ? `${prev} — 正規化: ${parts.join("・")}を反映しました。`
                : `正規化: ${parts.join("・")}を DATA マスタへ反映しました。`,
            );
          }
        }
        if (activate) void activateDoc(selectedFile, n, slotKey);
        setStatusNonce((v) => v + 1);
        return { persisted: true };
      } catch (error) {
        console.error("Slot persist failed:", error);
        const { pageCount: n } = await uploadFile(selectedFile);
        setSlotDocs((prev) => ({
          ...prev,
          [slotKey]: { file: selectedFile, pageCount: n, persisted: false },
        }));
        if (activate) void activateDoc(selectedFile, n, slotKey);
        return { persisted: false };
      }
    },
    [currentClient.id, periodKey, slotKeyFor, activateDoc, uploadFile, slotDocs],
  );

  const onFilesDroppedToSlot = useCallback(
    async (acceptedFiles: File[], slotIndex: number, slotLabel: string) => {
      if (!canUploadDocument) return;
      const selectedFile = acceptedFiles[0];
      if (!selectedFile) return;
      const isPdf =
        selectedFile.type === "application/pdf" || /\.pdf$/i.test(selectedFile.name);
      if (!isPdf) {
        alert("この画面のプレビューはPDFのみ対応しています。PDFをアップロードしてください。");
        return;
      }
      if (!currentClient.id || currentClient.id === "unknown") {
        alert("顧客が選択されていません。");
        return;
      }
      setUploadStatus("uploading");
      setIsLoading(true);
      try {
        let classifyMeta: ClassifyPersistMetadata | undefined;
        try {
          const candidates = classifyCandidates(periodKey, slotLabels);
          const result = await classifyDocument(selectedFile, candidates, currentClient.id, {
            periodKey,
            slotId: stableSlotId(periodKey, slotIndex),
          });
          classifyMeta = toClassifyPersistMetadata(result);
        } catch {
          /* 分類失敗時もスロット保存は続行 */
        }
        const { persisted } = await persistFileToSlot(
          selectedFile,
          slotIndex,
          slotLabel,
          true,
          classifyMeta,
        );
        setUploadStatus(persisted ? "success" : "error");
        setSlotNotice(
          persisted
            ? `「${slotLabel}」に保存しました（サーバー保存済み）。`
            : `「${slotLabel}」に取り込みました（サーバー保存に失敗・リロードで消えます）。`,
        );
        if (!persisted) {
          alert(
            "サーバーへの保存に失敗しました。バックエンド（http://localhost:8000）が起動しているか確認してください。",
          );
        }
      } finally {
        setIsLoading(false);
      }
    },
    [canUploadDocument, currentClient.id, persistFileToSlot, periodKey, slotLabels],
  );

  /** 自動振り分け: 複数PDFを分類し、高信頼かつ空きスロットは自動配置、それ以外は要確認キューへ。 */
  const onAutoSortFiles = useCallback(
    async (files: File[]) => {
      if (!canUploadDocument) return;
      if (!currentClient.id || currentClient.id === "unknown") {
        alert("顧客が選択されていません。");
        return;
      }
      const pdfs = files.filter(
        (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name),
      );
      if (pdfs.length === 0) return;
      const candidates = classifyCandidates(periodKey, slotLabels);
      const filledNow = new Set<number>();
      const queued: PendingReview[] = [];
      let autoCount = 0;
      setIsClassifying(true);
      try {
        for (const file of pdfs) {
          let bestIdx = NaN;
          let confidence = 0;
          let ranked: ClassifyRankedItem[] = [];
          let engine = "none";
          let classifyMeta: ClassifyPersistMetadata | undefined;
          try {
            const result = await classifyDocument(file, candidates, currentClient.id);
            confidence = result.confidence;
            ranked = result.ranked;
            engine = result.engine;
            classifyMeta = toClassifyPersistMetadata(result);
            setClassifyHint(describeClassifyCapabilities(result.capabilities));
            bestIdx = result.best
              ? slotIndexFromStableId(periodKey, String(result.best.id))
              : NaN;
            const bestScore = result.best?.score ?? 0;
            const targetEmpty =
              Number.isInteger(bestIdx) &&
              !slotDocs[slotKeyFor(bestIdx)] &&
              !filledNow.has(bestIdx);
            if (confidence >= AUTO_SORT_THRESHOLD && bestScore >= 2 && targetEmpty) {
              let metaForSlot = classifyMeta;
              try {
                const scoped = await classifyDocument(file, candidates, currentClient.id, {
                  periodKey,
                  slotId: stableSlotId(periodKey, bestIdx),
                });
                metaForSlot = toClassifyPersistMetadata(scoped);
              } catch {
                /* keep initial classify meta */
              }
              await persistFileToSlot(file, bestIdx, slotLabels[bestIdx], false, metaForSlot);
              filledNow.add(bestIdx);
              autoCount += 1;
              continue;
            }
          } catch (err) {
            console.error("Classify failed:", err);
          }
          queued.push({
            id: crypto.randomUUID(),
            file,
            fileName: file.name,
            confidence,
            engine,
            suggestedIndex: Number.isInteger(bestIdx) ? bestIdx : null,
            ranked,
            classifyMeta,
          });
        }
        const persistedQueued: PendingReview[] = [];
        for (const item of queued) {
          try {
            const saved = await createPendingClassify({
              clientId: currentClient.id,
              periodKey,
              file: item.file,
              confidence: item.confidence,
              engine: item.engine,
              suggestedSlotId:
                item.suggestedIndex !== null && Number.isInteger(item.suggestedIndex)
                  ? stableSlotId(periodKey, item.suggestedIndex)
                  : null,
              classifyMeta: item.classifyMeta,
              ranked: item.ranked,
            });
            const file = await fetchPendingClassifyFile(
              saved.id,
              saved.file_name,
              currentClient.id,
            );
            persistedQueued.push({
              ...item,
              id: saved.id,
              file,
              fileName: saved.file_name,
              suggestedIndex: saved.suggested_slot_id
                ? slotIndexFromStableId(periodKey, saved.suggested_slot_id)
                : item.suggestedIndex,
              ranked: (saved.ranked as ClassifyRankedItem[]) ?? item.ranked,
              classifyMeta: saved.classify_metadata ?? item.classifyMeta,
            });
          } catch (err) {
            console.error("Pending classify persist failed:", err);
            persistedQueued.push(item);
          }
        }
        setPendingReview((prev) => [...persistedQueued, ...prev]);
        if (persistedQueued.length > 0) setTourTriggerId("pending_review");
        const parts: string[] = [];
        if (autoCount > 0) parts.push(`${autoCount}件を自動振り分け`);
        if (persistedQueued.length > 0) parts.push(`${persistedQueued.length}件は要確認`);
        setSlotNotice(
          parts.length > 0 ? `${parts.join(" / ")}しました。` : "振り分け対象がありませんでした。",
        );
      } finally {
        setIsClassifying(false);
      }
    },
    [canUploadDocument, currentClient.id, slotLabels, slotDocs, slotKeyFor, persistFileToSlot],
  );

  const onConfirmPending = useCallback(
    async (reviewId: string, slotIndex: number) => {
      const item = pendingReview.find((p) => p.id === reviewId);
      if (!item) return;
      let classifyMeta = item.classifyMeta;
      try {
        const candidates = classifyCandidates(periodKey, slotLabels);
        const scoped = await classifyDocument(item.file, candidates, currentClient.id, {
          periodKey,
          slotId: stableSlotId(periodKey, slotIndex),
        });
        classifyMeta = toClassifyPersistMetadata(scoped);
      } catch {
        /* keep stored classify meta */
      }
      await persistFileToSlot(item.file, slotIndex, slotLabels[slotIndex], false, classifyMeta);
      try {
        await deletePendingClassify(reviewId, currentClient.id);
      } catch (err) {
        console.warn("Pending delete after confirm failed:", err);
      }
      setPendingReview((prev) => prev.filter((p) => p.id !== reviewId));
      setSlotNotice(`「${slotLabels[slotIndex]}」に確定しました。`);
    },
    [pendingReview, slotLabels, persistFileToSlot, currentClient.id, periodKey],
  );

  const onDismissPending = useCallback(
    async (reviewId: string) => {
      try {
        await deletePendingClassify(reviewId, currentClient.id);
      } catch (err) {
        console.warn("Pending delete failed:", err);
      }
      setPendingReview((prev) => prev.filter((p) => p.id !== reviewId));
    },
    [currentClient.id],
  );

  const onAssignPackageToSlot = useCallback(
    async (file: File, slotId: string, label: string) => {
      const slotIndex = slotIndexFromStableId(periodKey, slotId);
      if (!Number.isInteger(slotIndex) || slotIndex < 0) {
        setSlotNotice(`スロット「${label}」への配置に失敗しました。`);
        return;
      }
      let classifyMeta: ClassifyPersistMetadata | undefined;
      try {
        const candidates = classifyCandidates(periodKey, slotLabels);
        const result = await classifyDocument(file, candidates, currentClient.id, {
          periodKey,
          slotId,
        });
        classifyMeta = toClassifyPersistMetadata(result);
      } catch {
        /* 分類失敗時もスロット保存は続行 */
      }
      await persistFileToSlot(
        file,
        slotIndex,
        slotLabels[slotIndex] ?? label,
        false,
        classifyMeta,
      );
      setSlotNotice(`「${slotLabels[slotIndex] ?? label}」に配置しました。`);
    },
    [periodKey, slotLabels, persistFileToSlot, currentClient.id],
  );

  const onOpenSlot = useCallback(
    (slotIndex: number, mode: "preview" | "edit") => {
      const slotKey = slotKeyFor(slotIndex);
      const doc = slotDocs[slotKey];
      if (!doc) return;
      if (slotKey !== activeSlotKey) {
        void activateDoc(doc.file, doc.pageCount, slotKey, doc.docugridDocumentId);
      }
      useViewerUiStore.getState().open(mode, doc.file);
    },
    [slotDocs, activeSlotKey, slotKeyFor, activateDoc],
  );

  const onOpenSlotForAudit = useCallback(
    (slotIndex: number) => {
      const slotKey = slotKeyFor(slotIndex);
      const doc = slotDocs[slotKey];
      if (!doc) return;
      if (slotKey !== activeSlotKey) {
        void activateDoc(doc.file, doc.pageCount, slotKey, doc.docugridDocumentId);
      }
      const intent =
        doc.workflowStatus === "auditing" ? "audit-continue" : "audit-start";
      useViewerUiStore.getState().open("edit", doc.file, intent);
    },
    [slotDocs, activeSlotKey, slotKeyFor, activateDoc],
  );

  const activeSlotWorkflowStatus = activeSlotKey
    ? slotDocs[activeSlotKey]?.workflowStatus
    : undefined;

  useEffect(() => {
    if (!slotNotice) return;
    const t = window.setTimeout(() => setSlotNotice(null), 8000);
    return () => window.clearTimeout(t);
  }, [slotNotice]);

  // 顧客/期が変わったらサーバーから要確認キューを復元
  useEffect(() => {
    if (!canViewDocument) return;
    if (periodKey === "data") {
      setPendingReview([]);
      return;
    }
    if (!currentClient.id || currentClient.id === "unknown") {
      setPendingReview([]);
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const items = await listPendingClassify(
          currentClient.id,
          periodKey,
          controller.signal,
        );
        const restored = await Promise.all(
          items.map(async (item) => {
            const file = await fetchPendingClassifyFile(
              item.id,
              item.file_name,
              currentClient.id,
            );
            return {
              id: item.id,
              file,
              fileName: item.file_name,
              confidence: item.confidence,
              engine: item.engine,
              suggestedIndex: item.suggested_slot_id
                ? slotIndexFromStableId(periodKey, item.suggested_slot_id)
                : null,
              ranked: (item.ranked as ClassifyRankedItem[]) ?? [],
              classifyMeta: item.classify_metadata ?? undefined,
            } satisfies PendingReview;
          }),
        );
        if (!controller.signal.aborted) setPendingReview(restored);
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          console.warn("Pending classify hydration failed:", err);
        }
      }
    })();
    return () => controller.abort();
  }, [canViewDocument, currentClient.id, periodKey]);

  const onJumpToPeriod = useCallback((pk: string) => {
    const resolved = periodIndexFromKey(pk);
    if (!resolved) return;
    if (resolved.mode) setActiveMode(resolved.mode);
    setActivePeriodIdx(resolved.index);
  }, []);

  useEffect(() => {
    if (!authChecked || matrixDeepLinkHandled.current) return;
    const link = parseMatrixDeepLink(window.location.search);
    if (!link) return;
    if (!canAccessClient(stakeholder, link.clientId, currentUser?.visibleClientIds)) return;
    matrixDeepLinkHandled.current = true;
    onSelectRelatedClient(link.clientId);
    if (link.vouchMetric && link.vouchYen && link.vouchYen > 0) {
      useAutoVouchBridgeStore.getState().setPrefill({
        fieldId: link.vouchField ?? "",
        targetValue: link.vouchValue ?? String(link.vouchYen),
        contextHint: link.vouchHint,
        openPanel: true,
      });
      if (!link.vouchField) {
        void fetchAutoVouchSuggest(link.vouchMetric, link.vouchYen, link.clientId).then(
          (suggest) => {
            if (!suggest) return;
            useAutoVouchBridgeStore.getState().setPrefill({
              fieldId: suggest.field_id,
              targetValue: suggest.target_value,
              contextHint: suggest.context_hint ?? link.vouchHint,
              openPanel: true,
            });
          },
        );
      }
    } else if (link.vouchField && link.vouchValue) {
      useAutoVouchBridgeStore.getState().setPrefill({
        fieldId: link.vouchField,
        targetValue: link.vouchValue,
        contextHint: link.vouchHint,
        openPanel: true,
      });
    }
    pendingRelatedOpenRef.current = {
      periodKey: link.periodKey,
      slotId: link.slotId,
      label: link.slotId,
      audit: link.audit || Boolean(link.vouchMetric || link.vouchField),
      auditMode:
        link.vouchMetric || link.vouchField
          ? "check"
          : link.audit
            ? "formal"
            : undefined,
    };
    const resolved = periodIndexFromKey(link.periodKey);
    if (resolved) {
      if (resolved.mode) setActiveMode(resolved.mode);
      setActivePeriodIdx(resolved.index);
    }
    router.replace("/", { scroll: false });
  }, [
    authChecked,
    currentUser?.visibleClientIds,
    onSelectRelatedClient,
    router,
    stakeholder,
  ]);

  const onOpenMetricVouch = useCallback(
    (metricKey: string, valueYen: number) => {
      if (!canViewDocument || valueYen <= 0) return;
      void fetchAutoVouchSuggest(metricKey, valueYen, currentClient.id)
        .then((suggest) => {
          const pendingKey =
            metricKey === "monthly.revenue"
              ? useAutoVouchBridgeStore.getState().pendingMetricKey ?? metricKey
              : metricKey;
          useAutoVouchBridgeStore.getState().setPendingMetricKey(null);
          if (!suggest?.document_ref) {
            useAutoVouchBridgeStore.getState().setAuditPhase("idle");
            setSlotNotice("この指標に対応する証憑スロットが見つかりません。");
            return;
          }
          useAutoVouchBridgeStore.getState().setPrefill({
            fieldId: suggest.field_id,
            fieldLabel: suggest.field_label,
            targetValue: suggest.target_value,
            contextHint: suggest.context_hint,
            metricKey,
            metricLabel: metricAuditLabel(metricKey),
            documentLabel: suggest.document_ref.label,
            openPanel: true,
            fromMetricVouch: true,
            pendingKey,
          });
          setSlotNotice(
            `【承認不要】監査チェック: ${metricAuditLabel(metricKey)} ${suggest.target_value} → ${suggest.document_ref.label}`,
          );
          pendingRelatedOpenRef.current = {
            periodKey: suggest.document_ref.period_key,
            slotId: suggest.document_ref.slot_id,
            label: suggest.document_ref.label,
            audit: true,
            auditMode: "check",
          };
          const resolved = periodIndexFromKey(suggest.document_ref.period_key);
          if (!resolved) {
            setSlotNotice(`資料「${suggest.document_ref.label}」を開けません。`);
            pendingRelatedOpenRef.current = null;
            return;
          }
          if (resolved.mode) setActiveMode(resolved.mode);
          setActivePeriodIdx(resolved.index);
        })
        .catch(() => {
          useAutoVouchBridgeStore.getState().setPendingMetricKey(null);
          useAutoVouchBridgeStore.getState().setAuditPhase("idle");
          setSlotNotice("監査チェックの準備に失敗しました。");
        });
    },
    [canViewDocument, currentClient.id],
  );

  const onOpenRelatedDocument = useCallback(
    (ref: RelatedDocumentRef) => {
      if (!canViewDocument) return;
      const key = buildSlotStorageKeyFromSlotId(currentClient.id, ref.periodKey, ref.slotId);
      const existing = slotDocs[key];
      if (periodKey === ref.periodKey && existing) {
        if (key !== activeSlotKey) {
          void activateDoc(
            existing.file,
            existing.pageCount,
            key,
            existing.docugridDocumentId,
          );
        }
        const openMode = shouldOpenAuditEdit(ref) ? "edit" : "preview";
        const intent = resolveAuditOpenIntent(ref, existing.workflowStatus);
        useViewerUiStore.getState().open(openMode, existing.file, intent);
        return;
      }
      pendingRelatedOpenRef.current = ref;
      const resolved = periodIndexFromKey(ref.periodKey);
      if (!resolved) {
        pendingRelatedOpenRef.current = null;
        setSlotNotice(`資料「${ref.label}」を開けません。`);
        return;
      }
      if (resolved.mode) setActiveMode(resolved.mode);
      setActivePeriodIdx(resolved.index);
    },
    [
      canViewDocument,
      currentClient.id,
      periodKey,
      slotDocs,
      activeSlotKey,
      activateDoc,
    ],
  );

  useEffect(() => {
    const pending = pendingRelatedOpenRef.current;
    if (!pending || isHydratingSlots) return;
    if (periodKey !== pending.periodKey) return;
    const key = buildSlotStorageKeyFromSlotId(
      currentClient.id,
      pending.periodKey,
      pending.slotId,
    );
    const doc = slotDocs[key];
    if (!doc) {
      pendingRelatedOpenRef.current = null;
      setSlotNotice(`「${pending.label}」に資料がありません。永続枠へアップロードしてください。`);
      return;
    }
    pendingRelatedOpenRef.current = null;
    const openMode = shouldOpenAuditEdit(pending) ? "edit" : "preview";
    const intent = resolveAuditOpenIntent(pending, doc.workflowStatus);
    if (key !== activeSlotKey) {
      void activateDoc(doc.file, doc.pageCount, key, doc.docugridDocumentId).then(() => {
        useViewerUiStore.getState().open(openMode, doc.file, intent);
      });
    } else {
      useViewerUiStore.getState().open(openMode, doc.file, intent);
    }
  }, [periodKey, slotDocs, isHydratingSlots, currentClient.id, activeSlotKey, activateDoc]);

  // 顧客全体の充足状況（全期間サマリ）を取得
  useEffect(() => {
    if (!canViewDocument) return;
    if (!currentClient.id || currentClient.id === "unknown") {
      setDocStatus(null);
      return;
    }
    const controller = new AbortController();
    let active = true;
    void (async () => {
      try {
        const summary = await fetchDocumentStatus(currentClient.id, controller.signal);
        if (active) setDocStatus(summary);
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          console.warn("Failed to load document status:", err);
        }
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [canViewDocument, currentClient.id, statusNonce]);

  // データ画面の関連資料リンク用 — 顧客の全スロット一覧
  useEffect(() => {
    if (!canViewDocument) return;
    if (!currentClient.id || currentClient.id === "unknown") {
      setClientSlotCatalog(new Set());
      return;
    }
    const controller = new AbortController();
    let active = true;
    void (async () => {
      try {
        const items = await listSlotDocuments(currentClient.id, undefined, controller.signal);
        if (!active) return;
        const keys = new Set(
          items.map((item) =>
            slotCatalogKey(
              item.period_key,
              normalizeSlotId(item.period_key, item.slot_id),
            ),
          ),
        );
        setClientSlotCatalog(keys);
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          console.warn("Client slot catalog load failed:", err);
        }
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [canViewDocument, currentClient.id, statusNonce]);

  useEffect(() => {
    if (!canViewDocument) return;
    if (!currentClient.id || currentClient.id === "unknown") return;
    const controller = new AbortController();
    let active = true;
    setTimelineLoading(true);
    void (async () => {
      try {
        const events = await listReviewTimeline(
          { clientId: currentClient.id, periodKey, limit: 40 },
          controller.signal,
        );
        if (active) setTimelineEvents(events);
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          console.warn("Timeline load failed:", err);
        }
      } finally {
        if (active) setTimelineLoading(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [canViewDocument, currentClient.id, periodKey, statusNonce]);

  // 顧客/期が変わったらサーバーに保存済みの資料を復元する
  useEffect(() => {
    if (!canViewDocument) return;
    if (periodKey === "data") return;
    if (!currentClient.id || currentClient.id === "unknown") return;
    const controller = new AbortController();
    let active = true;
    void (async () => {
      try {
        setIsHydratingSlots(true);
        const items = await listSlotDocuments(currentClient.id, periodKey, controller.signal);
        if (!active) return;
        const entries = await Promise.all(
          items.map(async (item) => {
            try {
              const restored = await fetchSlotDocumentFile(item, controller.signal);
              const key = buildSlotStorageKeyFromSlotId(
                currentClient.id,
                periodKey,
                item.slot_id,
              );
              return [
                key,
                {
                  file: restored,
                  pageCount: item.page_count,
                  docId: item.id,
                  persisted: true,
                  logicalDocumentId: item.logical_document_id ?? undefined,
                  currentVersionId: item.current_version_id ?? undefined,
                  currentVersionLabel: item.current_version_label ?? undefined,
                  versionCount: item.version_count ?? undefined,
                  workflowStatus: item.workflow_status ?? undefined,
                  logicalStatus: item.logical_status ?? undefined,
                  docugridDocumentId: item.docugrid_document_id ?? undefined,
                  classifyMeta: item.classify_metadata ?? undefined,
                } satisfies SlotDoc,
              ] as const;
            } catch {
              return null;
            }
          }),
        );
        if (!active) return;
        const hydrated: Record<string, SlotDoc> = {};
        for (const entry of entries) {
          if (entry) hydrated[entry[0]] = entry[1];
        }
        setSlotDocs((prev) => ({ ...prev, ...hydrated }));
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          console.warn("Slot hydration failed:", err);
        }
      } finally {
        if (active) setIsHydratingSlots(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [currentClient.id, periodKey, canViewDocument]);

  // 監査・版管理後にメタデータだけ更新（PDF再取得はしない）
  useEffect(() => {
    if (!canViewDocument) return;
    if (!currentClient.id || currentClient.id === "unknown") return;
    if (statusNonce === 0) return;
    const controller = new AbortController();
    let active = true;
    void (async () => {
      try {
        const items = await listSlotDocuments(currentClient.id, periodKey, controller.signal);
        if (!active) return;
        setSlotDocs((prev) => {
          const next = { ...prev };
          for (const item of items) {
            const key = buildSlotStorageKeyFromSlotId(
              item.client_id,
              item.period_key,
              item.slot_id,
            );
            if (!next[key]) continue;
            next[key] = {
              ...next[key],
              docId: item.id,
              logicalDocumentId: item.logical_document_id ?? undefined,
              currentVersionId: item.current_version_id ?? undefined,
                  currentVersionLabel: item.current_version_label ?? undefined,
                  versionCount: item.version_count ?? undefined,
                  workflowStatus: item.workflow_status ?? undefined,
              logicalStatus: item.logical_status ?? undefined,
              docugridDocumentId: item.docugrid_document_id ?? undefined,
            };
          }
          return next;
        });
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          console.warn("Slot metadata refresh failed:", err);
        }
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [statusNonce, currentClient.id, periodKey, canViewDocument]);

  const closeViewer = useCallback(() => {
    useViewerUiStore.getState().close();
  }, []);

  useLayoutEffect(() => {
    if (!isViewerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isViewerOpen]);

  const logAnnotateReview = useCallback(
    (
      pageIdx: number,
      tool: string,
      rect: { x: number; y: number; w: number; h: number },
    ) => {
      if (!activeSlotKey) return;
      const scope = parseSlotKey(activeSlotKey);
      if (!scope) return;
      void createReviewEvent(scope, {
        event_type: "annotate",
        status: "draft",
        action_title: `${tool} 注釈`,
        detail: JSON.stringify({ page: pageIdx, tool, rect }),
      }).catch((err) => console.warn("annotate audit failed:", err));
    },
    [activeSlotKey],
  );

  const logExportPdfReview = useCallback(() => {
    if (!activeSlotKey) return;
    const scope = parseSlotKey(activeSlotKey);
    if (!scope) return;
    void createReviewEvent(scope, {
      event_type: "export_pdf",
      status: "draft",
      action_title: "PDF を出力",
      detail: JSON.stringify({ merge: true, source: "docugrid" }),
    }).catch((err) => console.warn("export_pdf audit failed:", err));
  }, [activeSlotKey]);

  const handleHighlight = useCallback(async (
    type: "box" | "marker" | "line" | "check" | "eraser",
    pageIdx: number,
    rect: { x: number, y: number, w: number, h: number },
    options?: { file?: File; updatePrimary?: boolean; path?: { x: number; y: number }[] },
  ) => {
    const targetFile = options?.file ?? file;
    if (!targetFile) return;
    const cleanName = targetFile.name.replace(/^(processed_)+/i, "").trim() || targetFile.name;
    try {
      const formData = new FormData();
      formData.append("file", targetFile);
      formData.append("page", pageIdx.toString());
      formData.append("x", rect.x.toString());
      formData.append("y", rect.y.toString());
      formData.append("w", rect.w.toString()); 
      formData.append("h", rect.h.toString());
      formData.append("type", type);
      if (options?.path && options.path.length > 0) {
        formData.append("path_json", JSON.stringify(options.path));
      }
      formData.append("include_render", "true");

      const response = await authFetch(API_ENDPOINTS.HIGHLIGHT, {
        method: "POST",
        body: formData,
        headers: scopedAuthHeaders(),
      });
      if (!response.ok) throw new Error(`${type} action failed`);

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = (await response.json()) as { pdf_base64: string; preview_png_base64?: string };
        const raw = atob(data.pdf_base64);
        const pdfBytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) pdfBytes[i] = raw.charCodeAt(i);
        const updatedFile = new File([pdfBytes], `processed_${cleanName}`, {
          type: "application/pdf",
        });
        if (options?.updatePrimary !== false) {
          setFile(updatedFile);
          assignPreviewFromFile(updatedFile);
          if (activeSlotKey) {
            setSlotDocs((prev) => {
              const cur = prev[activeSlotKey];
              if (!cur) return prev;
              return { ...prev, [activeSlotKey]: { ...cur, file: updatedFile } };
            });
          }
        }
        logAnnotateReview(pageIdx, type, rect);
        scheduleAnnotationSnapshotRef.current(updatedFile);
        if (data.preview_png_base64) {
          return {
            file: updatedFile,
            previewDataUrl: `data:image/png;base64,${data.preview_png_base64}`,
          };
        }
        return updatedFile;
      }

      const blob = await response.blob();
      const updatedFile = new File([blob], `processed_${cleanName}`, { type: blob.type || "application/pdf" });
      if (options?.updatePrimary !== false) {
        setFile(updatedFile);
        assignPreviewFromFile(updatedFile);
        if (activeSlotKey) {
          setSlotDocs((prev) => {
            const cur = prev[activeSlotKey];
            if (!cur) return prev;
            return { ...prev, [activeSlotKey]: { ...cur, file: updatedFile } };
          });
        }
      }
      logAnnotateReview(pageIdx, type, rect);
      scheduleAnnotationSnapshotRef.current(updatedFile);
      return updatedFile;
    } catch (error) {
      console.error(error);
      alert(`${type}処理に失敗しました。`);
    }
  }, [file, assignPreviewFromFile, activeSlotKey, logAnnotateReview, scopedAuthHeaders]);

  const handleReorder = useCallback(async (newOrderIndices: number[]) => {
    if (!file || !canAnnotateDocument) return;
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const orderStr = newOrderIndices.join(",");
      formData.append("order", orderStr);
      const response = await authFetch(API_ENDPOINTS.REORDER, {
        method: "POST",
        body: formData,
        headers: scopedAuthHeaders(),
      });
      if (!response.ok) throw new Error("Reorder failed");
      const blob = await response.blob();
      const updatedFile = new File([blob], `reordered_${file.name}`, { type: blob.type || "application/pdf" });
      setFile(updatedFile);
      assignPreviewFromFile(updatedFile);
      return updatedFile;
    } catch (error) {
      alert("並べ替え処理に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  }, [file, assignPreviewFromFile, canAnnotateDocument, scopedAuthHeaders]);

  const handleMerge = useCallback(async (filesToMerge: File[]) => {
    setIsLoading(true);
    try {
      const formData = new FormData();
      filesToMerge.forEach(f => formData.append("files", f));
      const response = await authFetch(API_ENDPOINTS.MERGE, {
        method: "POST",
        body: formData,
        headers: scopedAuthHeaders(),
      });
      if (!response.ok) throw new Error("Merge failed");
      const blob = await response.blob();
      const updatedFile = new File([blob], `merged.pdf`, { type: blob.type || "application/pdf" });
      setFile(updatedFile);
      assignPreviewFromFile(updatedFile);
      return updatedFile;
    } catch (error) {
      alert("結合処理に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  }, [assignPreviewFromFile, scopedAuthHeaders]);

  const handleGetThumbnails = useCallback(async () => {
    if (!file) return [];
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await authFetch(API_ENDPOINTS.THUMBNAILS, {
        method: "POST",
        body: formData,
        headers: scopedAuthHeaders(),
      });
      if (!response.ok) return [];
      const data = await response.json();
      if (data.thumbnails && data.thumbnails.length > 0) {
        setPageCount(data.thumbnails.length);
      }
      return data.thumbnails as string[];
    } catch (error) {
      return [];
    }
  }, [file, scopedAuthHeaders]);

  // ★修正: 第2引数で fileOverride を受け取れるように変更
  // これにより、State更新を待たずに「今できたファイル」で即時レンダリングできる
  const handleRenderPage = useCallback(async (pageIdx: number, fileOverride?: File) => {
    const targetFile = fileOverride || file;
    if (!targetFile) return null;
    
    try {
        const formData = new FormData();
        formData.append("file", targetFile);
        formData.append("page", pageIdx.toString());
        const response = await authFetch(API_ENDPOINTS.RENDER_PAGE, {
          method: "POST",
          body: formData,
          headers: scopedAuthHeaders(),
        });
        if (!response.ok) return null;
        const blob = await response.blob();
        return URL.createObjectURL(blob);
    } catch (error) {
        console.error("Render Page Error:", error);
        return null;
    }
  }, [file, scopedAuthHeaders]);

  const slotIdentity = useMemo(() => {
    if (!activeSlotKey) return undefined;
    const parts = activeSlotKey.split(":");
    if (parts.length < 3) return undefined;
    return {
      clientId: parts[0],
      slotId: parts[parts.length - 1],
      periodKey: parts.slice(1, -1).join(":"),
    };
  }, [activeSlotKey]);

  const activeSlotLabel = useMemo(() => {
    if (!activeSlotKey) return undefined;
    const idx = slotIndexFromSlotKey(activeSlotKey, periodKey);
    return idx !== null && idx >= 0 ? slotLabels[idx] : undefined;
  }, [activeSlotKey, periodKey, slotLabels]);

  const onVersionCreated = useCallback(
    (meta: {
      versionId: string;
      versionLabel: string;
      logicalDocumentId?: string;
      workflowStatus?: string;
      file: File;
    }) => {
      if (!activeSlotKey) return;
      setSlotDocs((prev) => {
        const cur = prev[activeSlotKey];
        if (!cur) return prev;
        return {
          ...prev,
          [activeSlotKey]: {
            ...cur,
            file: meta.file,
            currentVersionId: meta.versionId,
            currentVersionLabel: meta.versionLabel,
            logicalDocumentId: meta.logicalDocumentId ?? cur.logicalDocumentId,
            workflowStatus: meta.workflowStatus ?? cur.workflowStatus,
            logicalStatus: "uploaded",
          },
        };
      });
      setFile(meta.file);
      assignPreviewFromFile(meta.file);
      setStatusNonce((v) => v + 1);
    },
    [activeSlotKey, assignPreviewFromFile],
  );

  scheduleAnnotationSnapshotRef.current = (updatedFile: File) => {
    if (!canAnnotateDocument || !activeSlotKey) return;
    const scope = parseSlotKey(activeSlotKey);
    if (!scope) return;
    const idx = slotIndexFromSlotKey(activeSlotKey, periodKey);
    const label = idx !== null && idx >= 0 ? slotLabels[idx] : undefined;
    if (annotationSnapshotTimerRef.current) {
      clearTimeout(annotationSnapshotTimerRef.current);
    }
    annotationSnapshotTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          const snap = await createDocumentVersionSnapshot(
            scope,
            updatedFile,
            "minor",
            label,
          );
          onVersionCreated({
            versionId: snap.id,
            versionLabel: snap.version_label,
            logicalDocumentId: snap.logical_document_id,
            file: updatedFile,
          });
        } catch (err) {
          console.warn("annotation version snapshot failed:", err);
        }
      })();
    }, 8000);
  };

  useEffect(() => {
    return () => {
      if (annotationSnapshotTimerRef.current) {
        clearTimeout(annotationSnapshotTimerRef.current);
      }
    };
  }, []);

  const onAuditStateChange = useCallback(() => {
    setStatusNonce((v) => v + 1);
  }, []);

  const slotCount = slotLabels.length;
  const filledInView = Array.from({ length: slotCount }, (_, i) => slotKeyFor(i)).filter(
    (k) => slotDocs[k],
  ).length;
  const progressPercent = isDataPeriodIndex(activePeriodIdx)
    ? currentOrgClient
      ? profileFillPercent(currentOrgClient)
      : 0
    : isPermPeriodIndex(activePeriodIdx)
      ? 100
      : slotCount > 0
        ? Math.round((filledInView / slotCount) * 100)
        : 0;

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

  return (
    <>
    <MatrixShellLayout
      navClients={navClients}
      currentClient={currentClient}
      activeClientIdx={activeClientIdx}
      onClientChange={setActiveClientIdx}
      clientScopeMode={clientScopeMode}
      canToggleClientScope={canToggleScope}
      onClientScopeModeChange={onClientScopeModeChange}
      activeMode={activeMode}
      activePeriodIdx={activePeriodIdx}
      onPeriodChange={setActivePeriodIdx}
      onModeSwitch={() => {
        setActiveMode((prev) => (prev === "year" ? "month" : "year"));
        setActivePeriodIdx(2);
      }}
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
              onSelectRelatedClient(clientId);
              setInsightsOpen(false);
            }}
          />
        ) : undefined
      }
      footer={
        isHydratingSlots ? (
          <div className="pointer-events-none fixed bottom-4 right-4 z-20 flex items-center gap-2 rounded-full bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            保存済みの資料を復元中…
          </div>
        ) : null
      }
    >
          {isDataPeriodIndex(activePeriodIdx) ? (
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
                onOpenRelatedDocument={onOpenRelatedDocument}
                onOpenMetricVouch={onOpenMetricVouch}
                docStatus={docStatus}
                docStatusLoading={!docStatus && canViewDocument}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center p-12 text-sm text-slate-500">
                顧客データを読み込み中…
              </div>
            )
          ) : (
          <MatrixGrid
            currentClient={currentClient}
            activePeriodIdx={activePeriodIdx}
            activeMode={activeMode}
            slotLabels={slotLabels}
            displayOrder={slotDisplayOrder}
            onSlotLayoutChange={applySlotLayout}
            onClearSlot={handleClearSlot}
            slotDocs={slotDocs}
            slotKeyFor={slotKeyFor}
            progressPercent={progressPercent}
            onFilesDroppedToSlot={onFilesDroppedToSlot}
            onOpenSlot={onOpenSlot}
            onOpenSlotForAudit={onOpenSlotForAudit}
            canApproveAudit={canApproveAudit}
            slotNotice={slotNotice}
            onDismissSlotNotice={() => setSlotNotice(null)}
            relatedClients={relatedClients}
            onSelectRelatedClient={onSelectRelatedClient}
            canUpload={canUploadDocument}
            canView={canViewDocument}
            onAutoSortFiles={onAutoSortFiles}
            isClassifying={isClassifying}
            classifyHint={classifyHint}
            pendingReview={pendingReview.map((p) => ({
              id: p.id,
              fileName: p.fileName,
              confidence: p.confidence,
              engine: p.engine,
              suggestedIndex: p.suggestedIndex,
              ranked: p.ranked.map((r) => ({ id: r.id, label: r.label, score: r.score })),
            }))}
            onConfirmPending={onConfirmPending}
            onDismissPending={onDismissPending}
            docStatus={docStatus}
            currentPeriodKey={periodKey}
            onJumpToPeriod={onJumpToPeriod}
            onSaveDocugridNow={saveDocugridNow}
            onPdfExported={logExportPdfReview}
            layoutEditScope={layoutEditScope}
            onLayoutEditScopeChange={setLayoutEditScope}
            selectedLayoutClientIds={selectedLayoutClientIds}
            onSelectedLayoutClientIdsChange={setSelectedLayoutClientIds}
            layoutScopeStaffClients={layoutScopeStaffClients}
            timelineEvents={timelineEvents}
            timelineLoading={timelineLoading}
            onAssignPackageToSlot={onAssignPackageToSlot}
            onPackageNotice={setSlotNotice}
            onAuthoringSave={async (file, slotIndex, slotLabel) =>
              persistFileToSlot(file, slotIndex, slotLabel, false)
            }
          />
          )}
    </MatrixShellLayout>
    <FeatureTourHost
      user={currentUser}
      triggerTourId={tourTriggerId}
      onTriggerConsumed={() => setTourTriggerId(null)}
    />
    {isViewerOpen && file ? (
      <ViewerModal
        isOpen
        onClose={closeViewer}
        viewerMode={viewerMode}
        onViewerModeChange={(mode) => useViewerUiStore.getState().setMode(mode)}
        file={file}
        pdfUrl={pdfUrl}
        viewerSession={viewerSession}
        pageCount={pageCount}
        uploadStatus={uploadStatus}
        isLoading={isLoading}
        onHighlight={handleHighlight}
        onReorder={handleReorder}
        onMerge={handleMerge}
        onGetThumbnails={handleGetThumbnails}
        onRenderPage={handleRenderPage}
        canAnnotate={canAnnotateDocument}
        canApprove={canApproveAudit}
        syncWithDocugrid={docugridPageCount > 0}
        slotIdentity={slotIdentity}
        slotLabel={activeSlotLabel}
        onVersionCreated={onVersionCreated}
        onAuditStateChange={onAuditStateChange}
        slotWorkflowStatus={activeSlotWorkflowStatus}
      />
    ) : null}
    </>
  );
}
