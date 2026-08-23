"use client";

import { useCallback, useEffect, useState } from "react";
import { UploadStatus } from "@/features/pdf-viewer/types";
import { useViewerUiStore } from "@/features/pdf-viewer/state/viewer-ui-store";
import {
  classifyDocument,
  describeClassifyCapabilities,
  toClassifyPersistMetadata,
  type ClassifyPersistMetadata,
  type ClassifyRankedItem,
} from "@/features/docugrid/lib/classify";
import { summarizeAutoSortEngines } from "@/features/docugrid/lib/classify-display";
import {
  createPendingClassify,
  deletePendingClassify,
  fetchPendingClassifyFile,
  listPendingClassify,
} from "@/features/docugrid/lib/pending-classify";
import type { SlotLayout } from "@/lib/slot-layout-storage";
import { slotIdAtIndex, slotIndexFromLayoutSlotId } from "@/lib/slot-layout-ops";
import { classifyCandidates } from "@/lib/slot-ids";
import { AUTO_SORT_THRESHOLD, type PendingReview } from "@/features/matrix/types/pending-review";
import type { SlotDoc } from "@/features/matrix/types/slot-doc";

type PersistFileToSlot = (
  file: File,
  slotIndex: number,
  slotLabel: string,
  showAlertOnFail: boolean,
  classifyMeta?: ClassifyPersistMetadata,
) => Promise<{ persisted: boolean; docId?: string }>;

type ActivateDoc = (
  file: File,
  count: number | null,
  slotKey: string,
  docugridDocumentId?: string,
) => void | Promise<void>;

type UseSlotClassifyParams = {
  canUploadDocument: boolean;
  canViewDocument: boolean;
  currentClientId: string;
  periodKey: string;
  slotLabels: string[];
  layoutSlotIds: string[];
  currentSlotLayout: SlotLayout;
  slotDocs: Record<string, SlotDoc>;
  slotKeyFor: (index: number) => string;
  persistFileToSlot: PersistFileToSlot;
  activateDoc: ActivateDoc;
  setSlotNotice: (msg: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  setUploadStatus: (status: UploadStatus) => void;
};

export type PendingReviewViewItem = {
  id: string;
  fileName: string;
  confidence: number;
  engine: string;
  suggestedIndex: number | null;
  ranked: { id: string; label: string; score: number }[];
};

export function useSlotClassify({
  canUploadDocument,
  canViewDocument,
  currentClientId,
  periodKey,
  slotLabels,
  layoutSlotIds,
  currentSlotLayout,
  slotDocs,
  slotKeyFor,
  persistFileToSlot,
  activateDoc,
  setSlotNotice,
  setIsLoading,
  setUploadStatus,
}: UseSlotClassifyParams) {
  const [pendingReview, setPendingReview] = useState<PendingReview[]>([]);
  const [isClassifying, setIsClassifying] = useState(false);
  const [classifyHint, setClassifyHint] = useState<string | null>(null);
  const [tourTriggerId, setTourTriggerId] = useState<string | null>(null);

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
      if (!currentClientId || currentClientId === "unknown") {
        alert("顧客が選択されていません。");
        return;
      }
      setUploadStatus("uploading");
      setIsLoading(true);
      try {
        let classifyMeta: ClassifyPersistMetadata | undefined;
        try {
          const candidates = classifyCandidates(periodKey, slotLabels, layoutSlotIds);
          const result = await classifyDocument(selectedFile, candidates, currentClientId, {
            periodKey,
            slotId: slotIdAtIndex(currentSlotLayout, periodKey, slotIndex),
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
    [
      canUploadDocument,
      currentClientId,
      persistFileToSlot,
      periodKey,
      slotLabels,
      layoutSlotIds,
      currentSlotLayout,
      setUploadStatus,
      setIsLoading,
      setSlotNotice,
    ],
  );

  const onAutoSortFiles = useCallback(
    async (files: File[]) => {
      if (!canUploadDocument) return;
      if (!currentClientId || currentClientId === "unknown") {
        alert("顧客が選択されていません。");
        return;
      }
      const pdfs = files.filter(
        (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name),
      );
      if (pdfs.length === 0) return;
      const candidates = classifyCandidates(periodKey, slotLabels, layoutSlotIds);
      const filledNow = new Set<number>();
      const queued: PendingReview[] = [];
      let autoCount = 0;
      const enginesUsed: string[] = [];
      setIsClassifying(true);
      try {
        for (const file of pdfs) {
          let bestIdx = NaN;
          let confidence = 0;
          let ranked: ClassifyRankedItem[] = [];
          let engine = "none";
          let classifyMeta: ClassifyPersistMetadata | undefined;
          try {
            const result = await classifyDocument(file, candidates, currentClientId);
            confidence = result.confidence;
            ranked = result.ranked;
            engine = result.engine;
            enginesUsed.push(engine);
            classifyMeta = toClassifyPersistMetadata(result);
            setClassifyHint(describeClassifyCapabilities(result.capabilities));
            bestIdx = result.best
              ? slotIndexFromLayoutSlotId(currentSlotLayout, periodKey, String(result.best.id))
              : NaN;
            const bestScore = result.best?.score ?? 0;
            const targetEmpty =
              Number.isInteger(bestIdx) &&
              !slotDocs[slotKeyFor(bestIdx)] &&
              !filledNow.has(bestIdx);
            if (confidence >= AUTO_SORT_THRESHOLD && bestScore >= 2 && targetEmpty) {
              let metaForSlot = classifyMeta;
              try {
                const scoped = await classifyDocument(file, candidates, currentClientId, {
                  periodKey,
                  slotId: slotIdAtIndex(currentSlotLayout, periodKey, bestIdx),
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
              clientId: currentClientId,
              periodKey,
              file: item.file,
              confidence: item.confidence,
              engine: item.engine,
              suggestedSlotId:
                item.suggestedIndex !== null && Number.isInteger(item.suggestedIndex)
                  ? slotIdAtIndex(currentSlotLayout, periodKey, item.suggestedIndex)
                  : null,
              classifyMeta: item.classifyMeta,
              ranked: item.ranked,
            });
            const file = await fetchPendingClassifyFile(
              saved.id,
              saved.file_name,
              currentClientId,
            );
            persistedQueued.push({
              ...item,
              id: saved.id,
              file,
              fileName: saved.file_name,
              suggestedIndex: saved.suggested_slot_id
                ? slotIndexFromLayoutSlotId(currentSlotLayout, periodKey, saved.suggested_slot_id)
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
        const aiSummary = summarizeAutoSortEngines(enginesUsed);
        const base =
          parts.length > 0 ? `${parts.join(" / ")}しました。` : "振り分け対象がありませんでした。";
        setSlotNotice(aiSummary ? `${base}（${aiSummary}）` : base);
      } finally {
        setIsClassifying(false);
      }
    },
    [
      canUploadDocument,
      currentClientId,
      slotLabels,
      slotDocs,
      slotKeyFor,
      persistFileToSlot,
      periodKey,
      layoutSlotIds,
      currentSlotLayout,
      setSlotNotice,
    ],
  );

  const onConfirmPending = useCallback(
    async (reviewId: string, slotIndex: number) => {
      const item = pendingReview.find((p) => p.id === reviewId);
      if (!item) return;
      let classifyMeta = item.classifyMeta;
      try {
        const candidates = classifyCandidates(periodKey, slotLabels, layoutSlotIds);
        const scoped = await classifyDocument(item.file, candidates, currentClientId, {
          periodKey,
          slotId: slotIdAtIndex(currentSlotLayout, periodKey, slotIndex),
        });
        classifyMeta = toClassifyPersistMetadata(scoped);
      } catch {
        /* keep stored classify meta */
      }
      await persistFileToSlot(item.file, slotIndex, slotLabels[slotIndex], false, classifyMeta);
      try {
        await deletePendingClassify(reviewId, currentClientId);
      } catch (err) {
        console.warn("Pending delete after confirm failed:", err);
      }
      setPendingReview((prev) => prev.filter((p) => p.id !== reviewId));
      setSlotNotice(`「${slotLabels[slotIndex]}」に確定しました。`);
    },
    [
      pendingReview,
      slotLabels,
      persistFileToSlot,
      currentClientId,
      periodKey,
      layoutSlotIds,
      currentSlotLayout,
      setSlotNotice,
    ],
  );

  const onDismissPending = useCallback(
    async (reviewId: string) => {
      try {
        await deletePendingClassify(reviewId, currentClientId);
      } catch (err) {
        console.warn("Pending delete failed:", err);
      }
      setPendingReview((prev) => prev.filter((p) => p.id !== reviewId));
    },
    [currentClientId],
  );

  const onOpenPendingPdf = useCallback(
    (reviewId: string) => {
      if (!canViewDocument) return;
      const item = pendingReview.find((p) => p.id === reviewId);
      if (!item) return;
      void activateDoc(item.file, null, `pending:${reviewId}`);
      useViewerUiStore.getState().open("preview", item.file);
    },
    [pendingReview, canViewDocument, activateDoc],
  );

  useEffect(() => {
    if (!canViewDocument) return;
    if (periodKey === "data") {
      setPendingReview([]);
      return;
    }
    if (!currentClientId || currentClientId === "unknown") {
      setPendingReview([]);
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const items = await listPendingClassify(currentClientId, periodKey, controller.signal);
        const restored = await Promise.all(
          items.map(async (item) => {
            const file = await fetchPendingClassifyFile(
              item.id,
              item.file_name,
              currentClientId,
            );
            return {
              id: item.id,
              file,
              fileName: item.file_name,
              confidence: item.confidence,
              engine: item.engine,
              suggestedIndex: item.suggested_slot_id
                ? slotIndexFromLayoutSlotId(currentSlotLayout, periodKey, item.suggested_slot_id)
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
  }, [canViewDocument, currentClientId, periodKey, currentSlotLayout]);

  const pendingReviewView: PendingReviewViewItem[] = pendingReview.map((p) => ({
    id: p.id,
    fileName: p.fileName,
    confidence: p.confidence,
    engine: p.engine,
    suggestedIndex: p.suggestedIndex,
    ranked: p.ranked.map((r) => ({ id: r.id, label: r.label, score: r.score })),
  }));

  return {
    pendingReview,
    pendingReviewView,
    isClassifying,
    classifyHint,
    tourTriggerId,
    clearTourTrigger: () => setTourTriggerId(null),
    onFilesDroppedToSlot,
    onAutoSortFiles,
    onConfirmPending,
    onDismissPending,
    onOpenPendingPdf,
  };
}
