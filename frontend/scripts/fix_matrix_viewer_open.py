# -*- coding: utf-8 -*-
from pathlib import Path

TARGET = Path(__file__).resolve().parents[1] / "src" / "components" / "MatrixGrid.tsx"
t = TARGET.read_text(encoding="utf-8")

t = t.replace(
    'import { useState } from "react";\nimport { useDropzone } from "react-dropzone";',
    'import { useCallback, useRef, useState } from "react";',
)
t = t.replace(
    "  onPreview: () => void;\n  onEdit: () => void;",
    "  onPreview: (sourceFile: File) => void;\n  onEdit: (sourceFile: File) => void;",
)

t = t.replace(
    """  const { getRootProps, getInputProps, isDragActive, open: openFilePicker } = useDropzone({
    onDrop: (files) => {
      if (!canUpload) return;
      void Promise.resolve(onFilesDropped(files)).catch((err) => {
        console.error("File drop failed:", err);
        alert("ファイルの取り込みに失敗しました。");
      });
    },
    accept: { "application/pdf": [".pdf"] },
    multiple: false,
    noClick: true,
    disabled: !canUpload,
  });""",
    """  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);

  const acceptPdfFiles = useCallback(
    (picked: FileList | File[]) => {
      if (!canUpload) return;
      const list = Array.from(picked).filter(
        (f) => f.type === "application/pdf" || /\\.pdf$/i.test(f.name),
      );
      if (list.length === 0) return;
      void Promise.resolve(onFilesDropped(list)).catch((err) => {
        console.error("File drop failed:", err);
        alert("ファイルの取り込みに失敗しました。");
      });
    },
    [canUpload, onFilesDropped],
  );""",
)

t = t.replace(
    """  return (
    <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-slate-100 transition-opacity duration-300">""",
    """  return (
    <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-slate-100 transition-opacity duration-300">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          if (e.target.files?.length) acceptPdfFiles(e.target.files);
          e.target.value = "";
        }}
      />""",
)

t = t.replace("onPreview();", "onPreview(file);")
t = t.replace("onEdit();", "onEdit(file);")

old_empty_start = "            return (\n              <div\n                key={i}\n                {...getRootProps({"
if old_empty_start not in t:
    raise SystemExit("empty slot start not found")

# replace from old_empty_start through closing `);` before `})}`
idx = t.index(old_empty_start)
end = t.index("          })}", idx)
old_chunk = t[idx:end]
new_chunk = """            const slotDragActive = dragOverSlot === i;
            return (
              <div
                key={i}
                role="button"
                tabIndex={canUpload ? 0 : -1}
                onKeyDown={(e) => {
                  if (!canUpload) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragEnter={(e) => {
                  if (!canUpload) return;
                  e.preventDefault();
                  setDragOverSlot(i);
                }}
                onDragOver={(e) => {
                  if (!canUpload) return;
                  e.preventDefault();
                  setDragOverSlot(i);
                }}
                onDragLeave={() => {
                  setDragOverSlot((prev) => (prev === i ? null : prev));
                }}
                onDrop={(e) => {
                  if (!canUpload) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOverSlot(null);
                  if (e.dataTransfer.files.length > 0) {
                    acceptPdfFiles(e.dataTransfer.files);
                  }
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (canUpload) fileInputRef.current?.click();
                }}
                className={`flex h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-2 text-center transition-colors group ${
                  slotDragActive
                    ? "scale-105 border-blue-500 bg-blue-50"
                    : "border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-white"
                } ${canUpload ? "" : "cursor-not-allowed opacity-60 hover:border-slate-300 hover:bg-slate-50"}`}
              >
                {!canUpload ? (
                  <div className="text-xs font-bold text-slate-500">アップロード権限なし</div>
                ) : slotDragActive ? (
                  <>
                    <UploadCloud className="mb-2 h-8 w-8 animate-bounce text-blue-600" />
                    <div className="text-sm font-black text-blue-600">ここにドロップ</div>
                  </>
                ) : (
                  <>
                    <Plus className="mb-2 text-slate-300 group-hover:text-blue-500" />
                    <div className="text-xs font-bold text-slate-400 group-hover:text-blue-500">{title}</div>
                    {isActiveSlot && (
                      <motion.div className="mt-1 text-[10px] font-medium text-slate-400">PDFをドロップ</div>
                    )}
                  </>
                )}
              </div>
            );
""".replace("motion.div", "TAG").replace("</motion.div>", "</TAG>").replace("<motion.div", "<TAG").replace("TAG", "div")

t = t[:idx] + new_chunk + t[end:]

TARGET.write_text(t, encoding="utf-8", newline="\n")
assert "useDropzone" not in t
assert "onPreview(file)" in t
print("ok")
