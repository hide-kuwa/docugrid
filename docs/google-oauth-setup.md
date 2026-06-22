# Google OAuth SSO セットアップ

DocuGrid のログインは **Google Sign-In（OpenID Connect）** を主経路とします。

## 1. Google Cloud Console

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成または選択
2. **API とサービス → OAuth 同意画面** を設定（内部 or 外部）
3. **認証情報 → 認証情報を作成 → OAuth クライアント ID**
   - アプリケーションの種類: **ウェブアプリケーション**
   - **承認済みの JavaScript 生成元**
     - 開発: `http://localhost:3000`
     - 本番: `https://your-app.example.com`
   - リダイレクト URI は不要（フロントで GIS ボタン → ID トークンを API に POST）

## 2. 環境変数

### バックエンド (`backend/.env`)

```env
GOOGLE_OAUTH_CLIENT_ID=xxxx.apps.googleusercontent.com
DOCUGRID_ENV=production
DOCUGRID_JWT_SECRET=<32文字以上のランダム文字列>
DOCUGRID_ALLOW_PASSWORD_LOGIN=false
DOCUGRID_ALLOW_HEADER_AUTH=false
```

### フロント (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_BASE=http://localhost:8000/api
NEXT_PUBLIC_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
```

`GOOGLE_OAUTH_CLIENT_ID` と `NEXT_PUBLIC_GOOGLE_CLIENT_ID` は **同じ Web クライアント ID** にしてください。  
未設定時はフロントが `GET /api/auth/config` から `google_client_id` を取得します。

## 3. ユーザー登録（member directory）

Google でログインできるのは **member directory に登録されたメール** のみです。

- デフォルト: `backend/services/member_directory.py` の `DEFAULT_EMAIL_TO_STAKEHOLDER`
- 運用: `backend/storage/member_directory.json`

```json
{
  "emailToStakeholderId": {
    "tanaka@your-firm.co.jp": "actor-s1",
    "admin@your-firm.co.jp": "actor-admin"
  }
}
```

未登録の Google アカウントは `403`（This Google account is not registered...）になります。

## 4. 開発用パスワードログイン

ローカルで Google を設定しない場合:

```env
# backend/.env
DOCUGRID_ALLOW_PASSWORD_LOGIN=true
DOCUGRID_LOGIN_PASSWORD=password
```

ログイン画面の「開発用パスワードログイン」から利用できます。本番では `false`（デフォルト）。

## 5. API

| メソッド | パス | 説明 |
|----------|------|------|
| GET | `/api/auth/config` | `google_client_id`, `password_login_enabled` |
| POST | `/api/auth/google` | Body: `{ "credential": "<Google ID token>" }` → DocuGrid JWT |
| POST | `/api/auth/login` | 開発用パスワードログイン（無効化可能） |

## 関連

- [`security-checklist.md`](security-checklist.md)
- [`auth-tenancy-design.md`](auth-tenancy-design.md)
