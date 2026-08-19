# DocuGrid ヘルプ（ユーザー向け）

最終更新: 2026-08-08

エンジニア向け設計・セキュリティ文書（`docs/security-*.md` など）とは別枠。  
**事務所スタッフ・運用担当が「使い方」を書く／読む場所**。

**漏れ防止の正本:** [coverage.md](./coverage.md)（機能 ↔ ページ台帳）  
**開発者向け手順:** [maintaining.md](./maintaining.md)

---

## チュートリアルとの役割分担

| 種類 | 目的 | 現状 |
|------|------|------|
| **ゲーム風ツアー** | 「ここを押せ」と光らせる | 左レール **ヘルプ** ホバー → **ガイド**。定義は `frontend/src/lib/feature-tours.ts`（ヘルプ記事と対応） |
| **ヘルプ（本ディレクトリ）** | いつでも読める説明・手順・用語 | Markdown 正本 → `/help` ＋ **AIボットの KB** |
| **AIサポートチャット** | 質問・不具合・CS へつなぐ | S4: チャット＋チケット＋指標＋[support-ops.md](./support-ops.md) |
| **設計ドキュメント** | 実装・認可・API | `docs/` 直下の既存ファイル |

ツアーは「覚えるきっかけ」。ヘルプは「辞典」かつ将来のボット知識。チャットは「対話で解決→だめならメールCS」。  
**画面へのヘルプリンクは後回し**（レイアウトを崩さない）。ツアーカード内からのみ `/help` へ辿れる。

### ガイド一覧（ヘルプ対応）

| ツアー ID | ラベル | 主なヘルプ |
|-----------|--------|------------|
| `first_workspace` | はじめの操作 | workspace / overview（初回のみ自動） |
| `doc_matrix` | 資料マトリクス（Doc） | doc-matrix |
| `auto_sort` | 自動振り分け | auto-sort |
| `pending_review` | 要確認キュー | auto-sort |
| `karte_hub` | カルテの見方 | karte / karte-master |
| `pdf_workspace` | PDF ワークスペース | pdf / saving |
| `tax_board` | 税務進捗（Tax） | tax-progress |
| `saving_basics` | 保存先の考え方 | saving / storage-story / google-drive / guest-pdf |
| `tasks_nav` | 今日やること | audit-flow |

未読でも **自動起動は `first_workspace` のみ**。他はガイド一覧から再生。

---

## 目次

| ページ | 内容 | 状態 |
|--------|------|------|
| [overview.md](./overview.md) | DocuGrid でできること・画面の全体像 | draft |
| [workspace.md](./workspace.md) | レール（Doc / PDF / DM / Tax / カルテ） | draft |
| [doc-matrix.md](./doc-matrix.md) | 資料マトリクス・期（R8 など）・スロット | draft |
| [crm-perm.md](./crm-perm.md) | 永続の保有／提案／案件（CRM 入口） | stub |
| [karte.md](./karte.md) | カルテ概要（左縦セクション） | draft |
| [karte-master.md](./karte-master.md) | カルテ · マスタ | draft |
| [karte-relations.md](./karte-relations.md) | カルテ · 関係（家系・出資・紹介） | draft |
| [karte-charts.md](./karte-charts.md) | カルテ · グラフ | draft |
| [karte-payroll.md](./karte-payroll.md) | カルテ · 給与 | draft |
| [karte-progress.md](./karte-progress.md) | カルテ · 進捗 | draft |
| [karte-stock.md](./karte-stock.md) | カルテ · 株評 | draft |
| [karte-special.md](./karte-special.md) | カルテ · 特殊 | draft |
| [pdf.md](./pdf.md) | PDF 編集・並べ替え・ダウンロード | draft |
| [guest-pdf.md](./guest-pdf.md) | ログイン不要の `/pdf` | draft |
| [auto-sort.md](./auto-sort.md) | 自動振り分け・要確認キュー | draft |
| [audit-flow.md](./audit-flow.md) | 監査フロー（保存〜承認） | draft |
| [tax-progress.md](./tax-progress.md) | Tax レール（税務進捗） | draft |
| [dm.md](./dm.md) | DM（連絡） | draft |
| [saving.md](./saving.md) | どこに保存されるか（サーバー / Drive） | draft |
| [my-number.md](./my-number.md) | マイナンバー関連書類（SPI） | draft |
| [go-live.md](./go-live.md) | 本格稼働の最初の2歩（CSV + Drive） | draft |
| [client-csv.md](./client-csv.md) | 顧客一覧 CSV 取込 | draft |
| [google-drive.md](./google-drive.md) | Google Drive 連携（管理者） | draft |
| [support.md](./support.md) | 困ったとき・CS（メール→電話） | draft |
| [support-ops.md](./support-ops.md) | CS 運用・電話ポリシー・指標 | draft |
| [later-ops.md](./later-ops.md) | あとでやる設定・方針チェックリスト | — |
| [support-bot-vision.md](./support-bot-vision.md) | AIチャット構想（開発正本） | draft |
| [faq.md](./faq.md) | よくある質問 | draft |
| [coverage.md](./coverage.md) | 機能カバレッジ台帳（開発用） | — |
| [maintaining.md](./maintaining.md) | ヘルプを漏れなく更新する手順 | — |

**アプリ:** http://localhost:3000/help （レールの「ヘルプ」、サポートパネルからも）

**最終形:** ヘルプ記事 ＝ AIサポートボットの知識源。記事を厚くすることがボット品質そのもの。

**あとでやること（設定・方針・任意）:** → **[later-ops.md](./later-ops.md)**（チェックリスト）

---

## アプリ画面への載せ方（予定）

1. **いま** — Markdown 正本 + アプリ `/help` 全文 + **ガイド一覧ツアー**（ヘルプ連動）
2. **次** — AIチャットが記事を引用／ツアー起動（Phase S2）
3. **後回し** — 実機スクショ、画面への文脈リンク（レイアウト優先）

---

## 書き方のルール（短く）

- **誰向けか**を冒頭1行で書く（例: 担当スタッフ）
- 手順は番号付き。画面上のラベルは **太字** で DocuGrid の表記に合わせる
- 開発用語（`firm_id` など）は出さない。必要なときだけ設計ドキュメントへリンク
- 「できないこと／まだ工事中」を明示する
- 1 ページ 1 トピック。長くなったら分割
- 機能を足したら **coverage.md を忘れずに**
- **冒頭に2〜4行の要約**を置く（将来 AI チャットが最初に参照する段落）

---

## サポート最終形（前提）

```
チュートリアル → ヘルプ記事 → AIチャット → CSメール →（必要時のみ）電話
```

詳細: [support-bot-vision.md](./support-bot-vision.md) / ユーザー向け: [support.md](./support.md)

---

## エンジニア向け入口

- プロダクト名: [`../product-naming.md`](../product-naming.md)
- 開発起動: [`../dev-quickstart.md`](../dev-quickstart.md)
- エージェント地図: リポジトリ根の `AGENTS.md`
- 機能サーフェス: `backend/config/feature_surfaces.yaml`（ID を coverage と揃える）
