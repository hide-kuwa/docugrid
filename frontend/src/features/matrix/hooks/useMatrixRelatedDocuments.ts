"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { RelatedDocumentRef } from "@/config/client-field-sources";
import { fetchAutoVouchSuggest } from "@/features/pdf-viewer/lib/auto-vouch-api";
import { useAutoVouchBridgeStore } from "@/features/pdf-viewer/state/auto-vouch-bridge-store";
import { useViewerUiStore } from "@/features/pdf-viewer/state/viewer-ui-store";
import { metricAuditLabel } from "@/features/audit/lib/metric-audit-labels";
import {
  resolveAuditOpenIntent,
  shouldOpenAuditEdit,
} from "@/features/audit/lib/resolve-audit-open-intent";
import { parseMatrixDeepLink } from "@/lib/matrix-deep-link";
import { canAccessClient, resolveStakeholder } from "@/lib/authorization";
import { setClientScope } from "@/lib/api-auth";
import { buildSlotStorageKeyFromSlotId } from "@/lib/slot-ids";
import { periodIndexFromKey } from "@/lib/period-nav";
import type { SlotDoc } from "@/features/matrix/types/slot-doc";
import type { DocugridUser } from "@/lib/auth";
import type { NavClient } from "@/lib/client-nav";
import type { PeriodLists } from "@/lib/fiscal-year-drum";

type UseMatrixRelatedDocumentsParams = {
  authChecked: boolean;
  currentUser: DocugridUser | null;
  canViewDocument: boolean;
  currentClientId: string;
  periodKey: string;
  slotDocs: Record<string, SlotDoc>;
  activeSlotKey: string | null;
  isHydratingSlots: boolean;
  matrixPeriods: PeriodLists;
  currentClient: NavClient;
  allNavClients: NavClient[];
  assignedClientIds: string[];
  assignedClientIdSet: Set<string>;
  allVisibleClientIds: string[];
  canToggleScope: boolean;
  clientScopeMode: "assigned" | "all";
  setActiveClientIdx: React.Dispatch<React.SetStateAction<number>>;
  onClientScopeModeChange: (mode: "assigned" | "all") => void;
  setActiveMode: React.Dispatch<React.SetStateAction<"year" | "month">>;
  setActivePeriodIdx: React.Dispatch<React.SetStateAction<number>>;
  activateDoc: (
    file: File,
    count: number | null,
    slotKey: string,
    docugridDocumentId?: string,
  ) => void | Promise<void>;
  setSlotNotice: (msg: string | null) => void;
};

export function useMatrixRelatedDocuments({
  authChecked,
  currentUser,
  canViewDocument,
  currentClientId,
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
}: UseMatrixRelatedDocumentsParams) {
  const router = useRouter();
  const stakeholder = resolveStakeholder(currentUser);
  const pendingRelatedOpenRef = useRef<RelatedDocumentRef | null>(null);
  const matrixDeepLinkHandled = useRef(false);

  const onSelectRelatedClient = useCallback(
    (clientId: string) => {
      if (!canAccessClient(stakeholder, clientId, currentUser?.visibleClientIds)) return;

      const inAssigned = assignedClientIdSet.has(clientId);
      if (!inAssigned && canToggleScope) {
        onClientScopeModeChange("all");
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
      onClientScopeModeChange,
      currentUser?.visibleClientIds,
      stakeholder,
      setActiveClientIdx,
    ],
  );

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
        link.vouchMetric || link.vouchField ? "check" : link.audit ? "formal" : undefined,
    };
    const resolved = periodIndexFromKey(link.periodKey, matrixPeriods);
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
    matrixPeriods,
    setActiveMode,
    setActivePeriodIdx,
  ]);

  const onOpenMetricVouch = useCallback(
    (metricKey: string, valueYen: number) => {
      if (!canViewDocument || valueYen <= 0) return;
      void fetchAutoVouchSuggest(metricKey, valueYen, currentClientId)
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
          const resolved = periodIndexFromKey(suggest.document_ref.period_key, matrixPeriods);
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
    [canViewDocument, currentClientId, matrixPeriods, setActiveMode, setActivePeriodIdx, setSlotNotice],
  );

  const onOpenRelatedDocument = useCallback(
    (ref: RelatedDocumentRef) => {
      if (!canViewDocument) return;
      const key = buildSlotStorageKeyFromSlotId(currentClientId, ref.periodKey, ref.slotId);
      const existing = slotDocs[key];
      if (periodKey === ref.periodKey && existing) {
        if (key !== activeSlotKey) {
          void activateDoc(existing.file, existing.pageCount, key, existing.docugridDocumentId);
        }
        const openMode = shouldOpenAuditEdit(ref) ? "edit" : "preview";
        const intent = resolveAuditOpenIntent(ref, existing.workflowStatus);
        useViewerUiStore.getState().open(openMode, existing.file, intent);
        return;
      }
      pendingRelatedOpenRef.current = ref;
      const resolved = periodIndexFromKey(ref.periodKey, matrixPeriods);
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
      currentClientId,
      periodKey,
      slotDocs,
      activeSlotKey,
      activateDoc,
      matrixPeriods,
      setActiveMode,
      setActivePeriodIdx,
      setSlotNotice,
    ],
  );

  useEffect(() => {
    const pending = pendingRelatedOpenRef.current;
    if (!pending || isHydratingSlots) return;
    if (periodKey !== pending.periodKey) return;
    const key = buildSlotStorageKeyFromSlotId(currentClientId, pending.periodKey, pending.slotId);
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
      void Promise.resolve(activateDoc(doc.file, doc.pageCount, key, doc.docugridDocumentId)).then(
        () => {
          useViewerUiStore.getState().open(openMode, doc.file, intent);
        },
      );
    } else {
      useViewerUiStore.getState().open(openMode, doc.file, intent);
    }
  }, [
    periodKey,
    slotDocs,
    isHydratingSlots,
    currentClientId,
    activeSlotKey,
    activateDoc,
    setSlotNotice,
  ]);

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

  return {
    onSelectRelatedClient,
    onOpenMetricVouch,
    onOpenRelatedDocument,
    relatedClients,
  };
}
