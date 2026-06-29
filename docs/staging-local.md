# ローカル本番モード（Google OAuth 不要）

**あなたがやることはこれだけ:**

```bash
npm run staging:local
```

ブラウザで http://localhost:3000/login を開き:

| 項目 | 値 |
|------|-----|
| メール | `admin@tax.co.jp` |
| パスワード | `staging` |

`DOCUGRID_ENV=production` のまま（JWT 厳格・httpOnly Cookie・CSRF）動きます。  
Google OAuth は **本番ドメインが決まってから** で OK です。

## 何が起きているか

| 変数 | 値 |
|------|-----|
| `DOCUGRID_STAGING_LOCAL` | `true`（localhost 専用・公開サーバーでは絶対に使わない） |
| `DOCUGRID_ALLOW_PASSWORD_LOGIN` | `true`（ステージングのみ） |
| `DOCUGRID_LOGIN_PASSWORD` | `staging` |

## 課金（Stripe）を試す

別ターミナルで Stripe CLI があれば:

```bash
stripe listen --forward-to localhost:8000/api/billing/webhook
```

表示された `whsec_...` を `backend/.env.production` の `STRIPE_WEBHOOK_SECRET` に追記して API を再起動。

## 本番に進むとき

1. `DOCUGRID_STAGING_LOCAL` を **削除**
2. Google OAuth を設定（[`google-oauth-setup.md`](google-oauth-setup.md)）
3. ドメインで `npm run bootstrap:production -- --domain app.example.com`

詳細: [`production-deployment.md`](production-deployment.md)
