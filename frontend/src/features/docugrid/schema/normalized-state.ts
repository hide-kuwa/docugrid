import type { FileEntity, HighlightEntity, PageEntity } from "./entities";
import type { FileId, HighlightId, PageId } from "./ids";
import type { SyncStatus } from "./sync";

/**
 * アプリ全体の単一の真実（RDB 風フラット構造）
 */
export interface DocugridNormalizedState {
  filesById: Record<FileId, FileEntity>;
  pagesById: Record<PageId, PageEntity>;
  highlightsById: Record<HighlightId, HighlightEntity>;
  /** 結合・編集後の線形順（クロスファイル DnD の結果） */
  pageOrder: PageId[];
  /** ファイル一覧の順序 */
  fileOrder: FileId[];
  /** highlight の逆引き */
  highlightIdsByPageId: Record<PageId, HighlightId[]>;
  /**
   * ブラウザ内の File 参照（永続化しない）。サムネ・プレビュー用。
   * `FileEntity.id` と対応。
   */
  localFilesById: Record<FileId, File>;
  /** セッション全体の同期（一括保存 UI 用） */
  sessionSyncStatus: SyncStatus;
  lastSyncError?: string;
  /** POST /api/docugrid/save で発行・更新されるサーバー側ドキュメント ID（再ロード用） */
  persistedDocumentId: string | null;
}