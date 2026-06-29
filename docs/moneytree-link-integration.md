# Moneytree LINK 連携（銀行・クレカ）

最終更新: 2026-06-25

## 位置づけ

**顧問先ごと**に、**顧問先ユーザー本人**がワークスペースから銀行・クレカを連携する。税理士事務所が代行して接続するフローは想定しない。

- 顧問先 UI: ワークスペース（`client_accounting` / `client_sales_expense`）
- 事務所 UI: 設定 → 外部連携（**連携状況の閲覧のみ**）

## アーキテクチャ

```
顧問先ユーザー（ワークスペース）
    │ OAuth 2.0 + PKCE（client_id 単位）
    ▼
Moneytree 認可ページ
    │ redirect + code
    ▼
TAXX Backend  /api/integrations/moneytree/callback
    │ token 保存（firm_id + client_id）
    ▼
顧問先ワークスペースへリダイレクト（/workspace/client_accounting?moneytree=connected）
```

## 連携ポート

| port_id | 内容 | manual_policy |
|---------|------|---------------|
| `external.moneytree.accounts` | 口座一覧（銀行・クレカ等） | staging_only |
| `external.moneytree.transactions` | 取引明細 | staging_only |

## 環境変数

| 変数 | 説明 |
|------|------|
| `MONEYTREE_LINK_CLIENT_ID` | マネーツリー発行 client_id（検証/本番で別） |
| `MONEYTREE_LINK_CLIENT_SECRET` | client_secret |
| `MONEYTREE_LINK_REDIRECT_URI` | OAuth コールバック（例: `http://localhost:8000/api/integrations/moneytree/callback`） |
| `MONEYTREE_LINK_ENV` | `staging`（既定）または `production` |
| `MONEYTREE_LINK_MOCK` | `true` でデモ口座・明細（契約前の UI 確認用） |

契約・client_id 取得: [Moneytree LINK お問い合わせ](https://business.getmoneytree.com/link/)

## API（TAXX）

| メソッド | パス | 権限 | 説明 |
|----------|------|------|------|
| GET | `/api/integrations/moneytree/firm-status` | settings.manage | 事務所: 顧問先別の連携状況（閲覧のみ） |
| GET | `/api/integrations/moneytree/status` | client.view + 顧問先スコープ | 接続状態 |
| GET | `/api/integrations/moneytree/connect` | document.upload + 顧問先スコープ | 認可 URL（`return_path` 可） |
| GET | `/api/integrations/moneytree/callback` | （OAuth） | コールバック → ワークスペースへリダイレクト |
| POST | `/api/integrations/moneytree/mock-connect` | document.upload | 開発用デモ接続 |
| POST | `/api/integrations/moneytree/sync` | document.upload | 口座・明細の再取得 |
| GET | `/api/integrations/moneytree/accounts` | client.view | キャッシュ済み口座 |
| GET | `/api/integrations/moneytree/transactions` | client.view | キャッシュ済み明細 |
| GET | `/api/integrations/moneytree/vault-url` | document.upload | 金融機関登録ページ |
| DELETE | `/api/integrations/moneytree/disconnect` | document.upload | 連携解除 |

すべての顧問先向け API は **`client_id` 必須**。

## UI

| 利用者 | 画面 |
|--------|------|
| 顧問先（経理・経費担当） | ワークスペース → **銀行・クレジットカード連携** |
| 税理士事務所 | 設定 → 外部連携 → 顧問先別ステータス一覧 |

## 今後の拡張

- 顧問先ワークスペース DATA タブからの接続（client_id 必須）
- 明細 → 経費キャプチャカード自動生成
- 口座残高と試算表科目の自動照合（`docugrid.audit.auto_vouch`）
- 同期スケジュール（request_refresh は 1 日 4 回まで）
