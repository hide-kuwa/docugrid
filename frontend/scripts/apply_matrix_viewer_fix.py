# -*- coding: utf-8 -*-
"""Restore UTF-8 MatrixGrid, patch buttons, remove react-dropzone."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
scripts = ROOT / "scripts"

for name in ("restore_matrix_grid_utf8.py", "patch_matrix_buttons.py"):
    r = subprocess.run([sys.executable, str(scripts / name)], cwd=str(ROOT))
    if r.returncode != 0:
        raise SystemExit(f"{name} failed")

p = ROOT / "src" / "components" / "MatrixGrid.tsx"
t = p.read_text(encoding="utf-8")

t = t.replace(
    'import { useState } from "react";\nimport { useDropzone } from "react-dropzone";',
    'import { useCallback, useRef, useState } from "react";',
)
t = t.replace(
    "  onPreview: () => void;\n  onEdit: () => void;",
    "  onPreview: (sourceFile: File) => void;\n  onEdit: (sourceFile: File) => void;",
)

import re

t = re.sub(
    r"  const \{ getRootProps.*?disabled: !canUpload,\n  \}\);",
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
    raise SystemExit("dropzone removal failed")

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

t = t.replace("onPreview();", "onPreview(file);")
t = t.replace("onEdit();", "onEdit(file);")

m = re.search(
    r"            return \(\s*<div\s+key=\{i\}\s+\{\.\.\.getRootProps\(\{.*?\}\)\}\s+className=.*?\);\s*",
    t,
    re.DOTALL,
)
if not m:
    raise SystemExit("empty slot pattern not found")

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
                    <div className="text-sm font-black text-blue-600">ここにドロップ</div>
                  </>
                ) : (
                  <>
                    <Plus className="mb-2 text-slate-300 group-hover:text-blue-500" />
                    <div className="text-xs font-bold text-slate-400 group-hover:text-blue-500">{title}</motion.div>
                    {isActiveSlot && (
                      <div className="mt-1 text-[10px] font-medium text-slate-400">PDFをドロップ</motion.div>
                    )}
                  </>
                )}
              </motion.div>
            );
"""
new_slot = new_slot.replace("motion.div", "div").replace("</motion.div>", "</div>")

t = t[: m.start()] + new_slot + t[m.end() :]

p.write_text(t, encoding="utf-8", newline="\n")
assert "法人税申告書" in t
assert "useDropzone" not in t
assert "onPreview(file)" in t
print("all OK")
