/**
 * クラウド同期・ローカル変更の可視化用。
 * MVP では API 未接続でも UI 上で dirty / saved を切り替え可能。
 */
export type SyncStatus = "idle" | "dirty" | "saving" | "saved" | "error";
