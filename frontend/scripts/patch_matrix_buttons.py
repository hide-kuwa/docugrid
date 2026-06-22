# -*- coding: utf-8 -*-
from pathlib import Path

TARGET = Path(__file__).resolve().parents[1] / "src" / "components" / "MatrixGrid.tsx"
t = TARGET.read_text(encoding="utf-8")

t = t.replace(
    """  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => {
      if (!canUpload) return;
      void Promise.resolve(onFilesDropped(files)).catch((err) => {
        console.error("File drop failed:", err);
        alert("ファイルの取り込みに失敗しました。");
      });
    },
    accept: { "application/pdf": [".pdf"] },
    multiple: false,
    noClick: !!file || !canUpload,
  });""",
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
)

t = t.replace(
    "transition-opacity duration-300 select-none",
    "transition-opacity duration-300",
)

t = t.replace(
    """            if (isActiveSlot && file) {
              return (
                <motion.div key={i} className={`${uploadedCardClass} shadow-md ring-2 ring-blue-100`}>""".replace(
        "motion.div", "div"
    ),
    """            if (isActiveSlot && file) {
              return (
                <motion.div
                  key={i}
                  className={`relative z-10 ${uploadedCardClass} shadow-md ring-2 ring-blue-100`}
                >""".replace("motion.div", "motion.DIV").replace("motion.DIV", "div"),
)

old_btns = """                  {canView && (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPreview();
                        }}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden />
                        プレビュー
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit();
                        }}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-2 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-500"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                        編集する
                      </button>
                    </div>
                  )}"""

new_btns = """                  {canView && (
                    <motion.div className="relative z-20 mt-3 flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onPreview();
                        }}
                        className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden />
                        プレビュー
                      </button>
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onEdit();
                        }}
                        className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-2 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-500"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                        編集する
                      </button>
                    </motion.div>
                  )}""".replace("motion.div", "div")

if old_btns in t:
    t = t.replace(old_btns, new_btns)
else:
    raise SystemExit("buttons block not found")

t = t.replace(
    """            return (
              <div
                key={i}
                {...getRootProps()}
                className={`flex h-32 cursor-pointer""",
    """            return (
              <div
                key={i}
                {...getRootProps({
                  onClick: (e) => {
                    e.stopPropagation();
                    if (canUpload) openFilePicker();
                  },
                })}
                className={`flex h-32 cursor-pointer""",
)

TARGET.write_text(t, encoding="utf-8", newline="\n")
assert "法人税申告書" in t
assert "openFilePicker" in t
assert "????" not in t
print("patched OK")
