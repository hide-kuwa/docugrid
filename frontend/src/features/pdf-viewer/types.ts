export type UploadStatus = "idle" | "uploading" | "success" | "error";

/** preview = 閲覧のみ（注釈ツール非表示）、edit = フル編集 */
export type ViewerMode = "preview" | "edit";

export type WorkflowStatus = "draft" | "review_pending" | "auditing" | "done" | "rejected" | "fix";

export type DocVersion = {
  ver: string;
  date: string;
  user: string;
  action: string;
  status: WorkflowStatus;
  comment?: string;
  file?: File;
};

export type ToolType = "none" | "marker" | "box" | "line" | "check" | "eraser";

/** 0..1 正規化座標のフリーハンド点 */
export type NormPoint = { x: number; y: number };

export type NormRect = { x: number; y: number; w: number; h: number };

export type AuditTarget = "primary" | "reference";
export type AuditSide = "left" | "right";

export type AuditCheckPoint = {
  side: AuditSide;
  page: number;
  x: number;
  y: number;
  fileName?: string;
  fileHash?: string;
};

export type AuditCheckLink = {
  id: string;
  createdAt: string;
  createdBy?: string;
  /** 照合リスト用メモ（監査担当のコメント） */
  comment?: string;
  left: AuditCheckPoint;
  right: AuditCheckPoint;
};

export interface EnhancedDocVersion extends Omit<DocVersion, "status"> {
  status: WorkflowStatus;
  actionsLog: string[];
  isMajor: boolean;
  versionId: string;
  /** 完全削除イベント（PDF は参照不可・ファイル名は記録しない） */
  isDeletion?: boolean;
  /** 版に紐づかない監査メタイベント（共有・解除など） */
  metaEventType?: "client_share" | "client_unshare";
}

export interface ViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: File | null;
  pdfUrl: string | null;
  /** 新規ドロップのたびに増やすとビューアが 1 ページ目から読み直す（注釈で pdfUrl が変わるだけのときは増やさない） */
  viewerSession?: number;
  pageCount: number | null;
  uploadStatus: UploadStatus;
  isLoading: boolean;
  onHighlight: (
    type: "box" | "marker" | "line" | "check" | "eraser",
    page: number,
    rect: NormRect,
    options?: { file?: File; updatePrimary?: boolean; path?: NormPoint[] },
  ) => Promise<File | { file: File; previewDataUrl: string } | void>;
  onReorder: (newOrder: number[]) => Promise<File | void>;
  onMerge: (files: File[]) => Promise<File | void>;
  onGetThumbnails: () => Promise<string[]>;
  onRenderPage: (page: number, fileOverride?: File) => Promise<string | null>;
  canAnnotate?: boolean;
  canApprove?: boolean;
  /** Docugrid グリッドとビューアの pageOrder を共有 */
  syncWithDocugrid?: boolean;
  viewerMode?: ViewerMode;
  onViewerModeChange?: (mode: ViewerMode) => void;
  /** 監査イベントを紐づける対象スロット（client × 期 × slot）。未指定なら永続化しない。 */
  slotIdentity?: { clientId: string; periodKey: string; slotId: string };
  slotLabel?: string;
  /** 新版スナップショット作成後に親へ通知（スロット表示の更新用） */
  onVersionCreated?: (meta: {
    versionId: string;
    versionLabel: string;
    logicalDocumentId?: string;
    workflowStatus?: string;
    file: File;
  }) => void;
  /** 監査イベント保存後（差戻し等、版なしイベント含む） */
  onAuditStateChange?: () => void;
  /** スロットの最新ワークフロー（review_events）。ビューア未同期時の表示用。 */
  slotWorkflowStatus?: string;
  /** サーバー保存済み資料の doc_id */
  persistedDocId?: string;
  canSoftDeleteDocument?: boolean;
  onSoftDelete?: () => void;
  canPurgeDocument?: boolean;
  onPurge?: () => void;
  onRestore?: () => void;
  canShareWithClient?: boolean;
  clientSharedAt?: string | null;
  onShareWithClient?: () => void;
  onUnshareWithClient?: () => void;
  /** 親画面の操作（共有解除など）後に版履歴を再取得する */
  historyRevision?: number;
}

export function isPersistedDocumentVersionId(versionId: string | undefined): boolean {
  return !!versionId && versionId !== "initial" && versionId !== "fallback";
}

export const INITIAL_HISTORY: EnhancedDocVersion[] = [
  {
    ver: "v1.0.0",
    date: "2024/05/15 11:00",
    user: "田中 (担当)",
    action: "初版アップロード",
    status: "draft",
    isMajor: true,
    versionId: "initial",
    actionsLog: ["ファイルアップロード"],
  },
];
