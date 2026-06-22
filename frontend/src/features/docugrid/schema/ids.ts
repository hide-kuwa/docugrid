/** Branded string IDs — JSON / API 上は通常の string */

export type FileId = string & { readonly __brand: "FileId" };
export type PageId = string & { readonly __brand: "PageId" };
export type HighlightId = string & { readonly __brand: "HighlightId" };

export function asFileId(id: string): FileId {
  return id as FileId;
}

export function asPageId(id: string): PageId {
  return id as PageId;
}

export function asHighlightId(id: string): HighlightId {
  return id as HighlightId;
}
