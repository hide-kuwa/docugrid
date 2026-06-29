"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { Sparkles, Loader2 } from "lucide-react";

import { useGridSlotTagsVisibility } from "@/features/config/hooks/use-grid-slot-tags-visibility";
import {
  AuthoringWizardModal,
  AuthoringWizardTrigger,
} from "@/features/authoring/components/AuthoringWizardModal";

import type { SlotLayoutScope } from "@/lib/slot-layout-scope";
import type { SlotLayout } from "@/lib/slot-layout-storage";
import { SortableSlotCard } from "./SortableSlotCard";
import { SlotLayoutScopeBar } from "./SlotLayoutScopeBar";
import { SlotAddPanel } from "./SlotAddPanel";
import { slotPresetGroupsForPeriod } from "@/lib/slot-layout-presets";

const WORKFLOW_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft: { label: "未チェック", className: "bg-slate-100 text-slate-600" },
  review_pending: { label: "レビュー待ち", className: "bg-amber-50 text-amber-700" },
  auditing: { label: "監査中", className: "bg-indigo-50 text-indigo-700" },
  done: { label: "承認済", className: "bg-emerald-50 text-emerald-700" },
  rejected: { label: "差戻し", className: "bg-red-50 text-red-700" },
  fix: { label: "修正中", className: "bg-orange-50 text-orange-700" },
};

const LOGICAL_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  processing: { label: "処理中", className: "bg-amber-50 text-amber-700" },
  approved: { label: "論理承認", className: "bg-emerald-50 text-emerald-700" },
  remanded: { label: "差戻し", className: "bg-red-50 text-red-700" },
};

type SlotDoc = {
  file: File;
  pageCount: number | null;
  currentVersionLabel?: string;
  versionCount?: number;
  workflowStatus?: string;
  logicalStatus?: string;
  classifyMeta?: {
    confidence: number;
    engine: string;
    best?: { label: string } | null;
  };
};

type UnassignedDocView = {
  docId: string;
  label: string;
  fileName: string;
};

type Props = {
  displayOrder: number[];
  slotLabels: string[];
  slotDocs: Record<string, SlotDoc>;
  slotKeyFor: (slotIndex: number) => string;
  canView: boolean;
  canUpload: boolean;
  canShareWithClient?: boolean;
  canEditLayout: boolean;
  canApproveAudit: boolean;
  onOpenSlot: (slotIndex: number, mode: "preview" | "edit") => void;
  onOpenSlotForAudit?: (slotIndex: number) => void;
  onFilesDroppedToSlot: (files: File[], slotIndex: number, slotLabel: string) => void;
  onReorderSlots: (order: number[]) => void;
  onRenameSlot: (slotIndex: number, label: string) => void;
  onClearSlot: (slotIndex: number) => void;
  onRemoveSlot?: (slotIndex: number) => void;
  onAddCustomSlot?: (label: string) => void;
  onAddPresetSlots?: (presetIds: string[]) => void;
  periodKey?: string;
  unassignedDocs?: UnassignedDocView[];
  onOpenUnassigned?: (docId: string) => void;
  onAssignUnassigned?: (docId: string, slotIndex: number) => void;
  onDeleteUnassigned?: (docId: string) => void;
  deletedDocs?: UnassignedDocView[];
  onOpenDeleted?: (docId: string) => void;
  onRestoreDeleted?: (docId: string) => void;
  onPurgeDeleted?: (docId: string) => void;
  canAutoSort: boolean;
  isClassifying: boolean;
  classifyHint?: string | null;
  onAutoSortFiles: (files: File[]) => void;
  layoutEditScope?: SlotLayoutScope;
  onLayoutEditScopeChange?: (scope: SlotLayoutScope) => void;
  selectedLayoutClientIds?: string[];
  onSelectedLayoutClientIdsChange?: (ids: string[]) => void;
  layoutScopeStaffClients?: Array<{ id: string; name: string }>;
  clientId?: string;
  clientName?: string;
  onApplySlotLayout?: (layout: SlotLayout) => void;
  onAuthoringSave?: (
    file: File,
    slotIndex: number,
    slotLabel: string,
  ) => Promise<{ persisted: boolean }>;
};

const LONG_PRESS_MS = 480;
const LONG_PRESS_MOVE_PX = 10;

export function MatrixSlotGrid({
  displayOrder,
  slotLabels,
  slotDocs,
  slotKeyFor,
  canView,
  canUpload,
  canShareWithClient = false,
  canEditLayout,
  canApproveAudit,
  onOpenSlot,
  onOpenSlotForAudit,
  onFilesDroppedToSlot,
  onReorderSlots,
  onRenameSlot,
  onClearSlot,
  onRemoveSlot,
  onAddCustomSlot,
  onAddPresetSlots,
  periodKey = "",
  unassignedDocs = [],
  onOpenUnassigned,
  onAssignUnassigned,
  onDeleteUnassigned,
  deletedDocs = [],
  onOpenDeleted,
  onRestoreDeleted,
  onPurgeDeleted,
  canAutoSort,
  isClassifying,
  classifyHint,
  onAutoSortFiles,
  layoutEditScope = "current",
  onLayoutEditScopeChange,
  selectedLayoutClientIds = [],
  onSelectedLayoutClientIdsChange,
  layoutScopeStaffClients = [],
  clientId = "",
  clientName = "",
  onApplySlotLayout,
  onAuthoringSave,
}: Props) {
  const [slotEditMode, setSlotEditMode] = useState(false);
  const [authoringOpen, setAuthoringOpen] = useState(false);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [autoDragActive, setAutoDragActive] = useState(false);
  const { mode: slotTagsVisibility } = useGridSlotTagsVisibility();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoSortInputRef = useRef<HTMLInputElement>(null);
  const pendingSlotRef = useRef<{ index: number; label: string } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);

  const slotCardHeight = "h-[15.5rem] overflow-hidden flex flex-col";
  const uploadedCardClass = `${slotCardHeight} bg-white rounded-xl border-l-4 shadow-sm p-3`;

  const sortableIds = displayOrder.map((idx) => `slot-${idx}`);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressOriginRef.current = null;
  }, []);

  const enterEditMode = useCallback(() => {
    if (!canEditLayout) return;
    suppressClickRef.current = true;
    setSlotEditMode(true);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(12);
    }
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 400);
  }, [canEditLayout]);

  const startLongPressWatch = useCallback(
    (e: React.PointerEvent) => {
      if (!canEditLayout || slotEditMode) return;
      if ((e.target as HTMLElement).closest("[data-slot-skip-edit]")) return;
      clearLongPress();
      longPressOriginRef.current = { x: e.clientX, y: e.clientY };
      longPressTimerRef.current = setTimeout(() => {
        enterEditMode();
        clearLongPress();
      }, LONG_PRESS_MS);
    },
    [canEditLayout, slotEditMode, clearLongPress, enterEditMode],
  );

  const onGridPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const origin = longPressOriginRef.current;
      if (!origin || !longPressTimerRef.current) return;
      const dx = e.clientX - origin.x;
      const dy = e.clientY - origin.y;
      if (dx * dx + dy * dy > LONG_PRESS_MOVE_PX * LONG_PRESS_MOVE_PX) {
        clearLongPress();
      }
    },
    [clearLongPress],
  );

  useEffect(() => {
    if (!slotEditMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSlotEditMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slotEditMode]);

  const acceptPdfFiles = useCallback(
    (picked: FileList | File[], slotIndex: number, slotLabel: string) => {
      if (!canUpload || slotEditMode) return;
      const list = Array.from(picked).filter(
        (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name),
      );
      if (list.length === 0) return;
      onFilesDroppedToSlot(list, slotIndex, slotLabel);
    },
    [canUpload, slotEditMode, onFilesDroppedToSlot],
  );

  const acceptAutoSortFiles = useCallback(
    (picked: FileList | File[]) => {
      if (!canUpload || slotEditMode) return;
      const list = Array.from(picked).filter(
        (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name),
      );
      if (list.length === 0) return;
      onAutoSortFiles(list);
    },
    [canUpload, slotEditMode, onAutoSortFiles],
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortableIds.indexOf(String(active.id));
    const newIndex = sortableIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorderSlots(arrayMove(displayOrder, oldIndex, newIndex));
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-slate-800">資料の格納</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {slotEditMode
              ? "枠をドラッグして並べ替え · 名前をタップして変更 · − で資料を外す · 赤いゴミ箱で枠を削除 · 「枠を追加」で枠を増やす"
              : canEditLayout
                ? "各枠に PDF を入れるか、右端でまとめて振り分け。枠を長押しで編集モード。"
                : "各枠に PDF を入れるか、右端の箱へまとめてドロップ。収納済みの枠をクリックで開きます。"}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2" data-slot-skip-edit>
          {canUpload && clientId && onAuthoringSave && !slotEditMode ? (
            <AuthoringWizardTrigger onClick={() => setAuthoringOpen(true)} />
          ) : null}
          {canEditLayout && !slotEditMode ? (
            <button
              type="button"
              onClick={enterEditMode}
              className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800"
            >
              枠を編集
            </button>
          ) : null}
        </div>
      </div>

      {canUpload && clientId && onAuthoringSave && (
        <AuthoringWizardModal
          open={authoringOpen}
          onClose={() => setAuthoringOpen(false)}
          clientId={clientId}
          clientName={clientName}
          slotLabels={slotLabels}
          displayOrder={displayOrder}
          onApplySlotLayout={onApplySlotLayout ?? (() => {})}
          onSaveToSlot={onAuthoringSave}
        />
      )}

      <div
        className={`relative ${slotEditMode ? "rounded-2xl bg-slate-100/80 p-2 ring-2 ring-amber-200/80" : ""}`}
        onPointerDown={startLongPressWatch}
        onPointerMove={onGridPointerMove}
        onPointerUp={clearLongPress}
        onPointerCancel={clearLongPress}
        onPointerLeave={clearLongPress}
      >
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
            <div className="grid min-w-0 grid-cols-2 gap-4 fade-in-up md:grid-cols-3 lg:grid-cols-4 [&>*]:min-w-[9rem] [&>*]:h-[15.5rem]">
              {displayOrder.map((slotIndex) => {
                const title = slotLabels[slotIndex] ?? `枠 ${slotIndex + 1}`;
                const doc = slotDocs[slotKeyFor(slotIndex)];
                const workflowBadge = doc?.workflowStatus
                  ? WORKFLOW_STATUS_BADGE[doc.workflowStatus]
                  : null;
                const logicalBadge =
                  doc?.logicalStatus && doc.logicalStatus !== "uploaded"
                    ? LOGICAL_STATUS_BADGE[doc.logicalStatus]
                    : null;
                const classifyBadge = doc?.classifyMeta
                  ? {
                      label:
                        doc.classifyMeta.confidence >= 0.6
                          ? `AI ${Math.round(doc.classifyMeta.confidence * 100)}%`
                          : "要確認済",
                      className:
                        doc.classifyMeta.confidence >= 0.6
                          ? "bg-violet-50 text-violet-700"
                          : "bg-amber-50 text-amber-800",
                      title: `分類: ${doc.classifyMeta.best?.label ?? "—"} (${doc.classifyMeta.engine})`,
                    }
                  : null;
                const showAudit =
                  Boolean(
                    canApproveAudit &&
                      onOpenSlotForAudit &&
                      canView &&
                      doc?.file &&
                      (doc.workflowStatus === "review_pending" ||
                        doc.workflowStatus === "auditing"),
                  );

                const canRemoveSlot = slotLabels.length > 1 && Boolean(onRemoveSlot);

                return (
                  <SortableSlotCard
                    key={`slot-${slotIndex}`}
                    sortableId={`slot-${slotIndex}`}
                    slotIndex={slotIndex}
                    title={title}
                    doc={doc}
                    slotEditMode={slotEditMode}
                    canView={canView}
                    canUpload={canUpload}
                    canRemoveSlot={canRemoveSlot}
                    showAuditButton={showAudit}
                    workflowBadge={workflowBadge}
                    logicalBadge={logicalBadge}
                    classifyBadge={classifyBadge}
                    showClientShareStatus={canShareWithClient}
                    slotTagsVisibility={slotTagsVisibility}
                    slotDragActive={dragOverSlot === slotIndex}
                    uploadedCardClass={uploadedCardClass}
                    slotCardHeight={slotCardHeight}
                    onOpenSlot={() => {
                      if (suppressClickRef.current) return;
                      onOpenSlot(slotIndex, "edit");
                    }}
                    onOpenSlotForAudit={() => onOpenSlotForAudit?.(slotIndex)}
                    onClearSlot={() => onClearSlot(slotIndex)}
                    onRemoveSlot={onRemoveSlot ? () => onRemoveSlot(slotIndex) : undefined}
                    onRenameSlot={(label) => onRenameSlot(slotIndex, label)}
                    onEmptyClick={() => {
                      pendingSlotRef.current = { index: slotIndex, label: title };
                      fileInputRef.current?.click();
                    }}
                    onDragEnter={() => setDragOverSlot(slotIndex)}
                    onDragLeave={() =>
                      setDragOverSlot((prev) => (prev === slotIndex ? null : prev))
                    }
                    onDragOver={(e) => e.preventDefault()}
                    onEmptyDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragOverSlot(null);
                      if (e.dataTransfer.files.length > 0) {
                        acceptPdfFiles(e.dataTransfer.files, slotIndex, title);
                      }
                    }}
                  />
                );
              })}

              {slotEditMode && onAddCustomSlot && onAddPresetSlots && periodKey ? (
                <div data-slot-skip-edit className="min-w-0">
                  <SlotAddPanel
                    variant="grid"
                    presetGroups={slotPresetGroupsForPeriod(periodKey)}
                    existingLabels={slotLabels}
                    onAddCustom={onAddCustomSlot}
                    onAddPresets={onAddPresetSlots}
                  />
                </div>
              ) : null}

              {canAutoSort ? (
                <div
                  data-tour="auto-sort"
                  data-slot-skip-edit
                  role="button"
                  tabIndex={slotEditMode ? -1 : 0}
                  onDragEnter={(e) => {
                    if (slotEditMode) return;
                    e.preventDefault();
                    setAutoDragActive(true);
                  }}
                  onDragOver={(e) => {
                    if (slotEditMode) return;
                    e.preventDefault();
                    setAutoDragActive(true);
                  }}
                  onDragLeave={() => setAutoDragActive(false)}
                  onDrop={(e) => {
                    if (slotEditMode) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setAutoDragActive(false);
                    if (e.dataTransfer.files.length > 0) {
                      acceptAutoSortFiles(e.dataTransfer.files);
                    }
                  }}
                  onClick={() => {
                    if (slotEditMode) return;
                    autoSortInputRef.current?.click();
                  }}
                  className={`flex h-[15.5rem] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed p-3 text-center transition-colors ${
                    slotEditMode ? "pointer-events-none opacity-40" : ""
                  } ${
                    autoDragActive
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-indigo-300 bg-indigo-50/60 hover:border-indigo-400 hover:bg-indigo-50"
                  }`}
                >
                  {isClassifying ? (
                    <>
                      <Loader2 className="mb-2 h-8 w-8 animate-spin text-indigo-600" aria-hidden />
                      <span className="text-xs font-bold text-indigo-700">振り分け中…</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="mb-2 h-8 w-8 text-indigo-500" aria-hidden />
                      <div className="text-xs font-black text-indigo-700">まとめて自動振り分け</div>
                      <div className="mt-1 px-1 text-[10px] font-medium leading-snug text-indigo-600/90">
                        複数 PDF をドロップ
                        <br />
                        またはクリック
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </SortableContext>
        </DndContext>
        {classifyHint && canAutoSort ? (
          <p className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50/80 px-3 py-2 text-[11px] leading-relaxed text-indigo-800">
            {classifyHint}
          </p>
        ) : null}
      </div>

      {slotEditMode && unassignedDocs.length > 0 ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <h3 className="text-xs font-bold text-amber-900">未割当の資料（枠を削除した際に保持）</h3>
          <ul className="mt-2 space-y-1.5">
            {unassignedDocs.map((item) => (
              <li
                key={item.docId}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-100 bg-white px-2 py-1.5 text-[11px]"
              >
                <span className="min-w-0 flex-1 font-semibold text-slate-700">
                  {item.label}
                  <span className="ml-1 font-normal text-slate-400">({item.fileName})</span>
                </span>
                {onOpenUnassigned ? (
                  <button
                    type="button"
                    onClick={() => onOpenUnassigned(item.docId)}
                    className="rounded border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
                  >
                    開く
                  </button>
                ) : null}
                {onAssignUnassigned && displayOrder.length > 0 ? (
                  <select
                    className="max-w-[8rem] rounded border border-slate-200 px-1 py-0.5 text-[10px]"
                    defaultValue=""
                    onChange={(e) => {
                      const idx = Number(e.target.value);
                      if (Number.isInteger(idx) && idx >= 0) {
                        onAssignUnassigned(item.docId, idx);
                        e.target.value = "";
                      }
                    }}
                  >
                    <option value="" disabled>
                      枠へ移す
                    </option>
                    {displayOrder.map((idx) => (
                      <option key={idx} value={idx}>
                        {slotLabels[idx]}
                      </option>
                    ))}
                  </select>
                ) : null}
                {onDeleteUnassigned ? (
                  <button
                    type="button"
                    onClick={() => onDeleteUnassigned(item.docId)}
                    className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 hover:bg-red-100"
                    title="削除（所長のみ削除済み一覧から閲覧・復元可能）"
                  >
                    削除
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {deletedDocs.length > 0 ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50/50 p-3">
          <h3 className="text-xs font-bold text-red-900">削除済み資料（所長のみ表示）</h3>
          <p className="mt-1 text-[10px] text-red-800/80">閲覧・復元、または完全削除ができます。</p>
          <ul className="mt-2 space-y-1.5">
            {deletedDocs.map((item) => (
              <li
                key={item.docId}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-red-100 bg-white px-2 py-1.5 text-[11px]"
              >
                <span className="min-w-0 flex-1 font-semibold text-slate-700">
                  {item.label}
                  <span className="ml-1 font-normal text-slate-400">({item.fileName})</span>
                </span>
                {onOpenDeleted ? (
                  <button
                    type="button"
                    onClick={() => onOpenDeleted(item.docId)}
                    className="rounded border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
                  >
                    閲覧
                  </button>
                ) : null}
                {onRestoreDeleted ? (
                  <button
                    type="button"
                    onClick={() => onRestoreDeleted(item.docId)}
                    className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100"
                  >
                    復元
                  </button>
                ) : null}
                {onPurgeDeleted ? (
                  <button
                    type="button"
                    onClick={() => onPurgeDeleted(item.docId)}
                    className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 hover:bg-red-100"
                  >
                    完全削除
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {slotEditMode && onLayoutEditScopeChange && onSelectedLayoutClientIdsChange ? (
        <SlotLayoutScopeBar
          scope={layoutEditScope}
          onScopeChange={onLayoutEditScopeChange}
          staffClients={layoutScopeStaffClients}
          selectedClientIds={selectedLayoutClientIds}
          onSelectedClientIdsChange={onSelectedLayoutClientIdsChange}
        />
      ) : null}

      {slotEditMode ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <button
            type="button"
            onClick={() => setSlotEditMode(false)}
            className="pointer-events-auto rounded-full bg-slate-900/90 px-8 py-2.5 text-sm font-bold text-white shadow-lg backdrop-blur-sm transition hover:bg-slate-800"
          >
            完了
          </button>
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const pending = pendingSlotRef.current;
          if (!pending || !e.target.files?.length) return;
          acceptPdfFiles(e.target.files, pending.index, pending.label);
          pendingSlotRef.current = null;
          e.target.value = "";
        }}
      />
      <input
        ref={autoSortInputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          if (!e.target.files?.length) return;
          acceptAutoSortFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );
}
