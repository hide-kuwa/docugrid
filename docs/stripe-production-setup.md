# Stripe 本番セットアップ

事務所サブスクリプション・顧問先从量・AI トップアップ・Connect パートナー報酬用。  
全体の流れは [`production-deployment.md`](production-deployment.md) **フェーズ 6** を参照。

課金を有効にしない場合、Stripe 未設定のままでもアプリ本体は動作します。

---

## 1. Stripe Dashboard（本番モード）

[Stripe Dashboard](https://dashboard.stripe.com/) で **本番モード** に切り替え。

### Products / Prices

| 用途 | 環境変数 | デフォルト料金 |
|------|----------|----------------|
| 事務所基本料（月額） | `STRIPE_PRICE_FIRM_BASE` | ¥10,000/月 |
| 顧問先从量（月額・使用量連動） | `STRIPE_PRICE_CLIENT_METERED` | ¥100/社/月 |
| AI トップアップ（任意） | `STRIPE_PRICE_AI_TOPUP_100` | ¥100/パック |

料金ロジックの SSOT: `backend/services/billing_catalog.py`  
未設定の AI トップアップは Checkout 時に動的 `price_data` にフォールバック。

**顧問先从量 Price** は Stripe Billing **Meter** に紐づく metered price です（API 2025-03-31+）。  
自動作成:

```bash
cd backend
python scripts/setup_stripe_catalog.py --env-file .env --write-env
```

出力される `STRIPE_METER_CLIENT_EVENT`（既定: `docugrid_billable_clients`）と Price ID を `.env.production` に設定。  
顧問先数の同期は legacy usage record ではなく **`billing.MeterEvent.create`** を使用（`billing_meter_service.py`）。

### API キー

| 変数 | 形式 |
|------|------|
| `STRIPE_SECRET_KEY` | `sk_live_...`（API のみ） |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_...`（API + フロント） |

フロント: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...`

---

## 2. Webhook

### エンドポイント

```
POST https://api.example.com/api/billing/webhook
```

ローカル検証は Stripe CLI:

```bash
stripe listen --forward-to localhost:8000/api/billing/webhook
# 表示された whsec_... を STRIPE_WEBHOOK_SECRET に設定
```

### 購読イベント

| イベント | 用途 |
|----------|------|
| `checkout.session.completed` | サブスク開始・AI トップアップ付与 |
| `customer.subscription.updated` | プラン状態更新 |
| `customer.subscription.deleted` | 解約 |
| `invoice.payment_failed` | `past_due` マーク |
| `account.updated` | Connect パートナー onboarding 完了 |

実装: `backend/services/stripe_billing_service.py` → `handle_webhook()`

### 環境変数

```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## 3. Checkout / Portal の戻り先

```env
DOCUGRID_FRONTEND_URL=https://app.example.com
```

Checkout 成功 URL 例: `{DOCUGRID_FRONTEND_URL}/settings?tab=billing&checkout=success`

---

## 4. Stripe Connect（販売パートナー・任意）

パートナー手数料（デフォルト 20%）を使う場合:

1. Dashboard で Connect を有効化
2. プラットフォーム管理者が **設定 → 課金** からパートナー作成・onboarding
3. 事務所にパートナーを紐付け

実装: `backend/services/stripe_connect_service.py`

---

## 5. 環境変数まとめ

`backend/.env.production` に追加:

```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_FIRM_BASE=price_...
STRIPE_PRICE_CLIENT_METERED=price_...
STRIPE_METER_CLIENT_EVENT=docugrid_billable_clients
# STRIPE_PRICE_AI_TOPUP_100=price_...

DOCUGRID_FRONTEND_URL=https://app.example.com

# 任意 — デフォルトと異なる場合のみ
# BILLING_FIRM_BASE_YEN=10000
# BILLING_FIRM_PER_CLIENT_YEN=100
# BILLING_PARTNER_COMMISSION_PERCENT=20
```

検証:

```bash
cd backend
python scripts/validate_production_env.py --env-file .env.production --check-stripe
```

---

## 6. 本番確認チェックリスト

- [ ] 本番モードの Price ID（`price_...` が test/live で混在していない）
- [ ] Webhook が 200 を返す（Dashboard → Webhooks → 配信ログ）
- [ ] テスト事務所で Checkout → 設定画面に `active` 表示
- [ ] 顧問先数変更後「使用量同期」または API `POST /api/billing/sync-usage`
- [ ] Customer Portal（請求管理）が開ける

---

## 関連 API

| メソッド | パス |
|----------|------|
| GET | `/api/billing/status` |
| POST | `/api/billing/checkout` |
| POST | `/api/billing/portal` |
| POST | `/api/billing/webhook` |
| POST | `/api/billing/sync-usage` |
| POST | `/api/billing/ai/topup` |
