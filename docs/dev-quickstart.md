# 開発クイックスタート（ユーザー作業なしで動かす）

Google OAuth や本番環境変数の設定は **後回し** で OK。以下だけでローカル開発を開始できます。

## 起動

```bash
# バックエンド
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# フロント（別ターミナル）
cd frontend
npm install
npm run dev
```

## ログイン（パスワード・開発用）

1. http://localhost:3000/login を開く
2. 「開発用パスワードログイン」を展開
3. 例: `admin@tax.co.jp` / `password`

### ペルソナ別の試し方（パスワードはすべて `password`）

| メール | ログイン後の画面 |
|--------|------------------|
| `tanaka@tax.co.jp` | 担当スタッフ → 資料マトリクス |
| `yamamoto@tax.co.jp` | 所長 → 資料マトリクス |
| `c1@client.example` | クライアント経理 → 専用ワークスペース |
| `ceo@client.example` | クライアント社長 → 専用ワークスペース |
| `bank@example.com` | 銀行 → 専用ワークスペース |

詳細: [`persona-ui-design.md`](persona-ui-design.md)

セッションは httpOnly Cookie（`docugrid_session`）で保持されます。localStorage にトークンは保存しません。

## レガシー storage の移行（任意）

旧 `storage/versions/*.pdf` を firm 配下へコピーする場合:

```bash
cd backend
python scripts/migrate_legacy_storage.py          # ドライラン
python scripts/migrate_legacy_storage.py --apply  # 実行
python scripts/migrate_legacy_storage.py --list-orphans
```

## Google SSO（後で設定）

準備できたら [`google-oauth-setup.md`](google-oauth-setup.md) に従い `GOOGLE_OAUTH_CLIENT_ID` を設定。未設定でもパスワードログインで開発可能。

本番移行の全体手順: [`production-deployment.md`](production-deployment.md)

## セキュリティメモ

- 本番: Google SSO のみ + `DOCUGRID_ALLOW_PASSWORD_LOGIN=false`
- グローバル設定（ロール権限・AI キー）: `platform_admin` のみ
- 事務所内設定（顧客・担当）: `firm_admin` / `settings.manage`

詳細: [`security-checklist.md`](security-checklist.md)

## 設計ドキュメント（機能追加前に）

| 文書 | 用途 |
|------|------|
| [`extensibility-principles.md`](extensibility-principles.md) | **拡張性デフォルト** — 境界・SSOT・PR チェックリスト |
| [`new-product-onboarding.md`](new-product-onboarding.md) | **新リポ追加時の引き継ぎ** |
| [`no-code-config-vision.md`](no-code-config-vision.md) | ノーコード優先・dev コンフィグ |
| [`product-naming.md`](product-naming.md) | DocuGrid / 税務会計 / TAXX の呼び分け |
| [`ssot-normalization.md`](ssot-normalization.md) | 正規化・SSOT レジストリ |
| [`roadmap.md`](roadmap.md) | フェーズと進め方の原則 |
