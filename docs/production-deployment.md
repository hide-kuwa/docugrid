# 本番デプロイ手順（フェーズ順）

DocuGrid（TAXX）を本番環境へ移すときの **推奨順序** です。  
各フェーズの出口条件を満たしてから次へ進んでください。

| フェーズ | 内容 | ドキュメント / ツール |
|---------|------|----------------------|
| **1** | ホスティング方針（永続ストレージ付き API） | 本文 §1 |
| **2** | ドメイン・HTTPS | 本文 §2 |
| **3** | 本番環境変数（認証・CORS） | [`backend/.env.production.example`](../backend/.env.production.example) |
| **4** | Google OAuth + ユーザー登録 | [`google-oauth-setup.md`](google-oauth-setup.md) |
| **5** | デプロイ・起動確認 | `docker-compose.prod.yml` / 本文 §5 |
| **—** | **ローカルで今すぐ試す（Google 不要）** | [`staging-local.md`](staging-local.md) → `npm run staging:local` |
| **6** | Stripe 課金（任意） | [`stripe-production-setup.md`](stripe-production-setup.md) |
| **7** | 本番スモークテスト | [`production-smoke-checklist.md`](production-smoke-checklist.md) |
| **8** | AI 機能（任意） | 本文 §8 |

関連: [`security-checklist.md`](security-checklist.md) · [`api-contract.md`](api-contract.md)（Auth environment）

---

## フェーズ 1 — ホスティング方針

### なぜ永続ディスクが必要か

バックエンドは次を **ローカルディスク** に保存します。

| 種類 | パス例 |
|------|--------|
| SQLite | `backend/storage/*.db` |
| マスタ JSON | `member_directory.json`, `client_master.json` 等 |
| PDF 実体 | `backend/storage/firms/...` |

サーバーレスだけ（再起動でディスクが消える）では **データが失われます**。

### 推奨構成

```
[ユーザー]
    │
    ▼ HTTPS
[フロント]  https://app.example.com     ← Vercel / 静的ホスト + Next.js
    │
    ▼ HTTPS /api
[API]       https://api.example.com     ← VPS / VM / Docker + 永続ボリューム
    │
    └── volume: /app/storage  (SQLite + PDF + JSON)
```

### このリポジトリで用意しているもの

- **API 用 Docker イメージ**: [`backend/Dockerfile`](../backend/Dockerfile)
- **本番 compose**: [`docker-compose.prod.yml`](../docker-compose.prod.yml)（名前付きボリューム `docugrid_storage`）

```bash
cp backend/.env.production.example backend/.env.production
# backend/.env.production を編集
docker compose -f docker-compose.prod.yml up -d --build
```

### 出口条件

- [ ] API を載せる先が決まっている（自前 VPS / クラウド VM / 永続ボリューム付きコンテナ）
- [ ] `storage` 相当のパスが再起動後も残る

---

## フェーズ 2 — ドメイン・HTTPS

| 役割 | 例 | 備考 |
|------|-----|------|
| フロント | `https://app.example.com` | Google OAuth の「承認済み JavaScript 生成元」 |
| API | `https://api.example.com` | リバースプロキシ（Caddy / nginx / ALB）で TLS 終端 |

本番ではセッション Cookie が `Secure` になるため **HTTPS 必須** です（`docugrid_auth.session_cookie_secure()`）。

### 出口条件

- [ ] フロント・API それぞれに HTTPS URL がある（または決まっている）
- [ ] API 前段にリバースプロキシを置く場合、`/api/billing/webhook` が Stripe から到達できる

---

## フェーズ 3 — 本番環境変数

テンプレート: [`backend/.env.production.example`](../backend/.env.production.example)

### 必須（`DOCUGRID_ENV=production` で起動時検証）

| 変数 | 説明 |
|------|------|
| `DOCUGRID_ENV` | `production` |
| `DOCUGRID_JWT_SECRET` | 32 文字以上のランダム文字列 |
| `GOOGLE_OAUTH_CLIENT_ID` | Google Cloud の Web クライアント ID |
| `DOCUGRID_CORS_ORIGINS` | フロント URL（カンマ区切り可） |
| `DOCUGRID_ALLOW_HEADER_AUTH` | `false` |
| `DOCUGRID_ALLOW_PASSWORD_LOGIN` | `false` |

### 推奨

| 変数 | 説明 |
|------|------|
| `DOCUGRID_FRONTEND_URL` | Stripe Checkout 戻り先（フェーズ 6） |
| `DOCUGRID_CSRF` | `true`（本番デフォルト推奨） |

フロント（Vercel 等）: [`frontend/.env.production.example`](../frontend/.env.production.example)

```env
NEXT_PUBLIC_API_BASE=https://api.example.com/api
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<バックエンドと同じ>
```

### 事前検証コマンド

```bash
cd backend
# 一括ブートストラップ（JWT 生成・Stripe 引き継ぎ・member_directory）
python scripts/bootstrap_production.py --staging-local   # localhost 検証用
python scripts/bootstrap_production.py --domain app.example.com --api-domain api.example.com

# Stripe 商品/Price 自動作成（test または live キー）
python scripts/setup_stripe_catalog.py --env-file .env --write-env

python scripts/validate_production_env.py --env-file .env.production
```

Docker:

```bash
docker compose -f docker-compose.prod.yml run --rm api \
  python scripts/validate_production_env.py --env-file .env.production
```

### 出口条件

- [ ] `validate_production_env.py` がエラー 0 で終了

---

## フェーズ 4 — Google OAuth とユーザー登録

詳細: [`google-oauth-setup.md`](google-oauth-setup.md)

### Google Cloud Console

1. OAuth 同意画面
2. **ウェブアプリケーション** クライアント ID
3. **承認済み JavaScript 生成元** に `https://app.example.com` を追加  
   （リダイレクト URI は不要 — GIS → ID トークン → `POST /api/auth/google`）

### ログイン許可リスト（本番必須）

本番では **開発用デフォルトメールは無効** です。`member_directory.json` に登録されたメールのみログインできます。

```bash
cd backend
python scripts/seed_member_directory.py init-from-example   # 初回のみ
python scripts/seed_member_directory.py add tanaka@firm.co.jp actor-s1
python scripts/seed_member_directory.py list
```

ファイル: `backend/storage/member_directory.json`（永続ボリューム上）

### 出口条件

- [ ] Google クライアント ID がフロント・バックエンドで一致
- [ ] 利用者全員を `member_directory.json` に登録済み
- [ ] 未登録 Google アカウントで `403` になることを確認

---

## フェーズ 5 — デプロイ・起動確認

### Docker（推奨の最小構成）

```bash
# リポジトリルート
docker compose -f docker-compose.prod.yml up -d --build
curl -s https://api.example.com/health   # {"status":"ok"}
```

### 手動（uvicorn）

```bash
cd backend
export $(grep -v '^#' .env.production | xargs)   # または dotenv
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

`DOCUGRID_ENV=production` で設定ミスがあると **起動時に `RuntimeError`**（`validate_auth_config()`）。

### フロント（Vercel の例）

1. リポジトリを Vercel にリンク（Root: `frontend`）
2. 環境変数に `NEXT_PUBLIC_API_BASE`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID` を設定
3. `npm run build` が通ることを CI と同様に確認

### 出口条件

- [ ] `GET /health` が 200
- [ ] フロントから Google ログイン → マトリクス画面まで到達
- [ ] 誤設定時に API が起動しない（JWT 未設定など）

---

## フェーズ 6 — Stripe 課金（任意）

課金を使わない場合はスキップ可能（API は `503 stripe_not_configured`）。

手順: [`stripe-production-setup.md`](stripe-production-setup.md)

検証:

```bash
python scripts/validate_production_env.py --env-file .env.production --check-stripe
```

---

## フェーズ 7 — 本番スモークテスト

[`production-smoke-checklist.md`](production-smoke-checklist.md)

自動テスト（デプロイ前）:

```bash
npm run test
npm run validate:production   # .env.production がある場合
```

---

## フェーズ 8 — AI 機能（任意）

- OpenAI / Gemini の API キーは **設定画面 → システム設定**（`/api/system-config`、firm スコープ）
- AI 従量課金の同意は **設定 → 課金** タブ
- 利用規約・外部送信オプトアウト UI は [`security-checklist.md`](security-checklist.md) の未完了項目 — 本番で AI を使う前にポリシーを決める

---

## 運用メモ

### バックアップ

`storage/` 全体を定期バックアップ（DB + PDF + JSON）。リストア手順はインフラ側で文書化。

### メンバー追加（本番）

```bash
docker compose -f docker-compose.prod.yml exec api \
  python scripts/seed_member_directory.py add newuser@firm.co.jp actor-s2
```

### トラブルシュート

| 症状 | 確認 |
|------|------|
| API 起動しない | `validate_production_env.py`、ログの `RuntimeError` |
| Google ログイン失敗 | 生成元 URL、クライアント ID 一致、`member_directory` |
| CORS エラー | `DOCUGRID_CORS_ORIGINS` にフロント URL |
| 課金 503 | Stripe env、`--check-stripe` |
| Webhook 失敗 | `STRIPE_WEBHOOK_SECRET`、エンドポイント URL |

---

## 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-06-25 | 初版 — フェーズ順手順、Docker、検証スクリプト |
