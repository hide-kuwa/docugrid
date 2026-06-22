const DEFAULT_API_BASE = "http://localhost:8000/api";

export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || DEFAULT_API_BASE).replace(/\/$/, "");

export const API_ENDPOINTS = {
  UPLOAD: `${API_BASE}/pdf/info`,
  HIGHLIGHT: `${API_BASE}/highlight`,
  REORDER: `${API_BASE}/edit/reorder`,
  MERGE: `${API_BASE}/edit/merge`,
  /** OrderPayload + file_ids + files (multipart) */
  MERGE_ORDERED: `${API_BASE}/edit/merge-ordered`,
  THUMBNAILS: `${API_BASE}/pdf/thumbnails`,
  RENDER_PAGE: `${API_BASE}/pdf/render`,
  DOCUGRID_SAVE: `${API_BASE}/docugrid/save`,
  DOCUGRID_LOAD: (documentId: string) =>
    `${API_BASE}/docugrid/load/${encodeURIComponent(documentId)}`,
  /** Per client × period × slot document persistence */
  SLOTS: `${API_BASE}/slots`,
  SLOT_FILE: (docId: string) => `${API_BASE}/slots/${encodeURIComponent(docId)}/file`,
  /** OCR + ルールベース分類（自動振り分け） */
  CLASSIFY: `${API_BASE}/classify`,
  /** 申告パッケージ一括分類（Vision LLM） */
  CLASSIFY_BATCH: `${API_BASE}/classify/batch`,
  CLASSIFY_PENDING: `${API_BASE}/classify/pending`,
  CLASSIFY_PENDING_FILE: (id: string) =>
    `${API_BASE}/classify/pending/${encodeURIComponent(id)}/file`,
  DOCUMENT_TEMPLATES: `${API_BASE}/document-templates`,
  AUTHORING_TEMPLATES: `${API_BASE}/authoring-templates`,
  /** immutable 資料版 */
  DOCUMENT_VERSIONS: `${API_BASE}/document-versions`,
  DOCUMENT_VERSION_FILE: (versionId: string) =>
    `${API_BASE}/document-versions/${encodeURIComponent(versionId)}/file`,
  DRIVE_STATUS: `${API_BASE}/drive/status`,
  DRIVE_TEST: `${API_BASE}/drive/test`,
  DRIVE_CREDENTIALS: `${API_BASE}/drive/credentials`,
  LOGICAL_VERSIONS: `${API_BASE}/logical-documents/versions`,
} as const;
