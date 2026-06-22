import { AlertTriangle, ChevronDown, ChevronRight, GitCompare, X } from "lucide-react";
import { EnhancedDocVersion } from "../types";

type HistoryPanelProps = {
  isHistoryOpen: boolean;
  onClose: () => void;
  history: EnhancedDocVersion[];
  activeVerIdx: number;
  setActiveVerIdx: (idx: number) => void;
  unsavedActions: string[];
  expandedHistoryIdx: number | null;
  setExpandedHistoryIdx: (idx: number | null) => void;
  onCompareWithCurrent?: (idx: number) => void;
  compareLoadingIdx?: number | null;
};

export const HistoryPanel = ({
  isHistoryOpen,
  onClose,
  history,
  activeVerIdx,
  setActiveVerIdx,
  unsavedActions,
  expandedHistoryIdx,
  setExpandedHistoryIdx,
  onCompareWithCurrent,
  compareLoadingIdx = null,
}: HistoryPanelProps) => {
  return (
    <div
      className={`absolute top-0 right-0 z-10 flex h-full w-[320px] flex-col border-l border-slate-700 bg-slate-800 shadow-2xl transition-all duration-300 ${
        isHistoryOpen ? "translate-x-0 opacity-100 pointer-events-auto" : "translate-x-full opacity-0 pointer-events-none"
      }`}
    >
      <div className="flex h-14 items-center justify-between border-b border-slate-700 bg-slate-900/50 p-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-slate-300">版の履歴</span>
          <p className="mt-0.5 text-[10px] text-slate-500">最新が上 · 過去版は保持されます</p>
        </div>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="relative flex-1 overflow-y-auto p-6">
        <div className="absolute bottom-0 left-[29px] top-0 z-0 w-[2px] bg-slate-700" />

        {unsavedActions.length > 0 && (
          <div className="relative mb-8 pl-8">
            <div className="absolute left-[24px] top-[6px] z-10 h-3 w-3 animate-pulse rounded-full border-2 border-yellow-400 bg-yellow-500" />
            <div className="mb-1 text-[10px] font-bold text-yellow-400">編集中（未保存）</div>
            <div className="rounded border border-slate-600 bg-slate-700/50 p-2">
              {unsavedActions.map((act, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1 border-b border-slate-600/50 py-1 text-[10px] text-slate-300 last:border-0"
                >
                  <span className="h-1 w-1 rounded-full bg-slate-500" /> {act}
                </div>
              ))}
            </div>
          </div>
        )}

        {history.map((h, i) => (
          <div
            key={`${h.versionId}-${i}`}
            className={`group relative mb-6 pl-8 ${i === activeVerIdx ? "opacity-100" : "opacity-70 hover:opacity-100"}`}
          >
            <div
              onClick={() => setActiveVerIdx(i)}
              className={`absolute left-[24px] top-[6px] z-10 h-3 w-3 cursor-pointer rounded-full border-2 transition-transform ${
                h.isMajor ? "scale-125 border-white bg-green-500" : "border-slate-300 bg-slate-500 group-hover:bg-blue-400"
              } ${i === activeVerIdx ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-800" : ""}`}
            />
            <div className="cursor-pointer" onClick={() => setActiveVerIdx(i)}>
              <div className="mb-0.5 flex items-center justify-between">
                <span className="font-mono text-[10px] text-slate-400">{h.date}</span>
                <div className="flex items-center gap-1">
                  {i === 0 ? (
                    <span className="rounded border border-emerald-700 bg-emerald-900 px-1.5 text-[9px] text-emerald-300">
                      最新
                    </span>
                  ) : null}
                  {h.isMajor ? (
                    <span className="rounded border border-green-700 bg-green-900 px-1.5 text-[9px] text-green-300">
                      確定版
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="mb-0.5 flex items-center gap-2 text-sm font-bold text-white">
                {h.ver} {h.action}{" "}
                {h.status === "rejected" ? <AlertTriangle className="h-3 w-3 text-red-500" /> : null}
              </div>
              <div className="mb-2 flex items-center gap-1 text-[10px] text-slate-500">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-700 text-[8px]">
                  {h.user.charAt(0)}
                </span>
                {h.user}
              </div>
            </div>

            {i > 0 && onCompareWithCurrent ? (
              <button
                type="button"
                disabled={compareLoadingIdx === i}
                onClick={(e) => {
                  e.stopPropagation();
                  onCompareWithCurrent(i);
                }}
                className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-indigo-600/50 bg-indigo-950/40 px-2 py-1.5 text-[10px] font-bold text-indigo-200 hover:bg-indigo-900/50 disabled:opacity-50"
              >
                <GitCompare className="h-3 w-3" />
                {compareLoadingIdx === i ? "読み込み中…" : "最新と比較"}
              </button>
            ) : null}

            <div
              className="cursor-pointer rounded border border-slate-700 bg-slate-900/50 text-[10px] text-slate-400 transition-colors hover:bg-slate-900"
              onDoubleClick={() => setExpandedHistoryIdx(expandedHistoryIdx === i ? null : i)}
            >
              <div
                className="flex items-center justify-between p-2"
                onClick={() => setExpandedHistoryIdx(expandedHistoryIdx === i ? null : i)}
              >
                <span>詳細ログ ({h.actionsLog?.length || 0})</span>
                {expandedHistoryIdx === i ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </div>
              {expandedHistoryIdx === i ? (
                <div className="border-t border-slate-700 px-2 pb-2 pt-1">
                  {h.actionsLog && h.actionsLog.length > 0 ? (
                    h.actionsLog.map((log, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 py-0.5 text-slate-500">
                        <span className="h-1 w-1 rounded-full bg-slate-600" />
                        {log}
                      </div>
                    ))
                  ) : (
                    <div className="italic text-slate-600">操作履歴なし</div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
