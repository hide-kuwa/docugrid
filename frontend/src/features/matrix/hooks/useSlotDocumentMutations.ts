import { useCallback, useRef } from "react";
import { propagateSlotNormalizeResult } from "@/features/org/org-directory-events";
import type { ClassifyPersistMetadata } from "@/features/docugrid/lib/classify";
import { hydrateDocugridForSlot } from "@/features/docugrid/lib/hydrate-docugrid-slot";
import {
  detachSlotDocument,
  moveSlotDocument,
  persistSlotDocument,
  purgeSlotDocument,
  restoreSlotDocument,
  shareSlotWithClient,
  softDeleteSlotDocument,
  unshareSlotWithClient,
} from "@/features/docugrid/lib/slot-documents";
import { useViewerUiStore } from "@/features/pdf-viewer/state/viewer-ui-store";
import { appendCustomSlot, appendPresetSlots, removeSlotAtIndex, slotIdAtIndex } from "@/lib/slot-layout-ops";
import { flattenPresetsForPeriod } from "@/lib/slot-layout-presets";
import type { DeletedSlotDoc, SlotDoc, UnassignedSlotDoc } from "@/features/matrix/types/slot-doc";
import type { UseSlotDocumentsParams } from "./useSlotDocuments";

export type SlotDocumentStore = {
  slotDocs: Record<string, SlotDoc>;
  setSlotDocs: React.Dispatch<React.SetStateAction<Record<string, SlotDoc>>>;
  unassignedDocs: Record<string, UnassignedSlotDoc>;
  setUnassignedDocs: React.Dispatch<React.SetStateAction<Record<string, UnassignedSlotDoc>>>;
  deletedDocs: Record<string, DeletedSlotDoc>;
  setDeletedDocs: React.Dispatch<React.SetStateAction<Record<string, DeletedSlotDoc>>>;
  activeSlotKey: string | null;
  setActiveSlotKey: React.Dispatch<React.SetStateAction<string | null>>;
  slotNotice: string | null;
  setSlotNotice: React.Dispatch<React.SetStateAction<string | null>>;
};

export function useSlotDocumentMutations(
  params: UseSlotDocumentsParams,
  store: SlotDocumentStore,
) {
  const {
    clientId,
    periodKey,
    canViewDocument,
    canUploadDocument,
    canPurgeDocument,
    canShareWithClient,
    currentSlotLayout,
    slotKeyFor,
    slotLabels,
    applySlotLayout,
    uploadFile,
    assignPreviewFromFile,
    loadFromCloud,
    setFile,
    setPdfUrl,
    setPageCount,
    setViewerSession,
    setExtractionReviewCtx,
    setStatusNonce,
  } = params;

  const {
    slotDocs,
    setSlotDocs,
    unassignedDocs,
    setUnassignedDocs,
    deletedDocs,
    setDeletedDocs,
    activeSlotKey,
    setActiveSlotKey,
    setSlotNotice,
  } = store;

  const shareActionBusyRef = useRef(false);

  const clearActiveViewer = useCallback(() => {
    setActiveSlotKey(null);
    setFile(null);
    setPdfUrl(null);
  }, [setFile, setPdfUrl]);

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
    [assignPreviewFromFile, loadFromCloud, setFile, setPageCount, setViewerSession],
  );

  const handleClearSlot = useCallback(
    async (slotIndex: number) => {
      const key = slotKeyFor(slotIndex);
      const doc = slotDocs[key];
      const label = slotLabels[slotIndex] ?? "枠";
      if (doc?.docId && doc.persisted) {
        try {
          await detachSlotDocument(doc.docId, clientId);
          setUnassignedDocs((prev) => ({
            ...prev,
            [doc.docId!]: {
              ...doc,
              docId: doc.docId!,
              label,
              slotId: `unassigned_${doc.docId}`,
            },
          }));
        } catch (err) {
          console.error("Slot detach failed:", err);
          setSlotNotice("資料の切り離しに失敗しました。もう一度お試しください。");
          return;
        }
      }
      setSlotDocs((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      if (activeSlotKey === key) clearActiveViewer();
      setSlotNotice(
        doc?.docId
          ? `「${label}」から資料を外しました。ファイルは未割当として保持されています。`
          : `「${label}」から資料を外しました。`,
      );
    },
    [slotKeyFor, slotLabels, slotDocs, clientId, activeSlotKey, clearActiveViewer],
  );

  const handleSoftDeleteDocument = useCallback(
    async (docId: string) => {
      if (!canUploadDocument) return;
      try {
        await softDeleteSlotDocument(docId, clientId);
        setSlotDocs((prev) => {
          const next = { ...prev };
          for (const key of Object.keys(next)) {
            if (next[key]?.docId === docId) delete next[key];
          }
          return next;
        });
        setUnassignedDocs((prev) => {
          const next = { ...prev };
          delete next[docId];
          return next;
        });
        if (activeSlotKey) {
          const activeDocId =
            slotDocs[activeSlotKey]?.docId ??
            (activeSlotKey.startsWith("unassigned:")
              ? activeSlotKey.split(":")[1]
              : activeSlotKey.startsWith("deleted:")
                ? activeSlotKey.split(":")[1]
                : undefined);
          if (activeDocId === docId) {
            clearActiveViewer();
            useViewerUiStore.getState().close();
          }
        }
        setStatusNonce((v) => v + 1);
        setSlotNotice(
          canPurgeDocument
            ? "資料を削除しました。削除済み一覧から閲覧・復元できます。"
            : "資料を削除しました。",
        );
      } catch (err) {
        console.error("Soft delete failed:", err);
        setSlotNotice("資料の削除に失敗しました。");
      }
    },
    [canUploadDocument, canPurgeDocument, clientId, activeSlotKey, slotDocs, clearActiveViewer],
  );

  const handlePurgeDocument = useCallback(
    async (docId: string) => {
      if (!canPurgeDocument) return;
      try {
        await purgeSlotDocument(docId, clientId);
        setDeletedDocs((prev) => {
          const next = { ...prev };
          delete next[docId];
          return next;
        });
        if (activeSlotKey?.startsWith(`deleted:${docId}`)) {
          clearActiveViewer();
          useViewerUiStore.getState().close();
        }
        setStatusNonce((v) => v + 1);
        setSlotNotice("資料を完全削除しました。履歴に記録のみ残ります。");
      } catch (err) {
        console.error("Purge failed:", err);
        setSlotNotice("完全削除に失敗しました。");
      }
    },
    [canPurgeDocument, clientId, activeSlotKey, clearActiveViewer],
  );

  const handleRestoreDocument = useCallback(
    async (docId: string) => {
      if (!canPurgeDocument) return;
      const snapshot = deletedDocs[docId];
      try {
        const item = await restoreSlotDocument(docId, clientId);
        setDeletedDocs((prev) => {
          const next = { ...prev };
          delete next[docId];
          return next;
        });
        if (activeSlotKey?.startsWith(`deleted:${docId}`)) clearActiveViewer();
        setStatusNonce((v) => v + 1);
        setSlotNotice(`「${snapshot?.label ?? item.original_name}」を復元しました。`);
      } catch (err) {
        console.error("Restore failed:", err);
        setSlotNotice("資料の復元に失敗しました。枠が既に使われている可能性があります。");
      }
    },
    [canPurgeDocument, clientId, deletedDocs, activeSlotKey, clearActiveViewer],
  );

  const handleShareWithClient = useCallback(
    async (docId: string) => {
      if (!canShareWithClient || shareActionBusyRef.current) return;
      shareActionBusyRef.current = true;
      try {
        const item = await shareSlotWithClient(docId, clientId);
        setSlotDocs((prev) => {
          const next = { ...prev };
          for (const key of Object.keys(next)) {
            if (next[key]?.docId === docId) {
              next[key] = { ...next[key], clientSharedAt: item.client_shared_at ?? new Date().toISOString() };
            }
          }
          return next;
        });
        setStatusNonce((v) => v + 1);
        setSlotNotice("クライアントポータルへ共有しました。");
      } catch (err) {
        console.error("Client share failed:", err);
        setSlotNotice("クライアント共有に失敗しました。");
      } finally {
        shareActionBusyRef.current = false;
      }
    },
    [canShareWithClient, clientId],
  );

  const handleUnshareWithClient = useCallback(
    async (docId: string) => {
      if (!canShareWithClient || shareActionBusyRef.current) return;
      shareActionBusyRef.current = true;
      try {
        await unshareSlotWithClient(docId, clientId);
        setSlotDocs((prev) => {
          const next = { ...prev };
          for (const key of Object.keys(next)) {
            if (next[key]?.docId === docId) {
              next[key] = { ...next[key], clientSharedAt: null };
            }
          }
          return next;
        });
        setStatusNonce((v) => v + 1);
        setSlotNotice("クライアントへの共有を解除しました。");
      } catch (err) {
        console.error("Client unshare failed:", err);
        setSlotNotice("共有解除に失敗しました。");
      } finally {
        shareActionBusyRef.current = false;
      }
    },
    [canShareWithClient, clientId],
  );

  const handleRemoveSlot = useCallback(
    async (slotIndex: number) => {
      const key = slotKeyFor(slotIndex);
      const doc = slotDocs[key];
      const label = slotLabels[slotIndex] ?? "枠";
      if (currentSlotLayout.labels.length <= 1) {
        setSlotNotice("枠は最低1つ必要です。");
        return;
      }
      const confirmMsg = doc?.file
        ? `「${label}」の枠を削除します。${
            doc.docId ? "入っている資料は未割当として保持されます。" : "未保存の資料は表示から外れます。"
          }`
        : `「${label}」の枠を削除しますか？`;
      if (!window.confirm(confirmMsg)) return;

      if (doc?.docId && doc.persisted) {
        try {
          await detachSlotDocument(doc.docId, clientId);
          setUnassignedDocs((prev) => ({
            ...prev,
            [doc.docId!]: {
              ...doc,
              docId: doc.docId!,
              label,
              slotId: `unassigned_${doc.docId}`,
            },
          }));
        } catch (err) {
          console.error("Slot detach failed:", err);
          setSlotNotice("枠削除前の資料切り離しに失敗しました。");
          return;
        }
      }
      setSlotDocs((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      if (activeSlotKey === key) clearActiveViewer();

      const { layout } = removeSlotAtIndex(currentSlotLayout, slotIndex, periodKey);
      applySlotLayout(layout);
      setSlotNotice(`「${label}」の枠を削除しました。`);
    },
    [
      slotKeyFor,
      slotDocs,
      slotLabels,
      currentSlotLayout,
      periodKey,
      applySlotLayout,
      clientId,
      activeSlotKey,
      clearActiveViewer,
    ],
  );

  const handleAddCustomSlot = useCallback(
    (label: string) => {
      const next = appendCustomSlot(currentSlotLayout, label, periodKey);
      applySlotLayout(next);
      setSlotNotice(`「${label.trim()}」枠を追加しました。`);
    },
    [currentSlotLayout, periodKey, applySlotLayout],
  );

  const handleAddPresetSlots = useCallback(
    (presetIds: string[]) => {
      const presets = flattenPresetsForPeriod(periodKey).filter((p) => presetIds.includes(p.id));
      if (presets.length === 0) return;
      const next = appendPresetSlots(currentSlotLayout, presets, periodKey);
      applySlotLayout(next);
      setSlotNotice(`定型枠を ${presets.length} 件追加しました。`);
    },
    [currentSlotLayout, periodKey, applySlotLayout],
  );

  const persistFileToSlot = useCallback(
    async (
      selectedFile: File,
      slotIndex: number,
      slotLabel: string,
      activate: boolean,
      classifyMeta?: ClassifyPersistMetadata,
    ): Promise<{ persisted: boolean; docId?: string }> => {
      const slotKey = slotKeyFor(slotIndex);
      const replacing = !!slotDocs[slotKey]?.docId;
      if (replacing) {
        setSlotDocs((prev) => ({
          ...prev,
          [slotKey]: { ...prev[slotKey], logicalStatus: "processing" },
        }));
      }
      try {
        const item = await persistSlotDocument({
          clientId,
          periodKey,
          slotId: slotIdAtIndex(currentSlotLayout, periodKey, slotIndex),
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
          const hist = (item.version_count ?? 0) > 1 ? ` — 履歴 ${item.version_count} 件` : "";
          setSlotNotice(`「${slotLabel}」に新版を保存しました${ver}${hist}`);
        }
        const norm = item.normalize_result;
        if (propagateSlotNormalizeResult(clientId, norm)) {
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
        const review = norm?.extraction_review;
        const slotId = slotIdAtIndex(currentSlotLayout, periodKey, slotIndex);
        if (
          review &&
          (review.review_status === "needs_review" ||
            review.fields.some((f) => f.status !== "extracted"))
        ) {
          setExtractionReviewCtx({ periodKey, slotId, slotLabel, review });
        } else {
          setExtractionReviewCtx(null);
        }
        if (activate) void activateDoc(selectedFile, n, slotKey);
        setStatusNonce((v) => v + 1);
        return { persisted: true, docId: item.id };
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
    [
      clientId,
      periodKey,
      slotKeyFor,
      activateDoc,
      uploadFile,
      slotDocs,
      currentSlotLayout,
      setExtractionReviewCtx,
    ],
  );

  const handleOpenUnassigned = useCallback(
    (docId: string) => {
      const doc = unassignedDocs[docId];
      if (!doc || !canViewDocument) return;
      void activateDoc(doc.file, doc.pageCount, `unassigned:${docId}`, doc.docugridDocumentId);
      useViewerUiStore.getState().open("preview", doc.file);
    },
    [unassignedDocs, canViewDocument, activateDoc],
  );

  const handleOpenDeleted = useCallback(
    (docId: string) => {
      const doc = deletedDocs[docId];
      if (!doc || !canPurgeDocument) return;
      void activateDoc(doc.file, doc.pageCount, `deleted:${docId}`, doc.docugridDocumentId);
      useViewerUiStore.getState().open("preview", doc.file);
    },
    [deletedDocs, canPurgeDocument, activateDoc],
  );

  const handleAssignUnassigned = useCallback(
    async (docId: string, slotIndex: number) => {
      const doc = unassignedDocs[docId];
      if (!doc) return;
      const targetKey = slotKeyFor(slotIndex);
      if (slotDocs[targetKey]?.file) {
        setSlotNotice("移動先の枠に既に資料があります。先に外してください。");
        return;
      }
      const targetLabel = slotLabels[slotIndex] ?? `枠 ${slotIndex + 1}`;
      const targetSlotId = slotIdAtIndex(currentSlotLayout, periodKey, slotIndex);
      try {
        await moveSlotDocument(doc.docId, targetSlotId, targetLabel, clientId);
        setSlotDocs((prev) => ({ ...prev, [targetKey]: { ...doc, persisted: true } }));
        setUnassignedDocs((prev) => {
          const next = { ...prev };
          delete next[docId];
          return next;
        });
        setSlotNotice(`「${doc.label}」を「${targetLabel}」へ移しました。`);
        setStatusNonce((v) => v + 1);
      } catch (err) {
        console.error("Move unassigned failed:", err);
        setSlotNotice("資料の移動に失敗しました。");
      }
    },
    [unassignedDocs, slotKeyFor, slotDocs, slotLabels, currentSlotLayout, periodKey, clientId],
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
      const intent = doc.workflowStatus === "auditing" ? "audit-continue" : "audit-start";
      useViewerUiStore.getState().open("edit", doc.file, intent);
    },
    [slotDocs, activeSlotKey, slotKeyFor, activateDoc],
  );


  return {
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
    onOpenSlot,
    onOpenSlotForAudit,
  };
}
