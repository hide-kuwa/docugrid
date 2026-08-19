# あとでやること（運用・本番・任意拡張）

要約: ヘルプ／サポート／ツアーの **コード実装は一通り済み**。残作業は設定・方針決定・任意の品質上げ。チェックを付けながら進める。

対象: プロダクトオーナー・運用・デプロイ担当（開発者向けチェックリスト）

作成: 2026-08-08

関連: [support-ops.md](./support-ops.md) · [support-bot-vision.md](./support-bot-vision.md) · [`../production-go-live-plan.md`](../production-go-live-plan.md) · `backend/.env.example`

---

## 必須に近い（本番で CS メールを使うとき）

### 1. CS 受信箱と SMTP

- [ ] 受信メールアドレスを決める（例: `support@your-domain`）
- [ ] 本番（または staging）の env に設定する:

```text
DOCUGRID_SUPPORT_INBOX_EMAIL=support@your-domain
DOCUGRID_SUPPORT_SMTP_HOST=...
DOCUGRID_SUPPORT_SMTP_PORT=587
DOCUGRID_SUPPORT_SMTP_USER=...
DOCUGRID_SUPPORT_SMTP_PASSWORD=...
DOCUGRID_SUPPORT_SMTP_FROM=...
DOCUGRID_SUPPORT_SMTP_TLS=1
```

- [ ] アプリからテストチケットを1件送り、受信箱に届くことを確認
- [ ] 未設定のまま本番を使う場合は「DB 保存＋ mailto フォールバックのみ」と所内で合意する

変数の雛形: `backend/.env.example`（`DOCUGRID_SUPPORT_*`）

### 2. 本番 pre-flight

- [ ] `cd backend`
- [ ] `python scripts/validate_production_env.py --env-file .env.production`
- [ ] `[6] Support CS` の WARN（inbox / SMTP）を解消するか、意図的に残すか決める
- [ ] 全体の go-live は [`../production-go-live-plan.md`](../production-go-live-plan.md) に従う

### 3. 電話運用（番号はアプリに常時出さない）

- [ ] 折り返し用の電話番号・当番を決める（所内メモで可）
- [ ] [support-ops.md](./support-ops.md) の「電話に上げてよい条件」を所内で確認
- [ ] 番号はメール返信本文でのみ案内する運用にする

---

## 方針決定（公開範囲）

- [ ] サポートアシスタントを **`preview` のまま**か **`live` にするか**  
  - 変更箇所: `frontend/src/features/support/support-types.ts` の `SUPPORT_ASSISTANT_STATUS`  
  - 併せて `backend/config/feature_surfaces.yaml` の `support.assistant` 表記を揃える
- [ ] ゲスト **`/pdf`** を本番で公開するか（ログイン不要 PDF）。ポリシーは [guest-pdf.md](./guest-pdf.md)
- [ ]（任意）チャット回答の LLM 合成用に `OPENAI_API_KEY`（未設定でもヘルプ検索は動く）

---

## 合意済みで後回し（急がなくてよい）

- [ ] ヘルプ記事への **実機スクショ**
- [ ] メイン画面への **文脈ヘルプリンク**（レイアウト優先で意図的に見送り）
- [ ] ヘルプ KB の **ベクトル RAG**（現状は bigram 検索＋任意 LLM）
- [ ] チケット状態更新の専用管理画面（現状: API ＋ サポートパネルの指標／直近一覧）

---

## 動作確認（設定後の短いスモーク）

1. ログイン → レール **ヘルプ** ホバー → サポートチャットで質問  
2. 「不具合」「まだダメ」などでチケットフォームが出る  
3. チケット送信 → 受付番号表示 →（SMTP ありなら）受信箱にメール  
4. 事務所管理者ロールで指標（件数・解決率・電話希望率）が見える  
5. 別事務所のチケット ID を推測しても読めないこと（回帰: `pytest tests/test_support_tickets.py -q`）

---

## 済んでいること（参照用・触らなくてよい）

- `docs/help/` 正本・coverage・`/help`・ガイドツアー  
- `POST /api/support/chat`・tickets・metrics・PATCH（firm スコープ）  
- 電話ポリシー文書・クロス firm テスト・本番 validate の Support WARN  
