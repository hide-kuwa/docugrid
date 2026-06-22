"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Clock,
  CheckCircle,
  Loader2,
  X,
} from "lucide-react";
import type { ReviewTimelineItem } from "@/features/pdf-viewer/lib/review-events";
import { MatrixSlotGrid } from "@/components/matrix/MatrixSlotGrid";
import { SyncStatusBadge } from "@/features/docugrid/components/SyncStatusBadge";
import type { SlotLayout } from "@/lib/slot-layout-storage";
import type { SlotLayoutScope } from "@/lib/slot-layout-scope";
import { useMergePdf } from "@/features/docugrid/hooks/useMergePdf";
import { useDocugridStore } from "@/features/docugrid/state/docugrid-store";
import { useViewerUiStore } from "@/features/pdf-viewer/state/viewer-ui-store";
import { Client } from "./types";
import {
  isDataPeriodIndex,
  isPermPeriodIndex,
  periodKeyFromIndex,
  periodIndexFromKey,
  periodLabelFromIndex,
} from "@/lib/period-nav";
import { PERIODS } from "./mockData";
import type { DocumentStatusSummary } from "@/features/docugrid/lib/document-status";
import { TaxPackagePanel } from "@/features/docugrid/components/TaxPackagePanel";

const TIMELINE_EVENT_LABEL: Record<string, string> = {
  upload: "アップロード",
  work_save: "作業保存",
  audit_start: "監査開始",
  approve: "承認",
  remand: "差戻し",
  page_view: "ページ閲覧",
  annotate: "注釈",
  export_pdf: "PDF出力",
  viewer_open_preview: "プレビュー",
  viewer_open_edit: "編集開始",
  viewer_close: "ビューア終了",
  audit_link_create: "監査リンク",
};

function formatTimelineWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function slotNoticeTone(message: string): "default" | "audit" | "audit-check" | "error" {
  if (message.startsWith("【承認不要】") || message.includes("承認不要")) return "audit-check";
  if (message.startsWith("監査チェック") || message.startsWith("【承認必要】")) return "audit";
  if (/失敗|見つかりません|ありません|開けません/.test(message)) return "error";
  return "default";
}

function slotNoticeStyles(tone: "default" | "audit" | "audit-check" | "error"): {
  box: string;
  icon: typeof CheckCircle;
  iconClass: string;
  text: string;
  dismiss: string;
} {
  if (tone === "audit-check") {
    return {
      box: "border-teal-200 bg-teal-50 text-teal-950",
      icon: ClipboardCheck,
      iconClass: "text-teal-600",
      text: "text-teal-950",
      dismiss: "text-teal-700 hover:bg-teal-100",
    };
  }
  if (tone === "audit") {
    return {
      box: "border-indigo-200 bg-indigo-50 text-indigo-950",
      icon: ClipboardCheck,
      iconClass: "text-indigo-600",
      text: "text-indigo-950",
      dismiss: "text-indigo-700 hover:bg-indigo-100",
    };
  }
  if (tone === "error") {
    return {
      box: "border-amber-200 bg-amber-50 text-amber-950",
      icon: AlertTriangle,
      iconClass: "text-amber-600",
      text: "text-amber-950",
      dismiss: "text-amber-700 hover:bg-amber-100",
    };
  }
  return {
    box: "border-emerald-200 bg-emerald-50 text-emerald-900",
    icon: CheckCircle,
    iconClass: "text-emerald-600",
    text: "text-emerald-900",
    dismiss: "text-emerald-700 hover:bg-emerald-100",
  };
}

export type PendingReviewView = {
  id: string;
  fileName: string;
  confidence: number;
  engine: string;
  suggestedIndex: number | null;
  ranked: Array<{ id: string; label: string; score: number }>;
};

interface MatrixGridProps {
  currentClient: Client;
  activePeriodIdx: number;
  activeMode: "year" | "month";
  slotLabels: string[];
  displayOrder: number[];
  onSlotLayoutChange: (layout: SlotLayout) => void;
  onClearSlot: (slotIndex: number) => void;
  slotDocs: Record<
    string,
    {
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
    }
  >;
  slotKeyFor: (slotIndex: number) => string;
  progressPercent: number;
  onFilesDroppedToSlot: (files: File[], slotIndex: number, slotLabel: string) => void;
  onOpenSlot: (slotIndex: number, mode: "preview" | "edit") => void;
  onOpenSlotForAudit?: (slotIndex: number) => void;
  canApproveAudit?: boolean;
  slotNotice: string | null;
  onDismissSlotNotice: () => void;
  relatedClients: Array<{ id: string; name: string; relation: string }>;
  onSelectRelatedClient: (clientId: string) => void;
  canUpload: boolean;
  canView: boolean;
  onAutoSortFiles: (files: File[]) => void;
  isClassifying: boolean;
  classifyHint?: string | null;
  pendingReview: PendingReviewView[];
  onConfirmPending: (reviewId: string, slotIndex: number) => void;
  onDismissPending: (reviewId: string) => void;
  docStatus: DocumentStatusSummary | null;
  currentPeriodKey: string;
  onJumpToPeriod: (periodKey: string) => void;
  onSaveDocugridNow?: () => Promise<string | undefined>;
  onPdfExported?: () => void;
  timelineEvents?: ReviewTimelineItem[];
  timelineLoading?: boolean;
  layoutEditScope?: SlotLayoutScope;
  onLayoutEditScopeChange?: (scope: SlotLayoutScope) => void;
  selectedLayoutClientIds?: string[];
  onSelectedLayoutClientIdsChange?: (ids: string[]) => void;
  layoutScopeStaffClients?: Array<{ id: string; name: string }>;
  onAssignPackageToSlot?: (file: File, slotId: string, label: string) => Promise<void>;
  onPackageNotice?: (message: string) => void;
  onAuthoringSave?: (
    file: File,
    slotIndex: number,
    slotLabel: string,
  ) => Promise<{ persisted: boolean }>;
}

const periodLabel = (pk: string): string => {
  if (pk === "data") return "データ";
  if (pk === "perm") return "永続";
  const resolved = periodIndexFromKey(pk);
  if (!resolved?.mode) return pk;
  const label = periodLabelFromIndex(resolved.index, resolved.mode, PERIODS);
  return label ?? pk;
};

export default function MatrixGrid({
  currentClient,
  activePeriodIdx,
  activeMode,
  slotLabels,
  displayOrder,
  onSlotLayoutChange,
  onClearSlot,
  slotDocs,
  slotKeyFor,
  progressPercent,
  onFilesDroppedToSlot,
  onOpenSlot,
  onOpenSlotForAudit,
  canApproveAudit = false,
  slotNotice,
  onDismissSlotNotice,
  relatedClients,
  onSelectRelatedClient,
  canUpload,
  canView,
  onAutoSortFiles,
  isClassifying,
  classifyHint,
  pendingReview,
  onConfirmPending,
  onDismissPending,
  docStatus,
  currentPeriodKey,
  onJumpToPeriod,
  onSaveDocugridNow,
  onPdfExported,
  timelineEvents = [],
  timelineLoading = false,
  layoutEditScope = "current",
  onLayoutEditScopeChange,
  selectedLayoutClientIds = [],
  onSelectedLayoutClientIdsChange,
  layoutScopeStaffClients = [],
  onAssignPackageToSlot,
  onPackageNotice,
  onAuthoringSave,
}: MatrixGridProps) {
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const pendingReviewRef = useRef<HTMLDivElement>(null);
  const prevPendingCountRef = useRef(0);

  useEffect(() => {
    if (pendingReview.length > prevPendingCountRef.current && pendingReview.length > 0) {
      pendingReviewRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    prevPendingCountRef.current = pendingReview.length;
  }, [pendingReview.length]);

  const slotCount = slotLabels.length;

  const missingCurrent = Array.from({ length: slotCount }, (_, i) => i)
    .filter((i) => !slotDocs[slotKeyFor(i)])
    .map((i) => slotLabels[i] ?? `枠 ${i + 1}`);
  const incompletePeriods = (docStatus?.periods ?? []).filter(
    (p) => !p.complete && p.period_key !== currentPeriodKey,
  );

  const pageOrderLen = useDocugridStore((s) => s.pageOrder.length);
  const sessionSyncStatus = useDocugridStore((s) => s.sessionSyncStatus);
  const persistedDocumentId = useDocugridStore((s) => s.persistedDocumentId);
  const { mergeFromStore, isMerging } = useMergePdf({
    onExportSuccess: onPdfExported,
  });

  const remandedSlots = Array.from({ length: slotCount }, (_, i) => ({
    label: slotLabels[i] ?? `枠 ${i + 1}`,
    doc: slotDocs[slotKeyFor(i)],
  })).filter(({ doc }) => doc?.workflowStatus === "rejected" || doc?.workflowStatus === "fix");

  const auditQueueSlots = Array.from({ length: slotCount }, (_, i) => ({
    label: slotLabels[i] ?? `枠 ${i + 1}`,
    index: i,
    doc: slotDocs[slotKeyFor(i)],
  }))
    .filter(
      ({ doc }) =>
        doc?.workflowStatus === "review_pending" || doc?.workflowStatus === "auditing",
    );

  const currentPendingApproval =
    docStatus?.periods.find((p) => p.period_key === currentPeriodKey)?.pending_approval ?? [];

  const todayTaskCount =
    pendingReview.length +
    remandedSlots.length +
    missingCurrent.length +
    currentPendingApproval.length +
    (canApproveAudit ? auditQueueSlots.length : 0);

  const acceptAutoSortFiles = useCallback(
    (picked: FileList | File[]) => {
      if (!canUpload) return;
      const list = Array.from(picked).filter(
        (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name),
      );
      if (list.length === 0) return;
      onAutoSortFiles(list);
    },
    [canUpload, onAutoSortFiles],
  );

  const wrapDropToSlot = useCallback(
    (files: File[], slotIndex: number, slotLabel: string) => {
      void Promise.resolve(onFilesDroppedToSlot(files, slotIndex, slotLabel)).catch((err) => {
        console.error("File drop failed:", err);
        alert("ファイルの取り込みに失敗しました。");
      });
    },
    [onFilesDroppedToSlot],
  );

  return (
    <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-slate-100 transition-opacity duration-300 select-none">
      {slotNotice ? (() => {
        const tone = slotNoticeTone(slotNotice);
        const styles = slotNoticeStyles(tone);
        const Icon = styles.icon;
        return (
        <div
          role="status"
          className={`mx-4 mt-3 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-sm md:mx-8 ${styles.box}`}
        >
          <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${styles.iconClass}`} aria-hidden />
          <p className={`min-w-0 flex-1 font-medium leading-snug ${styles.text}`}>{slotNotice}</p>
          <button
            type="button"
            onClick={onDismissSlotNotice}
            className={`shrink-0 rounded p-1 ${styles.dismiss}`}
            aria-label="通知を閉じる"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        );
      })() : null}

      <header className="z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 bg-white/80 px-4 py-2 backdrop-blur md:px-6">
        <div className="min-w-0 flex-1 basis-[min(100%,14rem)]">
          <div className="flex flex-wrap items-center gap-2">
            <div className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-400">CLIENT</div>
            <span
              className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold ${
                currentClient.fiscal === 3
                  ? "border-red-200 bg-red-100 text-red-500"
                  : "border-slate-200 bg-slate-100 text-slate-500"
              }`}
            >
              {currentClient.fiscal}月決算
            </span>
          </div>
          <div className="text-lg font-bold leading-snug text-slate-800">
            {isDataPeriodIndex(activePeriodIdx) ? (
              <span className="text-violet-600">顧客データ（正規化一覧）</span>
            ) : isPermPeriodIndex(activePeriodIdx) ? (
              <span className="text-yellow-600">永久保存ドキュメント</span>
            ) : (
              <span>
                <span
                  className={`mr-2 inline ${
                    activeMode === "year" ? "text-blue-600" : "text-green-500"
                  }`}
                >
                  {periodLabelFromIndex(activePeriodIdx, activeMode, PERIODS) ?? "—"}
                </span>
                {activeMode === "year" ? "決算資料" : "月次監査"}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {relatedClients.length > 0 && (
            <div className="flex max-w-[min(100%,28rem)] items-center gap-2 rounded-lg border border-slate-200 bg-white/70 px-3 py-1.5">
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                関係先
              </span>
              <div className="flex min-w-0 flex-wrap gap-1">
                {relatedClients.slice(0, 4).map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => onSelectRelatedClient(client.id)}
                    className="max-w-full truncate rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100"
                    title={client.relation}
                  >
                    {client.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white/70 px-2 py-1">
            <span className="text-base font-black tabular-nums text-brand-600">{progressPercent}%</span>
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
              <svg className="h-10 w-10 -rotate-90 transform">
                <circle cx="20" cy="20" r="16" stroke="#e2e8f0" strokeWidth="3.5" fill="transparent" />
                <circle
                  cx="20"
                  cy="20"
                  r="16"
                  stroke="#3b82f6"
                  strokeWidth="3.5"
                  fill="transparent"
                  strokeDasharray="100"
                  strokeDashoffset={100 - progressPercent}
                  className="transition-all duration-700"
                />
              </svg>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-3 md:p-6">
        <MatrixSlotGrid
          displayOrder={displayOrder}
          slotLabels={slotLabels}
          slotDocs={slotDocs}
          slotKeyFor={slotKeyFor}
          canView={canView}
          canUpload={canUpload}
          canEditLayout={canUpload}
          canApproveAudit={canApproveAudit}
          onOpenSlot={onOpenSlot}
          onOpenSlotForAudit={onOpenSlotForAudit}
          onFilesDroppedToSlot={wrapDropToSlot}
          onReorderSlots={(order) => onSlotLayoutChange({ labels: slotLabels, order })}
          onRenameSlot={(slotIndex, label) => {
            const next = [...slotLabels];
            next[slotIndex] = label;
            onSlotLayoutChange({ labels: next, order: displayOrder });
          }}
          onClearSlot={onClearSlot}
          canAutoSort={canUpload}
          isClassifying={isClassifying}
          classifyHint={classifyHint}
          onAutoSortFiles={acceptAutoSortFiles}
          layoutEditScope={layoutEditScope}
          onLayoutEditScopeChange={onLayoutEditScopeChange}
          selectedLayoutClientIds={selectedLayoutClientIds}
          onSelectedLayoutClientIdsChange={onSelectedLayoutClientIdsChange}
          layoutScopeStaffClients={layoutScopeStaffClients}
          clientId={currentClient.id}
          clientName={currentClient.name}
          onApplySlotLayout={onSlotLayoutChange}
          onAuthoringSave={onAuthoringSave}
        />

        {canUpload && onAssignPackageToSlot && onPackageNotice && (
          <TaxPackagePanel
            canUpload={canUpload}
            clientId={currentClient.id}
            periodKey={currentPeriodKey}
            onAssignToSlot={onAssignPackageToSlot}
            onNotice={onPackageNotice}
          />
        )}

        <div className="mt-10 space-y-5 border-t border-slate-200 pt-8">
          <h2 className="text-sm font-bold text-slate-600">ステータス・タスク</h2>

          {canView && todayTaskCount > 0 && (
            <section className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
              <h3 className="text-sm font-bold text-indigo-900">今日やること</h3>
              <ul className="mt-2 space-y-1.5 text-xs text-indigo-950">
                {missingCurrent.length > 0 && (
                  <li>
                    · この期間の不足資料: <strong>{missingCurrent.length} 点</strong>（
                    {missingCurrent.slice(0, 3).join("、")}
                    {missingCurrent.length > 3 ? "…" : ""}）
                  </li>
                )}
                {currentPendingApproval.length > 0 && (
                  <li>
                    · 承認待ち: <strong>{currentPendingApproval.length} 点</strong>（
                    {currentPendingApproval.slice(0, 3).join("、")}
                    {currentPendingApproval.length > 3 ? "…" : ""}）
                  </li>
                )}
                {canApproveAudit && auditQueueSlots.length > 0 && (
                  <li>
                    · 監査・照合: <strong>{auditQueueSlots.length} 点</strong>（
                    {auditQueueSlots
                      .slice(0, 3)
                      .map((s) => s.label)
                      .join("、")}
                    {auditQueueSlots.length > 3 ? "…" : ""}）— 各スロットの
                    <strong>「監査する」</strong>から
                  </li>
                )}
                {pendingReview.length > 0 && (
                  <li>
                    · 自動振り分けの要確認: <strong>{pendingReview.length} 件</strong>
                  </li>
                )}
                {remandedSlots.length > 0 && (
                  <li>
                    · 差戻し・修正中: <strong>{remandedSlots.length} 点</strong>（
                    {remandedSlots
                      .slice(0, 3)
                      .map((s) => s.label)
                      .join("、")}
                    {remandedSlots.length > 3 ? "…" : ""}）
                  </li>
                )}
                {(docStatus?.pending_approval_total ?? 0) > currentPendingApproval.length && (
                  <li>
                    · 他期間の承認待ち合計:{" "}
                    <strong>
                      {(docStatus?.pending_approval_total ?? 0) - currentPendingApproval.length} 点
                    </strong>
                  </li>
                )}
              </ul>
            </section>
          )}

          <div
            className={`flex flex-wrap items-center gap-2 rounded-xl border px-4 py-3 ${
              missingCurrent.length === 0
                ? "border-emerald-200 bg-emerald-50"
                : "border-rose-200 bg-rose-50"
            }`}
          >
            {missingCurrent.length === 0 && currentPendingApproval.length === 0 ? (
              <>
                <CheckCircle className="h-4 w-4 text-emerald-600" aria-hidden />
                <span className="text-sm font-bold text-emerald-800">
                  この期間の必要書類はすべて揃っています
                  {docStatus?.periods.find((p) => p.period_key === currentPeriodKey)?.approved_complete
                    ? "（承認済み）"
                    : ""}
                </span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4 text-rose-600" aria-hidden />
                <span className="text-sm font-black text-rose-700">あと {missingCurrent.length} 点</span>
                <span className="text-xs font-medium text-rose-500">不足:</span>
                <div className="flex flex-wrap gap-1.5">
                  {missingCurrent.map((label) => (
                    <span
                      key={label}
                      className="rounded-full border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-bold text-rose-600"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          {missingCurrent.length === 0 && currentPendingApproval.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
              <span className="text-sm font-bold text-amber-800">
                承認待ち {currentPendingApproval.length} 点
              </span>
              <span className="text-xs text-amber-700">{currentPendingApproval.join("、")}</span>
            </div>
          )}

          {pendingReview.length > 0 && (
            <div
              ref={pendingReviewRef}
              data-tour="pending-review"
              className="rounded-xl border border-amber-200 bg-amber-50/70 p-4"
            >
              <div className="mb-3 flex items-center gap-2 text-sm font-black text-amber-800">
                <AlertTriangle className="h-4 w-4" aria-hidden />
                要確認（{pendingReview.length}件） — 振り分け先を選んでください
              </div>
              <div className="space-y-3">
                {pendingReview.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-lg border border-amber-200 bg-white p-3 shadow-sm"
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="line-clamp-1 text-xs font-bold text-slate-700">{p.fileName}</div>
                        <div className="mt-0.5 text-[10px] font-medium text-slate-400">
                          確信度 {Math.round(p.confidence * 100)}% ・ 抽出{" "}
                          {p.engine === "none" ? "不可（スキャン）" : p.engine}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDismissPending(p.id)}
                        className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        aria-label="このファイルを破棄"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {slotLabels.map((label, idx) => {
                        const isSuggested = p.suggestedIndex === idx;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => onConfirmPending(p.id, idx)}
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                              isSuggested
                                ? "border-indigo-400 bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                                : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                            }`}
                          >
                            {isSuggested ? "★ " : ""}
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {canView && (
            <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setTimelineOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
                  <Clock className="h-4 w-4 text-slate-500" aria-hidden />
                  監査タイムライン
                  {timelineEvents.length > 0 ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      {timelineEvents.length}
                    </span>
                  ) : null}
                </span>
                {timelineOpen ? (
                  <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                )}
              </button>
              {timelineOpen ? (
                <div className="border-t border-slate-100 px-4 py-3">
                  {timelineLoading ? (
                    <p className="flex items-center gap-2 text-xs text-slate-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      読み込み中…
                    </p>
                  ) : timelineEvents.length === 0 ? (
                    <p className="text-xs text-slate-500">この期間の監査イベントはまだありません。</p>
                  ) : (
                    <ul className="max-h-56 space-y-2 overflow-y-auto">
                      {timelineEvents.map((ev) => {
                        const slotTitle =
                          ev.slot_label ?? slotLabels[Number(ev.slot_id)] ?? `スロット ${ev.slot_id}`;
                        const typeLabel =
                          ev.action_title ??
                          TIMELINE_EVENT_LABEL[ev.event_type] ??
                          ev.event_type;
                        return (
                          <li
                            key={ev.id}
                            className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg bg-slate-50 px-3 py-2 text-xs"
                          >
                            <time className="shrink-0 font-mono text-[10px] text-slate-400">
                              {formatTimelineWhen(ev.created_at)}
                            </time>
                            <span className="font-bold text-slate-700">{slotTitle}</span>
                            <span className="text-slate-600">{typeLabel}</span>
                            {ev.version_label ? (
                              <span className="font-mono text-[10px] text-blue-600">{ev.version_label}</span>
                            ) : null}
                            {ev.actor_email ? (
                              <span className="ml-auto text-[10px] text-slate-400">{ev.actor_email}</span>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ) : null}
            </section>
          )}

          {canView && docStatus && (
            <section className="rounded-xl border border-slate-200 bg-white/90">
              <button
                type="button"
                onClick={() => setDashboardOpen((o) => !o)}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
              >
                <span className="flex items-center gap-2 text-sm font-bold text-slate-700">
                  資料の充足状況（全期間）
                  {docStatus.missing_total > 0 ? (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-600">
                      不足 合計 {docStatus.missing_total} 点 ・ {docStatus.incomplete_count} 期間
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                      不足なし
                    </span>
                  )}
                </span>
                {dashboardOpen ? (
                  <ChevronUp className="h-4 w-4 text-slate-500" aria-hidden />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-500" aria-hidden />
                )}
              </button>
              {dashboardOpen && (
                <div className="border-t border-slate-100 px-4 pb-4">
                  {incompletePeriods.length === 0 ? (
                    <p className="py-2 text-xs text-slate-500">
                      アップロード実績のある他の期間に不足はありません。
                    </p>
                  ) : (
                    <div className="space-y-2 py-2">
                      {incompletePeriods.map((p) => (
                        <button
                          key={p.period_key}
                          type="button"
                          onClick={() => onJumpToPeriod(p.period_key)}
                          className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-blue-300 hover:bg-blue-50"
                        >
                          <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-700">
                            {periodLabel(p.period_key)}
                          </span>
                          <span className="shrink-0 text-xs font-bold text-rose-600">
                            あと {p.missing.length} 点
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500">
                            {p.missing.join(" / ")}
                          </span>
                          <span className="shrink-0 text-[10px] font-medium text-blue-600">この期間へ →</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      {canUpload && pageOrderLen > 0 && (
        <div className="sticky bottom-0 z-30 flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(15,23,42,0.06)] backdrop-blur md:px-8">
          <div className="mr-auto flex items-center gap-2">
            <p className="hidden text-[11px] text-slate-500 sm:block">
              必要なときだけ編集し、PDF を出力できます。
            </p>
            <SyncStatusBadge status={sessionSyncStatus} variant="inline" />
            <span className="text-[10px] text-slate-400">セッション同期</span>
            {persistedDocumentId && sessionSyncStatus === "saved" ? (
              <span
                className="hidden max-w-[140px] truncate font-mono text-[10px] text-emerald-700 sm:inline"
                title={`ワークスペース ID: ${persistedDocumentId}`}
              >
                {persistedDocumentId.slice(0, 8)}…
              </span>
            ) : null}
            {sessionSyncStatus === "dirty" && onSaveDocugridNow ? (
              <button
                type="button"
                onClick={() => {
                  void onSaveDocugridNow().catch((err) => {
                    console.warn("Docugrid manual save failed:", err);
                  });
                }}
                className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800 hover:bg-amber-100"
              >
                今すぐ保存
              </button>
            ) : null}
          </div>
          <button
            type="button"
            disabled={isMerging}
            onClick={async () => {
              const r = await mergeFromStore(true);
              if (!r.ok) {
                alert(r.error);
              }
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isMerging ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                出力中…
              </>
            ) : (
              <>PDF を出力</>
            )}
          </button>
        </div>
      )}
    </main>
  );
}
