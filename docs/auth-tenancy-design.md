# 認可・マルチテナント設計（税理士事務所 × 担当者）

最終更新: 2026-06-02

この文書は **実装前に合意する** 認可・データ分離の設計です。  
現行コード（`client_id` + `scopedClientIds`）とのギャップと、移行方針を含みます。

関連: `docs/roadmap.md`（P1 / P1.5）、`docs/api-contract.md`、`docs/docugrid-matrix-model.md`、**`docs/extensibility-principles.md`**（拡張性デフォルト）

---

## 1. なぜこの設計が必要か

| 不安 | 設計で担保すること |
|------|-------------------|
| 別の税理士事務所のデータが混ざる | **事務所（`firm_id`）を最上位テナント**にし、すべての行・ファイルに付与 |
| 担当外の顧問先が見える | **割当（assignment）** で顧問先単位の可視性を制御 |
| ID を知れば他社の版に触れる | **リソース ID 指定 API** は必ず `resource → client → firm` を辿ってから許可 |
| 事務所ごとに運用が違う | データは分離したまま、**`firm_settings`** でワークフロー・表示だけ差し替え |

**原則:** フロントのフィルタは UX。セキュリティ境界は **常にサーバー**。

---

## 2. 現状（2026-06-02 時点）

| 項目 | 実装 |
|------|------|
| 認証 | JWT（`sub`, `role`, `stid`） |
| 顧問先スコープ | `X-Docugrid-Client` + `_require_client_scope` / `_require_client_access` |
| 担当リスト | `stakeholder_master.json` の `clientScopesByStakeholderId` |
| ロール | `ROLE_PERMISSIONS` + `AppPermission`（`organization.ts`） |
| 弱点 | `firm_id` なし、`admin` が全顧問先スルー、一部 API が ID のみで参照（IDOR 余地） |

詳細なギャップ一覧は `docs/backlog-2026-06-02.md`（セキュリティ節）を参照。

---

## 3. 三層モデル

```
[L0] プラットフォーム運営（任意・別経路）
  └─ [L1] 事務所（firm）          ← データの硬い境界
       └─ [L2] メンバー（member）
            └─ [L3] 顧問先（client）への割当
                 └─ [L4] 資料（logical_document / version / slot / ワークスペース）
```

### L1 事務所 — 不変条件

1. 業務データのすべての行に `firm_id`（NOT NULL、インデックス）。
2. すべての API で **JWT の `firm_id` と行の `firm_id` が一致**することを必須とする。
3. バイナリは `storage/{firm_id}/...` のようにパスでも分離（DB だけに依存しない）。
4. `audit_events` / `review_events` にも `firm_id` を記録。

### L2 メンバー

| エンティティ | 説明 |
|--------------|------|
| `firms` | 税理士法人（事務所） |
| `firm_members` | 事務所に所属するユーザー（退職は `inactive`） |
| `firm_role` | 事務所内ロール（後述） |

**ロールの分離（重要）**

| ロール | 範囲 |
|--------|------|
| `platform_admin` | 運営のみ。本番は別デプロイ or 別ログイン |
| `firm_admin` | **自事務所内のみ** 全顧問先・設定・メンバー |
| `partner` / `manager` / `staff` / … | 割当・チーム・ポリシーに従う |

現行の `admin` が `_require_client_access` をスキップする挙動は、**`firm_admin` に縮小**する。

### L3 顧問先 — 担当者単位で「隠す」

`scopedClientIds` のフラットリストを、割当テーブルに置き換える。

```sql
-- 概念モデル（実装時は SQLModel / SQLite）
client_assignments (
  firm_id       TEXT NOT NULL,
  client_id     TEXT NOT NULL,
  member_id     TEXT NOT NULL,
  assignment_role TEXT NOT NULL,  -- main | sub | reviewer | readonly
  effective_from  TEXT,
  effective_to    TEXT,
  PRIMARY KEY (firm_id, client_id, member_id)
)
```

**可視性ポリシー（`firm_settings.visibility_mode`）**

| モード | 説明 |
|--------|------|
| `assigned_only` | 割当がある顧問先のみ（一般スタッフ） |
| `team` | 同一 `team_id` の顧問先（マネージャー） |
| `firm_wide` | 事務所内の全顧問先（パートナー・所長） |
| `approval_queue` | 承認待ちを横断（`approver` ロールと組み合わせ） |

### L4 資料 — ルール R1

> **R1:** `version_id` / `document_id` / `doc_id` など ID だけを受け取る API は、  
> 必ず `resource → client_id → firm_id` を解決し、`authorize()` を通す。

対象例（現行で要修正）:

- `GET/POST /api/audit-links/{version_id}`
- `GET /api/docugrid/load/{document_id}`
- `GET /files`（顧問先フィルタなしのレガシー一覧）

---

## 4. JWT とリクエスト

### ペイロード（ログイン確定時）

```json
{
  "sub": "user@firm.example",
  "firm_id": "firm-uuid",
  "member_id": "member-uuid",
  "role": "operator",
  "stid": "legacy-stakeholder-id",
  "iat": "...",
  "exp": "..."
}
```

| フィールド | 用途 |
|------------|------|
| `firm_id` | テナント境界（**信頼するのはここ**） |
| `member_id` | 割当・監査の主体 |
| `role` | RBAC（permission セット） |

`X-Docugrid-Client` は **UI がどの顧問先を操作中か** のヒント。  
サーバーは「JWT の firm + 割当でその `client_id` が許可されるか」を必ず検証する。

### 中央認可関数（実装前にインターフェース固定）

```text
authorize(ctx, action, resource) → OK | 403

ctx:
  firm_id, member_id, role, permissions[]

resource:
  type: client | slot_document | document_version | docugrid_workspace | firm_settings
  ids: { client_id?, version_id?, document_id?, ... }
```

**評価順序（常に同じ）**

1. 認証済みか  
2. `action` に必要な permission があるか（RBAC）  
3. リソースの `firm_id` == `ctx.firm_id` か  
4. `client_id` に対する割当・チーム・visibility_mode を満たすか  
5. （任意）ワークフロー状態による追加制約  

---

## 5. RBAC と割当の役割

| 層 | 決めること | 変更頻度 |
|----|------------|----------|
| **Permission** | `document.upload`, `audit.approve` 等 | 低 |
| **Firm role** | パートナー / スタッフ / 所内管理者 | 中 |
| **Assignment** | どの顧問先にアクセスできるか | 高（日々） |

例: 「副担当は閲覧のみ」= `assignment_role=sub` + permission マトリクスで表現。

---

## 6. データモデル（最小セット）

| テーブル | 備考 |
|----------|------|
| `firms` | 事務所 |
| `firm_members` | `firm_id` 必須 |
| `clients` | `firm_id` 必須。**client_id は firm 内で一意**（推奨: UUID） |
| `client_assignments` | 担当 |
| `slot_documents` | 既存 + `firm_id` |
| `logical_documents` / `document_versions` | 既存 + `firm_id` |
| `review_events` / `audit_events` | 既存 + `firm_id` |

ストレージ案:

```text
storage/
  {firm_id}/
    clients/{client_id}/
      versions/{version_id}.pdf
    slots/...
```

---

## 7. 事務所ごとの「やり方の違い」

**フェーズ1（安心優先）** — スキーマは共通、`firm_settings` のみ差

- 必須書類マスタ（P4）を `firm_id` 付き  
- マトリクス枠テンプレ（期間種別 × スロット名）  
- 差戻し理由必須などワークフローフラグ  

**フェーズ2** — 可視性・承認キュー  

**フェーズ3** — ワークフローテンプレ（状態機械は 2〜3 パターンに限定）

---

## 8. 移行ロードマップ

| 順 | 成果物 |
|----|--------|
| 1 | ADR: テナントモデル（`firm_id`、JWT、ストレージ） |
| 2 | ADR: 認可モデル（`authorize()`、R1） |
| 3 | ADR: ロールと `firm_settings` |
| 4 | マイグレーション: 既存データを `firm_default` に backfill |
| 5 | 実装スライス（下記） |

**実装スライス**

1. JWT + 全クエリに `firm_id`（既存は default firm で動作継続）  
2. `client_assignments` 導入、`scopedClientIds` から移行  
3. IDOR 修正 + `/files` 廃止 or firm 配下化  
4. `admin` → `firm_admin` / `platform_admin` 分離  
5. P3 OCR メタに `firm_id` + `client_id` 必須（`docs/backlog-2026-06-02.md` §3 と整合）  

---

## 9. 受け入れ基準（テスト）

| ID | 基準 |
|----|------|
| T1 | firm A のトークンで firm B の `client_id` / `version_id` に **必ず 403** |
| T2 | 担当外顧問先は一覧 API が **空**（フロントは二重チェックのみ） |
| T3 | 業務 SQL に `firm_id` 条件があることを pytest で検証 |
| T4 | 拒否は `audit_events` に `firm_id` + `denied` |
| T5 | 本番でヘッダ認証・デフォルト JWT 秘密鍵が **起動時失敗** |

---

## 11. TAXX 認証シェル（エコシステム横断）

最終更新: 2026-06-19  
命名との対応: [`product-naming.md`](product-naming.md) §2

### 11.1 方針（合意案）

| レイヤ | 責務 |
|--------|------|
| **TAXX** | ログイン、IdP、JWT/セッション発行、`firm_id`・メンバー・ロール、統合ナビ |
| **DocuGrid** | 資料 SSOT API。**TAXX が発行したトークンを検証**して動作 |
| **税務会計システム** | 帳簿 SSOT API。同上 |

ユーザーは **一度ログイン** すれば、タブ切替で DocuGrid と税務会計に入れる（SSO）。  
各バックエンドは **自分でもトークンを検証** する（BFF だけに依存しない）。

### 11.2 なぜ TAXX に認証を集約するか

| メリット | 説明 |
|----------|------|
| テナント境界が一貫 | `firm_id` が全 API で同じ意味 |
| ログインが1か所 | 税務会計に別アカウントを作らない |
| handoff が安全 | 同一 `member_id` / `client_id` コンテキストで連携 |
| 監査が追える | ログイン・拒否を TAXX 側に集約可能 |

| 避けること | 理由 |
|------------|------|
| プロダクトごとに別 IdP | 事務所・顧問先の対応がずれる |
| フロントだけ共有 Cookie | API 直叩きで破綻 |
| TAXX に業務データ | 認証層の肥大化 |

### 11.3 トークンとリクエスト（エコシステム共通）

§4 の JWT に加え、エコシステム全体で共有するクレーム:

```json
{
  "sub": "user@firm.example",
  "firm_id": "firm-uuid",
  "member_id": "member-uuid",
  "role": "operator",
  "iss": "taxx",
  "aud": ["docugrid", "tax-accounting"]
}
```

| ヘッダ / クレーム | 用途 |
|-------------------|------|
| `Authorization: Bearer` | 全プロダクト API |
| `firm_id`（JWT） | **信頼するテナント境界** |
| `X-Docugrid-Client` / `X-Taxx-Client-Id` | 操作中の顧問先（サーバーで割当検証） |

税務会計システムの API も **`authorize(ctx, action, resource)`** を同型で実装する（`client_id` → `firm_id` の辿り）。

### 11.4 実装フェーズ

| Phase | 内容 |
|-------|------|
| **Auth-0（現状）** | DocuGrid リポの `/api/auth/*` がログイン。JWT に `firm_id` 追加（P1.5） |
| **Auth-1** | 税務会計は読み取り専用埋め込み時、親からトークンを受け取る |
| **Auth-2** | 税務会計 API が TAXX JWT を直接検証（共有秘密鍵 or JWKS） |
| **Auth-3** | 認証 UI を `taxx.` サブドメイン or 専用モジュールに分離 |
| **Auth-4** | handoff / バッチ用 **サービスアカウント**（`firm_id` スコープ） |

[`ecosystem-accounting-ui-integration.md`](ecosystem-accounting-ui-integration.md) Phase **B1** と同一タイムライン。

### 11.5 handoff 時の認証

- ユーザー操作の handoff: **ユーザーの JWT** を転送（または BFF が代理）
- 夜間バッチ: **サービストークン**（`firm_id` 固定、`aud: handoff`）
- いずれも `idempotency_key` に `firm_id` / `client_id` を含める

### 11.6 受け入れ基準（追加）

| ID | 基準 |
|----|------|
| T6 | 税務会計 API が TAXX 以外の `iss` の JWT を **拒否** |
| T7 | DocuGrid と税務会計で **同一ログイン** 後、両方の API が同じ `firm_id` で成功 |
| T8 | 税務会計に **事務所用の独立ログイン画面がない**（本番） |

---

## 10. 用語集

| 用語 | 意味 |
|------|------|
| **firm** | 税理士法人（事務所）。テナント境界 |
| **member** | 事務所にログインする人 |
| **client** | 顧問先（法人・個人） |
| **assignment** | member と client の担当関係 |
| **slot** | マトリクス上の資料枠（期間 × スロット index） |
| **platform_admin** | SaaS 運営者（事務所データには原則触れない） |
| **TAXX シェル** | ログイン・認証・統合ナビの入口（業務 SSOT は持たない） |

---

## 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-06-02 | 初版（設計合意用） |
| 2026-06-19 | §11 追加: TAXX 認証シェル、エコシステム横断 JWT |
