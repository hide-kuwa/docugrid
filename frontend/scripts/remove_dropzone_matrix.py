# -*- coding: utf-8 -*-
from pathlib import Path

p = Path(r"c:\dev\TAXX\frontend\src\components\MatrixGrid.tsx")
t = p.read_text(encoding="utf-8")

if "useDropzone" not in t:
    print("already removed")
    raise SystemExit(0)

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

if "fileInputRef" not in t:
    raise SystemExit("dropzone replace failed")

if '<input\n        ref={fileInputRef}' not in t:
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
    )

start = t.find("{...getRootProps({")
if start == -1:
    raise SystemExit("getRootProps block not found")
end = t.find("          })}", start)
new_slot = '''            const slotDragActive = dragOverSlot === i;
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
                  <motion.div className="text-xs font-bold text-slate-500">PLACEHOLDER_NO_UPLOAD</motion.div>
                ) : slotDragActive ? (
                  <>
                    <UploadCloud className="mb-2 h-8 w-8 animate-bounce text-blue-600" />
                    <motion.div className="text-sm font-black text-blue-600">PLACEHOLDER_DROP</motion.div>
                  </>
                ) : (
                  <>
                    <Plus className="mb-2 text-slate-300 group-hover:text-blue-500" />
                    <motion.div className="text-xs font-bold text-slate-400 group-hover:text-blue-500">{title}</motion.div>
                    {isActiveSlot && (
                      <motion.div className="mt-1 text-[10px] font-medium text-slate-400">PLACEHOLDER_PDF_DROP</motion.div>
                    )}
                  </>
                )}
              </motion.div>
            );'''
new_slot = new_slot.replace("motion.div", "div").replace("PLACEHOLDER_NO_UPLOAD", "アップロード権限なし").replace("PLACEHOLDER_DROP", "ここにドロップ").replace("PLACEHOLDER_PDF_DROP", "PDFをドロップ")

# find return ( before getRootProps
ret = t.rfind("            return (", 0, start)
t = t[:ret] + new_slot + t[end:]

p.write_text(t, encoding="utf-8", newline="\n")
print("done", "useDropzone" in t, "onPreview(file)" in t)
