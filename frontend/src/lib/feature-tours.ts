import type { AppPermission } from "@/config/organization";
import type { PersonaId } from "@/config/personas";
import type { DocugridUser } from "./auth";
import { hasPermission } from "./authorization";
import { resolvePersonaId } from "./persona";

export type FeatureTourPrepare =
  | "pin-workspace-rail"
  | "open-workspace-rail"
  | "settings-clients"
  | "settings-drive";

/** レール切替（MatrixShellLayout が監視） */
export type FeatureTourWorkspace =
  | "doc"
  | "pdf"
  | "dm"
  | "tax"
  | "karte";

export type FeatureTourStep = {
  title: string;
  body: string;
  /** CSS selector for spotlight target; 空なら中央カードのみ */
  target: string;
  /** 主ターゲットが無い／非表示のときの代替（例: 要確認キューが空） */
  fallbackTarget?: string;
  /** ハイライト穴をクリックして実ボタンを押せる（既定 true） */
  allowTargetClick?: boolean;
  /** ステップ表示前の準備（レールを開く等） */
  prepare?: FeatureTourPrepare;
  /** 表示前にワークスペース面へ切替 */
  workspace?: FeatureTourWorkspace;
  /** カルテ左ドラムのセクション id（例: master） */
  karteSection?: string;
  /** 対応ヘルプ記事 id（ツアーカード内リンク用。画面には埋め込まない） */
  helpId?: string;
};

export type FeatureTourDefinition = {
  id: string;
  label: string;
  /** ガイド一覧用の一行説明（ヘルプ要約ベース） */
  summary?: string;
  steps: FeatureTourStep[];
  /** Optional permission gate */
  permission?: AppPermission;
  /** Show only for these personas (empty = all) */
  personaIds?: PersonaId[];
  /** 未読時に自動起動（初回ワークスペースのみ推奨） */
  autoStart?: boolean;
  /** false ならガイド一覧にも出さない（UI 一時非表示など） */
  enabled?: boolean;
};

const STORAGE_PREFIX = "docugrid.tour.";

/**
 * ヘルプ（docs/help）に基づくスポットライト・チュートリアル。
 * 画面へのヘルプリンクは付けず、左下「ガイド」から再生する。
 */
export const FEATURE_TOURS: FeatureTourDefinition[] = [
  {
    id: "first_workspace",
    label: "はじめの操作",
    summary: "レール（≡）で Doc / PDF / Tax / カルテを切り替える",
    autoStart: true,
    permission: "dashboard.view",
    personaIds: ["firm_director", "firm_staff_main", "firm_staff_support"],
    steps: [
      {
        title: "メニューを開く",
        body: "左の ≡ にマウスを乗せるか固定すると、ワークスペース一覧が開きます。光っているところから触ってみましょう。",
        target: '[data-tour="workspace-menu"]',
        prepare: "open-workspace-rail",
        helpId: "workspace",
      },
      {
        title: "Doc — 資料マトリクス",
        body: "顧問先の資料を期ごとに並べるメイン画面です。日々の作業の中心になります。",
        target: '[data-tour="workspace-doc"]',
        prepare: "pin-workspace-rail",
        helpId: "doc-matrix",
      },
      {
        title: "PDF — 編集ワークスペース",
        body: "PDF の注釈・並べ替え・ダウンロードはここから。ログインなしの /pdf と同じ操作感です。",
        target: '[data-tour="workspace-pdf"]',
        prepare: "pin-workspace-rail",
        helpId: "pdf",
      },
      {
        title: "Tax — 税務進捗",
        body: "決算・中間・源泉など、事務所横断の進捗ボードです。Doc のスロット不足とは別画面ですが、現場ではセットで見ることが多いです。",
        target: '[data-tour="workspace-tax"]',
        prepare: "pin-workspace-rail",
        helpId: "tax-progress",
      },
      {
        title: "カルテ — 顧問先データ",
        body: "マスタ・グラフ・給与・進捗などはカルテにまとまっています。開くと左の縦リスト（Doc の R8・R7 と同じ位置）で切り替えます。",
        target: '[data-tour="workspace-karte"]',
        prepare: "pin-workspace-rail",
        helpId: "karte",
      },
    ],
  },
  {
    id: "doc_matrix",
    label: "資料マトリクス（Doc）",
    summary: "顧問先・期（R8 など）・スロットの見方",
    permission: "dashboard.view",
    personaIds: ["firm_director", "firm_staff_main", "firm_staff_support"],
    steps: [
      {
        title: "Doc を開く",
        body: "まずレールの Doc を選びます。資料マトリクスが中央に出ます。",
        target: '[data-tour="workspace-doc"]',
        prepare: "pin-workspace-rail",
        workspace: "doc",
        helpId: "doc-matrix",
      },
      {
        title: "上の顧問先ドラム",
        body: "上の帯は担当分の顧問先です（デモ顧客は出ません）。右上で名前・ID検索。ダブルクリックで書類別表示に切り替わる場合もあります。",
        target: '[data-tour="client-nav"]',
        workspace: "doc",
        helpId: "doc-matrix",
      },
      {
        title: "左の期リスト",
        body: "左上のラベルは YEAR（年次・R8）と MONTH（月次）が切り替わります。ダブルクリックや横スワイプで入れ替わります。月次は下へスクロールすると前期に入れます。",
        target: '[data-tour="sidebar-drum"]',
        workspace: "doc",
        helpId: "doc-matrix",
      },
      {
        title: "中央のスロット",
        body: "その期の資料枠です。空スロットに PDF をドロップするか、既存資料を開いて確認・注釈します。",
        target: '[data-tour="doc-matrix"]',
        workspace: "doc",
        allowTargetClick: false,
        helpId: "doc-matrix",
      },
    ],
  },
  {
    id: "auto_sort",
    label: "自動振り分け",
    summary: "まとめて投入 → 高信頼は自動、低信頼は要確認",
    enabled: false, // まとめて自動振り分け UI を当面非表示
    permission: "document.upload",
    personaIds: ["firm_director", "firm_staff_main", "firm_staff_support"],
    steps: [
      {
        title: "Doc で期を選ぶ",
        body: "自動振り分けは Doc のマトリクス上で行います。先に顧問先と期（例: R8）を合わせておきましょう。",
        target: '[data-tour="workspace-doc"]',
        prepare: "pin-workspace-rail",
        workspace: "doc",
        helpId: "auto-sort",
      },
      {
        title: "PDF をまとめて投入",
        body: "複数の PDF をこのエリアにドロップすると、書類種別を推定してスロットへ振り分けます。権限や期の条件でエリアが出ないときは、中央のマトリクス全体を目印にしてください。",
        target: '[data-tour="auto-sort"]',
        fallbackTarget: '[data-tour="doc-matrix"]',
        workspace: "doc",
        helpId: "auto-sort",
      },
      {
        title: "高信頼は自動配置",
        body: "確信度が高いものはそのままスロットに入ります。AI は間違えることがあるので、入ったラベルはざっと確認してください。",
        target: '[data-tour="auto-sort"]',
        fallbackTarget: '[data-tour="doc-matrix"]',
        workspace: "doc",
        helpId: "auto-sort",
      },
      {
        title: "整理トレイ",
        body: "推定が弱い書類（要確認）と未割当はスロット直上の整理トレイに並びます。提案どおり確定、または枠を検索して振り分け。↑↓と Enter も使えます。",
        target: '[data-tour="matrix-sort-tray"]',
        fallbackTarget: '[data-tour="doc-matrix"]',
        workspace: "doc",
        helpId: "auto-sort",
      },
    ],
  },
  {
    id: "pending_review",
    label: "整理トレイ",
    summary: "要確認・未割当を正しい枠へ確定する",
    permission: "document.upload",
    personaIds: ["firm_director", "firm_staff_main", "firm_staff_support"],
    steps: [
      {
        title: "整理トレイ",
        body: "要確認と未割当はスロット直上の整理トレイに出ます。提案どおり、または枠検索で振り分け。件がないときはトレイ自体が隠れます。",
        target: '[data-tour="matrix-sort-tray"]',
        fallbackTarget: '[data-tour="doc-matrix"]',
        workspace: "doc",
        helpId: "auto-sort",
      },
    ],
  },
  {
    id: "karte_hub",
    label: "カルテの見方",
    summary: "左縦リストでマスタ（他は工事中）を切替",
    permission: "dashboard.view",
    personaIds: ["firm_director", "firm_staff_main", "firm_staff_support"],
    steps: [
      {
        title: "カルテを開く",
        body: "レールのカルテを選びます。顧問先データのハブです（上の横タブではありません）。",
        target: '[data-tour="workspace-karte"]',
        prepare: "pin-workspace-rail",
        workspace: "karte",
        helpId: "karte",
      },
      {
        title: "左のセクション縦リスト",
        body: "Doc では R8・R7 があった場所に、マスタ／メモ／グラフなどが縦に並びます。いま使えるのはマスタのみで、他は工事中です。",
        target: '[data-tour="sidebar-drum"]',
        workspace: "karte",
        helpId: "karte",
      },
      {
        title: "マスタ",
        body: "顧客マスタ・正規化データ。カルテでいま本番利用できるのはこのセクションです。",
        target: '[data-tour="karte-section-master"]',
        workspace: "karte",
        karteSection: "master",
        helpId: "karte-master",
      },
      {
        title: "ほかの項目",
        body: "メモ・グラフ・給与などは工事中です。開くと準備中の案内だけ出ます。",
        target: '[data-tour="karte-section-karte"]',
        workspace: "karte",
        karteSection: "karte",
        helpId: "karte",
      },
    ],
  },
  {
    id: "pdf_workspace",
    label: "PDF ワークスペース",
    summary: "注釈・並べ替え・ダウンロード／格納",
    permission: "dashboard.view",
    personaIds: ["firm_director", "firm_staff_main", "firm_staff_support"],
    steps: [
      {
        title: "PDF 面を開く",
        body: "レールの PDF から開きます。Doc のスロットからビューアを開く経路もあります。",
        target: '[data-tour="workspace-pdf"]',
        prepare: "pin-workspace-rail",
        workspace: "pdf",
        helpId: "pdf",
      },
      {
        title: "ファイルを開く",
        body: "ここに PDF をドロップするか選ぶとビューアが開きます。注釈・ページ並べ替え・Add PDF・ダウンロードができます。",
        target: '[data-tour="pdf-open"]',
        workspace: "pdf",
        helpId: "pdf",
      },
      {
        title: "保存の違い",
        body: "ログイン後は顧問先を選んで DocuGrid へ格納できます。ゲスト /pdf はサーバー保存なしで、端末へのダウンロードが中心です。",
        target: '[data-tour="pdf-open"]',
        workspace: "pdf",
        allowTargetClick: false,
        helpId: "saving",
      },
    ],
  },
  {
    id: "tax_board",
    label: "税務進捗（Tax）",
    summary: "事務所横断の決算・中間・源泉ボード",
    permission: "dashboard.view",
    personaIds: ["firm_director", "firm_staff_main", "firm_staff_support"],
    steps: [
      {
        title: "Tax を開く",
        body: "レールの Tax を選びます。Doc の資料スロットやカルテの進捗とは別画面です。",
        target: '[data-tour="workspace-tax"]',
        prepare: "pin-workspace-rail",
        workspace: "tax",
        helpId: "tax-progress",
      },
      {
        title: "進捗ボード",
        body: "顧問先横断で今どこまで進んでいるかを一覧します。期限・手動更新の項目はボード上で確認（環境による）。不明な列は所長または設定担当へ。",
        target: '[data-tour="tax-board"]',
        workspace: "tax",
        allowTargetClick: false,
        helpId: "tax-progress",
      },
    ],
  },
  {
    id: "saving_basics",
    label: "保存先の考え方",
    summary: "サーバー保存 / Drive ミラー / 端末ダウンロード",
    permission: "dashboard.view",
    personaIds: ["firm_director", "firm_staff_main", "firm_staff_support"],
    steps: [
      {
        title: "ログイン後の保存",
        body: "ログインして保存した資料は DocuGrid のサーバー側に残ります。ブラウザに勝手に溜まるアプリではありません。",
        target: '[data-tour="workspace-doc"]',
        prepare: "pin-workspace-rail",
        helpId: "saving",
      },
      {
        title: "Google Drive",
        body: "事務所で Drive 連携が ON なら、サーバー保存に加えて Drive にもミラーされます。くわしくはヘルプ「資料はどこに残る？」。",
        target: '[data-tour="workspace-doc"]',
        helpId: "storage-story",
      },
      {
        title: "ゲストとダウンロード",
        body: "ゲスト /pdf やダウンロードボタンは、その人の端末に落ちるだけです。社内の版管理・共有にはログイン後の Doc／格納を使います。",
        target: '[data-tour="workspace-pdf"]',
        prepare: "pin-workspace-rail",
        helpId: "guest-pdf",
      },
    ],
  },
  {
    id: "tasks_nav",
    label: "今日やること",
    summary: "事務所全体の不足資料・承認待ち",
    permission: "settings.platform",
    personaIds: ["firm_director", "firm_staff_main", "firm_staff_support", "platform_admin"],
    steps: [
      {
        title: "タスクボタン",
        body: "事務所全体の不足資料・承認待ちを一覧できます。マトリクス横断の「今日やること」です。",
        target: '[data-tour="tasks-nav"]',
        prepare: "pin-workspace-rail",
        helpId: "audit-flow",
      },
    ],
  },
  {
    id: "go_live_setup",
    label: "本格稼働の最初のステップ",
    summary: "顧客 CSV · 任意 ZIP 整理 · Google Drive",
    permission: "settings.manage",
    personaIds: ["firm_director", "firm_staff_main", "platform_admin"],
    steps: [
      {
        title: "本格稼働の入口",
        body: "事務所設定のバナーから、顧客一覧 →（任意）ZIP 整理 → Drive を順番に整えます。保存はサーバー本体＋任意で Drive ミラーです。",
        target: '[data-tour="go-live-banner"]',
        fallbackTarget: '[data-tour="settings-clients"]',
        prepare: "settings-clients",
        helpId: "go-live",
      },
      {
        title: "顧客一覧 CSV",
        body: "サンプル CSV をダウンロードして事務所の顧問先を記入し、「CSV を取り込む」→ 保存します。既存データはマージまたは置き換えを選べます。",
        target: '[data-tour="settings-clients-csv"]',
        fallbackTarget: '[data-tour="go-live-step-clients"]',
        prepare: "settings-clients",
        helpId: "client-csv",
      },
      {
        title: "取り込む",
        body: "ここから CSV ファイルを選びます。取り込んだあと、画面下（または同パネル）の保存でマスタに反映してください。",
        target: '[data-tour="settings-clients-csv-import"]',
        fallbackTarget: '[data-tour="settings-clients-csv"]',
        prepare: "settings-clients",
        helpId: "client-csv",
      },
      {
        title: "初回 ZIP 整理（任意）",
        body: "旧フォルダやバックアップ ZIP を「初回データ整理」へ。Drive が満杯でもサーバーへ先に載せられます。要確認キューで人が確定します。",
        target: '[data-tour="settings-migration"]',
        fallbackTarget: '[data-tour="go-live-step-migration"]',
        prepare: "settings-clients",
        helpId: "migration",
      },
      {
        title: "Google Drive 設定",
        body: "左の「Google Drive」へ。「Google Drive を接続」で同意画面を開き、事務所の保管用アカウントを1つ繋ぎます（ログイン用とは別に可）。",
        target: '[data-tour="settings-drive-oauth"]',
        fallbackTarget: '[data-tour="settings-drive"]',
        prepare: "settings-drive",
        helpId: "google-drive",
      },
      {
        title: "アカウントと所内共有",
        body: "接続後は「事務所で見えるようにする」へ。共有ドライブを選ぶのがおすすめ。マイドライブならメンバー共有ボタンでスタッフが Drive から開けます。",
        target: '[data-tour="settings-drive-office"]',
        fallbackTarget: '[data-tour="settings-drive-account"]',
        prepare: "settings-drive",
        helpId: "google-drive",
      },
    ],
  },
];

export const tourStorageKey = (tourId: string): string => `${STORAGE_PREFIX}${tourId}.seen`;

export const isTourSeen = (tourId: string): boolean => {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(tourStorageKey(tourId)) === "1";
};

export const markTourSeen = (tourId: string): void => {
  if (typeof window === "undefined") return;
  localStorage.setItem(tourStorageKey(tourId), "1");
};

export const resetTourSeen = (tourId: string): void => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(tourStorageKey(tourId));
};

export const resetAllToursSeen = (): void => {
  if (typeof window === "undefined") return;
  for (const tour of FEATURE_TOURS) {
    localStorage.removeItem(tourStorageKey(tour.id));
  }
};

export const canUserSeeTour = (
  user: DocugridUser | null,
  tour: FeatureTourDefinition,
): boolean => {
  if (!user) return false;
  if (tour.enabled === false) return false;
  if (tour.permission && !hasPermission(user, tour.permission)) return false;
  if (tour.personaIds?.length) {
    const personaId = resolvePersonaId(user);
    if (!tour.personaIds.includes(personaId)) return false;
  }
  return true;
};

export const eligibleTours = (user: DocugridUser | null): FeatureTourDefinition[] =>
  FEATURE_TOURS.filter((t) => canUserSeeTour(user, t));

export const unseenTours = (user: DocugridUser | null): FeatureTourDefinition[] =>
  eligibleTours(user).filter((t) => !isTourSeen(t.id));

export const hasUnseenFeatures = (user: DocugridUser | null): boolean =>
  unseenTours(user).length > 0;

export const getTourById = (id: string): FeatureTourDefinition | undefined =>
  FEATURE_TOURS.find((t) => t.id === id);
