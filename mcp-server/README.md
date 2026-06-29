# DocuGrid MCP Server

DocuGrid（TAXX）資料整理アプリの **FastAPI バックエンド**（`http://localhost:8000/api`）を操作する MCP サーバーです。

## アプリ概要（補足）

| 項目 | 内容 |
|------|------|
| フロント | **Next.js 14**（`frontend/`）— API Route は未使用、REST はバックエンド直叩き |
| バックエンド | **FastAPI**（`backend/main.py` :8000） |
| データ | **SQLite**（`backend/storage/*.db`）+ **JSON**（`client_master.json` 等） |
| ORM | Prisma / PostgreSQL は **未使用**（将来移行のドキュメントのみ） |

主要エンティティ: **顧問先（client）** × **期間（period_key）** × **スロット（slot）** = マトリクス上の PDF 資料。

## 提供ツール

| ツール | 説明 |
|--------|------|
| `get_me` | ログインユーザー・ロール確認 |
| `list_clients` | 顧問先一覧 |
| `search_clients` | 顧問先キーワード検索（名前・タグ） |
| `update_client_tags` | 顧問先タグの更新 |
| `list_slot_documents` | マトリクス資料一覧 |
| `get_document_status` | 不足資料・承認待ちチェック |
| `list_catalog_categories` | 書類カタログ category 一覧 |
| `search_document_catalog` | 書類カタログ横断 + キーワード絞り込み |
| `list_firm_tasks` | 事務所タスク（不足・承認待ち集約） |
| `list_pending_classify` | 自動分類待ちキュー |

## セットアップ

```bash
cd mcp-server
cp .env.example .env
# 必要なら DOCUGRID_EMAIL / DOCUGRID_PASSWORD を編集

npm install
npm run build
```

バックエンドを起動しておく:

```bash
# リポジトリルートで
npm run dev:backend
```

## 環境変数

| 変数 | 説明 |
|------|------|
| `DOCUGRID_API_BASE` | API ベース URL（既定: `http://localhost:8000/api`） |
| `DOCUGRID_ACCESS_TOKEN` | **推奨** ログインユーザー本人の JWT（設定時はパスワードログインをスキップ） |
| `DOCUGRID_EMAIL` / `DOCUGRID_PASSWORD` | 開発用パスワードログイン（`DOCUGRID_MCP_ALLOW_DEV_LOGIN=true` 時のみ） |
| `DOCUGRID_MCP_STRICT` | 既定 `true`。MCP 側の権限・顧問先スコープチェックを有効化 |
| `DOCUGRID_MCP_ALLOW_DEV_LOGIN` | 既定 `false`。`true` のときのみ共有パスワードログインを許可 |
| `DOCUGRID_CLIENT_ID` | **非推奨**。担当外 ID は拒否される |

---

## セキュリティ（必読）

### 原則

1. **MCP は「その JWT のユーザー本人」としてしか動かない**
2. **ツール呼び出しごとに `/auth/me` を再取得**し、`visible_client_ids` と `permissions` を照合
3. **担当外の `client_id` は MCP 層で即拒否**（API 403 に加えた多層防御）
4. **カタログ・一覧の返却行も `visible_client_ids` で再フィルタ**
5. **共有 admin パスワードは strict モードで既定禁止**

### 認証の推奨構成

| 環境 | 設定 |
|------|------|
| **本番・チーム** | アプリ → **MCP** メニュー → トークン発行 → `.cursor/mcp.json` に貼り付け |
| **ローカル開発** | 同上（推奨）または `DOCUGRID_MCP_ALLOW_DEV_LOGIN=true` のみ一時許可 |

**UI:** 設定 → **AI / MCP** タブ → 短命 JWT と Cursor 設定 JSON をコピー

### 各ツールのガード

| ツール | MCP 側チェック |
|--------|----------------|
| 全ツール | `/auth/me` の `visible_client_ids` |
| 閲覧系 | `client.view` / `document.view` |
| `list_firm_tasks` | `dashboard.view` |
| `update_client_tags` | `settings.manage` + 顧問先割当 |
| `client_id` 引数あり | 割当外なら **API を呼ばず拒否** |

### その他に必ず守ること

- **`.cursor/mcp.json` を git にコミットしない**（JWT・パスワード漏洩）
- **MCP サーバーをインターネット公開しない**（stdio はローカル Cursor 専用）
- **バックエンド本番**: `DOCUGRID_ALLOW_HEADER_AUTH=false`、`DOCUGRID_ALLOW_PASSWORD_LOGIN=false`
- **AI へのプロンプト注入**対策: サーバー側認可が最終防衛線（MCP は client_id を盲信しない）
- **監査**: API リクエストに `X-Docugrid-MCP: 1` ヘッダを付与（ログ追跡用）

### バックエンド側（API）の保証

MCP に加え、FastAPI 側でも以下を実施済み:

- `firm_id` 境界（他事務所データ不可）
- `authorize_client_access`（担当外顧問先は 403）
- `client-master` PUT は **変更対象 client ごとに割当チェック** + 部分マージ（他顧問先の誤削除防止）

---

## Cowork / Cursor / Claude Desktop への登録

### 1. Cursor（推奨）

1. **Cursor** → `Settings` → `MCP` → `Add new MCP server`
2. またはプロジェクト / ユーザーの `mcp.json` に追記:

**Windows 例**（パスは自分の環境に合わせて変更）:

```json
{
  "mcpServers": {
    "docugrid": {
      "command": "node",
      "args": [
        "C:/Users/yasuh/OneDrive/デスクトップ/TAXX/mcp-server/dist/index.js"
      ],
      "env": {
        "DOCUGRID_API_BASE": "http://localhost:8000/api",
        "DOCUGRID_EMAIL": "admin@tax.co.jp",
        "DOCUGRID_PASSWORD": "password"
      }
    }
  }
}
```

開発中は `tsx` で直接起動も可:

```json
{
  "mcpServers": {
    "docugrid": {
      "command": "npx",
      "args": ["tsx", "C:/Users/yasuh/OneDrive/デスクトップ/TAXX/mcp-server/src/index.ts"],
      "env": {
        "DOCUGRID_API_BASE": "http://localhost:8000/api",
        "DOCUGRID_EMAIL": "admin@tax.co.jp",
        "DOCUGRID_PASSWORD": "password"
      }
    }
  }
}
```

3. Cursor を再起動し、MCP パネルで `docugrid` が **緑（接続済み）** になることを確認
4. Agent チャットで例: 「`search_clients` で製造とつくタグの顧問先を探して」

**設定ファイルの場所（参考）**

- プロジェクト: `.cursor/mcp.json`
- ユーザー: `%USERPROFILE%\.cursor\mcp.json`

### 2. Claude Desktop

`%APPDATA%\Claude\claude_desktop_config.json`（macOS は `~/Library/Application Support/Claude/`）:

```json
{
  "mcpServers": {
    "docugrid": {
      "command": "node",
      "args": ["C:/Users/yasuh/OneDrive/デスクトップ/TAXX/mcp-server/dist/index.js"],
      "env": {
        "DOCUGRID_API_BASE": "http://localhost:8000/api",
        "DOCUGRID_EMAIL": "admin@tax.co.jp",
        "DOCUGRID_PASSWORD": "password"
      }
    }
  }
}
```

Claude Desktop を再起動。

### 3. Claude Cowork

Cowork は MCP 対応クライアントとして **stdio トランスポート**のサーバーを登録します。手順は製品版により異なりますが、一般的には:

1. Cowork の **Integrations / MCP** 設定を開く
2. **Custom MCP Server（stdio）** を追加
3. 以下を設定:
   - **Name**: `docugrid`
   - **Command**: `node`
   - **Args**: `["<リポジトリ絶対パス>/mcp-server/dist/index.js"]`
   - **Environment**: 上記 `DOCUGRID_*` 変数
4. 接続テストで `list_clients` が成功することを確認

> Cowork の UI ラベルが「Add Connector」「MCP Servers」等の場合でも、**command + args + env** の stdio 形式は同じです。

---

## 動作確認（手動）

```bash
cd mcp-server
npm run dev
# 別ターミナルで MCP Inspector（任意）:
# npx @modelcontextprotocol/inspector npm run dev
```

## 権限メモ

| 操作 | 必要権限（目安） |
|------|------------------|
| 顧問先一覧・資料閲覧 | `client.view` / `document.view` |
| タグ更新 | `settings.manage` |
| 事務所タスク | `dashboard.view` |

本番では `DOCUGRID_ALLOW_HEADER_AUTH=false` とし、`DOCUGRID_ACCESS_TOKEN` に短命 JWT を渡す運用を推奨します。

## トラブルシュート

| 症状 | 対処 |
|------|------|
| `DOCUGRID_ACCESS_TOKEN が必要` | ユーザー JWT を設定するか、開発のみ `DOCUGRID_MCP_ALLOW_DEV_LOGIN=true` |
| `顧問先へのアクセスは許可されていません` | 正常動作。担当外 client_id は MCP が拒否している |
| Login failed | バックエンド起動確認、`DOCUGRID_ALLOW_PASSWORD_LOGIN=true`（開発） |
| 403 on update_client_tags | `settings.manage` 権限と顧問先割当を確認 |
| ECONNREFUSED | `npm run dev:backend` で :8000 を起動 |
