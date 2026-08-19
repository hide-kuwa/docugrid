import {
  ArrowLeftRight,
  ClipboardCheck,
  FileSearch,
  Grid3X3,
  Layers,
  Lock,
  ScanLine,
  Settings2,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export const HERO_ROTATING_WORDS = [
  "資料整理",
  "月次監査",
  "決算対応",
  "指標連携",
  "監査承認",
  "税務会計連携",
] as const;

export const SOCIAL_PROOF = {
  badge: "TAXX エコシステム",
  headline: "税理士事務所向けに設計",
  note: "資料マトリクス × OCR × 監査を一体運用",
};

export const NEWS_ITEMS = [
  {
    date: "2026.06.19",
    title: "ノーコード設定（連携ポート・法定マスタ・指標マップ）を開発コンソールに追加",
  },
  {
    date: "2026.06.18",
    title: "インタラクティブ LP を DocuGrid リポジトリ内に統合 — 本番マトリクス UI を体験可能に",
  },
  {
    date: "2026.06.15",
    title: "TAXX 認証シェルと税務会計システム（accounting-ui）の連携設計を公開",
  },
];

export type FeatureCard = {
  id: string;
  tag: string;
  title: string;
  subtitle: string;
  gradient: string;
  icon: LucideIcon;
};

export const PRIMARY_FEATURES: FeatureCard[] = [
  {
    id: "matrix",
    tag: "MATRIX",
    title: "顧問先 × 期間の資料マトリクス",
    subtitle: "縦に月、横に顧問先。本番と同じドラム UI で資料の所在が一目瞭然。",
    gradient: "from-blue-600 to-indigo-700",
    icon: Grid3X3,
  },
  {
    id: "ocr",
    tag: "OCR",
    title: "PDF を読み取り、指標に正規化",
    subtitle: "試算表・元帳・請求書を OCR → 指標キーへ。監査と帳簿連携の土台。",
    gradient: "from-cyan-600 to-blue-700",
    icon: ScanLine,
  },
  {
    id: "audit",
    tag: "AUDIT",
    title: "承認フローまでワンストップ",
    subtitle: "資料と数値の根拠を同じ画面で追跡。差戻し・履歴も保持。",
    gradient: "from-violet-600 to-indigo-800",
    icon: ClipboardCheck,
  },
  {
    id: "handoff",
    tag: "HANDOFF",
    title: "税務会計システムへシームレス連携",
    subtitle: "正規化した指標を TAXX エコシステム内の帳簿・決算へ渡す。",
    gradient: "from-emerald-600 to-teal-800",
    icon: ArrowLeftRight,
  },
];

export const TAX_OPS_FEATURES = [
  {
    icon: Layers,
    title: "顧問先データと資料を一元管理",
    body: "マトリクス上の PDF と正規化指標が同じ client_id・期間スコープで紐づきます。",
  },
  {
    icon: FileSearch,
    title: "法定マスタで税率・控除をコードレス更新",
    body: "消費税率や所得税区分を YAML / CSV で管理。エンジニア不要の変更が可能。",
  },
  {
    icon: Settings2,
    title: "連携ポートカタログで API を可視化",
    body: "handoff 先ごとのペイロードを定義・検証。ドライランで本番前にテスト。",
  },
];

export const PRODUCTIVITY_FEATURES = [
  {
    icon: Sparkles,
    title: "AI 自動振り分け（本番機能）",
    body: "複数 PDF をまとめてドロップし、枠へ自動配置。デモでは手動 D&D も可能。",
  },
  {
    icon: Grid3X3,
    title: "担当顧問先のスコープ切替",
    body: "担当分 / 全顧問先をナビで切替。大規模事務所でも迷わない。",
  },
  {
    icon: ClipboardCheck,
    title: "監査タイムライン",
    body: "誰がいつ承認したかを時系列で確認。クライアントへの説明負荷を削減。",
  },
];

export const TRUST_POINTS = [
  "firm_id / client_id によるテナント分離",
  "JWT セッションとロールベース権限",
  "資料・指標の変更履歴を監査ログで追跡",
  "サーバー保存 ＋ 任意で Google Drive ミラー",
  "第三者提供なし — 事務所データは事務所の SSOT",
];

/** LP・営業向け（正本: docs/help/storage-story.md） */
export const STORAGE_STORY_LP = {
  headline: "資料の正本は DocuGrid。Drive はそのまま活かす。",
  subcopy:
    "PDF はまず DocuGrid のサーバーに集約。Google Drive 連携 ON なら、同じファイルを事務所の Drive にも自動で残します。ブラウザや個人 PC に散らばらず、マトリクス・権限・版管理はアプリ側で一元化。",
  bullets: [
    "散らばらない — 格納先はサーバー中心。スタッフはマトリクスから同じ資料を見る",
    "Drive と両立 — 連携 ON で Drive にもミラー。所内の Drive 文化を壊さない",
    "移行に配慮 — 旧 Drive は残しつつ ZIP 整理。容量逼迫時もサーバーへ先に載せられる",
  ],
  helpPath: "/help?id=storage-story",
};

export const PLAN_FEATURES = [
  "資料マトリクス・PDF ビューア",
  "OCR 正規化と指標マッピング",
  "監査・承認ワークフロー",
  "税務会計システムへの handoff",
  "開発コンソール（プラットフォーム管理者）",
  "法定マスタ・連携ポートのノーコード設定",
];

export const ONBOARDING_STEPS = [
  {
    step: "1",
    title: "顧客マスタを CSV で取り込み",
    body: "事務所設定から顧問先一覧を整えます。",
  },
  {
    step: "2",
    title: "（任意）旧フォルダを ZIP 一括整理",
    body: "Drive や PC のバックアップを DocuGrid へ。要確認キューで人が確定。",
  },
  {
    step: "3",
    title: "Google Drive を接続",
    body: "整理済み PDF をサーバー ＋ Drive にミラー。共有ドライブ推奨。",
  },
  {
    step: "4",
    title: "マトリクスで日々の資料を格納",
    body: "OCR・監査・税務会計システムへの handoff へ。",
  },
];

export const FAQ_ITEMS = [
  {
    q: "DocuGrid は誰向けのプロダクトですか？",
    a: "税理士法人・会計事務所向けです。顧問先ごとの資料整理・月次監査・決算資料の管理を担う TAXX エコシステムの資料整理レイヤーです。",
  },
  {
    q: "税務会計システム（仕訳・試算表）との関係は？",
    a: "DocuGrid は資料と正規化指標の SSOT。帳簿本体は別プロダクト（税務会計システム）が担い、handoff API で連携します。",
  },
  {
    q: "このページのデモと本番の違いは？",
    a: "デモはスクリプト演出で OCR API を呼びません。本番では実際の PDF 取込・OCR・監査フローが動作します。",
  },
  {
    q: "ログイン方法は？",
    a: "ローカル開発では admin@taxx.jp / password（プラットフォーム管理者）。本番は事務所の Google アカウント等を想定しています。",
  },
  {
    q: "データのセキュリティは？",
    a: "テナント境界（firm_id）と client スコープを API 層で強制。監査ログで操作を追跡できる設計です。",
  },
  {
    q: "Google Drive だけで運用していた事務所は？",
    a: "DocuGrid にサーバー保存し、必要なら Drive にもミラーします。旧 Drive フォルダは ZIP で一括整理できます。Drive が満杯でも、まずサーバーへ載せてから整理する運用が可能です。",
  },
];

export const FOOTER_LINKS = {
  product: [
    { label: "ライブデモ", href: "#demo" },
    { label: "機能一覧", href: "#features" },
    { label: "ログイン", href: "/login" },
  ],
  taxx: [
    { label: "TAXX ログイン", href: "/login" },
    { label: "開発コンソール", href: "/dev" },
    { label: "事務所設定", href: "/settings" },
  ],
};
