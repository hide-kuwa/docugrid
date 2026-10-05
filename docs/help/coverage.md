# ヘルプ coverage（機能 ↔ 使い方ページ）

最終更新: 2026-08-28

**ユーザー向け説明がどこまで書けているか**の台帳。  
機能を足す・大きく変えるときは **必ずこの表を更新**する（本文がまだなら `stub` で行を足す）。
**AIサポートボットの KB 進捗**もこの表で見る。

状態の意味:

| 状態 | 意味 |
|------|------|
| `ok` | スタッフが読んで手順を辿れる |
| `draft` | 骨格あり。スクショ・例外はこれから |
| `stub` | タイトルと1段落だけ。中身は未着手 |
| `n/a` | ユーザー向けヘルプ不要（内部・dev のみ） |

---

## 台帳

| 機能 ID / 画面 | ヘルプ | 状態 | 備考 |
|----------------|--------|------|------|
| workspace.rail | [workspace.md](./workspace.md) | draft | Doc/PDF/カルテ＋設定・検索。DM/Tax/ひな形/判定/タスクは「開発中」に集約。スマホは左レールタップ・期間チップ |
| workspace.doc_matrix | [doc-matrix.md](./doc-matrix.md) | draft | 見出し・左ドラムに R〇年〇月期／第N期。スマホは枠縮小＋下のまとめて上げる |
| workspace.slot_attachments | [slot-attachments.md](./slot-attachments.md) | draft | PDF以外の保存・DL。画像は手動PDF化（版履歴に元ファイル） |
| workspace.mobile | [mobile.md](./mobile.md) | draft | 閲覧中心・簡易UP・ゲスト。写真UPは未対応 |
| workspace.authoring | [authoring.md](./authoring.md) | draft | 広い画面・拡大縮小・かっこ書き→差し込み・手入力 |
| workspace.flowchart | [flowchart-templates.md](./flowchart-templates.md) | draft | 顧問先検索・事業区分ツリーUI・ノーコード・税法固定 |
| settings.flowchart_templates | [flowchart-templates.md](./flowchart-templates.md) | draft | 設定からは案内のみ。本体は判定ページ |
| crm.perm_tabs | [crm-perm.md](./crm-perm.md) | stub | 永続横タブ（保有／提案／案件）C0・顧問先ナビ直下 |
| workspace.karte | [karte.md](./karte.md) | draft | 左縦セクション・失敗時 |
| workspace.pdf | [pdf.md](./pdf.md) | draft | 注釈・並べ替え・Add PDF結合。Docスロット時は新版保存（過去版保持）。帳票索引 |
| workspace.tax | [tax-progress.md](./tax-progress.md) | draft | Tax レール。主担当列は sticky 顧客名に被らないよう幅固定 |
| workspace.dm | [dm.md](./dm.md) | draft | システム内チャット＋メール/Slack/LINE |
| saving.server_drive | [saving.md](./saving.md) | draft | 保存先・他者に見えないとき |
| saving.storage_story | [storage-story.md](./storage-story.md) | draft | サーバー＋Drive・LP転用コピー・移行時のDrive容量 |
| security.my_number | [my-number.md](./my-number.md) | draft | SPI 暗号化レーン。HP文は docs/my-number-handling.md |
| saving.google_drive | [google-drive.md](./google-drive.md) | draft | OAuth + 共有ドライブ／メンバー共有。空一覧・メール前提のケア UI |
| settings.client_csv | [client-csv.md](./client-csv.md) | draft | 顧客マスタ最下部の受け入れ枠。新規登録・一覧は上部 |
| guest.pdf | [guest-pdf.md](./guest-pdf.md) | draft | `/pdf` ログイン不要。スマホは全幅CTA・safe-area |
| settings.client_transfer | [client-transfer.md](./client-transfer.md) | draft | 発行は顧客詳細最下部。受け取り・発行一覧は顧客マスタ最下部 |
| settings.client_profile | [client-profile.md](./client-profile.md) | draft | 顧客詳細。担当変更（上）・移管は最下部。e-Tax補助 |
| settings.go_live | [go-live.md](./go-live.md) | draft | 顧客マスタ／Drive の最下部バナー。CSV → 任意ZIP → Drive |
| settings.migration | [migration.md](./migration.md) | draft | 初回 ZIP。本格稼働バナー（最下部）から開く |
| settings.addons | [addons.md](./addons.md) | stub | 公式パックの付け外し／こちら専用／公式昇格 |
| doc.auto_sort | [auto-sort.md](./auto-sort.md) | stub | **当面 UI 非表示**（一括ドロップ帯）。再開時に draft へ戻す |
| doc.pending_review | [auto-sort.md](./auto-sort.md)#要確認キュー | draft | スロット直上の整理トレイ。提案どおり＋枠検索 |
| doc.audit_flow | [audit-flow.md](./audit-flow.md) | draft | 作業保存〜承認。証跡（閲覧・確認・契約同意） |
| client_data.master | [karte-master.md](./karte-master.md) | draft | カルテで唯一利用可。上部ヘッダーはコンパクト（検索・入力率）。他セクションは工事中 |
| client_data.relations | [karte-relations.md](./karte-relations.md) | draft | 関係図・PDF。役員・代表（役職名）／From/To は名前・かな検索。**工事中** |
| client_data.charts | [karte-charts.md](./karte-charts.md) | draft | 正規指標は年次表＋月次2カード。**工事中** |
| client_data.payroll | [karte-payroll.md](./karte-payroll.md) | draft | 最短手順・失敗表 |
| client_data.progress | [karte-progress.md](./karte-progress.md) | draft | マイルストーン・アラート。判定はレール「判定」 |
| client_data.stock_valuation | [karte-stock.md](./karte-stock.md) | draft | 試算注意・失敗表 |
| client_data.special | [karte-special.md](./karte-special.md) | draft | メモとの使い分け |
| client_data.karte_notes | [karte.md](./karte.md) | draft | メモ本体 |
| capture.gallery | — | stub | feature_surfaces 連動候補 |
| rag.mcp_search | — | draft | 設定 MCP タブの検索ラボ（I2 live） |
| onboarding.feature_tour | [README.md](./README.md)#チュートリアルとの役割分担 | draft | レール「ヘルプ」ホバー → ガイド |
| support.funnel | [support.md](./support.md) | draft | ユーザー向け窓口の流れ |
| support.ops | [support-ops.md](./support-ops.md) | draft | S4 電話ポリシー・指標 |
| support.later_ops | [later-ops.md](./later-ops.md) | n/a | 運用・本番の「あとで」チェック（ユーザー向け記事ではない） |
| support.assistant | [support-bot-vision.md](./support-bot-vision.md) | draft | S4: tickets + metrics + ops |
| work.assistant | [work-assistant.md](./work-assistant.md) | draft | Doc／設定 右下 FAB。ヘルプ＋充足＋OCR反映確認＋資料 RAG |
| help.center | `/help` + help-articles / MD 本文表示 | draft | S1: 一覧＋全文 |
| overview | [overview.md](./overview.md) | draft | |
| faq | [faq.md](./faq.md) | draft | 迷いどころを厚くした |
| auth.login | — | n/a | Google SSO + 開発用パスワード（ローカルのみ）。手順は `docs/dev-quickstart.md` |
| auth.register | `/register` | draft | 事務所新規登録（代表・Google） |
| auth.register.join | `/register/join` | draft | 事務所コードで参加申請 |

`feature_surfaces.yaml` の `id` を増やしたら、上表に同じ ID（または `group.*`）の行を足す。

---

## 更新チェック（機能 PR 用・コピペ可）

```
[ ] docs/help/coverage.md に行を追加 or 状態を更新した
[ ] ユーザーが触る UI なら docs/help/ に草案を書いた（最低 stub）
[ ] 画面ラベル変更ならヘルプ内の太字表記を合わせた
[ ] 初回誘導が必要なら feature-tours.ts も検討した（任意）
[ ] ヘルプ不要なら coverage で n/a と理由を書いた
```
