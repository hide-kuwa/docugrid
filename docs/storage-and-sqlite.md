# ストレージと SQLite — 現状と運用見通し

最終更新: 2026-06-17

## 概要

TAXX / DocuGrid のバックエンドは **PostgreSQL 等のサーバー型 RDB は使わず**、`backend/storage/` 配下の **SQLite ファイル（`.db`）と JSON** で永続化している。

- **ORM なし** — Python 標準の `sqlite3` で各 `*_service.py` が SQL を直接実行
- **マイグレーション** — Alembic 等は未導入。起動時の `init_*_db()` で `CREATE TABLE IF NOT EXISTS`、必要に応じて `ALTER TABLE` をベタ書き
- **フロント** — REST API 経由のみ。ブラウザから DB には直接触れない

SSOT のドメイン分割とデータの流れは [`ssot-normalization.md`](ssot-normalization.md) を参照。

```
FastAPI (backend/main.py)
    ↓ 各 services/*.py が sqlite3.connect(...)
backend/storage/
    ├── *.db          … 構造化データ
    ├── client_master.json
    ├── firms/{firm_id}/…  … PDF 実体・事務所設定 JSON
    └── platform/…    … 全体設定
```

起動時の DB 初期化は `backend/main.py` の `_startup_init_db()` が入口。

---

## アクセスパターン

| 項目 | 現状 |
|------|------|
| 接続 | リクエストごとに `with sqlite3.connect(path) as conn:`（短寿命） |
| Row | 一部サービスで `conn.row_factory = sqlite3.Row` |
| 柔軟フィールド | `metadata_json`, `payload_json`, `parsed_json`, `meta_json` 等の TEXT に JSON 格納 |
| テナント | ほぼ全テーブルに `firm_id` + `client_id`（資料系は歴史的に `client_id` のみの列もあり、`firm_id` は ALTER で追加中） |
| バイナリ | DB にはパス・ハッシュのみ。PDF/画像は `storage/{firm_id}/…`（`services/storage_paths.py`） |

コード上の SSOT 一覧: `backend/services/ssot_registry.py`

---

## ファイル一覧

### SSOT（DATA タブ・正規データ）

| ファイル | サービス | 主なテーブル | 用途 |
|----------|----------|--------------|------|
| `client_master.json` | main | — | 顧問先マスタ（profile・変更履歴）。**SQL ではない** |
| `payroll_ledger.db` | `payroll_ledger_service.py` | `payroll_employees`, `withholding_ledger_rows`, `social_insurance_grades`, `marufu_submissions`, `year_end_adjustment_runs` | 給与・源泉徴収 SSOT |
| `client_metrics.db` | `client_metrics_service.py` | `client_metric_facts` | グラフ指標・株価評価前提（`metric_key` × `period_key`） |
| `client_records.db` | `client_records_service.py` | `client_record_items` | 調査・特殊事項・税務アラート（`domain`） |
| `client_calendar.db` | `client_calendar_service.py` | `client_calendar_events` | 経費カレンダー |
| `client_comms.db` | `client_comms_service.py` | `client_comm_threads` | コミュニケーション |
| `client_simulation.db` | `client_simulation_service.py` | `client_simulation_overlays` | グラフ/試算のシミュ値（正規 metrics とは別） |
| `capture_items.db` | `capture_service.py` | `capture_items` | キャプチャ staging |

### DocuGrid（マトリクス・版管理・監査）

| ファイル | 定義場所 | 主なテーブル | 用途 |
|----------|----------|--------------|------|
| `slot_documents.db` | `main.py` | `slot_documents` | マトリクス各スロットの PDF メタ（`client_id` × `period_key` × `slot_id`） |
| `document_versions.db` | `document_version_service.py` | `logical_documents`, `document_versions` | 論理資料と immutable 版 |
| `review_events.db` | `main.py` | `review_events` | レビュー・承認イベント |
| `audit_links.db` | `main.py` | `audit_links` | PDF 監査リンク（座標） |
| `audit_events.db` | `main.py` | `audit_events` | 操作監査ログ |

### 認証・テナンシー・キュー

| ファイル | サービス | 主なテーブル | 用途 |
|----------|----------|--------------|------|
| `firm_members.db` | `firm_members.py` | `firms`, `firm_members` | 事務所・メンバー |
| `client_assignments.db` | `client_assignments.py` | `client_assignments` | メンバー ↔ 顧問先割当 |
| `pending_classify.db` | `pending_classify_service.py` | `pending_classify_items` | OCR 自動振り分け「要確認」キュー |

### その他 JSON（参考）

| パス | 用途 |
|------|------|
| `storage/firms/{firm_id}/local_authoring_templates.json` | 事務所ローカルテンプレ |
| `storage/platform/global_authoring_templates.json` | 全体テンプレ |
| `storage/member_directory.json` | OAuth 連携時のメンバー辞書 |
| `storage/stakeholder_master.json` | スコープ上書き（API 契約参照） |

---

## 代表的なキー設計

```text
firm_id + client_id
    … 顧問先スコープの SSOT 全般

client_id × period_key × slot_id
    … slot_documents（資料充足率の元データ）

employee_id × year_month
    … withholding_ledger_rows（月次源泉）

metric_key × period_key
    … client_metric_facts（例: annual.revenue / R7, M03）

panel_key (charts | valuation)
    … client_simulation_overlays

domain (investigation | special_note | tax_alert)
    … client_record_items
```

**資料充足率**は `client_metrics` ではなく、`slot_documents` と必須カタログから `GET /api/document-status` が読み取り専用で集計する。

---

## SQLite で今後も耐えられるか

### 結論（2026-06 時点）

| フェーズ | SQLite | 理由 |
|----------|--------|------|
| **開発・デモ・単一ノード本番（小規模事務所）** | **十分** | 同時ユーザー数・書き込み頻度が低く、デプロイとバックアップが単純 |
| **社内本番（1 台の API、数十顧問先・数名同時利用）** | **おおむね可** | 読み多・書き少の業務パターンと相性が良い。WAL 有効化とバックアップ手順の整備を推奨 |
| **マルチインスタンス SaaS・高並行書き込み** | **不向き** | 書き込みロック、レプリケーション欠如、ファイル単位バックアップの運用負荷 |
| **OCR/外部連携の大量 ingest** | **要設計** | キュー・バッチを別プロセスに分離しないと API プロセスが DB 待ちになりやすい |

**当面（プロダクト構築・SSOT 整備・単一サーバー運用）では SQLite 継続で問題ない。**  
本番を **複数 API レプリカ** や **高可用性** に寄せるタイミングで PostgreSQL（＋オブジェクトストレージ）への移行を計画するのが現実的。

### SQLite が合っている理由（現アーキテクチャ）

1. **ドメインごとに `.db` が分離** — 給与・metrics・資料などライフサイクルが異なる。1 ファイル障害の影響範囲が限定される。
2. **書き込みは「決定」ボタン中心** — デバウンス自動保存ではなく、ユーザー操作単位の upsert。同時書き込み競合は相対的に少ない。
3. **試算・グラフは読み取り中心** — シミュレーションは別 DB（`client_simulation.db`）に隔離済み。
4. **税理・監査ドメインのデータ量** — 顧問先あたりの行数は通常、SQLite の実用上限（GB 級・百万行級）に遠く及ばない想定。

### 限界・リスク

| リスク | 内容 | 緩和（SQLite 継続時） |
|--------|------|------------------------|
| **書き込み排他** | 同時書き込みは 1 プロセス内でも直列化 | API を 1 インスタンスに限定、または WAL + 書き込みを短トランザクションに |
| **DB ファイルが増殖** | ドメイン別 10+ ファイル | 定期バックアップは `storage/` ディレクトリ単位。将来は論理 DB を 1〜2 ファイルに統合も可 |
| **スキーマ変更が手作業** | `ALTER` のベタ書き、環境差 | 新テーブル追加時は `IF NOT EXISTS` を徹底。本番前にスキーマ diff チェックを CI に載せる余地 |
| **クロスドメイン整合** | DB 間に FK なし | SSOT レジストリと ingest パイプラインで整合をアプリ層で担保（現方針どおり） |
| **セキュリティ** | 平文ファイル | [`security-checklist.md`](security-checklist.md) 記載どおり、本番はディスク暗号化・権限分離。大規模本番ではマネージド DB を推奨 |

### 移行を検討すべきトリガー

次のいずれかが見えたら **PostgreSQL（または Turso/libSQL 等）移行の ADR** を書く。

1. FastAPI を **水平スケール**（複数 uvicorn / コンテナ）する必要が出た
2. **秒間数十件以上** の継続的書き込み（OCR パイプライン、監査ログ、外部 Webhook）
3. **DB 単位のレプリケーション・PITR** が SLA に必須になった
4. **複数ドメインを跨ぐトランザクション**（例: スロット確定と metrics 更新を 1 コミット）が増えた
5. 運用チームが **ファイルベースバックアップ** ではなくマネージド DB の運用を求める

### 推奨ロードマップ（ストレージ）

```text
Phase A（現在〜SSOT 完成）
  SQLite + JSON のまま進める
  → WAL モード検討、storage/ のスナップショットバックアップ手順を dev-quickstart に追記

Phase B（本番単一ノード hardening）
  書き込みパスの短縮、監査・キャプチャの非同期キュー化
  → 依然 SQLite 可。ボトルネック計測を入れる

Phase C（SaaS / 多テナント scale）
  PostgreSQL に集約（ドメイン別 schema または table prefix）
  PDF は S3 / GCS 等のオブジェクトストレージ
  → services 層の SQL をリポジトリ抽象に寄せ、1 ドメインずつ移行

Phase D（任意）
  client_master.json 等の JSON も RDB テーブル化（検索・監査の統一）
```

ドメイン別 `.db` 構成は、Phase C では **テーブル単位で PostgreSQL に取り込みやすい** メリットがある（一括 big-bang 移行を避けられる）。

---

## 開発者向けルール

1. **新ドメインの永続化** — 既存パターンに合わせ `backend/services/{name}_service.py` + `init_{name}_db()` + `storage/{name}.db`。SSOT なら [`ssot-normalization.md`](ssot-normalization.md) のレジストリ表も更新。
2. **新テーブル** — `firm_id` / `client_id` を最初から付ける。JSON カラムはスキーマ進化用に留め、検索キーは列として持つ。
3. **`.db` を git に含めない** — ローカル・CI は API 起動で自動生成。シードはコードまたは JSON シード関数。
4. **本番 PostgreSQL 移行を意識する場合** — SQL を service 内に閉じ、将来 `*_repository.py` に切り出せる粒度に保つ（現時点で ORM 導入は必須ではない）。

---

## 関連ドキュメント

| ドキュメント | 内容 |
|--------------|------|
| [`ssot-normalization.md`](ssot-normalization.md) | ドメイン別 SSOT とデータの流れ |
| [`auth-tenancy-design.md`](auth-tenancy-design.md) | firm / member / assignment の概念 |
| [`security-checklist.md`](security-checklist.md) | 平文 storage のリスクと本番推奨 |
| [`api-contract.md`](api-contract.md) | API と storage パスの対応 |
| [`architecture.md`](architecture.md) | 全体アーキテクチャ |
