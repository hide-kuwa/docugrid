# -*- coding: utf-8 -*-
"""Restore MatrixGrid then apply viewer-store + native file input (UTF-8 safe)."""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "src" / "components" / "MatrixGrid.tsx"

subprocess.run([sys.executable, str(ROOT / "scripts" / "restore_matrix_grid_utf8.py")], check=True)

t = TARGET.read_text(encoding="utf-8")
if "法人税申告書" not in t:
    raise SystemExit("restore failed: missing Japanese")

t = t.replace(
    'import { useState } from "react";\nimport { useDropzone } from "react-dropzone";',
    'import { useCallback, useRef, useState } from "react";',
)
t = t.replace(
    'import { useDocugridStore } from "@/features/docugrid/state/docugrid-store";\nimport { Client } from "./types";',
    'import { useDocugridStore } from "@/features/docugrid/state/docugrid-store";\nimport { useViewerUiStore } from "@/features/pdf-viewer/state/viewer-ui-store";\nimport { Client } from "./types";',
)
t = t.replace(
    "  onPreview: () => void;\n  onEdit: () => void;\n  slotNotice:",
    "  slotNotice:",
)
t = t.replace(
    "  onFilesDropped,\n  onPreview,\n  onEdit,\n  slotNotice,",
    "  onFilesDropped,\n  slotNotice,",
)

t = re.sub(
    r"  const \{ getRootProps, getInputProps, isDragActive \} = useDropzone\(\{.*?\n  \}\);",
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
    t,
    count=1,
    flags=re.DOTALL,
)

if "fileInputRef" not in t:
    raise SystemExit("dropzone replace failed")

if "ref={fileInputRef}" not in t:
    t = t.replace(
        '    <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-slate-100 transition-opacity duration-300">',
        '''    <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-slate-100 transition-opacity duration-300">
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
      />''',
        1,
    )

t = t.replace(
    """                <motion.div key={i} className={`${uploadedCardClass} shadow-md ring-2 ring-blue-100`}>""".replace(
        "motion.div", "motion.DIV"
    ),
    """                <div
                  key={i}
                  className={`relative z-10 ${uploadedCardClass} shadow-md ring-2 ring-blue-100`}
                >""",
).replace("motion.DIV", "motion.div")

if "relative z-10" not in t:
    t = t.replace(
        '<div key={i} className={`${uploadedCardClass} shadow-md ring-2 ring-blue-100`}>',
        '<motion.div key={i} className={`relative z-10 ${uploadedCardClass} shadow-md ring-2 ring-blue-100`}>'.replace(
            "motion.div", "div"
        ),
    )

t = re.sub(
    r"""                      <button
                        type="button"
                        onClick=\{\(e\) => \{
                          e\.stopPropagation\(\);
                          onPreview\(\);
                        \}\}""",
    """                      <button
                        type="button"
                        onClick={() => useViewerUiStore.getState().open("preview", file)}""",
    t,
    count=1,
)

t = re.sub(
    r"""                      <button
                        type="button"
                        onClick=\{\(e\) => \{
                          e\.stopPropagation\(\);
                          onEdit\(\);
                        \}\}""",
    """                      <button
                        type="button"
                        onClick={() => useViewerUiStore.getState().open("edit", file)}""",
    t,
    count=1,
)

if 'useViewerUiStore.getState().open("edit"' not in t:
    raise SystemExit("button replace failed")

t = t.replace(
    '<div className="mt-3 flex flex-col gap-2 sm:flex-row">',
    '<motion.div className="relative z-50 mt-3 flex flex-col gap-2 sm:flex-row">'.replace("motion.div", "motion.DIV"),
)
t = t.replace("motion.DIV", "div", 1)  # only first? careful

# fix button container - only replace in filled card section
t = t.replace(
    """                  {canView && (
                    <div className="relative z-50 mt-3 flex flex-col gap-2 sm:flex-row">""",
    """                  {canView && (
                    <div className="relative z-50 mt-3 flex flex-col gap-2 sm:flex-row">""",
)

m = re.search(
    r"            return \(\s*<div\s+key=\{i\}\s+\{\.\.\.getRootProps\(\)\}.*?\);\s*",
    t,
    re.DOTALL,
)
if not m:
    raise SystemExit("empty slot not found")

new_slot = """            const slotDragActive = dragOverSlot === i;
            return (
              <div
                key={i}
                role="button"
                tabIndex={canUpload ? 0 : -1}
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
                  if (e.dataTransfer.files.length > 0) acceptPdfFiles(e.dataTransfer.files);
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
                    <motion.div className="text-sm font-black text-blue-600">DROP</motion.div>
                  </>
                ) : (
                  <>
                    <Plus className="mb-2 text-slate-300 group-hover:text-blue-500" />
                    <motion.div className="text-xs font-bold text-slate-400 group-hover:text-blue-500">{title}</motion.div>
                    {isActiveSlot && (
                      <motion.div className="mt-1 text-[10px] font-medium text-slate-400">PDF_DROP</motion.div>
                    )}
                  </>
                )}
              </motion.div>
            );
"""
new_slot = (
    new_slot.replace("motion.div", "div")
    .replace("DROP", "ここにドロップ")
    .replace("PDF_DROP", "PDFをドロップ")
)

t = t[: m.start()] + new_slot + t[m.end() :]
t = t.replace("motion.div", "motion.DIV").replace("motion.DIV", "motion.div")  # noop safety
if "motion.div" in t:
    t = t.replace("motion.div", "div")

TARGET.write_text(t, encoding="utf-8", newline="\n")
assert "法人税申告書" in t
assert "useDropzone" not in t
assert 'open("edit"' in t
print("MatrixGrid final OK")
