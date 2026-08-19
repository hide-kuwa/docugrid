# ヘルプを漏れなく育てる

対象: 開発者・エージェント・レビュア

---

## なぜ必要か

機能はコードに入りやすいが、**使い方の説明は後回しになりがち**。  
DocuGrid は事務所向けなので、UI を増やしたら説明の置き場もセットで動かす。

---

## 必須フロー（新機能・大きな UX 変更）

1. **実装**（いつもの十ancy / テスト）
2. **`docs/help/coverage.md` を更新**（行追加 or `stub`→`draft`）
3. **本文** — 新規なら `docs/help/<topic>.md` を最低 stub（誰向け・何ができる・できないこと）
4. **任意** — 初回だけ光らせたいなら `frontend/src/lib/feature-tours.ts` + `data-tour`
5. **任意** — `backend/config/feature_surfaces.yaml` に載せた機能は coverage の機能 ID を揃える

PR では [coverage.md のチェックリスト](./coverage.md#更新チェック機能-pr-用コピペ可) を埋める。  
テンプレ: `.github/pull_request_template.md`

---

## エージェント向け

Cursor ルール: `.cursor/rules/docugrid-help.mdc`（ユーザー向け UI 変更時に発火）  
`AGENTS.md` のヘルプ行も参照。

「ドキュメントを書いてはいけない」一般ルールがあっても、**ユーザーがヘルプ拡充を依頼している／機能 PR の coverage 更新は例外**として `docs/help/` を触ってよい。

---

## 少しずつ進める順番（推奨）

1. coverage が `stub` のまま残っている **ユーザーが毎日触るもの**（Doc / カルテ各パネル）
2. 失敗しやすい操作（自動振り分け、保存先、ゲスト PDF）
3. 監査・Drive・キャプチャなど頻度の低いもの
4. アプリの `/help` 画面化（本文が draft 以上が 5 本以上そろってから）
5. **AIサポートチャット**（ヘルプ KB → RAG → 不具合チケット → メールCS）  
   構想: [support-bot-vision.md](./support-bot-vision.md) Phase S1〜

ヘルプ記事は「人が読む」だけでなく **将来のボットの正解データ**。曖昧なまま draft にしない。

1 PR = coverage 更新 + 本文 1 トピック、でよい。
