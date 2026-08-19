"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MatrixViewMode } from "@/lib/matrix-view-mode";
import {
  fetchCatalogCategories,
  type CatalogCategoryFields,
} from "@/features/docugrid/lib/document-catalog-api";
import { listSlotDocuments, type SlotDocumentItem } from "@/features/docugrid/lib/slot-documents";
import {
  buildMatrixPeriods,
  buildYearDrumMeta,
  clampYearDisplayCount,
  isOldPeriodKey,
  YEAR_DISPLAY_COUNT_DEFAULT,
} from "@/lib/fiscal-year-drum";
import {
  isDataPeriodIndex,
  PERIOD_INDEX_PERM,
  periodIndexFromKey,
  periodKeyFromIndex,
} from "@/lib/period-nav";
import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";
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
import type { loadCurrentUser } from "@/lib/auth";
import type { ClientFamilyGroup, OrgClient } from "@/config/organization";

type CurrentUser = ReturnType<typeof loadCurrentUser>;

export function useMatrixShellState(params: {
  currentUser: CurrentUser;
  orgClients: OrgClient[];
  orgGroups: ClientFamilyGroup[];
  authChecked: boolean;
  canViewDocument: boolean;
  statusNonce: number;
}) {
  const { currentUser, orgClients, orgGroups, authChecked, canViewDocument, statusNonce } = params;

  const [activeClientIdx, setActiveClientIdx] = useState(0);
  const [clientScopeMode, setClientScopeMode] = useState<ClientScopeMode>("assigned");
  const [activeMode, setActiveMode] = useState<"year" | "month">("year");
  const [activePeriodIdx, setActivePeriodIdx] = useState(2);
  const [matrixViewMode, setMatrixViewMode] = useState<MatrixViewMode>("client-period");
  const [docCategories, setDocCategories] = useState<CatalogCategoryFields[]>([]);
  const [activeDocCategoryIdx, setActiveDocCategoryIdx] = useState(0);
  const [docHistoryItems, setDocHistoryItems] = useState<SlotDocumentItem[]>([]);
  const [docHistoryLoading, setDocHistoryLoading] = useState(false);
  const [oldArchiveItems, setOldArchiveItems] = useState<SlotDocumentItem[]>([]);
  const [oldArchiveLoading, setOldArchiveLoading] = useState(false);
  const [matrixYearDisplayCount, setMatrixYearDisplayCount] = useState(YEAR_DISPLAY_COUNT_DEFAULT);
  const [karteDefaultPeriodKey, setKarteDefaultPeriodKey] = useState("year:1");

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

  const activeDocCategory = docCategories[activeDocCategoryIdx] ?? docCategories[0] ?? null;

  const toggleMatrixViewMode = useCallback(() => {
    setMatrixViewMode((prev) => (prev === "client-period" ? "document-client" : "client-period"));
  }, []);

  useEffect(() => {
    if (!authChecked || !canViewDocument) return;
    const controller = new AbortController();
    void authFetch(`${API_BASE}/system-config`, { headers: buildAuthHeaders(), signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { matrix_year_display_count?: number };
        setMatrixYearDisplayCount(clampYearDisplayCount(data.matrix_year_display_count ?? YEAR_DISPLAY_COUNT_DEFAULT));
      })
      .catch(() => {});
    return () => controller.abort();
  }, [authChecked, canViewDocument]);

  useEffect(() => {
    if (!authChecked || !canViewDocument) return;
    const controller = new AbortController();
    void fetchCatalogCategories(controller.signal)
      .then((cats) => {
        setDocCategories(cats);
        setActiveDocCategoryIdx((idx) => (idx < cats.length ? idx : 0));
      })
      .catch(() => setDocCategories([]));
    return () => controller.abort();
  }, [authChecked, canViewDocument]);

  const yearDrumMeta = useMemo(
    () => buildYearDrumMeta(matrixYearDisplayCount, new Date(), currentClient.fiscal),
    [matrixYearDisplayCount, currentClient.fiscal],
  );
  const matrixPeriods = useMemo(
    () => buildMatrixPeriods(yearDrumMeta, currentClient.fiscal),
    [yearDrumMeta, currentClient.fiscal],
  );

  const periodKey = periodKeyFromIndex(activePeriodIdx, activeMode, matrixPeriods);

  useEffect(() => {
    if (periodKey.startsWith("year:") || periodKey.startsWith("month:")) {
      setKarteDefaultPeriodKey(periodKey);
    }
  }, [periodKey]);

  useEffect(() => {
    const lastPeriodIdx = PERIOD_INDEX_PERM + matrixPeriods[activeMode].length;
    if (activePeriodIdx > lastPeriodIdx) {
      setActivePeriodIdx(PERIOD_INDEX_PERM + 1);
    }
  }, [matrixPeriods, activeMode, activePeriodIdx]);

  useEffect(() => {
    if (isDataPeriodIndex(activePeriodIdx)) {
      setActivePeriodIdx(PERIOD_INDEX_PERM);
    }
  }, [activePeriodIdx]);

  useEffect(() => {
    if (matrixViewMode !== "document-client") return;
    if (!canViewDocument || !currentClient.id || currentClient.id === "unknown") {
      setDocHistoryItems([]);
      return;
    }
    const category = docCategories[activeDocCategoryIdx];
    if (!category) {
      setDocHistoryItems([]);
      return;
    }
    const controller = new AbortController();
    setDocHistoryLoading(true);
    void listSlotDocuments(currentClient.id, undefined, controller.signal)
      .then((items) => {
        const filtered = items.filter((item) => item.slot_id === category.category_id);
        setDocHistoryItems(filtered);
      })
      .catch(() => setDocHistoryItems([]))
      .finally(() => setDocHistoryLoading(false));
    return () => controller.abort();
  }, [
    matrixViewMode,
    canViewDocument,
    currentClient.id,
    activeDocCategoryIdx,
    docCategories,
    statusNonce,
  ]);

  useEffect(() => {
    if (!isOldPeriodKey(periodKey)) {
      setOldArchiveItems([]);
      return;
    }
    if (!canViewDocument || !currentClient.id || currentClient.id === "unknown") {
      setOldArchiveItems([]);
      return;
    }
    const controller = new AbortController();
    setOldArchiveLoading(true);
    void listSlotDocuments(currentClient.id, undefined, controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setOldArchiveItems(items);
      })
      .catch(() => {
        if (!controller.signal.aborted) setOldArchiveItems([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setOldArchiveLoading(false);
      });
    return () => controller.abort();
  }, [periodKey, canViewDocument, currentClient.id, statusNonce]);

  const onJumpToPeriod = useCallback(
    (pk: string) => {
      const resolved = periodIndexFromKey(pk, matrixPeriods);
      if (!resolved) return;
      if (resolved.mode) setActiveMode(resolved.mode);
      setActivePeriodIdx(resolved.index);
    },
    [matrixPeriods],
  );

  return {
    activeClientIdx,
    setActiveClientIdx,
    clientScopeMode,
    onClientScopeModeChange,
    activeMode,
    setActiveMode,
    activePeriodIdx,
    setActivePeriodIdx,
    matrixViewMode,
    setMatrixViewMode,
    toggleMatrixViewMode,
    docCategories,
    activeDocCategoryIdx,
    setActiveDocCategoryIdx,
    activeDocCategory,
    docHistoryItems,
    docHistoryLoading,
    oldArchiveItems,
    oldArchiveLoading,
    matrixYearDisplayCount,
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
  };
}