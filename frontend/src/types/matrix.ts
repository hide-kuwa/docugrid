export type AxisDirection = 'horizontal' | 'vertical';

export interface AxisItem {
  id: string;
  label: string;
  subLabel?: string;
  type?: 'default' | 'special';
  color?: string;
  // ★追加: クライアント側のドライブ設定（存在しなければ未設定＝保存しない）
  clientDriveSetting?: {
    isConnected: boolean;
    folderId: string;
    lastSynced?: string;
  };
}

export interface CellData {
  id: string;      // ユニークID
  title: string;   // 書類名
  isFilled: boolean; // アップロード済みか？
  category: 'template' | 'custom'; // 必須項目か、個別追加か
  fileUrl?: string;
}