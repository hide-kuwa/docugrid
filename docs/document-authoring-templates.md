# DocuGrid ドキュメント作成支援（ひな形エンジン）

最終更新: 2026-06-10

申告 PDF 整列用の [`document-templates`](api-contract.md)（並び順テンプレ）とは **別機能** です。  
本モジュールは **定型文書の作成支援**（Global / Local ひな形、変数タグ、動的フォーム）を扱います。

関連: [`roadmap.md`](roadmap.md)、[`docugrid-matrix-model.md`](docugrid-matrix-model.md)、[`auth-tenancy-design.md`](auth-tenancy-design.md)

---

## 1. 概要

税理士事務所における定型ドキュメント（議事録、契約書、送付状、チェックリスト等）を、**変数タグ** 付きひな形から生成する。

| フェーズ | 内容 | Drive 依存 |
|----------|------|------------|
| **Phase 1**（実装中） | テキストひな形登録、`{{tag}}` パース、顧問先マスタ自動入力、プレビュー生成 | 不要 |
| Phase 2 | Google Docs 紐付け + OAuth「許可して連携」 | 要 |
| Phase 3 | Global Templates の版管理・一斉配布 | 一部 |
| Phase 4 | 顧問先フォルダ保存 + 電子契約 OEM | 要 |

**Google Drive 連携は後回し。** Phase 1 はローカルテキスト + API のみで価値を出す。

---

## 2. テンプレート2層構造

### 2.1 Global Templates（TAXX 公式）

- **対象**: 役員報酬改定議事録、金銭消費貸借契約書など法令準拠が重要な文書
- **管理**: `platform_admin` のみ CRUD
- **保存**: `storage/platform/global_authoring_templates.json`（未作成時はコード内シード）
- **責任**: 法改正追従は TAXX 運営（将来バージョン管理）

### 2.2 Local Templates（事務所独自）

- **対象**: 送付状、税務調査チェックリスト、業界別ヒアリングシート等
- **管理**: 事務所 `settings.manage` 権限
- **保存**: `storage/firms/{firm_id}/local_authoring_templates.json`
- **責任**: 文面の正確性は各事務所

### 既存 API との名前衝突回避

| 既存 | 本モジュール |
|------|----------------|
| `GET/PUT /api/document-templates` | 申告 **PDF 並び順** |
| `GET/POST /api/authoring-templates` | **文書ひな形**（本書） |

---

## 3. 変数タグ仕様（Phase 1）

### 3.1 記法

```text
{{client_name}} が {{fiscal_month}} 月決算の書類を送付します。
```

- パターン: `{{` + 識別子 + `}}`
- 識別子: `[a-zA-Z_][a-zA-Z0-9_]*`（前後空白は許容）

### 3.2 組み込み変数（顧問先マスタから自動）

| タグ | ソース |
|------|--------|
| `client_name` | 顧問先名称 |
| `client_id` | 顧問先 ID |
| `fiscal_month` | 決算月（1–12） |
| `today` | 生成日（ISO 日付） |

上記以外は **手入力フィールド** として動的フォームに表示する。

---

## 4. API（Phase 1）

ベース: `http://127.0.0.1:8000/api`

| メソッド | パス | 権限 | 説明 |
|----------|------|------|------|
| `GET` | `/authoring-templates` | `settings.manage` | Global + 自 firm Local 一覧 |
| `GET` | `/authoring-templates/{id}` | `settings.manage` | 1件取得 |
| `POST` | `/authoring-templates` | Local: `settings.manage` / Global: `settings.platform` | 作成 |
| `PUT` | `/authoring-templates/{id}` | 同上 | 更新 |
| `DELETE` | `/authoring-templates/{id}` | 同上 | 削除 |
| `POST` | `/authoring-templates/parse` | `settings.manage` | 本文から変数一覧抽出 |
| `POST` | `/authoring-templates/{id}/render` | `document.view` | 顧問先 + 手入力値で本文生成 |

### テンプレート JSON 形状

```json
{
  "id": "global-officer-compensation-minutes",
  "scope": "global",
  "title": "役員報酬改定議事録",
  "description": "株主総会議事録のたたき台",
  "category": "corporate_governance",
  "body": "株式会社{{client_name}}は...",
  "variables": ["client_name", "meeting_date", "new_salary"],
  "version": "1.0.0",
  "updatedAt": "2026-06-10T00:00:00Z"
}
```

### render リクエスト

```json
{
  "client_id": "c1",
  "values": {
    "meeting_date": "2026-03-25",
    "new_salary": "月額50万円"
  }
}
```

### render レスポンス

```json
{
  "renderedBody": "...",
  "resolvedValues": { "client_name": "株式会社 鈴木商店", "meeting_date": "2026-03-25", ... },
  "missingVariables": []
}
```

---

## 5. UI（Phase 1）

| 画面 | 内容 |
|------|------|
| **設定 → ひな形** | Local ひな形の一覧・登録・編集・削除。Global は閲覧のみ（platform は編集可） |
| **マトリクス → 文書作成** | ひな形選択 → 動的フォーム → プレビュー → テキストダウンロード |

---

## 6. 将来（Phase 2+）

- Google Docs API + Picker（「権限与えますか？はい」UX）
- `clientDriveSetting` による顧問先フォルダへの自動保存
- 電子契約 API 連携
- Global の semver と差分通知

---

## 7. ビジネス上の位置づけ

Local ひな形の蓄積は事務所ごとの **スイッチングコスト** を高め、解約率低下に寄与する（LTV は別途計測）。  
Global は **信頼の公式ブランド**、Local は **解約防止の資産** として役割分担する。
