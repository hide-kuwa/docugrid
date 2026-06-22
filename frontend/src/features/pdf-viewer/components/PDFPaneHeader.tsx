import { FileText, FolderOpen, X } from "lucide-react";

interface PDFPaneHeaderProps {
  fileName?: string;
  title?: string;
  onOpen?: () => void;
  onClose?: () => void;
  showOpenButton?: boolean;
}

export const PDFPaneHeader = ({
  fileName,
  title = "Reference",
  onOpen,
  onClose,
  showOpenButton = true,
}: PDFPaneHeaderProps) => {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-700 bg-slate-800 px-3 text-slate-200 shadow-md">
      <div className="flex min-w-0 items-center gap-3 overflow-hidden">
        <div className="rounded-md bg-slate-700 p-1.5">
          <FileText className="h-4 w-4 text-blue-400" />
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="mb-0.5 text-xs font-bold uppercase leading-none tracking-wider text-slate-400">
            {title}
          </span>
          <span className="truncate text-sm font-semibold leading-none text-white">
            {fileName || "未選択"}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {showOpenButton && onOpen && (
          <button
            type="button"
            onClick={onOpen}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
            title="ファイルを選択"
          >
            <FolderOpen className="h-4 w-4" />
            <span>開く</span>
          </button>
        )}

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-500/20 hover:text-red-400"
            title="閉じる"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};
