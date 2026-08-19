# 本番へ載せて少しずつ使う — 進め方

ローカル検証から **実ホストで使える状態** へ移すときの作業計画です。  
手順の詳細は既存ドキュメントに任せ、ここでは **何を・どの順で・なぜ** だけをまとめます。

| 関連ドキュメント | 役割 |
|------------------|------|
| [`production-deployment.md`](production-deployment.md) | デプロイ手順（フェーズ 1–8） |
| [`security-status.md`](security-status.md) | 守れている境界と残ギャップ |
| [`production-smoke-checklist.md`](production-smoke-checklist.md) | 載せたあとの手動確認 |
| [`help/later-ops.md`](help/later-ops.md) | サポート CS（inbox/SMTP）・assistant live・電話など「あとで」 |
| [`staging-local.md`](staging-local.md) | Google なしで本番相当をローカル検証 |
| [`google-oauth-setup.md`](google-oauth-setup.md) | Google ログイン設定 |
| [`common-pitfalls.md`](common-pitfalls.md) | 漏洩・混線のよくある原因 |

---

## 1. いまの認識合わせ（誤解しやすい点）

### ローカル PDF を消しただけでは「漏洩なし」ではない

ローカルの顧客 PDF 実体と版メタを消すと、**ディスク上の文書ファイル漏洩リスクは下がる**。  
それでも `backend/storage/` には次が残りうる。

- SQLite（顧問先・割当・監査・DM・メンバー等）
- JSON マスタ（`member_directory` 等）
- メッセージ連携・設定の暗号化シークレット
- 様式カタログ用サンプル PDF（意図的に残している場合あり）

**結論:** 本番に載せる前に「本番に載せるデータだけ」を用意し、開発用ストレージをそのままコピーしない。

### コアのテナント境界はコード側でかなりできている

- JWT の `firm_id` で事務所分離
- 顧問先は `authorize_client_access`（フロントのフィルタは UX のみ）
- 主要 IDOR / 混線パターンは `tests/test_security.py` で回帰

**まだ本番前に必須なのは主に「設定・インフラ」**（下記 §3 の P0）。  
コードギャップの例: firm 単位 RBAC、AV/PDF 無害化、CSP（詳細は `security-status.md` §5）。

### サーバーに載せると何が良くなるか

| できること | 条件 |
|------------|------|
| 事務所メンバーが同じ URL でログイン | Google OAuth + `member_directory` |
| PDF を永続保存して再ログイン後も使える | 永続ボリューム付き API |
| Slack / LINE の本物 Webhook を受ける | 公開 HTTPS の API（Inbound hook） |
| 少しずつ実業務に寄せる | 最初は少人数・少顧問先から |

ローカル専用の DM「local モード」は契約キーなしで UI 検証用。本番の外部到達は Webhook / Token 設定後。

---

## 2. 進め方の全体像（推奨順）

```text
[A] 現状整理・本番データを汚さない
        ↓
[B] staging-local で本番相当の env をローカル検証（任意だが推奨）
        ↓
[C] ホスト決定 + HTTPS + 永続 storage
        ↓
[D] .env.production を埋めて validate 通過
        ↓
[E] Google OAuth + 利用者だけ member_directory
        ↓
[F] デプロイ → スモーク → 少人数で使い始め
        ↓
[G] 必要になった機能だけ追加（Stripe / AI / 本物 Slack・LINE）
```

デプロイ手順のフェーズ番号対応: **C=1–2 · D=3 · E=4 · F=5+7 · G=6+8**（`production-deployment.md`）。

---

## 3. チェックリスト（この順で潰す）

### A — データと秘密を混ぜない

- [ ] 本番ホストの `storage/` は **空または本番用のみ**（開発 DB・開発 PDF をコピーしない）
- [ ] `.env` / `.env.production` / API キーを git に入れない
- [ ] ローカルで試した Ethereal / 実験用 SMTP 設定を本番に持ち込まない
- [ ] 開発用メール（例: `admin@taxx.jp`, `*@example.com`）を本番 `member_directory` に載せない

### B — 本番相当をローカルで先に試す（推奨）

```bash
npm run staging:local
# 詳細: docs/staging-local.md
```

- [ ] パスワードログイン off / ヘッダ認証 off 相当で起動できることを確認
- [ ] 問題があれば本番デプロイ前に直す

### C — ホストと HTTPS

- [ ] API: VPS / VM / 永続ボリューム付き Docker（サーバーレスのみは不可）
- [ ] フロント: 例 Vercel（`frontend/`）
- [ ] `https://app.…` と `https://api.…`（または同一オリジン + リバプロ）
- [ ] ディスク暗号化・`storage` のファイル権限（world-readable 禁止）

詳細: `production-deployment.md` フェーズ 1–2。

### D — 本番環境変数（P0・起動ゲート）

テンプレート: `backend/.env.production.example`  
フロント: `frontend/.env.production.example`

| 項目 | 必須値のイメージ |
|------|------------------|
| `DOCUGRID_ENV` | `production` |
| `DOCUGRID_JWT_SECRET` | 32 文字以上のランダム（`REPLACE_*` 禁止） |
| `DOCUGRID_ALLOW_HEADER_AUTH` | `false` |
| `DOCUGRID_ALLOW_PASSWORD_LOGIN` | `false` |
| `DOCUGRID_ALLOW_LOGIN_STAKEHOLDER_PICK` | `false` |
| `DOCUGRID_ALLOW_LEGACY_FILES` | 未設定 or `false` |
| `DOCUGRID_CORS_ORIGINS` | フロントの HTTPS URL |
| `GOOGLE_OAUTH_CLIENT_ID` | 実クライアント ID |
| `NEXT_PUBLIC_API_BASE` | `https://api.…/api` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | バックエンドと同じ |

```bash
cd backend
python scripts/bootstrap_production.py --domain app.example.com --api-domain api.example.com
python scripts/validate_production_env.py --env-file .env.production
```

- [ ] `validate_production_env.py` がエラー 0
- [ ] 誤設定時に API が起動失敗すること（意図どおり）

### E — ログインできる人だけ登録

- [ ] Google Cloud で OAuth クライアント作成（承認済み JS 生成元 = フロント URL）
- [ ] 本番利用者だけ `member_directory.json` に追加
- [ ] 未登録アカウントが入れないことを確認

```bash
cd backend
python scripts/seed_member_directory.py add you@yourfirm.co.jp actor-s1
python scripts/seed_member_directory.py list
```

### F — デプロイと最初の利用

```bash
docker compose -f docker-compose.prod.yml up -d --build
curl -s https://api.example.com/health
npm run test   # デプロイ前に可能なら
```

手動: [`production-smoke-checklist.md`](production-smoke-checklist.md)

**最初の使い方（小さく）**

1. 事務所管理者 1 名で Google ログイン
2. 顧問先を少数だけ登録・担当割当
3. PDF を 1–2 件アップロード → 再ログイン後も見えること
4. 必要なら DM はまず local / 模擬受信で流れ確認 → 後から本物 Webhook
5. AI・MCP・課金はまだオフのままでよい

### G — 後から足すもの（任意）

| 機能 | いつ | 参照 |
|------|------|------|
| Stripe | 課金が必要になったら | `stripe-production-setup.md` |
| AI（OCR 分類等） | ポリシー合意後 | `production-deployment.md` §8 · `security-checklist.md` |
| Slack / LINE 本番送信・受信 | 無料枠の Workspace / 公式アカを用意してから | 設定 → 通知連携 · DM の Inbound hook |
| firm 単位 RBAC | 事務所ごとに権限行列を変えたいとき | `security-status.md` §5.1 |
| AV / PDF 無害化 | 外部からのアップロードを広く受けるとき | `file-upload-security.md` |

---

## 4. 検証コマンド早見

```bash
# セキュリティ回帰
cd backend && python -m pytest tests/test_security.py -q

# 本番 env 事前検証
cd backend && python scripts/validate_production_env.py --env-file .env.production

# 全体（可能ならデプロイ前）
npm run test
npm run validate:production
```

---

## 5. 「少しずつ使える」マイルストーン

| 段階 | 使えること | まだやらないこと |
|------|------------|------------------|
| **M0** ローカル | 開発・local DM・模擬受信 | 顧客本番データ |
| **M1** staging-local / 本番 env 検証 | 本番設定の確認 | 外部公開 |
| **M2** 限定本番 | 自事務所メンバー + 少数顧問先の PDF | 全顧客・外部連携・AI |
| **M3** 連携あり | Slack/LINE Webhook・必要なら課金 | 無制限公開・MCP 外部公開 |
| **M4** 強化 | RBAC・AV・バックアップ運用の定着 | — |

M2 に到達した時点で「サーバーに載せて少しずつ使える」状態です。

---

## 6. やらないこと（事故防止）

- 開発用 `DOCUGRID_ALLOW_HEADER_AUTH=true` のまま本番起動
- デフォルト JWT 秘密鍵のまま本番
- パスワードログインを本番で残す
- 開発ストレージ一式を本番ボリュームへ rsync
- 「フロントで隠したから他社データは見えない」前提（必ずサーバー認可）
- 公開された「実験用 API キー」を探す・使う（公式に共有キーはない）

---

## 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-08-06 | 初版 — 現状認識・P0 チェック・段階的利用マイルストーン |
| 2026-08-06 | 進捗: staging-local bootstrap / validate 通過、env-file override 修正、空 storage 準備スクリプト |

---

## 7. 進捗ログ（自動更新）

| 段階 | 状態 | メモ |
|------|------|------|
| **A** データ混在防止 | 進行中 | 顧客 PDF はローカル削除済み。本番用は `prepare_production_storage.py` で空ツリーを用意。**開発 storage を本番へコピーしない** |
| **B** staging-local | 完了（ローカル） | `bootstrap_production.py --staging-local` → `backend/.env.production` + `frontend/.env.production.local`。`validate_production_env.py` **Passed（警告のみ）** |
| **C** ホスト / HTTPS | **要ユーザー入力** | Docker 未インストール。VPS/VM とドメイン（`app.` / `api.`）が必要 |
| **D** 本番 env | 一部 | staging-local 用 env 生成済み。**本番公開前に** `DOCUGRID_STAGING_LOCAL` 削除・ドメイン付き bootstrap・dev メール除去が必要 |
| **E** Google / member | 一部 | ローカル `.env` から `GOOGLE_OAUTH_CLIENT_ID` は引き継ぎ済みの可能性あり。本番利用者の登録と Console の承認済み生成元が未確定 |
| **F** デプロイ | 未着手 | `docker-compose.prod.yml` あり。ホスト決定後 |
| **G** 課金・AI・外部連携 | 後回し | Stripe キーは引き継がれているが Webhook secret 未設定 |

### こちらで実施済み（2026-08-06）

1. `pytest tests/test_security.py tests/test_production_deploy.py` — 通過
2. `python scripts/bootstrap_production.py --staging-local`
3. `python scripts/validate_production_env.py --env-file .env.production` — Passed（localhost / staging 警告は想定どおり）
4. `validate_production_env.py` の `--env-file` がシェルの汚い環境変数を上書きするよう修正
5. `scripts/prepare_production_storage.py` 追加（空の本番 storage）

### 次にユーザーが決めること

1. **フロント URL**（例: `app.example.com`）と **API URL**（例: `api.example.com`）
2. **API を載せるホスト**（VPS / クラウド VM。永続ディスク必須。Docker 推奨だが未導入なら uvicorn + リバプロでも可）
3. **本番でログインする Google メール**（1 名以上）
4. （任意）Vercel にフロントを載せるか

決まったら:

```bash
cd backend
python scripts/bootstrap_production.py --domain app.YOURDOMAIN --api-domain api.YOURDOMAIN --strip-dev-emails
python scripts/prepare_production_storage.py --dest ../deploy/storage
python scripts/seed_member_directory.py add you@YOURFIRM.co.jp actor-s1
# MEMBER は deploy/storage を指すよう起動時にマウント / 環境を合わせる
python scripts/validate_production_env.py --env-file .env.production
```
