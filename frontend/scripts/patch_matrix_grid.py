# -*- coding: utf-8 -*-
from pathlib import Path

TARGET = Path(__file__).resolve().parents[1] / "src" / "components" / "MatrixGrid.tsx"

t = TARGET.read_text(encoding="utf-8")

if 'import { useState } from "react"' not in t:
    t = t.replace(
        '"use client";\n\nimport { useDropzone }',
        '"use client";\n\nimport { useState } from "react";\nimport { useDropzone }',
    )
    t = t.replace(
        '"use client";\r\n\r\nimport { useDropzone }',
        '"use client";\r\n\r\nimport { useState } from "react";\r\nimport { useDropzone }',
    )
t = t.replace(
    'import { FileText, CheckCircle, Plus, UploadCloud } from "lucide-react";',
    """import {
  ChevronDown,
  ChevronUp,
  Eye,
  FileText,
  CheckCircle,
  Loader2,
  Pencil,
  Plus,
  UploadCloud,
  X,
} from "lucide-react";
import { PageGrid } from "@/features/docugrid/components/Grid/PageGrid";
import { SyncStatusBadge } from "@/features/docugrid/components/SyncStatusBadge";
import { useMergePdf } from "@/features/docugrid/hooks/useMergePdf";
import { useDocugridStore } from "@/features/docugrid/state/docugrid-store";""",
)

t = t.replace(
    "  file: File | null;\n  progressPercent: number;\n  onFilesDropped: (files: File[]) => void;\n  onOpenFile: () => void;",
    """  file: File | null;
  pageCount: number | null;
  progressPercent: number;
  onFilesDropped: (files: File[]) => void;
  onPreview: () => void;
  onEdit: () => void;
  slotNotice: string | null;
  onDismissSlotNotice: () => void;""",
)

t = t.replace(
    "  file,\n  progressPercent,\n  onFilesDropped,\n  onOpenFile,",
    """  file,
  pageCount,
  progressPercent,
  onFilesDropped,
  onPreview,
  onEdit,
  slotNotice,
  onDismissSlotNotice,""",
)

t = t.replace(
    "}: MatrixGridProps) {\n  const items =",
    """}: MatrixGridProps) {
  const [pagePanelOpen, setPagePanelOpen] = useState(false);
  const pageOrderLen = useDocugridStore((s) => s.pageOrder.length);
  const sessionSyncStatus = useDocugridStore((s) => s.sessionSyncStatus);
  const { mergeFromStore, isMerging } = useMergePdf();

  const items =""",
)

t = t.replace(
    "      onFilesDropped(files);",
    """      void Promise.resolve(onFilesDropped(files)).catch((err) => {
        console.error("File drop failed:", err);
        alert("ファイルの取り込みに失敗しました。");
      });""",
)

slot_notice = """
      {slotNotice ? (
        <motion.div
          role="status"
          className="mx-4 mt-3 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 shadow-sm md:mx-8"
        >
          <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
          <p className="min-w-0 flex-1 font-medium leading-snug">{slotNotice}</p>
          <button
            type="button"
            onClick={onDismissSlotNotice}
            className="shrink-0 rounded p-1 text-emerald-700 hover:bg-emerald-100"
            aria-label="通知を閉じる"
          >
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      ) : null}
""".replace("motion.div", "div")

t = t.replace(
    '    <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-slate-100 transition-opacity duration-300 select-none">\n      <header',
    f'    <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-slate-100 transition-opacity duration-300 select-none">{slot_notice}      <header',
)

old_filled = """            if (isActiveSlot && file) {
              return (
                <div
                  key={i}
                  onClick={() => {
                    if (canView) onOpenFile();
                  }}
                  className={`${uploadedCardClass} shadow-md ring-2 ring-blue-100 ${
                    canView ? "" : "opacity-60 cursor-not-allowed"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <FileText className="text-blue-600 text-xl" />
                    <motion.div className="flex items-center gap-1">
                       <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">NEW</span>
                       <CheckCircle className="text-green-500 w-5 h-5" />
                    </motion.div>
                  </motion.div>
                  <motion.div>
                    <motion.div className="text-xs font-bold text-slate-400 line-clamp-1">{file.name}</motion.div>
                    <motion.div className="text-sm font-bold text-slate-700 leading-tight">{title}</motion.div>
                  </motion.div>
                </motion.div>
              );
            }"""

# fix old_filled - use div only in template
old_filled = old_filled.replace("motion.div", "motion.D").replace("motion.D", "motion.div")
old_filled = """            if (isActiveSlot && file) {
              return (
                <div
                  key={i}
                  onClick={() => {
                    if (canView) onOpenFile();
                  }}
                  className={`${uploadedCardClass} shadow-md ring-2 ring-blue-100 ${
                    canView ? "" : "opacity-60 cursor-not-allowed"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <FileText className="text-blue-600 text-xl" />
                    <div className="flex items-center gap-1">
                       <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">NEW</span>
                       <CheckCircle className="text-green-500 w-5 h-5" />
                    </div>
                  </div>
                  <div>
                    <motion.div className="text-xs font-bold text-slate-400 line-clamp-1">{file.name}</motion.div>
                    <motion.div className="text-sm font-bold text-slate-700 leading-tight">{title}</motion.div>
                  </motion.div>
                </motion.div>
              );
            }""".replace("motion.div", "X").replace("motion.div", "div")  # broken

old_filled = """            if (isActiveSlot && file) {
              return (
                <div
                  key={i}
                  onClick={() => {
                    if (canView) onOpenFile();
                  }}
                  className={`${uploadedCardClass} shadow-md ring-2 ring-blue-100 ${
                    canView ? "" : "opacity-60 cursor-not-allowed"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <FileText className="text-blue-600 text-xl" />
                    <div className="flex items-center gap-1">
                       <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">NEW</span>
                       <CheckCircle className="text-green-500 w-5 h-5" />
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-400 line-clamp-1">{file.name}</div>
                    <div className="text-sm font-bold text-slate-700 leading-tight">{title}</motion.div>
                  </motion.div>
                </motion.div>
              );
            }"""

# I keep making errors in old_filled. Build new_filled cleanly:

new_filled = """
            if (isActiveSlot && file) {
              return (
                <div key={i} className={`${uploadedCardClass} shadow-md ring-2 ring-blue-100`}>
                  <div>
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <FileText className="shrink-0 text-xl text-blue-600" />
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        収納済み
                      </span>
                    </div>
                    <div className="line-clamp-1 text-xs font-bold text-slate-400">{file.name}</div>
                    <div className="break-words text-sm font-bold leading-tight text-slate-700">{title}</div>
                    {pageCount != null && pageCount > 0 && (
                      <p className="mt-1 text-[11px] text-slate-500">{pageCount} ページ</p>
                    )}
                  </div>
                  {canView && (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={onPreview}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden />
                        プレビュー
                      </button>
                      <button
                        type="button"
                        onClick={onEdit}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-2 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-500"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                        編集する
                      </button>
                    </div>
                  )}
                  <p className="mt-2 hidden text-[10px] leading-snug text-slate-400 sm:block">
                    ハイライト・並べ替えは「編集する」から
                  </p>
                </div>
              );
            }
"""

old_filled_correct = """            if (isActiveSlot && file) {
              return (
                <motion.div
                  key={i}
                  onClick={() => {
                    if (canView) onOpenFile();
                  }}
                  className={`${uploadedCardClass} shadow-md ring-2 ring-blue-100 ${
                    canView ? "" : "opacity-60 cursor-not-allowed"
                  }`}
                >
                  <motion.div className="flex justify-between items-start">
                    <FileText className="text-blue-600 text-xl" />
                    <motion.div className="flex items-center gap-1">
                       <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">NEW</span>
                       <CheckCircle className="text-green-500 w-5 h-5" />
                    </motion.div>
                  </motion.div>
                  <motion.div>
                    <motion.div className="text-xs font-bold text-slate-400 line-clamp-1">{file.name}</motion.div>
                    <motion.div className="text-sm font-bold text-slate-700 leading-tight">{title}</motion.div>
                  </motion.div>
                </motion.div>
              );
            }""".replace("motion.div", "div")

if old_filled_correct in t:
    t = t.replace(old_filled_correct, new_filled)
    print("filled ok")
else:
    print("filled block not found")

t = t.replace(
    'const uploadedCardClass = "bg-white h-32 rounded-xl border-l-4 border-blue-600 shadow-sm p-4 flex flex-col justify-between hover:scale-105 transition-transform cursor-pointer";',
    'const uploadedCardClass = "bg-white min-h-[8.5rem] rounded-xl border-l-4 border-blue-600 shadow-sm p-4 flex flex-col justify-between";',
)

t = t.replace("DROP PDF HERE", "ここにドロップ")

footer = """
      {canView && pageOrderLen > 0 && (
        <section className="border-t border-slate-200 bg-white/90">
          <button
            type="button"
            onClick={() => setPagePanelOpen((o) => !o)}
            className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50 md:px-8"
          >
            <span className="text-sm font-bold text-slate-700">
              ページの並び
              <span className="ml-2 text-xs font-normal text-slate-500">（任意・編集しなくても提出可）</span>
            </span>
            {pagePanelOpen ? (
              <ChevronUp className="h-4 w-4 text-slate-500" aria-hidden />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-500" aria-hidden />
            )}
          </button>
          {pagePanelOpen && <PageGrid />}
        </section>
      )}

      {canUpload && pageOrderLen > 0 && (
        <div className="sticky bottom-0 z-30 flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(15,23,42,0.06)] backdrop-blur md:px-8">
          <div className="mr-auto flex items-center gap-2">
            <p className="hidden text-[11px] text-slate-500 sm:block">
              必要なときだけ編集し、PDF を出力できます。
            </p>
            <SyncStatusBadge status={sessionSyncStatus} variant="inline" />
            <span className="text-[10px] text-slate-400">セッション同期</span>
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
"""

t = t.replace(
    "      </div>\n    </main>\n  );\n}",
    f"      </div>{footer}    </main>\n  );\n}}",
)

# fix double brace at end
t = t.replace("\n}}", "\n}")

t = t.replace("motion.div", "motion.DIV")
t = t.replace("motion.DIV", "div")

TARGET.write_text(t, encoding="utf-8")
print("written", TARGET)
