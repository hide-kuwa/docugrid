# DocuGrid 開発ロードマップ

最終更新: 2026-06-02（命名整理 2026-06-19）

> **本リポジトリのプロダクト名は DocuGrid**（資料整理アプリ）。会計・帳簿は別リポ **税務会計システム**（[accounting-ui](https://github.com/hide-kuwa/accounting-ui)）。全体ブランドは **TAXX** → [`product-naming.md`](product-naming.md)

この文書はプロダクトの北極星、フェーズ別の進め方、および **P2 以降のデータモデル（テーブル定義）** をまとめたものです。  
アーキテクチャの現状とターゲットの差分は `docs/architecture.md`、HTTP 契約は `docs/api-contract.md` を参照してください。

---

## 北極星（変更しない前提）

| 側 | 最終形 |
|----|--------|
| **クライアント** | D&D で資料投入するだけ。やることは「不足リスト」で明確 |
| **税理士事務所** | キューを確認・承認するだけ。例外だけ手を入れる |
| **システム** | AIOCR → 自動振り分け → 正規化データ蓄積 → 不足資料検知 |
| **コンプライアンス** | **誰が・いつ・どの版の・どこを見たか**が追記専用で残る。PDF バイナリは **immutable 版** |

エコシステム全体のビジョン・Phase 1–4 の機能計画は [`taxx-ecosystem-development-plan.md`](taxx-ecosystem-development-plan.md) を参照。

---

## 進め方の原則

1. **ランタイムは1本** — 当面は `frontend`（Next.js）+ `backend/main.py` のみ。`backend/core` はデフォルト経路に含めない。
2. **API 契約を先に固定** — エンドポイント追加時は `docs/api-contract.md` を同 PR で更新。
3. **2ストア分離** — PDF 編集（ページ順・マージ・注釈）と証憑メタ（OCR・スロット・ワークフロー）は別レイヤ。フロントは `docugrid-store`（編集）と将来の正規化ストア（証憑）を橋渡しする。
4. **マトリクス思想** — UI・データは「期間 × 枠」のセルと座標で一貫（`docs/docugrid-matrix-model.md`）。**コンフィグ画面まで** メインページのトンマナ・表感を踏襲する（設定だけ別 UI にしない）。
5. **監査はサーバーへ** — フロントのみの履歴（`useAuditWorkflow`）はプロトタイプ。P2 以降の業務イベントは最初から永続化。
6. **日本語 UI の編集** — `MatrixGrid.tsx` 等は `StrReplace` より UTF-8 スクリプト（`frontend/scripts/`）または IDE 直接編集で文字化けを防ぐ。
7. **拡張性優先** — 新機能は境界・契約・SSOT を先に決める。詳細は [`extensibility-principles.md`](extensibility-principles.md)。
8. **ノーコード優先** — 連携・マスタ・マッピングはコンフィグ UI / YAML。コードは最小限。[`no-code-config-vision.md`](no-code-config-vision.md)。

---

## フェーズ一覧

```mermaid
flowchart LR
  P0[P0 操作の完成] --> P1[P1 基盤・認証]
  P1 --> P2[P2 版管理と監査]
  P2 --> P3[P3 OCRと振り分け]
  P3 --> P4[P4 不足資料とタスク]
  P4 --> P5[P5 ダッシュボードと連携]
```

| フェーズ | 期間目安 | ゴール |
|----------|----------|--------|
| **P0** | 1〜2週 | マトリクス → プレビュー/編集 → 保存/再読込 → 出力が信頼できる |
| **P1** | 2〜3週 | 本番向け認証・スコープ・設定・監査閲覧・テストの骨格 |
| **P2** | 3〜4週 | 資料バージョン + 細粒度業務監査（事務所の説明責任） |
| **P3** | 4〜6週 | OCR → メタ → 半自動振り分け |
| **P4** | 3〜4週 | 不足資料エンジン + 双方タスク画面 |
| **P5** | 継続 | ダッシュボード、アラート、TAXX 連携、UI スタック判断 |

**依存:** P0 完了前に OCR 本実装は行わない。P2 完了前に「自動承認」は行わない。

---

## 現状スナップショット（2026-06-10）

| 領域 | 状態 |
|------|------|
| ランタイム | `frontend` + `backend/main.py` |
| 認証 | JWT + httpOnly Cookie + CSRF + ログイン rate limit |
| マルチテナント | firm_id、client_assignments、firm_members、platform_admin |
| ペルソナ UI | `client_accounting` 完了、所長・担当はマトリクス上部パネルのみ。残りは [`persona-ui-roadmap.md`](persona-ui-roadmap.md) で保留 |
| 画面設計 3 層 | platform / firm / member マージ + 設定 UI |
| タスク | `/tasks` + `GET /api/firm-tasks`（担当全体サマリ） |
| テスト | pytest 80+ 件、`tsc --noEmit` |
| 未着手 | 非同期 OCR、**Drive OAuth 連携**（SA 方式は実装済・後回し）、全ペルソナ widget、**書類カタログ横断ビュー**（[`document-catalog-vision.md`](document-catalog-vision.md)） |
| 進行中 | **ひな形エンジン Phase 1**（Global/Local、変数タグ）— [`document-authoring-templates.md`](document-authoring-templates.md) |
| 直近完了 | UI 権限ガード、FeatureTour、AIOCR 薄いスライス（`metadata_json`）、スロット安定 ID |
| UX（要検証） | 消しゴム redaction（backend 実装済み）、枠レイアウト一括スコープ |

---

## P0 — 操作の完成（詳細）

### 目的

デモおよび開発検証で「1 本の PDF をマトリクスに載せ、見て、編集し、必要ならクラウドに保存し、再読込・出力できる」状態を **毎回再現可能** にする。

### UX 仕様（確定）

| 項目 | 仕様 |
|------|------|
| D&D 後 | **フルスクリーンビューアは自動で開かない**。マトリクス上に留まる |
| 通知 | 緑色バナー（`slotNotice`）でスロット名と次アクションを表示。8 秒で自動 dismiss |
| 収納済みスロット | 「収納済み」、ページ数、**プレビュー** / **編集する** ボタン |
| ページ順パネル | デフォルト **折りたたみ**（`pagePanelOpen` 初期 `false`） |
| ビューア preview | 最小 chrome + **編集を開始** で edit モードへ |
| 下部 CTA | **PDF を出力**（マージ API 経由） |
| ビューア起動 | `useViewerUiStore.open("preview" \| "edit", file)` を MatrixGrid から直接呼ぶ（`page.tsx` と同期） |
| モーダル | `ViewerModal` は `document.body` へ portal、`z-index` 高め。`body overflow: hidden` は `isViewerOpen` 時のみ |

### 実装タスク

| ID | タスク | 状態 | 主なファイル / 備考 |
|----|--------|------|---------------------|
| P0.1 | プレビュー/編集の E2E | **要検証** | `MatrixGrid.tsx`, `page.tsx`, `viewer-ui-store.ts`, `features/pdf-viewer/index.tsx` |
| P0.2 | ビューア state の単一経路 | **概ね完了** | `viewer-ui-store` + `page.tsx` の `isViewerOpen` / `viewerSourceFile` |
| P0.3 | D&D でビューア自動オープンしない | **完了** | `onFilesDropped` は `setFile` のみ。`open()` は呼ばない |
| P0.4 | `react-dropzone` を MatrixGrid から除去 | **完了** | ネイティブ `input[type=file]` + drag ハンドラ |
| P0.5 | スロット一般化 | **完了** | 安定 `slot_id`（`slot-ids.ts`）、レガシー数値 ID 正規化 |
| P0.6 | `useSyncDocugrid` を UI に配線 | **概ね完了** | 自動保存・手動保存・`documentId` 表示・スロット復元 |
| P0.7 | スモークチェックリスト更新 | **完了** | `docs/smoke-checklist.md` を現 UX に合わせて更新済み |
| P0.8 | 回帰防止 | **一部** | `backend/tests/`、`npx tsc --noEmit` |

### P0.5 スロット一般化（設計メモ・確定方針）

- スロット定義を **データ駆動** にする（期間インデックス × 年次/月次モード × ラベル配列は既に `MatrixGrid` の `items` に存在）。
- 各スロットに安定 ID を付与: 例 `slot:year:2024:corporate_tax_return`（文字列、URL/DB に保存可能）。
- D&D ターゲットは **ドロップされたスロット index** を `onFilesDropped(files, slotId)` で受け取る（現状は常に index 2 相当の 1 ファイルのみ）。
- スロット ↔ 論理ドキュメントの紐づけは P2 の `matrix_slot_assignments` で行う（P0 では `localStorage` または Zustand の `slotFiles: Record<slotId, FileMeta>` で可）。

### P0 完了条件（出口）

1. `docs/smoke-checklist.md` の手順を非開発者が 10 分以内に再現できる。  
2. マトリクス → プレビュー → 編集開始 → 閉じる → 再プレビューが毎回成功する。  
3. （P0.6 完了後）同一 `documentId` でリロード後にページ順・注釈メタが復元される。

---

## P1 — プラットフォーム基盤（詳細）

### 目的

マルチ顧問先・マルチロール環境で **見えてはいけないものが見えない** こと、および **操作と拒否が監査に残る** ことを API と UI で担保する。

### 認証・認可（確定方針）

| 項目 | 方針 | 現状 |
|------|------|------|
| トークン | JWT（`HS256`）、`sub`=email、`role`、`stid`=stakeholder | `docugrid_auth.create_access_token` 実装済み |
| ログイン | `POST /api/auth/login` → `{ access_token, token_type }` | 実装済み |
| リクエスト解決 | `Authorization: Bearer` 優先 | 実装済み |
| 開発フォールバック | `X-Docugrid-*` ヘッダ（`DOCUGRID_ALLOW_HEADER_AUTH`） | 本番では **false** にする |
| シークレット | `DOCUGRID_JWT_SECRET` 環境変数必須（本番） | デフォルトは dev 用 insecure |
| 権限 | `ROLE_PERMISSIONS`（`main.py`）と endpoint ごとの `_require_permission` | 実装済み |
| 顧問先スコープ | `X-Docugrid-Client` + `_require_client_scope` | マスタは JSON + コード内デフォルトマップ併用 |

### P1 タスク

| ID | タスク | 状態 | 備考 |
|----|--------|------|------|
| P1.1 | フロントを Bearer 優先に統一 | **完了** | ログイン後は Bearer + `X-Docugrid-Client` のみ |
| P1.2 | 本番でヘッダ認証無効化 | **完了** | `DOCUGRID_ENV=production` でデフォルト無効、`validate_auth_config()` |
| P1.3 | スコープをサーバマスタのみから解決 | **完了** | PUT/GET stakeholder-master + 設定 UI |
| P1.4 | 顧客マスタ検証 | **完了** | 重複 ID・空名・決算月 1–12・グループ参照 |
| P1.5 | ステークホルダーマスタ編集 UI | **完了** | 設定 → 担当マスタ |
| P1.6 | ロール権限マッピング管理（admin） | **未着手** | 現状は `ROLE_PERMISSIONS` 固定 |
| P1.7 | `GET /api/audit-events` 閲覧 UI | **完了** | 設定 → 操作履歴 + 業務タイムライン |
| P1.8 | エラー JSON の統一 | **一部** | フロント `parseApiErrorBody()` |
| P1.9 | CI | **完了** | GitHub Actions: pytest + tsc |
| P1.10 | 認証移行の契約メモ | **未着手** | セッション Cookie 案が必要なら ADR。現状は JWT 継続で可 |

### P1.5 — マルチテナント認可（設計優先・**未実装**）

**目的:** 税理士事務所（法人）単位でデータが絶対に混ざらないこと、事務所内で担当者ごとに顧問先を隠せること。

| ID | タスク | 状態 | 備考 |
|----|--------|------|------|
| P1.5.1 | 設計文書の合意 | **ドラフト** | `docs/auth-tenancy-design.md` |
| P1.5.2 | JWT に `firm_id` / `member_id` | 未着手 | |
| P1.5.3 | 全業務テーブル + ストレージに `firm_id` | 未着手 | default firm へ backfill |
| P1.5.4 | `client_assignments` と可視性ポリシー | 未着手 | `scopedClientIds` から移行 |
| P1.5.5 | 中央 `authorize()` + ルール R1（IDOR 修正） | 未着手 | audit-links, docugrid load, `/files` |
| P1.5.6 | `firm_admin` / `platform_admin` 分離 | 未着手 | 現行 `admin` 全社スルーを廃止 |

**出口:** クロステナント拒否の pytest が標準セット。設計は `docs/auth-tenancy-design.md` の受け入れ基準 T1–T5。

### P1 完了条件（出口）

- ロール別に E2E テスト（または手動シート）で期待どおり 403。  
- 拒否イベントが `audit_events` に `result=denied` で残る。  
- 管理者が設定画面から直近の API 監査ログをフィルタ閲覧できる。

### 既存 API 監査（P1 で触らない層）

`audit_events` は **HTTP/API レイヤ** のログ（path, action, result）。  
P2 の `review_events` は **業務レイヤ**（どの版の何ページを見たか）。役割分担を維持する。

---

## P2 — 版管理と業務監査

### 目的

税理士事務所側について **監査の跡が必ず残る** こと、**資料が版管理される** ことをデータモデルと API で保証する。

### 設計不変条件

1. PDF バイナリは **上書きしない**（新イベント = 新 `document_versions` 行 + 新ストレージオブジェクト）。  
2. `review_events` は **追記のみ**（UPDATE/DELETE 禁止。訂正は `type=correction` の新規行）。  
3. 業務イベントには **`version_id` と `content_sha256` を必須**。  
4. 承認・差戻しは **`reason` テキスト必須**。  
5. 既存 `audit_links.version_id` と整合（リンク作成時は対象版を固定）。

### ストレージ配置

| 種別 | パス（案） | 備考 |
|------|------------|------|
| 版バイナリ | `storage/versions/{version_id}.pdf` | または `storage/{client_id}/{logical_document_id}/{version_no}.pdf` |
| DB | `storage/docugrid_audit.db`（新規）または `docugrid.db` にテーブル追加 | MVP の `documents`（ワークスペース）と **別テーブル名** で共存 |

**注意:** 既存 `models/mvp_docugrid.Document` は「編集ワークスペース」用。P2 の `logical_documents` は「税務上の1本の資料」用。統合は P3 以降でブリッジする。

---

### テーブル定義（P2）

#### `clients`（既存マスタの DB 化は P1/P2 境界）

P2 では `client_id TEXT` を外部参照キー相当として扱う（`client_master.json` の id）。  
将来的に RDB マスタへ移行。

---

#### `logical_documents`

税務上の論理資料（例: 「2024年分 法人税申告書」）。

```sql
CREATE TABLE logical_documents (
    id              TEXT PRIMARY KEY,  -- uuid
    client_id       TEXT NOT NULL,
    period_key      TEXT NOT NULL,     -- 例: "2024", "2024-03", "permanent"
    slot_id         TEXT NOT NULL,     -- 例: "year:corporate_tax_return"
    title           TEXT NOT NULL,     -- 表示名（スロットラベルと同期可）
    tax_category    TEXT,              -- 任意: corporate_tax | consumption_tax | ...
    status          TEXT NOT NULL DEFAULT 'empty',
        -- empty | uploaded | processing | review | approved | remanded
    current_version_id TEXT,           -- 最新版 FK（承認済みスナップショットは別途 approved_version_id でも可）
    approved_version_id TEXT,
    created_at      TEXT NOT NULL,     -- ISO8601 UTC
    updated_at      TEXT NOT NULL,
    UNIQUE (client_id, period_key, slot_id)
);

CREATE INDEX idx_logical_documents_client_period
    ON logical_documents (client_id, period_key);
```

---

#### `document_versions`

immutable なファイル版。

```sql
CREATE TABLE document_versions (
    id                  TEXT PRIMARY KEY,  -- uuid
    logical_document_id TEXT NOT NULL REFERENCES logical_documents(id),
    version_major       INTEGER NOT NULL DEFAULT 1,
    version_minor       INTEGER NOT NULL DEFAULT 0,
    version_patch       INTEGER NOT NULL DEFAULT 0,
    version_label       TEXT NOT NULL,     -- 表示用 "v2.0.0"
    storage_key         TEXT NOT NULL,     -- オブジェクトパス
    content_sha256      TEXT NOT NULL,
    byte_size           INTEGER NOT NULL,
    mime_type           TEXT NOT NULL DEFAULT 'application/pdf',
    page_count          INTEGER,
    source              TEXT NOT NULL,
        -- client_upload | firm_upload | ocr_derivative | annotation_export | system
    parent_version_id   TEXT,              -- 派生元（再アップロード・注釈焼き込み）
    created_by_stakeholder_id TEXT,
    created_by_email    TEXT,
    created_at          TEXT NOT NULL,
    metadata_json       TEXT               -- OCR 結果プレースホルダ（P3 で拡張）
);

CREATE INDEX idx_document_versions_logical
    ON document_versions (logical_document_id, created_at DESC);

CREATE UNIQUE INDEX idx_document_versions_label
    ON document_versions (logical_document_id, version_major, version_minor, version_patch);
```

**版番号ルール（`useAuditWorkflow` との対応）**

| イベント | major | minor | patch |
|----------|-------|-------|-------|
| 初回アップロード | 1 | 0 | 0 |
| 監査開始（audit_start） | 2 | 0 | 0 |
| minor（作業保存・差戻し記録等） | — | +1 | 0 |
| major（承認完了） | +1 | 0 | 0 |

---

#### `review_events`

業務監査ログ（閲覧・判断・エクスポート）。

```sql
CREATE TABLE review_events (
    id                  TEXT PRIMARY KEY,
    logical_document_id TEXT NOT NULL,
    version_id          TEXT NOT NULL REFERENCES document_versions(id),
    content_sha256      TEXT NOT NULL,     -- イベント時点の版ハッシュ（改ざん検知）
    event_type          TEXT NOT NULL,
    event_at            TEXT NOT NULL,
    stakeholder_id      TEXT,
    user_email          TEXT NOT NULL,
    role                TEXT,
    client_id           TEXT NOT NULL,
    session_id          TEXT,              -- ビューアセッション UUID
    payload_json        TEXT NOT NULL DEFAULT '{}',
    reason              TEXT,              -- approve / remand / correction 時は NOT NULL 制約をアプリ層で強制
    prev_event_id       TEXT,              -- 任意: チェーン
    created_at          TEXT NOT NULL
);

CREATE INDEX idx_review_events_doc_time
    ON review_events (logical_document_id, event_at DESC);

CREATE INDEX idx_review_events_version
    ON review_events (version_id, event_at DESC);

CREATE INDEX idx_review_events_client
    ON review_events (client_id, event_at DESC);
```

**`event_type` 一覧**

| event_type | 説明 | payload 例 |
|------------|------|------------|
| `upload` | 新版作成 | `{ "filename", "source" }` |
| `viewer_open` | ビューア開始 | `{ "mode": "preview" \| "edit" }` |
| `viewer_close` | ビューア終了 | `{ "duration_ms" }` |
| `page_view` | ページ表示 | `{ "page": 0, "dwell_ms": 1200 }` |
| `annotate` | 注釈操作 | `{ "page", "tool", "bbox" }` |
| `audit_link_create` | 監査リンク | `{ "link_id", "left", "right" }` |
| `workflow_audit_start` | 監査開始 | `{}` |
| `workflow_suspend` | 中断保存 | `{}` |
| `workflow_remand` | 差戻し | `{ "reason" }` — `reason` 列も必須 |
| `workflow_approve` | 承認 | `{ "reason" }` |
| `export_pdf` | PDF 出力 | `{ "merge": true }` |
| `correction` | 訂正（誤記録の補正説明） | `{ "corrects_event_id", "note" }` |

**バッチ送信:** フロントは `page_view` を 5〜10 秒ごと、または `viewer_close` 時に `POST /api/review-events/batch` でまとめて送る。

---

#### `matrix_slot_assignments`（任意・P2 後半）

マトリクス UI 上のスロットと論理資料の対応（期間切替時の再解決用）。

```sql
CREATE TABLE matrix_slot_assignments (
    client_id       TEXT NOT NULL,
    period_key      TEXT NOT NULL,
    slot_id         TEXT NOT NULL,
    logical_document_id TEXT NOT NULL REFERENCES logical_documents(id),
    updated_at      TEXT NOT NULL,
    PRIMARY KEY (client_id, period_key, slot_id)
);
```

---

#### 既存 `audit_links` との関係

現行スキーマ（`backend/main.py`）を維持し、以下を厳格化:

- `version_id` は必ず `document_versions.id` を指す。  
- `created_by` に `stakeholder_id` または email を保存。  
- リンク作成時に `review_events`（`audit_link_create`）を同時 INSERT。

---

### P2 API（案）

| メソッド | パス | 説明 |
|----------|------|------|
| POST | `/api/logical-documents` | 論理資料の upsert（client + period + slot） |
| POST | `/api/logical-documents/{id}/versions` | multipart: PDF → 新版 + `upload` イベント |
| GET | `/api/logical-documents/{id}/versions` | 版一覧 |
| GET | `/api/document-versions/{version_id}/file` | 版 PDF ダウンロード（権限・監査ログ付き） |
| POST | `/api/review-events` | 単一イベント |
| POST | `/api/review-events/batch` | 複数（`page_view` 等） |
| GET | `/api/review-events` | フィルタ: client_id, logical_document_id, version_id, 期間 |
| POST | `/api/logical-documents/{id}/workflow/approve` | 承認（reason 必須）→ major 版 or status 更新 |
| POST | `/api/logical-documents/{id}/workflow/remand` | 差戻し（reason 必須） |

アップロード・ダウンロード時は既存 `_log_audit_event` に加え、必ず `review_events` も書く。

---

### P2 フロントタスク（粒度: ロードマップレベル）

- `useAuditWorkflow` を API 駆動に差し替え（履歴は `GET .../versions` + `GET .../review-events`）。  
- ビューア: open / page change / close でイベント送信。  
- マトリクス: スロットごとに `logical_document_id` を保持。D&D は該当スロットへ `versions` POST。  
- 事務所向けタイムライン UI（顧問先 × 期間）。

### P2 完了条件（出口）

任意の資料について「誰が・いつ・どの版の・どのページまで見て・承認/差戻したか」をエクスポート（CSV/JSON）できる。

---

## P3 — OCR と自動振り分け

- **先にスコープを固定** — OCR から正規化するフィールドは段階的に絞る（振り分け用の薄いメタ → カテゴリ別深い抽出 → ダッシュボード集計）。詳細は `docs/backlog-2026-06-02.md` §3。  
- 抽出スキーマ v1（`ExtractedDocumentMeta`）: スロット候補、カテゴリ、`confidence`、`engine`、`text_excerpt`、`status`。金額・申告期限などは `ocrTarget` / `alertTarget` 付きカテゴリのみフェーズ B 以降。  
- 非同期ジョブ: `processing` → `done` / `failed`（`logical_documents.status` と連動）。  
- OCR 入口: 既存 `backend/PDF/my-pdf-api/api/ocr.py` をサービス境界に統合。  
- アップロード時に `metadata_json` へ結果を格納（`document_versions`）。  
- 振り分け v1: ルールベース + **要確認** キュー（現行 `doc_classifier` / `POST /api/classify`）。人の確定でスロット確定 → `review_events`。  
- 正規化ストア v1: 将来の `IDocuGridItem` 相当（`items[id]`、ステータス `LINKED` / `PENDING`）。Docugrid のページ正規化ストアとは別レイヤ（原則 2 と同じ）。

**出口:** D&D 後、おおむね正しいスロットに入り、グレーのみ事務所が確認する。

---

## P4 — 不足資料とタスク

- 必要書類マスタ（法人形態 × 税目 × 期間）。  
- 充足判定: マスタ − 承認済み `logical_documents` / リンク済み item。  
- クライアント画面:「あと N 点」+ 期限 + D&D 先の明示。  
- 事務所画面: レビューキュー + 不足 + 要確認 + 期限切れ。  
- 通知（任意）: `notification_email_enabled` と連動。

**出口:** 双方がログインすると「今日やること」が 1 画面でわかる。

---

## P5 — ダッシュボード・連携・技術的負債

- 届出アラート（消費税・法人税）、前期比ダッシュボード。  
- TAXX シェル経由で **税務会計システム** と handoff（`docs/ecosystem-accounting-ui-integration.md` §6–7）。
- 連携ポートカタログ（`docs/integration-port-catalog.md`）— 新 handoff はカタログ行追加を PR 条件とする。  
- Next.js 継続 vs Vite 移行の ADR（1 回決定）。  
- Google Drive Webhook（本番連携時。手動アップロードで P4 までは足りる）。

---

## 直近スプリント（2 週間）

### Week 1 — P0 クローズ

1. ビューア E2E 手動確認 + `smoke-checklist.md` 更新  
2. `useSyncDocugrid` を UI 配線（保存・documentId 表示・再読込）  
3. スロット一般化: `onFilesDropped(files, slotIndex)` + `slot_id` 生成

### Week 2 — P1 着手 + P2 DB

1. 監査ログ閲覧 UI（設定）  
2. `DOCUGRID_ALLOW_HEADER_AUTH` 本番方針ドキュメント  
3. `docugrid_audit.db` マイグレーション + `logical_documents` / `document_versions` / `review_events`  
4. `POST .../versions` と `useAuditWorkflow` の最初の API 接続（承認・差戻しのみでも可）

---

## 成功指標

| フェーズ | 測り方 |
|----------|--------|
| P0 | スモーク手順を非開発者が 10 分で再現 |
| P1 | ロール別に 403 が期待通り + `audit_events` に拒否が残る |
| P2 | 版履歴 + 閲覧ログの JSON/CSV エクスポート |
| P3 | サンプル PDF 10 種で 80% 自動スロット |
| P4 | マスタ定義顧問先で不足リストが正しい |
| P5 | 事務所が「確認だけ」で 1 日分キューを処理 |

---

## やらないこと（フェーズガード）

| 禁止 | 理由 |
|------|------|
| P0 未完了で OCR 本実装 | 検証不能 |
| P2 未完了で自動承認 | 監査要件を満たせない |
| `backend/core` をデフォルト経路に含める | ランタイム二重化 |
| P4 前の大規模 Next→Vite 移行 | 機能優先 |

---

## 関連ドキュメント

| ファイル | 内容 |
|----------|------|
| `docs/architecture.md` | ターゲット vs 現行ランタイム、移行フェーズ |
| `docs/api-contract.md` | HTTP 契約（更新必須） |
| `docs/smoke-checklist.md` | 手動スモーク（P0 完了時に同期） |
| `docs/backlog-2026-06-02.md` | 2026-06-02 セッション由来の未完了・設計メモ（注釈・枠編集・OCR 正規化） |
| `docs/auth-tenancy-design.md` | 事務所テナント × 担当者認可の設計（実装前合意用） |
| `docs/docugrid-matrix-model.md` | マトリクス・セル座標・メインページトンマナの基本思想 |
| `docs/client-data-vision.md` | DATA 画面・顧客データ正規化ハブ（自動反映の北極星） |
| `docs/taxx-ecosystem-development-plan.md` | TAXX 次世代税務会計エコシステム開発計画書（Phase 1–4） |
| `docs/extensibility-principles.md` | 拡張性の横断原則・PR チェックリスト |
| `docs/new-product-onboarding.md` | 新プロダクト / 新リポ追加時の引き継ぎ |
| `docs/product-naming.md` | DocuGrid / 税務会計システム / TAXX の命名正本 |
| `docs/ecosystem-accounting-ui-integration.md` | DocuGrid × 税務会計システム連携 |
| `docs/temporal-master-pattern.md` | 法定基準値の完全履歴管理マスタ（Temporal Pattern） |
| `docs/integration-port-catalog.md` | 連携ポート一覧・手入力/API 境界・開発者コンフィグ案 |
| `docs/payroll-withholding-year-end-vision.md` | まるふ・源泉徴収簿・社保源泉・年末調整ビジョン |
| `docs/capture-gallery-ux-vision.md` | ログイン即カメラ・Pinterest 風ギャラリー UX |
| `docs/expense-reimbursement-vision.md` | 営業経費精算（インボイス・カレンダー RAG）ビジョン |
| `docs/tomorrow-tasks.md` | P1 由来タスクのメモ（本 roadmap と重複する場合は本書を優先） |

---

## 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-05-16 | 初版: 北極星、P0–P1 詳細、P2 テーブル/API 定義、P3–P5 概要 |
| 2026-06-02 | P3 正規化スコープの方針追記、`backlog-2026-06-02.md` へのリンク、UX 途中項目 |
| 2026-06-02 | `auth-tenancy-design.md` / `docugrid-matrix-model.md` 追加、P1.5 フェーズ定義 |
| 2026-06-17 | `client-data-vision.md` 追加（DATA 正規化ハブ） |
| 2026-06-17 | 給与源泉・キャプチャギャラリー・営業経費ビジョン文書を追加 |
| 2026-06-19 | `ecosystem-accounting-ui-integration.md` 追加（会計別リポ連携） |
| 2026-06-19 | `temporal-master-pattern.md` 追加（法定マスタ履歴管理） |
| 2026-06-19 | `product-naming.md` — DocuGrid / 税務会計システム / TAXX に呼び名整理 |
| 2026-06-19 | `extensibility-principles.md` — 拡張性横断原則 |
| 2026-06-19 | `new-product-onboarding.md` — 新リポ引き継ぎガイド |
| 2026-06-19 | `no-code-config-vision.md` — ノーコード優先・dev コンフィグ |
