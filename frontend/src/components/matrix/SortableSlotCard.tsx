"use client";

import { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ClipboardCheck,
  FileText,
  Loader2,
  Minus,
  Plus,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { AuditApprovalBadge } from "@/features/audit/components/AuditApprovalBadge";

type SlotDocView = {
  file: File;
  pageCount: number | null;
  currentVersionLabel?: string;
  versionCount?: number;
  workflowStatus?: string;
  logicalStatus?: string;
  clientSharedAt?: string | null;
};

type Badge = { label: string; className: string; title?: string };

type Props = {
  sortableId: string;
  slotIndex: number;
  title: string;
  doc?: SlotDocView;
  slotEditMode: boolean;
  canView: boolean;
  canUpload: boolean;
  showAuditButton: boolean;
  workflowBadge: Badge | null;
  logicalBadge: Badge | null;
  classifyBadge?: Badge | null;
  showClientShareStatus?: boolean;
  slotTagsVisibility?: "hover" | "always";
  slotDragActive: boolean;
  uploadedCardClass: string;
  slotCardHeight: string;
  onOpenSlot: () => void;
  onOpenSlotForAudit: () => void;
  onClearSlot: () => void;
  onRemoveSlot?: () => void;
  canRemoveSlot?: boolean;
  onRenameSlot: (label: string) => void;
  onEmptyClick: () => void;
  onEmptyDrop: (e: React.DragEvent) => void;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDragOver: (e: React.DragEvent) => void;
};

export function SortableSlotCard({
  sortableId,
  slotIndex,
  title,
  doc,
  slotEditMode,
  canView,
  canUpload,
  showAuditButton,
  workflowBadge,
  logicalBadge,
  classifyBadge = null,
  showClientShareStatus = false,
  slotTagsVisibility = "hover",
  slotDragActive,
  uploadedCardClass,
  slotCardHeight,
  onOpenSlot,
  onOpenSlotForAudit,
  onClearSlot,
  onRemoveSlot,
  canRemoveSlot = false,
  onRenameSlot,
  onEmptyClick,
  onEmptyDrop,
  onDragEnter,
  onDragLeave,
  onDragOver,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
    disabled: !slotEditMode,
  });

  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editingTitle) setDraftTitle(title);
  }, [title, editingTitle]);

  useEffect(() => {
    if (editingTitle) inputRef.current?.focus();
  }, [editingTitle]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const jiggleClass = slotEditMode ? `slot-jiggle slot-jiggle-${(slotIndex % 4) + 1}` : "";
  const filled = Boolean(doc?.file);

  const commitRename = () => {
    const next = draftTitle.trim() || title;
    setEditingTitle(false);
    if (next !== title) onRenameSlot(next);
  };

  if (filled) {
    const isSharedWithClient = Boolean(showClientShareStatus && doc?.clientSharedAt);
    const accentBorder = isSharedWithClient ? "border-teal-500" : "border-blue-600";
    const accentRing = isSharedWithClient
      ? "ring-teal-100 hover:ring-teal-300 focus-visible:outline-teal-500"
      : "ring-blue-100 hover:ring-blue-300 focus-visible:outline-blue-500";
    const accentIcon = isSharedWithClient ? "text-teal-600" : "text-blue-600";

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`relative z-10 ${isDragging ? "z-20" : ""}`}
        {...(slotEditMode ? { ...attributes, ...listeners } : {})}
      >
        <div
          className={`group/slot-card h-full ${jiggleClass} ${uploadedCardClass} ${accentBorder} justify-between shadow-md ring-2 ${accentRing} transition-shadow ${
            slotEditMode
              ? "cursor-grab active:cursor-grabbing ring-amber-200"
              : canView
                ? `cursor-pointer hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`
                : ""
          } ${isDragging ? "opacity-90 ring-2 ring-amber-400" : ""}`}
          role={!slotEditMode && canView ? "button" : undefined}
          tabIndex={!slotEditMode && canView ? 0 : undefined}
          onClick={() => {
            if (slotEditMode || editingTitle) return;
            if (canView) onOpenSlot();
          }}
          onKeyDown={(e) => {
            if (slotEditMode || !canView) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpenSlot();
            }
          }}
        >
        {slotEditMode && canUpload ? (
          <button
            type="button"
            title="枠から外す（資料は未割当として保持・完全削除ではありません）"
            onClick={(e) => {
              e.stopPropagation();
              onClearSlot();
            }}
            className="absolute -left-1.5 -top-1.5 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-slate-700 text-white shadow-md hover:bg-amber-600"
          >
            <Minus className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
          </button>
        ) : null}
        {slotEditMode && canRemoveSlot && onRemoveSlot ? (
          <button
            type="button"
            title="枠を削除"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveSlot();
            }}
            className="absolute -right-1.5 -top-1.5 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white shadow-md hover:bg-red-700"
          >
            <Trash2 className="h-3 w-3" strokeWidth={2.5} aria-hidden />
          </button>
        ) : null}

        <div className="min-h-0 flex-1 overflow-hidden pt-1">
          <div className="flex gap-2">
            <FileText className={`h-5 w-5 shrink-0 ${accentIcon}`} />
            <div className="min-w-0 flex-1">
              {editingTitle ? (
                <input
                  ref={inputRef}
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") {
                      setDraftTitle(title);
                      setEditingTitle(false);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full rounded border border-amber-300 bg-white px-1.5 py-0.5 text-sm font-bold text-slate-800 outline-none ring-2 ring-amber-200"
                />
              ) : (
                <button
                  type="button"
                  disabled={!slotEditMode}
                  onClick={(e) => {
                    if (!slotEditMode) return;
                    e.stopPropagation();
                    setEditingTitle(true);
                  }}
                  className={`line-clamp-2 w-full text-left text-sm font-bold leading-tight text-slate-700 ${
                    slotEditMode ? "rounded px-0.5 hover:bg-amber-50" : ""
                  }`}
                >
                  {title}
                </button>
              )}
              <div className="line-clamp-1 text-[11px] font-medium text-slate-400">{doc!.file.name}</div>
              {doc!.pageCount != null && doc!.pageCount > 0 && (
                <p className="mt-0.5 text-[10px] text-slate-500">{doc!.pageCount} ページ</p>
              )}
            </div>
          </div>
          {!slotEditMode ? (
            <div
              className={`mt-1.5 flex flex-wrap gap-0.5 overflow-hidden transition-all duration-150 ${
                slotTagsVisibility === "always"
                  ? "max-h-12 opacity-100"
                  : "max-h-0 opacity-0 group-hover/slot-card:max-h-24 group-hover/slot-card:opacity-100 group-focus-within/slot-card:max-h-24 group-focus-within/slot-card:opacity-100"
              }`}
            >
              <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                収納済み
              </span>
              {doc!.logicalStatus === "processing" ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden />
                  処理中
                </span>
              ) : null}
              {doc!.currentVersionLabel ? (
                <span className="rounded-full bg-blue-50 px-1.5 py-0.5 font-mono text-[9px] font-bold text-blue-700">
                  {doc!.currentVersionLabel}
                </span>
              ) : null}
              {(doc!.versionCount ?? 0) > 1 ? (
                <span
                  className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold text-violet-700"
                  title="過去版も保持されています。枠を開いて履歴から比較できます。"
                >
                  履歴 {doc!.versionCount} 件
                </span>
              ) : null}
              {logicalBadge ? (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${logicalBadge.className}`}
                >
                  {logicalBadge.label}
                </span>
              ) : null}
              {workflowBadge ? (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${workflowBadge.className}`}
                >
                  {workflowBadge.label}
                </span>
              ) : null}
              {classifyBadge ? (
                <span
                  title={classifyBadge.title}
                  className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${classifyBadge.className}`}
                >
                  {classifyBadge.label}
                </span>
              ) : null}
              {showClientShareStatus && doc ? (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                    doc.clientSharedAt
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-900"
                  }`}
                  title={
                    doc.clientSharedAt
                      ? "クライアントポータルで閲覧可能"
                      : "クライアントには未共有（ビューアから共有できます）"
                  }
                >
                  {doc.clientSharedAt ? "共有済" : "未共有"}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {!slotEditMode && showAuditButton ? (
          <div className="relative z-10 mt-auto shrink-0 space-y-1 pt-2">
            <div className="flex justify-center">
              <AuditApprovalBadge approval="required" />
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenSlotForAudit();
              }}
              className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-indigo-600 px-2 py-1.5 text-[11px] font-bold text-white shadow-sm hover:bg-indigo-500"
              title="承認依頼〜承認完了までの正式監査フロー"
            >
              <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />
              {doc!.workflowStatus === "auditing" ? "監査を続ける" : "監査する"}
            </button>
          </div>
        ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? "z-20" : ""}
      {...(slotEditMode ? { ...attributes, ...listeners } : {})}
    >
      <div
        className={`relative h-full ${jiggleClass} ${slotCardHeight} group items-center justify-center rounded-xl border-2 border-dashed p-3 text-center transition-colors ${
          slotEditMode
            ? "cursor-grab border-amber-300 bg-amber-50/50 active:cursor-grabbing"
            : slotDragActive
              ? "cursor-pointer border-blue-500 bg-blue-50"
              : "cursor-pointer border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-white"
        } ${canUpload ? "" : "cursor-not-allowed opacity-60"} ${isDragging ? "opacity-90 ring-2 ring-amber-400" : ""}`}
        role={!slotEditMode && canUpload ? "button" : undefined}
        tabIndex={!slotEditMode && canUpload ? 0 : undefined}
        onDragEnter={(e) => {
        if (slotEditMode || !canUpload) return;
        e.preventDefault();
        onDragEnter();
      }}
      onDragOver={(e) => {
        if (slotEditMode || !canUpload) return;
        onDragOver(e);
      }}
      onDragLeave={() => {
        if (slotEditMode) return;
        onDragLeave();
      }}
      onDrop={(e) => {
        if (slotEditMode) return;
        onEmptyDrop(e);
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (slotEditMode) return;
        if (editingTitle) return;
        if (!canUpload) return;
        onEmptyClick();
      }}
    >
      {slotEditMode && (
        <>
          {canRemoveSlot && onRemoveSlot ? (
            <button
              type="button"
              title="枠を削除"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveSlot();
              }}
              className="absolute -right-1.5 -top-1.5 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white shadow-md hover:bg-red-700"
            >
              <Trash2 className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setEditingTitle(true);
            }}
            className="absolute inset-x-2 top-2 z-10 line-clamp-2 rounded px-1 text-left text-xs font-bold text-slate-600 hover:bg-amber-100/80"
          >
            {editingTitle ? (
              <input
                ref={inputRef}
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") {
                    setDraftTitle(title);
                    setEditingTitle(false);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-full rounded border border-amber-300 bg-white px-1.5 py-0.5 text-xs font-bold outline-none ring-2 ring-amber-200"
              />
            ) : (
              title
            )}
          </button>
        </>
      )}

      {!canUpload ? (
        <div className="text-xs font-bold text-slate-500">アップロード権限なし</div>
      ) : slotEditMode ? (
        <div className="flex flex-col items-center justify-center pt-6 text-amber-700/80">
          <Plus className="mb-1 h-7 w-7 opacity-60" />
          <div className="text-[10px] font-bold">空き枠</div>
        </div>
      ) : slotDragActive ? (
        <>
          <UploadCloud className="mb-2 h-8 w-8 animate-bounce text-blue-600" />
          <div className="text-sm font-black text-blue-600">ここにドロップ</div>
        </>
      ) : (
        <>
          <Plus className="mb-2 text-slate-300 group-hover:text-blue-500" />
          <div className="text-xs font-bold text-slate-400 group-hover:text-blue-500">{title}</div>
          <div className="mt-1 text-[10px] font-medium text-slate-400">PDF_ここにドロップ</div>
        </>
      )}
      </div>
    </div>
  );
}
