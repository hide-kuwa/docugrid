import type { FileId, HighlightId, PageId } from "./ids";
import type { SyncStatus } from "./sync";

/** アップロード済み／サーバ取得など、バイト列の参照方法 */
export type FileSource =
  | { kind: "blob"; blobKey: string }
  | { kind: "server"; serverFileId: string; downloadUrl?: string };

export interface FileEntity {
  id: FileId;
  name: string;
  source: FileSource;
  pageCount: number | null;
  mimeType: "application/pdf";
  createdAt: string;
  /** クラウド／オブジェクトストレージ上のキー（永続化後にセット） */
  storageKey?: string;
  /** ファイル単位の同期状態（サムネバッジ用） */
  syncStatus: SyncStatus;
  /** サーバー側ドキュメント ID 等（任意） */
  remoteDocumentId?: string;
  meta?: Record<string, unknown>;
}
export type HighlightTool = "marker" | "box" | "line" | "check";

/** PDF ページ座標系 0..1（バックエンド highlight と整合） */
export interface NormalizedCoord {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HighlightEntity {
  id: HighlightId;
  pageId: PageId;
  tool: HighlightTool;
  rect: NormalizedCoord;
  zIndex?: number;
  meta?: Record<string, unknown>;
}

export interface PageEntity {
  id: PageId;
  fileId: FileId;
  /** 元 PDF 内の 0-based ページ番号 */
  originalIndex: number;
  /** dnd-kit の item id 等に使う安定キー */
  displayKey: string;
  /** ページ単位の外部ストレージキー（将来の BYOS / ページキャッシュ用） */
  storageKey?: string;
}