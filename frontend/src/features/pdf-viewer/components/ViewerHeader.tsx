import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpDown,
  Check,
  CheckCircle2,
  Columns,
  Eraser,
  Highlighter,
  History,
  Minus,
  PauseCircle,
  PlayCircle,
  Save,
  Send,
  Square,
  Stamp,
} from "lucide-react";
import { EnhancedDocVersion, ToolType, ViewerMode, WorkflowStatus } from "../types";

type ViewerHeaderProps = {
  fileName: string;
  activeVersion: EnhancedDocVersion;
  workflowStatus: WorkflowStatus;
  unsavedCount: number;
  isReordering: boolean;
  activeTool: ToolType;
  isLoading: boolean;
  isHistoryOpen: boolean;
  isSplitView: boolean;
  splitViewHint?: string;
  onClose: () => void;
  onToggleHistory: () => void;
  onToggleSplitView: () => void;
  setActiveTool: (tool: ToolType) => void;
  setIsReordering: (next: boolean) => void;
  handleWorkSave: () => void;
  handleRequestReview: () => void;
  handleStartAudit: () => void;
  handleAuditSuspend: () => void;
  handleRemand: () => void;
  handleApprove: () => void;
  canAnnotate: boolean;
  canApprove: boolean;
  viewerMode: ViewerMode;
  onStartEdit: () => void;
  /** マトリクス「監査する」から開いたときなど、監査開始ボタンを目立たせる */
  highlightAuditStart?: boolean;
};

export const ViewerHeader = ({
  fileName,
  activeVersion,
  workflowStatus,
  unsavedCount,
  isReordering,
  activeTool,
  isLoading,
  isHistoryOpen,
  isSplitView,
  splitViewHint = "2画面照合",
  onClose,
  onToggleHistory,
  onToggleSplitView,
  setActiveTool,
  setIsReordering,
  handleWorkSave,
  handleRequestReview,
  handleStartAudit,
  handleAuditSuspend,
  handleRemand,
  handleApprove,
  canAnnotate,
  canApprove,
  viewerMode,
  onStartEdit,
  highlightAuditStart = false,
}: ViewerHeaderProps) => {
  const isReadOnly = viewerMode === "preview";
  const isDraft =
    workflowStatus === "draft" || workflowStatus === "fix" || workflowStatus === "rejected";
  const isReviewPending = workflowStatus === "review_pending";
  const isAuditing = workflowStatus === "auditing";
  const isDone = workflowStatus === "done";

  return (
    <header className="z-20 flex h-14 flex-shrink-0 items-center justify-between border-b border-slate-700 bg-slate-800 px-4">
      <div className="flex items-center gap-4">
        <button onClick={onClose} className="flex items-center gap-1 text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> 戻る
        </button>
        <div className="h-6 w-px bg-slate-600"></div>
        <h2 className="text-sm font-bold text-white max-w-[200px] truncate">{fileName}</h2>
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
          {activeVersion.ver} {activeVersion.action}
        </span>
        {unsavedCount > 0 && !isReadOnly && (
          <span className="text-[10px] text-yellow-400 font-bold flex items-center animate-pulse">
            <span className="w-2 h-2 rounded-full bg-yellow-400 mr-1"></span>未保存: {unsavedCount}
          </span>
        )}
        {isReadOnly && (
          <span className="rounded-full bg-slate-600 px-2 py-0.5 text-[10px] font-bold text-slate-200">閲覧</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {isReadOnly ? (
          <button
            type="button"
            onClick={onStartEdit}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-500"
          >
            編集を開始
          </button>
        ) : (
        <>
        <div className="flex items-center bg-slate-900 rounded-lg p-1 mr-2 border border-slate-700">
          {!isReordering && (
            <>
              <button
                onClick={() => setActiveTool(activeTool === "marker" ? "none" : "marker")}
                disabled={isLoading || !canAnnotate}
                className={`p-1.5 rounded transition-colors ${
                  activeTool === "marker" ? "bg-yellow-900 text-yellow-400" : "text-yellow-400 hover:bg-slate-700"
                }`}
              >
                <Highlighter className="h-4 w-4" />
              </button>
              <button
                onClick={() => setActiveTool(activeTool === "box" ? "none" : "box")}
                disabled={isLoading || !canAnnotate}
                className={`p-1.5 rounded transition-colors ${
                  activeTool === "box" ? "bg-red-900 text-red-500" : "text-red-500 hover:bg-slate-700"
                }`}
              >
                <Square className="h-4 w-4" />
              </button>
              <button
                onClick={() => setActiveTool(activeTool === "line" ? "none" : "line")}
                disabled={isLoading || !canAnnotate}
                className={`p-1.5 rounded transition-colors ${
                  activeTool === "line" ? "bg-blue-900 text-blue-400" : "text-blue-400 hover:bg-slate-700"
                }`}
              >
                <Minus className="h-4 w-4 transform -rotate-45" />
              </button>
              <button
                onClick={() => setActiveTool(activeTool === "check" ? "none" : "check")}
                disabled={isLoading || !canAnnotate}
                title="チェックマーク"
                className={`p-1.5 rounded transition-colors ${
                  activeTool === "check" ? "bg-green-900 text-green-500" : "text-green-500 hover:bg-slate-700"
                }`}
              >
                <CheckCircle2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setActiveTool(activeTool === "eraser" ? "none" : "eraser")}
                disabled={isLoading || !canAnnotate}
                title="消しゴム（範囲をドラッグして注釈を消す）"
                className={`p-1.5 rounded transition-colors ${
                  activeTool === "eraser" ? "bg-slate-600 text-white" : "text-slate-300 hover:bg-slate-700"
                }`}
              >
                <Eraser className="h-4 w-4" />
              </button>
            </>
          )}
          <div className="w-px h-6 bg-slate-700 mx-1"></div>
          <button
            onClick={() => setIsReordering(!isReordering)}
            disabled={isLoading}
            className={`p-1.5 rounded transition-colors flex items-center gap-1 ${
              isReordering ? "bg-blue-600 text-white" : "text-blue-400 hover:bg-slate-700"
            }`}
          >
            <ArrowUpDown className="h-4 w-4" /> {isReordering && <span className="text-xs font-bold pr-1">モード中</span>}
          </button>
        </div>

        {isDraft && (
          <>
            <button
              onClick={handleWorkSave}
              disabled={isLoading || unsavedCount === 0}
              title="承認不要 — 作業内容の下書き保存"
              className="flex items-center gap-1 bg-slate-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg border border-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="h-3 w-3" />
              <span className="text-xs font-bold">作業保存</span>
            </button>
            <button
              onClick={handleRequestReview}
              disabled={isLoading}
              title="承認必要 — レビュー待ちにして承認者へ回す"
              className="flex items-center gap-1 bg-blue-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg border border-blue-600 transition-colors shadow-lg ml-1"
            >
              <Send className="h-3 w-3" />
              <span className="text-xs font-bold">承認依頼</span>
            </button>
          </>
        )}

        {isReviewPending && (
            <button
              type="button"
              onClick={handleStartAudit}
              title="承認必要 — 承認者が正式な 2 画面照合を開始"
              className={`flex items-center gap-1 bg-indigo-700 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg border border-indigo-600 transition-colors shadow-lg ${
                highlightAuditStart ? "animate-pulse ring-2 ring-yellow-300 ring-offset-2 ring-offset-slate-800" : ""
              }`}
            >
              <PlayCircle className="h-3 w-3" />
              <span className="text-xs font-bold">監査開始</span>
            </button>
        )}

        {isAuditing && (
          <>
            <button
              onClick={handleAuditSuspend}
              disabled={isLoading}
              className="flex items-center gap-1 bg-yellow-700 hover:bg-yellow-600 text-white px-3 py-1.5 rounded-lg border border-yellow-600 transition-colors"
            >
              <PauseCircle className="h-3 w-3" />
              <span className="text-xs font-bold">中断・保存</span>
            </button>
            <button
              onClick={handleRemand}
              disabled={isLoading}
              title="承認必要 — 担当者へ差戻し"
              className="flex items-center gap-1 bg-red-800 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg border border-red-700 transition-colors shadow-lg ml-2"
            >
              <AlertTriangle className="h-3 w-3" />
              <span className="text-xs font-bold">差戻</span>
            </button>
            <button
              onClick={handleApprove}
            disabled={isLoading || !canApprove}
              title="承認必要 — 照合結果を確定し資料を承認済みにする"
              className="flex items-center gap-1 bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg border border-green-600 transition-colors shadow-lg ml-2"
            >
              <Stamp className="h-3 w-3" />
              <span className="text-xs font-bold">承認完了</span>
            </button>
          </>
        )}

        {isDone && (
          <div className="flex items-center gap-1 px-3 py-1.5 bg-green-900/50 rounded-lg border border-green-800 text-green-400">
            <Check className="h-3 w-3" />
            <span className="text-xs font-bold">承認済み</span>
          </div>
        )}

        <button
          onClick={onToggleHistory}
          className={`ml-2 flex h-9 w-9 items-center justify-center rounded-lg border border-slate-600 transition-colors ${
            isHistoryOpen ? "bg-blue-600 text-white border-blue-500" : "bg-slate-700 text-white hover:bg-slate-600"
          }`}
        >
          <History className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onToggleSplitView}
          disabled={!canAnnotate}
          title={splitViewHint}
          className={`flex h-9 items-center justify-center gap-1 rounded-lg border border-slate-600 px-2 transition-colors ${
            isSplitView ? "bg-blue-600 text-white border-blue-500" : "bg-slate-700 text-white hover:bg-slate-600"
          } ${!canAnnotate ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <Columns className="h-4 w-4" />
          <span className="hidden text-[10px] font-bold sm:inline">{isSplitView ? "2画面 ON" : "2画面"}</span>
        </button>
        <button
          onClick={onClose}
          className="flex items-center rounded-lg bg-green-600 px-4 py-1.5 text-xs font-bold text-white shadow-lg hover:bg-green-500"
        >
          <Check className="mr-1 h-3 w-3" /> 完了
        </button>
        </>
        )}
      </div>
    </header>
  );
};
