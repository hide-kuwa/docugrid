import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Columns,
  Download,
  FileUp,
  FolderInput,
  History,
  PauseCircle,
  PlayCircle,
  Save,
  Send,
  Share2,
  Stamp,
  Trash2,
  Unlink,
} from "lucide-react";
import { EnhancedDocVersion, ViewerMode, WorkflowStatus } from "../types";

type ViewerHeaderProps = {
  fileName: string;
  activeVersion: EnhancedDocVersion;
  workflowStatus: WorkflowStatus;
  unsavedCount: number;
  isLoading: boolean;
  isHistoryOpen: boolean;
  isSplitView: boolean;
  splitViewHint?: string;
  onClose: () => void;
  onToggleHistory: () => void;
  trailAgreement?: "agreed" | "unsigned" | null;
  onToggleSplitView: () => void;
  handleWorkSave: () => void;
  handleRequestReview: () => void;
  handleStartAudit: () => void;
  handleAuditSuspend: () => void;
  handleRemand: () => void;
  handleApprove: () => void;
  canAnnotate: boolean;
  /** プレビューから編集モードへ入れるか（document.annotate 等） */
  canEnterEditMode?: boolean;
  canApprove: boolean;
  viewerMode: ViewerMode;
  onStartEdit: () => void;
  /** マトリクス「監査する」から開いたときなど、監査開始ボタンを目立たせる */
  highlightAuditStart?: boolean;
  /**
   * full = マトリクス監査フロー一式
   * pdfSimple = PDF ワークスペース（ダウンロード / DocuGrid 格納）
   */
  chromeMode?: "full" | "pdfSimple";
  /** pdfSimple: 現在の PDF を端末にダウンロード */
  onDownloadPdf?: () => void;
  /** pdfSimple: 顧問先の DocuGrid 枠へ格納 */
  onStoreToDocugrid?: () => void;
  /** pdfSimple: 顧問先が紐付いているときだけ格納可 */
  canStoreToDocugrid?: boolean;
  canSoftDeleteDocument?: boolean;
  onSoftDelete?: () => void;
  canPurgeDocument?: boolean;
  onPurge?: () => void;
  onRestore?: () => void;
  canShareWithClient?: boolean;
  clientSharedAt?: string | null;
  onShareWithClient?: () => void;
  onUnshareWithClient?: () => void;
  /** ページ並べ替え中はリボンに並べ替え操作を出す */
  isReordering?: boolean;
  selectedSlotCount?: number;
  canUndo?: boolean;
  canRedo?: boolean;
  onRemoveSelectedSlots?: () => void;
  onKeepOnlySelectedSlots?: () => void;
  onClearSlotSelection?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onSaveReorder?: () => void;
  /** 並べ替え中の「戻る」→ ツール画面へ（ビューアは閉じない） */
  onExitReorder?: () => void;
};

export const ViewerHeader = ({
  fileName,
  activeVersion,
  workflowStatus,
  unsavedCount,
  isLoading,
  isHistoryOpen,
  isSplitView,
  splitViewHint = "2画面照合",
  onClose,
  onToggleHistory,
  trailAgreement = null,
  onToggleSplitView,
  handleWorkSave,
  handleRequestReview,
  handleStartAudit,
  handleAuditSuspend,
  handleRemand,
  handleApprove,
  canAnnotate,
  canEnterEditMode = true,
  canApprove,
  viewerMode,
  onStartEdit,
  highlightAuditStart = false,
  chromeMode = "full",
  onDownloadPdf,
  onStoreToDocugrid,
  canStoreToDocugrid = false,
  canSoftDeleteDocument = false,
  onSoftDelete,
  canPurgeDocument = false,
  onPurge,
  onRestore,
  canShareWithClient = false,
  clientSharedAt = null,
  onShareWithClient,
  onUnshareWithClient,
  isReordering = false,
  selectedSlotCount = 0,
  canUndo = false,
  canRedo = false,
  onRemoveSelectedSlots,
  onKeepOnlySelectedSlots,
  onClearSlotSelection,
  onUndo,
  onRedo,
  onSaveReorder,
  onExitReorder,
}: ViewerHeaderProps) => {
  const isReadOnly = viewerMode === "preview";
  const isDraft =
    workflowStatus === "draft" || workflowStatus === "fix" || workflowStatus === "rejected";
  const isReviewPending = workflowStatus === "review_pending";
  const isAuditing = workflowStatus === "auditing";
  const isDone = workflowStatus === "done";
  /** 2画面照合中は左/右どちらの資料か不明なため、枠単位の操作を出さない */
  const showSlotDocumentActions = !isSplitView;
  const isPdfSimple = chromeMode === "pdfSimple";
  const storeDisabled = isLoading || !canStoreToDocugrid || !onStoreToDocugrid;
  const storeTitle = !canStoreToDocugrid
    ? "DocuGrid に格納するには、開く前に顧問先を選んでください"
    : "現在の PDF を顧問先の「PDF 作業」枠へ格納します（画面は閉じません）";
  const hasSelection = selectedSlotCount > 0;
  const reorderBtn =
    "rounded border border-slate-500 bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-40";
  const handleBack = () => {
    if (isReordering && onExitReorder) {
      onExitReorder();
      return;
    }
    onClose();
  };

  return (
    <header className="z-20 flex h-14 flex-shrink-0 items-center justify-between border-b border-slate-700 bg-slate-800 px-4">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-1 text-slate-400 hover:text-white"
          title={isReordering ? "並べ替えを終了して編集画面へ" : "閉じる"}
        >
          <ArrowLeft className="h-4 w-4" /> 戻る
        </button>
        <div className="h-6 w-px bg-slate-600"></div>
        <h2 className="text-sm font-bold text-white max-w-[200px] truncate">{fileName}</h2>
        {isReordering ? (
          <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">
            並べ替え
          </span>
        ) : !isPdfSimple ? (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold text-white 
                ${
                  isDone
                    ? "bg-green-600"
                    : activeVersion.status === "rejected"
                      ? "bg-red-600"
                      : isAuditing
                        ? "bg-yellow-600"
                        : isReviewPending
                          ? "bg-purple-600"
                          : "bg-slate-600"
                }`}
          >
            {activeVersion.ver}
            {activeVersion.action ? ` ${activeVersion.action}` : ""}
          </span>
        ) : null}
        {unsavedCount > 0 && !isReadOnly && !isReordering && (
          <span className="text-[10px] text-yellow-400 font-bold flex items-center animate-pulse">
            <span className="w-2 h-2 rounded-full bg-yellow-400 mr-1"></span>未保存: {unsavedCount}
          </span>
        )}
        {isReadOnly && (
          <span className="rounded-full bg-slate-600 px-2 py-0.5 text-[10px] font-bold text-slate-200">閲覧</span>
        )}
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        {isReordering ? (
          <>
            <button
              type="button"
              onClick={onRemoveSelectedSlots}
              disabled={!hasSelection || isLoading}
              className={reorderBtn}
            >
              選択を削除
            </button>
            <button
              type="button"
              onClick={onKeepOnlySelectedSlots}
              disabled={!hasSelection || isLoading}
              className={reorderBtn}
            >
              選択だけ残す(分割)
            </button>
            <button
              type="button"
              onClick={onClearSlotSelection}
              disabled={!hasSelection || isLoading}
              className={reorderBtn}
            >
              選択解除
            </button>
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo || isLoading}
              className={reorderBtn}
            >
              Undo
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo || isLoading}
              className={reorderBtn}
            >
              Redo
            </button>
            <button
              type="button"
              onClick={onSaveReorder}
              disabled={isLoading}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white shadow-lg hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? (
                "処理中..."
              ) : (
                <>
                  <FileUp className="h-3.5 w-3.5" /> 確定
                </>
              )}
            </button>
          </>
        ) : isReadOnly ? (
          <>
            {onRestore ? (
              <button
                type="button"
                onClick={onRestore}
                disabled={isLoading}
                className="mr-2 flex items-center gap-1 rounded-lg border border-emerald-700 bg-emerald-950/40 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-900/50 disabled:opacity-50"
              >
                復元
              </button>
            ) : null}
            {!isPdfSimple && showSlotDocumentActions && canSoftDeleteDocument && onSoftDelete ? (
              <button
                type="button"
                onClick={onSoftDelete}
                disabled={isLoading}
                title="資料を削除（所長のみ削除済み一覧から閲覧・復元可能）"
                className="mr-2 flex items-center gap-1 rounded-lg border border-amber-800 bg-amber-950/40 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-900/50 disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" />
                削除
              </button>
            ) : null}
            {!isPdfSimple && showSlotDocumentActions && canPurgeDocument && onPurge ? (
              <button
                type="button"
                onClick={onPurge}
                disabled={isLoading}
                title="資料を完全削除（履歴に記録のみ残る）"
                className="mr-2 flex items-center gap-1 rounded-lg border border-red-800 bg-red-950/60 px-3 py-1.5 text-xs font-bold text-red-200 hover:bg-red-900/60 disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" />
                完全削除
              </button>
            ) : null}
            {!isPdfSimple && showSlotDocumentActions && canShareWithClient && onShareWithClient ? (
              <button
                type="button"
                onClick={onShareWithClient}
                disabled={isLoading}
                title="クライアントポータルへ共有"
                className="mr-2 flex items-center gap-1 rounded-lg border border-sky-700 bg-sky-950/40 px-3 py-1.5 text-xs font-bold text-sky-200 hover:bg-sky-900/50 disabled:opacity-50"
              >
                <Share2 className="h-3 w-3" />
                クライアント共有
              </button>
            ) : null}
            {!isPdfSimple && showSlotDocumentActions && clientSharedAt ? (
              <span className="mr-2 rounded-full bg-emerald-900/50 px-2 py-1 text-[10px] font-bold text-emerald-200">
                共有済
              </span>
            ) : null}
            {!isPdfSimple && showSlotDocumentActions && clientSharedAt && onUnshareWithClient ? (
              <button
                type="button"
                onClick={onUnshareWithClient}
                disabled={isLoading}
                title="クライアントポータルへの共有を解除"
                className="mr-2 flex items-center gap-1 rounded-lg border border-amber-700 bg-amber-950/40 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-900/50 disabled:opacity-50"
              >
                <Unlink className="h-3 w-3" />
                共有解除
              </button>
            ) : null}
            {canEnterEditMode ? (
              <button
                type="button"
                onClick={onStartEdit}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-500"
              >
                編集を開始
              </button>
            ) : null}
          </>
        ) : isPdfSimple ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDownloadPdf}
              disabled={isLoading || !onDownloadPdf}
              title="現在の PDF を端末にダウンロード"
              className="flex items-center gap-1.5 rounded-lg border border-slate-500 bg-slate-700 px-3.5 py-2 text-white transition-colors hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              <span className="text-xs font-bold">PDFダウンロード</span>
            </button>
            {onStoreToDocugrid ? (
              <button
                type="button"
                onClick={onStoreToDocugrid}
                disabled={storeDisabled}
                title={storeTitle}
                className="flex items-center gap-1.5 rounded-lg border border-teal-500 bg-teal-600 px-3.5 py-2 text-white shadow-lg transition-colors hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FolderInput className="h-4 w-4" />
                <span className="text-xs font-bold">DocuGridに格納</span>
              </button>
            ) : null}
          </div>
        ) : (
        <>
        {showSlotDocumentActions && isDraft && (
          <>
            <button
              onClick={handleWorkSave}
              disabled={isLoading || unsavedCount === 0}
              title="承認不要 — 作業内容の下書き保存"
              className="flex items-center gap-1.5 bg-slate-700 hover:bg-blue-600 text-white px-3.5 py-2 rounded-lg border border-slate-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="h-4 w-4" />
              <span className="text-xs font-bold">作業保存</span>
            </button>
            <button
              onClick={handleRequestReview}
              disabled={isLoading}
              title="承認必要 — レビュー待ちにして承認者へ回す"
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-2 rounded-lg border border-blue-500 transition-colors shadow-lg ml-1"
            >
              <Send className="h-4 w-4" />
              <span className="text-xs font-bold">承認依頼</span>
            </button>
          </>
        )}

        {showSlotDocumentActions && isReviewPending && (
            <button
              type="button"
              onClick={handleStartAudit}
              title="承認必要 — 承認者が正式な 2 画面照合を開始"
              className={`flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 rounded-lg border border-indigo-500 transition-colors shadow-lg ${
                highlightAuditStart ? "animate-pulse ring-2 ring-yellow-300 ring-offset-2 ring-offset-slate-800" : ""
              }`}
            >
              <PlayCircle className="h-4 w-4" />
              <span className="text-xs font-bold">監査開始</span>
            </button>
        )}

        {showSlotDocumentActions && isAuditing && (
          <>
            <button
              onClick={handleAuditSuspend}
              disabled={isLoading}
              className="flex items-center gap-1.5 bg-yellow-700 hover:bg-yellow-600 text-white px-3.5 py-2 rounded-lg border border-yellow-600 transition-colors"
            >
              <PauseCircle className="h-4 w-4" />
              <span className="text-xs font-bold">中断・保存</span>
            </button>
            <button
              onClick={handleRemand}
              disabled={isLoading}
              title="承認必要 — 担当者へ差戻し"
              className="flex items-center gap-1.5 bg-red-800 hover:bg-red-700 text-white px-3.5 py-2 rounded-lg border border-red-700 transition-colors shadow-lg ml-2"
            >
              <AlertTriangle className="h-4 w-4" />
              <span className="text-xs font-bold">差戻</span>
            </button>
            <button
              onClick={handleApprove}
            disabled={isLoading || !canApprove}
              title="承認必要 — 照合結果を確定し資料を承認済みにする"
              className="flex items-center gap-1.5 bg-green-700 hover:bg-green-600 text-white px-3.5 py-2 rounded-lg border border-green-600 transition-colors shadow-lg ml-2"
            >
              <Stamp className="h-4 w-4" />
              <span className="text-xs font-bold">承認完了</span>
            </button>
          </>
        )}

        {showSlotDocumentActions && isDone && (
          <div className="flex items-center gap-1 px-3 py-1.5 bg-green-900/50 rounded-lg border border-green-800 text-green-400">
            <Check className="h-3 w-3" />
            <span className="text-xs font-bold">承認済み</span>
          </div>
        )}

        {trailAgreement === "unsigned" ? (
          <div className="ml-2 flex items-center gap-1 rounded-lg border border-amber-700 bg-amber-950/50 px-2.5 py-1.5 text-amber-100">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="text-[10px] font-black">未契約</span>
          </div>
        ) : null}
        {trailAgreement === "agreed" ? (
          <div className="ml-2 flex items-center gap-1 rounded-lg border border-emerald-700 bg-emerald-950/50 px-2.5 py-1.5 text-emerald-200">
            <Stamp className="h-3.5 w-3.5" />
            <span className="text-[10px] font-black">契約済</span>
          </div>
        ) : null}

        <button
          onClick={onToggleHistory}
          className={`ml-2 flex h-9 items-center gap-1.5 rounded-lg border px-2.5 transition-colors ${
            isHistoryOpen
              ? "border-blue-500 bg-blue-600 text-white"
              : "border-slate-500 bg-slate-700 text-white hover:bg-slate-600"
          }`}
          title="証跡と版履歴"
        >
          <History className="h-4 w-4" />
          <span className="text-[10px] font-bold">証跡</span>
        </button>
        {showSlotDocumentActions && canShareWithClient && onShareWithClient && !isReadOnly ? (
          <button
            type="button"
            onClick={onShareWithClient}
            disabled={isLoading}
            title="クライアントポータルへ共有"
            className="flex h-9 items-center gap-1 rounded-lg border border-sky-700 bg-sky-950/40 px-2.5 text-[10px] font-bold text-sky-200 hover:bg-sky-900/50 disabled:opacity-50"
          >
            <Share2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">クライアント共有</span>
          </button>
        ) : null}
        {showSlotDocumentActions && clientSharedAt ? (
          <span className="hidden rounded-full bg-emerald-900/50 px-2 py-1 text-[10px] font-bold text-emerald-200 sm:inline">
            共有済
          </span>
        ) : null}
        {showSlotDocumentActions && clientSharedAt && onUnshareWithClient && !isReadOnly ? (
          <button
            type="button"
            onClick={onUnshareWithClient}
            disabled={isLoading}
            title="クライアントポータルへの共有を解除"
            className="flex h-9 items-center gap-1 rounded-lg border border-amber-700 bg-amber-950/40 px-2.5 text-[10px] font-bold text-amber-200 hover:bg-amber-900/50 disabled:opacity-50"
          >
            <Unlink className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">共有解除</span>
          </button>
        ) : null}
        {onRestore ? (
          <button
            type="button"
            onClick={onRestore}
            disabled={isLoading}
            className="flex h-9 items-center gap-1 rounded-lg border border-emerald-700 bg-emerald-950/40 px-2.5 text-[10px] font-bold text-emerald-200 hover:bg-emerald-900/50 disabled:opacity-50"
          >
            復元
          </button>
        ) : null}
        {showSlotDocumentActions && canSoftDeleteDocument && onSoftDelete && !isReadOnly ? (
          <button
            type="button"
            onClick={onSoftDelete}
            disabled={isLoading}
            title="資料を削除"
            className="flex h-9 items-center gap-1 rounded-lg border border-amber-800 bg-amber-950/40 px-2.5 text-[10px] font-bold text-amber-200 hover:bg-amber-900/50 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">削除</span>
          </button>
        ) : null}
        {showSlotDocumentActions && canPurgeDocument && onPurge && !isReadOnly ? (
          <button
            type="button"
            onClick={onPurge}
            disabled={isLoading}
            title="資料を完全削除（履歴に記録のみ残る）"
            className="flex h-9 items-center gap-1 rounded-lg border border-red-800 bg-red-950/60 px-2.5 text-[10px] font-bold text-red-200 hover:bg-red-900/60 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">完全削除</span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={onToggleSplitView}
          disabled={!canAnnotate}
          title={splitViewHint}
          className={`flex h-9 items-center justify-center gap-1.5 rounded-lg border px-2.5 transition-colors ${
            isSplitView
              ? "border-blue-500 bg-blue-600 text-white"
              : "border-slate-500 bg-slate-700 text-white hover:bg-slate-600"
          } ${!canAnnotate ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <Columns className="h-4 w-4" />
          <span className="text-[10px] font-bold">{isSplitView ? "2画面 ON" : "2画面照合"}</span>
        </button>
        <button
          onClick={onClose}
          className="flex items-center rounded-lg bg-green-600 px-4 py-2 text-xs font-bold text-white shadow-lg hover:bg-green-500"
        >
          <Check className="mr-1 h-3.5 w-3.5" /> 完了
        </button>
        </>
        )}
      </div>
    </header>
  );
};
