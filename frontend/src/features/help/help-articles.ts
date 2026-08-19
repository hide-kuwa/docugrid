/** Help center index — mirrors docs/help for in-app browsing (S1).
 *  Long-form prose stays in docs/help/*.md; this list is the app TOC.
 */

export type HelpArticle = {
  id: string;
  title: string;
  summary: string;
  /** Path under docs/help/ (for humans / future MD loader) */
  docPath: string;
  audience: string;
};

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "overview",
    title: "DocuGrid 概要",
    summary: "資料を顧問先×期で整理するアプリ。レールで画面を切り替えます。",
    docPath: "docs/help/overview.md",
    audience: "はじめての方",
  },
  {
    id: "support",
    title: "困ったとき（サポート）",
    summary: "ガイド → ヘルプ → AIチャット → CSはメール優先、電話は最終手段。",
    docPath: "docs/help/support.md",
    audience: "全員",
  },
  {
    id: "support-ops",
    title: "サポート運用（CS）",
    summary: "電話ポリシー・チケット状態・指標の見方（運用担当向け）。",
    docPath: "docs/help/support-ops.md",
    audience: "CS・所長",
  },
  {
    id: "workspace",
    title: "ワークスペース（レール）",
    summary: "Doc / PDF / DM / Tax / カルテの切り替え方。",
    docPath: "docs/help/workspace.md",
    audience: "担当スタッフ",
  },
  {
    id: "doc-matrix",
    title: "資料マトリクス（Doc）",
    summary: "R8 などの期とスロットへの資料の入れ方。",
    docPath: "docs/help/doc-matrix.md",
    audience: "担当スタッフ",
  },
  {
    id: "crm-perm",
    title: "永続の保有・提案・案件",
    summary: "永続の横タブ。入っている保険・提案中・進捗案件の入口（骨格）。",
    docPath: "docs/help/crm-perm.md",
    audience: "担当スタッフ",
  },
  {
    id: "auto-sort",
    title: "自動振り分け・要確認",
    summary: "まとめて投入した PDF の振り分けとキュー。",
    docPath: "docs/help/auto-sort.md",
    audience: "担当スタッフ",
  },
  {
    id: "audit-flow",
    title: "監査フロー",
    summary: "作業保存・承認依頼・監査・差戻しの流れ。",
    docPath: "docs/help/audit-flow.md",
    audience: "担当・承認者",
  },
  {
    id: "pdf",
    title: "PDF の編集",
    summary: "注釈・並べ替え・ダウンロード／格納。",
    docPath: "docs/help/pdf.md",
    audience: "担当スタッフ",
  },
  {
    id: "guest-pdf",
    title: "ゲスト PDF",
    summary: "ログイン不要の /pdf。サーバー保存はありません。",
    docPath: "docs/help/guest-pdf.md",
    audience: "ゲスト利用者",
  },
  {
    id: "my-number",
    title: "マイナンバー関連書類",
    summary: "個人番号入り PDF は暗号化レーン。Drive・AI には出しません。",
    docPath: "docs/help/my-number.md",
    audience: "所長・事務取扱担当",
  },
  {
    id: "karte",
    title: "カルテ概要",
    summary: "左縦リストでマスタ・グラフ・給与などを切替。",
    docPath: "docs/help/karte.md",
    audience: "担当スタッフ",
  },
  {
    id: "karte-master",
    title: "カルテ · マスタ",
    summary: "顧問先の基本情報カード。",
    docPath: "docs/help/karte-master.md",
    audience: "担当スタッフ",
  },
  {
    id: "karte-relations",
    title: "カルテ · 関係",
    summary: "家系・出資・紹介の関係図。グループと紹介の境界が分かります。",
    docPath: "docs/help/karte-relations.md",
    audience: "担当スタッフ",
  },
  {
    id: "karte-charts",
    title: "カルテ · グラフ",
    summary: "売上・利益ダッシュボードとシミュレーション。",
    docPath: "docs/help/karte-charts.md",
    audience: "担当スタッフ",
  },
  {
    id: "karte-payroll",
    title: "カルテ · 給与",
    summary: "従業員・源泉・給与台帳まわり。",
    docPath: "docs/help/karte-payroll.md",
    audience: "担当スタッフ",
  },
  {
    id: "karte-progress",
    title: "カルテ · 進捗",
    summary: "顧問先のアラート・カレンダー・マイルストーン。",
    docPath: "docs/help/karte-progress.md",
    audience: "担当スタッフ",
  },
  {
    id: "karte-stock",
    title: "カルテ · 株評",
    summary: "非上場株式の評価試算。",
    docPath: "docs/help/karte-stock.md",
    audience: "担当スタッフ",
  },
  {
    id: "karte-special",
    title: "カルテ · 特殊",
    summary: "継続的な注意・特例メモ。",
    docPath: "docs/help/karte-special.md",
    audience: "担当スタッフ",
  },
  {
    id: "tax-progress",
    title: "税務進捗（Tax）",
    summary: "事務所横断の進捗ボード。",
    docPath: "docs/help/tax-progress.md",
    audience: "担当・所長",
  },
  {
    id: "dm",
    title: "DM（連絡）",
    summary: "統合連絡ハブ。工事中の機能あり。",
    docPath: "docs/help/dm.md",
    audience: "担当スタッフ",
  },
  {
    id: "saving",
    title: "保存先",
    summary: "サーバーと Drive。端末に勝手には溜まりません。",
    docPath: "docs/help/saving.md",
    audience: "全員",
  },
  {
    id: "go-live",
    title: "本格稼働の最初のステップ",
    summary: "顧客 CSV → 任意 ZIP 整理 → Google Drive。保存はサーバー＋ミラー。",
    docPath: "docs/help/go-live.md",
    audience: "所長・設定担当",
  },
  {
    id: "client-csv",
    title: "顧客一覧 CSV",
    summary: "顧客マスタへの CSV 取り込み・書き出し。",
    docPath: "docs/help/client-csv.md",
    audience: "所長・設定担当",
  },
  {
    id: "migration",
    title: "初回データ整理",
    summary: "ZIP 一括取り込み・要確認キュー・整理用トークン。",
    docPath: "docs/help/migration.md",
    audience: "所長・設定担当",
  },
  {
    id: "addons",
    title: "アドオン",
    summary: "公式パックの付け外し。こちら専用は操作できません。",
    docPath: "docs/help/addons.md",
    audience: "所長・設定担当",
  },
  {
    id: "storage-story",
    title: "資料はどこに残る？",
    summary: "サーバー＋Google Drive の考え方。LP向けコピー付き。",
    docPath: "docs/help/storage-story.md",
    audience: "所長・導入検討者・営業",
  },
  {
    id: "google-drive",
    title: "Google Drive 連携",
    summary: "事務所保管用アカウントで1回接続。ログイン用とは別に可。",
    docPath: "docs/help/google-drive.md",
    audience: "管理者",
  },
  {
    id: "faq",
    title: "よくある質問",
    summary: "短い Q&A。",
    docPath: "docs/help/faq.md",
    audience: "全員",
  },
];

export function getHelpArticle(id: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.id === id);
}
