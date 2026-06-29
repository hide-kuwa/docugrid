# セキュリティ・情報漏洩対策チェックリスト（現フェーズ）

最終更新: 2026-06-10（platform_admin / docugrid save 必須化）

マルチテナント P1.5 途中・開発認証モデル時点で、押さえておくべき情報漏洩リスクとシステム対策を整理した文書です。

関連: [`auth-tenancy-design.md`](auth-tenancy-design.md)、[`smoke-checklist.md`](smoke-checklist.md)、[`roadmap.md`](roadmap.md)

---

## 前提：このフェーズの脅威モデル

| 想定する攻撃者 | 例 |
|----------------|-----|
| 同一事務所の別担当者 | 担当外の顧問先 PDF・監査履歴を見る |
| 別事務所のユーザー | firm 境界を越えてデータにアクセス |
| ログイン済みの一般ユーザー | 権限昇格（admin になりすます） |
| 外部からの API 呼び出し | 未認証アクセス、総当たり、ID 推測 |

**原則（設計書より）:** フロントのフィルタは UX のみ。境界は **常にサーバー** で判定する。

実装の中心: `backend/services/tenancy.py`、`backend/main.py`、`backend/docugrid_auth.py`

---

## A. テナント境界（事務所 × 事務所）— 最重要

### A-1. firm_id によるデータ分離

| 項目 | 現状 | リスク | 対策 |
|------|------|--------|------|
| JWT に `firm_id` | ✅ 実装済み | トークン改ざんで他 firm になりすまし | 本番は JWT のみ信頼。ヘッダ認証は無効化 |
| 顧問先アクセス時の firm チェック | ✅ `authorize_client_access` で `get_client_firm_id` と照合 | client_id の firm 解決が誤ると漏洩 | `client_master.json` の `firmId` を正確に管理 |
| `client_master` GET のフィルタ | ✅ `visible_client_ids` で firm 内＋割当のみ | — | 維持 |
| スロット・版 PDF の保存先 | ✅ `storage/{firm_id}/versions/...`（新規） | 旧 `storage/versions/` が残ると直アクセス余地 | レガシーパスは読み取りフォールバックのみ。段階的移行 |
| `/files` 一覧 | ✅ 本番デフォルト **410 無効**（`DOCUGRID_ALLOW_LEGACY_FILES`） | firm 内全 PDF が admin に見える（顧問先スコープなし） | 開発のみ有効。本番はスロット API を使用 |
| `logical_documents.firm_id` | ✅ 列追加・バックフィル | DB クエリに firm 条件がない箇所は理論上の穴 | 全クエリに `firm_id` 条件を追加（多層防御） |
| `slot_documents` / `review_events` / `audit_events` の `firm_id` | ✅ 列あり・バックフィル | 一覧 API で firm フィルタしていない箇所あり（A-2 参照） | 一覧系 SQL に `firm_id = ctx.firm_id` を必須化 |

### A-2. 未対応・要修正（firm 横断漏洩）

| 項目 | 現状 | リスク | 推奨対策 |
|------|------|--------|----------|
| **`GET /api/audit-events`** | ✅ `firm_id = ctx.firm_id` 必須 + バックフィル | — | 維持 |
| **`client_master` PUT** | ✅ 自 firm の行のみマージ更新（他 firm は保持） | — | 維持 |
| **`role-permissions` PUT** | ✅ `settings.platform` 必須（`platform_admin`） | — | 維持。将来 firm 単位 RBAC が必要なら別設計 |
| **`system-config` / AI キー** | ✅ `storage/firms/{firm_id}/` に分離。PUT は `settings.manage`（自 firm のみ） | レガシー `storage/system_config.json` は default firm へ自動移行 | 維持 |
| **`platform_admin`** | ✅ 実装済み（`actor-admin` は常に `platform_admin`、stakeholder master で降格不可） | — | `firm_admin` は事務所内のみ |
| **`firm_members` テーブル** | ✅ SQLite（`firm_members.db`）+ 起動時 bootstrap | 退職者は `inactive` でログイン拒否 | メンバー管理 API・UI は今後 |

### A-3. テストで担保済み（維持）

- firm A トークンで firm B のスロット一覧 → 403（`test_cross_firm_slot_access_denied`）
- firm A で firm B の `client-master` に beta 顧客が出ない
- firm A で firm B の docugrid workspace → 403
- stakeholder master のクロスファーム割当 → 400
- `/files` は自 firm ディレクトリのみ

---

## B. 顧問先スコープ（同一 firm 内の担当外漏洩）

### B-1. 実装済み

| 項目 | 内容 |
|------|------|
| サーバー側割当 | `client_assignments` テーブル + stakeholder master 同期 |
| `authorize_client_access` | firm 内 ∩ 割当クライアントのみ許可 |
| `firm_admin` / `admin` | **firm 内の全顧問先**のみ（他 firm は不可） |
| 主要 API | slots / versions / review-events / docugrid は `client_id` 解決後にチェック |
| IDOR 修正（R1） | `audit-links/{version_id}`、`docugrid/load/{document_id}` は resource → client 解決後に認可 |

### B-2. ギャップ

| 項目 | 現状 | リスク | 対策 |
|------|------|--------|------|
| **フロントの `canAccessClient`** | ✅ `/api/auth/me` の `visible_client_ids` を優先 | 初回ログイン前は静的マスタにフォールバック | `checkSession` で常時同期（✅） |
| **`/files`** | ✅ 本番デフォルト無効（410） | — | 開発時のみ `DOCUGRID_ALLOW_LEGACY_FILES=true` |
| **`review-events` 一覧** | ✅ `firm_id` 条件追加 | — | 維持 |
| **`document-versions/{id}/file`** | ✅ `authorize_firm_resource` 追加 | — | 維持 |
| **割当ロール（main/sub/readonly）** | ❌ 未実装 | 副担当の閲覧のみ制御ができない | `assignment_role` + permission 連動 |

---

## D. MCP（AI チャネル）— 公開前に必須

MCP は AI 経由で API を叩くため、**ブラウザ UI より漏洩リスクが高い**チャネルとして扱う。

### D-1. 実装済み（`mcp-server/`）

| 項目 | 内容 |
|------|------|
| ツールごと `/auth/me` 再取得 | `visible_client_ids` / `permissions` を毎回照合 |
| 担当外 `client_id` | MCP 層で API 呼び出し前に拒否 |
| 返却データ再フィルタ | カタログ行・顧問先一覧を二重で絞り込み |
| 本番設定検証 | 非 localhost API または `DOCUGRID_ENV=production` で厳格モード |
| 本番必須 JWT | `DOCUGRID_ACCESS_TOKEN` のみ（パスワードログイン禁止） |
| 本番 HTTPS 強制 | `http://` API は起動拒否 |
| JWT 有効期限 | 期限切れトークンは起動・リクエスト時に拒否 |
| 監査 | API に `X-Docugrid-MCP: 1` → `audit_events.detail` に `channel=mcp` |

### D-2. 公開前チェックリスト

```
[ ] ユーザーごとに DOCUGRID_ACCESS_TOKEN（短命 JWT）— 共有 admin 禁止
[ ] DOCUGRID_MCP_STRICT=true（本番では変更不可）
[ ] DOCUGRID_MCP_ALLOW_DEV_LOGIN=false
[ ] .cursor/mcp.json を git に含めない（.gitignore 済み）
[ ] MCP サーバーをインターネット公開しない（stdio / ローカル IDE 専用）
[ ] バックエンド本番: DOCUGRID_ALLOW_PASSWORD_LOGIN=false
[ ] バックエンド本番: DOCUGRID_ALLOW_HEADER_AUTH=false
[ ] audit_events で channel=mcp のアクセスを定期レビュー
```

### D-3. 将来（公開サービス化時）

| 項目 | 推奨 |
|------|------|
| MCP 用 OAuth / デバイスコード | ログイン UI から短命トークンをユーザーごとに発行 |
| MCP 専用スコープ | `mcp.read` / `mcp.write` 等、API 権限をさらに細分化 |
| レート制限 | ユーザー単位の MCP API クォータ |

---

## C. 認証（なりすまし・権限昇格）— 現フェーズ最大リスク

### C-1. 開発用認証の危険性（本番前に必ず潰す）

| 項目 | 現状 | リスク | 本番対策 |
|------|------|--------|----------|
| **Google OAuth SSO** | ✅ `POST /api/auth/google`（ID トークン検証） | 未登録メールは 403 | [`google-oauth-setup.md`](google-oauth-setup.md) 参照 |
| **共有パスワード** | 開発のみ `DOCUGRID_ALLOW_PASSWORD_LOGIN` | 本番で有効だと全員同一パスワード | 本番は Google のみ |
| **ログイン時の `stakeholder_id` 選択** | ✅ `member_directory.py` で email → stakeholder 固定。本番は pick 不可 | dev のみ `DOCUGRID_ALLOW_LOGIN_STAKEHOLDER_PICK=true` で従来動作 | 本番は pick 禁止（`validate_auth_config` で検証） |
| **JWT 秘密鍵** | デフォルト `dev-insecure-change-me`（22 バイト） | トークン偽造 | `DOCUGRID_JWT_SECRET` 32 文字以上のランダム値 |
| **ヘッダ認証** | `DOCUGRID_ALLOW_HEADER_AUTH`（dev では有効） | `X-Docugrid-Role` / `X-Docugrid-Firm` を任意設定 | 本番は **必ず false**（`validate_auth_config` で起動失敗） |
| **一時 admin メール** | `admin@tax.co.jp` は常に `actor-admin` | そのメールアドレスを知ると admin | 本番では削除 or 環境変数で無効化 |
| **JWT の localStorage 保存** | ✅ Cookie モード時は保存しない（`DOCUGRID_SESSION_COOKIE`） | XSS 残リスクは CSRF・CSP | 本番は Cookie のみ運用推奨 |
| **CSRF（Cookie 認証）** | ✅ `docugrid_csrf` + `X-CSRF-Token`（POST/PUT/PATCH/DELETE） | — | Bearer / ヘッダ認証テスト時はスキップ |
| **ログイン rate limit** | ✅ IP 単位（`DOCUGRID_LOGIN_RATE_LIMIT`、デフォルト 20/分） | — | 本番は WAF も併用推奨 |

`validate_auth_config()`（`backend/docugrid_auth.py`）は本番 misconfig を検知する設計だが、**開発モードでは警告のみ**。`DOCUGRID_ENV=production` での起動確認が必須（設計書 T5）。

### C-2. 実装済みの良い点

- Bearer JWT 優先、無効トークンは 401
- 401/403 は `audit_events` に `denied` 記録
- 動的 `role-permissions`（サーバー側 enforcement）
- `/api/auth/me` で permissions / firm_id 同期

---

## D. IDOR（ID を知ればアクセスできる問題）

### D-1. ルール R1 対応状況

設計書ルール: `version_id` / `document_id` / `doc_id` など ID だけを受け取る API は、必ず `resource → client_id → firm_id` を解決してから許可する。

| エンドポイント | resource → client 解決 | 認可 |
|----------------|------------------------|------|
| `GET/POST /api/audit-links/{version_id}` | ✅ `resolve_version_client_id` | ✅ |
| `GET /api/docugrid/load/{document_id}` | ✅ slot 経由 | ✅ 未リンクは 404 |
| `GET /api/slots/{doc_id}/file` | ✅ DB 行 | ✅ + firm_id チェック |
| `GET /api/document-versions/{version_id}/file` | ✅ logical → client | ✅（firm 明示は推奨） |
| `POST /api/docugrid/save` | ✅ `client_id` / `period_key` / `slot_id` 必須 + `firm_id` 保存 | — | 維持 |

### D-2. 残リスク

- **DocuGrid SQLModel `Document`**: `firm_id` / `client_id` 列追加済み。`owner_user_id` は定数のまま
- **版 ID / スロット doc_id**: UUID なので推測困難。ただし URL・ログ・Referer 漏洩には注意
- **監査ログの detail フィールド**: 操作内容が平文で記録される（内部漏洩時に情報量が多い）

---

## E. ストレージ・データ保管

| 項目 | 現状 | リスク | 対策 |
|------|------|--------|------|
| PDF 実体 | ローカル `backend/storage/` | サーバー侵害で一括窃取 | ディスク暗号化、バックアップ暗号化、アクセス権限 |
| SQLite / JSON | 平文ファイル | 同上 | 同上。本番はマネージド DB + オブジェクトストレージ |
| レガシーパス | `storage/versions/` 等 | 移行前データが firm 分離外 | 移行スクリプト + 旧パス削除 |
| AI キー | `storage/ai_secrets.json` | ファイル読取で全 firm のキー漏洩 | シークレットマネージャー、GET でキー本体を返さない（✅ 済） |
| ログ・監査 | SQLite `audit_events` | firm フィルタ不足（A-2） | firm スコープ + 保持期間・マスキング |

ストレージパス解決: `backend/services/storage_paths.py`（firm 配下 + レガシーフォールバック）

---

## F. 外部へのデータ送信（第三者漏洩）

| 項目 | 現状 | リスク | 対策 |
|------|------|--------|------|
| **OpenAI / Gemini 分類** | 信頼度低いとき `text_excerpt`（抜粋）のみ送信 | 抜粋に会社名・金額が含まれる可能性 | firm 単位の AI 利用同意・オプトアウト・DPA。送信前マスキング |
| **`frontend/src/app/api/upload/route.ts`** | ✅ 削除済み（未使用の攻撃面） | — | 将来 Drive 連携する場合は認証必須で再実装 |
| **CORS** | localhost のみ許可 | 本番ドメイン未設定 | デプロイ時に本番 origin のみ許可 |
| **HTTPS** | 開発は HTTP | 中間者攻撃 | 本番は TLS 必須 |

---

## G. フロントエンド

| 項目 | 現状 | リスク | 対策 |
|------|------|--------|------|
| 権限チェック `hasPermission` | サーバー permissions 同期あり | 古い localStorage で UI だけ許可表示 | `checkSession` で毎回同期（✅ 一部済） |
| 顧問先フィルタ `canAccessClient` | ✅ `/api/auth/me` の `visible_client_ids` 優先 | 初回ログイン前のみ静的フォールバック | 維持 |
| `localStorage` | ユーザー・トークン・スロットレイアウト | XSS / 端末共有 PC | トークンは Cookie 化。機密は載せない |
| ログイン画面 | デフォルト password 表示 | 誤運用 | 本番ビルドではプレースホルダーのみ |
| firm 表示（NavBar / 設定） | ✅ `firm_label` 表示 | — | 維持 |
| 設定画面のグローバル保存 | ✅ `settings.platform` がある場合のみ保存ボタン有効 | — | 維持 |

---

## H. 運用・監査・コンプライアンス

| 項目 | 現状 | 推奨 |
|------|------|------|
| 拒否ログ | 401/403 を audit に記録 | firm_id 付きで集計可能（✅ 記録側は対応） |
| 成功ログ | 主要操作を記録 | PII・ファイル名の扱いポリシーを決める |
| 業務監査 `review_events` | append-only | エクスポートは client スコープ（✅） |
| スモーク手動確認 | `docs/smoke-checklist.md` 14 項目 | マルチテナント項目を追加（firm 切替・403 確認） |
| 自動テスト | `backend/tests/test_tenancy.py` 等 | T3「全 SQL に firm 条件」を網羅的に拡張 |

---

## I. 本番デプロイ前チェックリスト（必須）

**手順書**: [`production-deployment.md`](production-deployment.md)（フェーズ 1→8）  
**事前検証**: `cd backend && python scripts/validate_production_env.py --env-file .env.production`

```
[ ] DOCUGRID_ENV=production
[ ] DOCUGRID_JWT_SECRET — 32文字以上のランダム値
[ ] DOCUGRID_LOGIN_PASSWORD — デフォルト禁止
[ ] DOCUGRID_ALLOW_HEADER_AUTH=false
[ ] ログインで stakeholder_id をクライアントに選ばせない
[ ] HTTPS + 本番 CORS origin のみ
[ ] storage/ のファイル権限（他ユーザー読取不可）
[ ] audit-events に firm_id フィルタ
[ ] client_master の firm スコープ化（PUT は済、GET は visible のみ）
[x] role-permissions / system-config は platform_admin のみ（`settings.platform`）
[x] 未使用の /api/upload (Google Drive) を削除
[ ] AI 外部送信の利用規約・オプトアウト
[ ] バックアップの暗号化とアクセス制御
```

---

## J. 優先度マトリクス（今のフェーズでやる順）

| 優先 | 項目 | 理由 |
|------|------|------|
| ~~**P0**~~ | ~~ログイン時の stakeholder 任意選択の廃止~~ | ✅ 2026-06-10 |
| **P0** | 本番 auth 設定（JWT / ヘッダ認証 / パスワード） | 偽造・バイパス |
| ~~**P0**~~ | ~~`audit-events` の firm フィルタ~~ | ✅ 2026-06-10 |
| ~~**P1**~~ | ~~`client_master` の firm スコープ~~ | ✅ 2026-06-10 |
| ~~**P1**~~ | ~~フロント `canAccessClient` をサーバー割当に同期~~ | ✅ 2026-06-10 |
| ~~**P1**~~ | ~~`platform_admin` + `settings.platform` でグローバル設定保護~~ | ✅ 2026-06-10 |
| ~~**P1**~~ | ~~`firm_members` + inactive 制御~~ | ✅ 2026-06-10 |
| ~~**P2**~~ | ~~DocuGrid save に slot コンテキスト必須 + `Document.firm_id`~~ | ✅ 2026-06-10 |
| ~~**P2**~~ | ~~AI / system-config の firm 分離~~ | ✅ 2026-06-10 |
| ~~**P2**~~ | ~~JWT を httpOnly Cookie 化~~ | ✅ 2026-06-10（`docugrid_session` httpOnly + `credentials: include`） |
| ~~**P3**~~ | ~~`/files` 本番無効化~~ | ✅ 2026-06-10（`DOCUGRID_ALLOW_LEGACY_FILES`、本番デフォルト off） |
| ~~**P3**~~ | ~~レガシー `storage/versions/` 移行 CLI~~ | ✅ 2026-06-10（`python scripts/migrate_legacy_storage.py`） |
| ~~**P3**~~ | ~~本番 CORS（`DOCUGRID_CORS_ORIGINS`）~~ | ✅ 起動時検証追加 |
| ~~**P3**~~ | ~~CSRF + ログイン rate limit~~ | ✅ 2026-06-10 |
| **P4** | ペルソナ UI Phase 2（所長キュー・担当タスク） | `/api/firm-tasks` 追加済み |
| ~~**P3**~~ | ~~Google Drive upload ルートの削除~~ | ✅ 2026-06-10 |

---

## K. 設計書受け入れ基準との対応

| ID | 基準 | 状態 |
|----|------|------|
| T1 | firm A のトークンで firm B の client / version に必ず 403 | ✅ 主要 API で pytest 担保 |
| T2 | 担当外顧問先は一覧 API が空 | ✅ client-master 等 |
| T3 | 業務 SQL に `firm_id` 条件 | ⚠️ グローバル設定ファイルは firm 分離前 |
| T4 | 拒否は audit_events に firm_id + denied | ✅ 記録・一覧とも firm スコープ |
| T5 | 本番でヘッダ認証・デフォルト JWT 秘密鍵が起動時失敗 | ✅ 実装済み（本番起動確認が必要） |

---

## まとめ

**今のフェーズで効いている対策:** firm 境界付きの顧問先認可、主要 IDOR 修正、版 PDF の firm 配下保存、`client_assignments`、JWT + RBAC、拒否監査、AI キーの GET 非返却。

**本番前に危険な点:** 共有パスワード（本番無効化必須）、AI キー等のグローバル設定ファイルの firm 横断共有、開発用ヘッダ認証、JWT の localStorage 保存。

開発時の手順は [`dev-quickstart.md`](dev-quickstart.md)（Google OAuth 設定なしで起動可能）。

---

## 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-06-10 | 初版（マルチテナント P1.5 途中時点の洗い出し） |
| 2026-06-10 | P0/P1 対応: member_directory、audit-events firm フィルタ、client_master マージ、visible_client_ids |
| 2026-06-10 | platform_admin、`settings.platform`、docugrid save 必須化、Drive upload 削除、設定 UI 権限制御 |
| 2026-06-10 | firm_members DB、inactive ログイン拒否、firm 単位 system-config / AI キー |
