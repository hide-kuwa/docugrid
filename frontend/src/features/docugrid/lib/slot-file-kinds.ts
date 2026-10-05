/** マトリクススロットに載せられる拡張子（バックエンド upload_file_kinds と揃える） */

export const SLOT_ALLOWED_EXTENSIONS = [
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "xlsx",
  "xls",
  "csv",
  "docx",
  "doc",
  "rtf",
] as const;

export const SLOT_FILE_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.gif,.xlsx,.xls,.csv,.docx,.doc,.rtf,application/pdf,image/png,image/jpeg,image/webp,image/gif,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/rtf";

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

export function slotFileExt(name: string | null | undefined): string {
  if (!name) return "";
  const base = name.replace(/\\/g, "/").split("/").pop() || "";
  const i = base.lastIndexOf(".");
  if (i <= 0) return "";
  return base.slice(i + 1).toLowerCase();
}

export function isAllowedSlotFile(file: File): boolean {
  const ext = slotFileExt(file.name);
  if ((SLOT_ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) return true;
  if (file.type === "application/pdf") return true;
  if (file.type.startsWith("image/")) {
    const map: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "image/gif": "gif",
    };
    return Boolean(map[file.type]);
  }
  return false;
}

export function isPdfSlotName(name: string | null | undefined): boolean {
  return slotFileExt(name) === "pdf";
}

export function isConvertibleImageName(name: string | null | undefined): boolean {
  return IMAGE_EXT.has(slotFileExt(name));
}

export function extBadgeLabel(name: string | null | undefined): string | null {
  const ext = slotFileExt(name);
  if (!ext || ext === "pdf") return null;
  return ext.toUpperCase();
}

export function guessSlotMime(name: string | null | undefined, fallback = "application/octet-stream"): string {
  const ext = slotFileExt(name);
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    csv: "text/csv",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    rtf: "application/rtf",
  };
  return map[ext] || fallback;
}
