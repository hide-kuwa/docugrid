# ノーコード優先コンフィグ（Config-First / Low-Code）

最終更新: 2026-06-19

**方針:** 連携・マスタ・マッピング・法令値・画面定義など **変更頻度が高いものは UI / YAML で編集** し、**コード変更はアルゴリズム追加・新プロダクト接続・バグ修正に限定** する。

コンフィグ UI は [`docugrid-matrix-model.md`](docugrid-matrix-model.md) §5 の **「第 0 シート」**（`/settings`）を拡張する。別系統の管理画面は作らない。

関連: [`integration-port-catalog.md`](integration-port-catalog.md)、[`temporal-master-pattern.md`](temporal-master-pattern.md)、[`extensibility-principles.md`](extensibility-principles.md)

---

## 1. 3層の編集権限

| 層 | 誰が触る | 例 | 置き場所 |
|----|----------|-----|----------|
| **運用（事務所）** | `firm_admin` / 担当 | 顧問先マスタ、担当割当、書類カテゴリ | `/settings` 既存シート |
| **連携・拡張（開発/導入）** | `platform_admin` / 開発者 | 連携ポート、metric マップ、法定マスタ seed | `/settings/dev/*`（新設） |
| **コード（最低限）** | エンジニア | 新 extractor アルゴリズム、新 API エンドポイント本体 | リポジトリ |

**原則:** 新機能を足すとき **先にコンフィグスキーマ → UI → コードが読む** の順（[`extensibility-principles.md`](extensibility-principles.md) E2）。

---

## 2. コンフィグ vs コード — 境界表

| ノーコード / 低コード（UI・YAML） | コード必須（最小） |
|-----------------------------------|-------------------|
| 連携ポート定義（`port_id`, SSOT, API パス） | handoff **実行エンジン**（初回1本） |
| 指標 ↔ 科目 / スロット **マッピング** | OCR **抽出ロジック**（新書式の初回） |
| 消費税率・控除額・社保料率（Temporal マスタ） | 税額 **計算式**（累進・丸め） |
| 書類カテゴリ・`ocrTarget` フラグ | 分類器の **新カテゴリ型** 追加 |
| 画面設計（Screen Design） | 新 **コンポーネント種別** |
| 顧問先プロフィール項目の表示/必須 | 新 **SSOT テーブル** の初回マイグレーション |
| firm 別ワークフロー ON/OFF | ワークフロー **状態機械** の新ステート |
| 外部連携の URL・有効化・モデル名 | OAuth **初回接続** の SDK 組み込み |

**目標:** 運用・導入で週1回触るものは **100% コンフィグ**。年1回の法令改定は **マスタ UI + seed インポート**。

---

## 3. コンフィグの保存（SSOT）

```
UI（/settings）  →  検証 API  →  コンフィグ SSOT  →  ランタイムが読む
                      ↑
               スキーマバージョン + 監査ログ
```

| コンフィグ種別 | 保存先（現状 / 計画） | 読者 |
|----------------|----------------------|------|
| 事務所・AI・Drive | `firm_settings` / `system-config` API | フロント + backend |
| 顧客・担当・ロール | JSON + SQLite 割当 | 認可 + マトリクス |
| 書類カテゴリ | 設定 + `document_catalog` | 振り分け・スロット |
| 画面設計 | screen-design API | フロント動的レイアウト |
| **連携ポート** | `integration_ports.yaml`（計画） | handoff BFF |
| **metric / 科目マップ** | `metric_account_map.yaml`（計画） | ingest / auto-vouch |
| **法定マスタ** | `legal_master.db`（計画） | 給与・税計算 |
| firm 別上書き | `firm_settings.config_overrides`（計画） | テナント |

コンフィグ変更は **版管理**（`config_version`, `updated_by`, `updated_at`）と **追記監査** を付ける。

---

## 4. 開発用コンフィグ UI（`/settings/dev`）

`platform_admin`（または `settings.platform`）専用。**メインマトリクスと同じトンマナ**（表・シート・セル）。

### 4.1 シート一覧（計画）

| シート ID | 日本語名 | 編集内容 | 対応 doc |
|-----------|----------|----------|----------|
| `dev.ports` | 連携ポート | port 行の追加・SSOT・手入力可否・API | [`integration-port-catalog.md`](integration-port-catalog.md) |
| `dev.metrics` | 指標マップ | `metric_key` ↔ 科目 / スロット / field_id | auto_vouch_fields |
| `dev.legal` | 法定マスタ | 税率・控除の `valid_from` / `valid_to` | [`temporal-master-pattern.md`](temporal-master-pattern.md) |
| `dev.slots` | スロット定義 | 期間種別 × slot_id × 必須フラグ | docugrid-matrix |
| `dev.handoff` | 連携ヘルス | 最終成功・テスト送信・dry-run | integration-port-catalog §5 |
| `dev.products` | エコシステム | 登録プロダクト slug・`aud`・リポ URL | [`product-naming.md`](product-naming.md) |

### 4.2 画面イメージ（連携ポート）

```
/settings/dev/ports
┌────────────────────────────────────────────────────────────┐
│ DEV › 連携ポート          [インポート YAML] [エクスポート]   │
├──────────┬─────────┬──────────┬────────┬───────────────────┤
│ 連携名   │ SSOT    │ 手入力   │ 状態   │ port_id           │
├──────────┼─────────┼──────────┼────────┼───────────────────┤
│ 月次売上 │ DocuGrid│ SSOTのみ │ 🟢     │ docugrid.metrics… │
│ [+ 行]   │         │          │        │                   │
└──────────┴─────────┴──────────┴────────┴───────────────────┘
  行クリック → 右ペイン: API・payload サンプル・[テスト送信]
```

**非開発者向け:** 日本語の連携名と SSOT 列を前面。`port_id` と YAML は「詳細」折りたたみ。

### 4.3 既存 `/settings` との関係

| 既存シート | ノーコード化の方向 |
|------------|-------------------|
| `documents` | スロット・OCR 対象 — そのまま拡張 |
| `integrations` | Drive / AI — 行列表 + ヘルス列 |
| `screens` | Screen Design — 既に低コード |
| `clients` / `stakeholders` | マトリクス — 既に表 UI |

新規 `dev.*` シートは **左ドラムの `DEV` セクション** にまとめ、権限で非表示。

---

## 5. ランタイムの読み方（コード側の約束）

コンフィグ SSOT を読むコードは **薄く** 保つ:

```python
# 例: 連携はカタログ経由のみ
port = integration_registry.get_port("docugrid.metrics.monthly_revenue")
client.post(port.api, json=payload, headers=auth_from_taxx_jwt())
```

| ルール | 意味 |
|--------|------|
| **ハードコード禁止** | URL・マッピング・税率を定数に書かない |
| **キャッシュ + バージョン** | コンフィグ reload は `config_version` 変更で |
| **フォールバック最小** | コンフィグ欠落 = 明示エラー（黙ってデフォルト値） |
| **dry-run** | dev UI から「本番 SSOT に書かず試す」 |

---

## 6. 実装フェーズ

| Phase | 内容 | コード量 |
|-------|------|----------|
| **C0（今）** | ドキュメント正本（本書 + integration-port §4 表） | doc のみ |
| **C1** ✅ | `integration_ports.yaml` + `GET /api/dev/integration-ports` | 小 |
| **C2** ✅ | `/dev/integration-ports` 読み取り専用一覧 | 中 |
| **C3** ✅ | port 行 CRUD + YAML import/export + 検証 | 中 |
| **C4** ✅ | テスト送信・handoff dry-run | 中 |
| **C5** ✅ | 法定マスタ UI + CSV インポート | 大 |
| **C6** ✅ | metric ↔ 科目マップ UI | 中 |

**新プロダクト追加時:** [`new-product-onboarding.md`](new-product-onboarding.md) — **Phase 0 で port 行を dev UI / YAML に追加** してから API 実装。

---

## 7. YAML スキーマたたき台（連携ポート）

```yaml
version: 1
ports:
  - port_id: docugrid.metrics.monthly_revenue
    label_ja: 月次売上 → CHARTS
    ssot_owner: docugrid
    manual_policy: ssot_only  # ssot_only | staging_only | forbidden
    direction: ingress
    api:
      method: POST
      path: /api/handoff/metrics
    idempotency_key_template: "docugrid:{client_id}:{period_key}:revenue"
```

UI 編集 ↔ YAML は **双方向同期**。Git 管理する場合は export を CI で diff。

---

## 8. PR / 運用ルール

- **コンフィグだけで済む変更** — コード PR 不要（YAML / UI 操作 + 監査ログ）
- **新 port 種別** — カタログ + dev UI 先行、handoff コードは2件目以降はテンプレ流用
- **法令改定** — `dev.legal` で seed。アプリ deploy なし（[`temporal-master-pattern.md`](temporal-master-pattern.md)）
- **レビュー** — 非エンジニアは日本語ラベル列のみレビュー可能

---

## 9. 関連ファイル（実装参照）

| 用途 | パス |
|------|------|
| コンフィグ UI 本体 | `frontend/src/app/settings/page.tsx` |
| マトリクス表コンポーネント | `frontend/src/features/settings/`（各 Matrix） |
| 画面設計 | `frontend/src/features/screen-design/` |
| システム設定 API | `backend/main.py` `/api/system-config` |
| 将来: ポートレジストリ | `backend/config/integration_ports.yaml`（未作成） |

---

## 10. 関連ドキュメント

| 文書 | 関係 |
|------|------|
| [`docugrid-matrix-model.md`](docugrid-matrix-model.md) §5 | コンフィグ＝第0シート |
| [`integration-port-catalog.md`](integration-port-catalog.md) | ポート一覧の正本 |
| [`temporal-master-pattern.md`](temporal-master-pattern.md) | 法定値のノーコード改定 |
| [`extensibility-principles.md`](extensibility-principles.md) | 設定とコードの分離 E3 |
| [`new-product-onboarding.md`](new-product-onboarding.md) | 新リポ時の port 先行 |

---

## 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-06-19 | 初版: ノーコード優先方針、dev シート、境界表、フェーズ |
