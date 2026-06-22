# SSOT 正規化 — 基本思想

最終更新: 2026-06-17

## 原則

**すべてのソースは一度正規化ストアに集約し、画面・試算・出力はそのストアから読む。**

```
取り込み (Ingest)  →  正規化 (Normalize)  →  正規 DB (SSOT)  →  反映 (Propagate)
     ↑                      ↑                      ↑                    ↑
  アップロード            クレンジング           単一の正            各タブ・試算・帳票
  OCR / 手入力            マッピング             SQLite / JSON       年末調整・グラフ
  外部連携                優先順位マージ
```

- UI の数字入力は **正規 DB への書き込み** であり、ローカル state やデモ計算の置き換えではない。
- 二次入力フォーム（同じ数字を別画面で再入力）は原則作らない。
- キャプチャ・OCR は **ステージング**（`capture_items`）→ 確定操作で **ドメイン SSOT** へ反映。

詳細な顧客マスタ設計は [`client-data-vision.md`](client-data-vision.md) を参照。

---

## ドメイン別 SSOT レジストリ

| ドメイン | 正規ストア | 主キー例 | 取り込み元 | 主な購読者 |
|----------|------------|----------|------------|------------|
| **顧客マスタ** | `storage/client_master.json` | `client_id` + profile フィールド ID | 手動・OCR（将来） | DATA マスタ、設定、テンプレ変数 |
| **給与・源泉** | `storage/payroll_ledger.db` | `employee_id` × `year_month` | DATA 給与タブ、キャプチャ「源泉台帳へ」 | 年末調整、算定基礎届、源泉徴収簿 |
| **まるふ提出** | `payroll_ledger.db` › `marufu_submissions` | `submission_id` | キャプチャ apply-payroll | 年末調整エンジン |
| **キャプチャ（生）** | `storage/capture_items.db` | `item_id` | `/capture` アップロード | 解析パイプライン（ステージング） |
| **ダッシュボード指標** | `storage/client_metrics.db` | `metric_key` × `period_key` | 手動（CHARTS）、将来: 試算表 OCR | DATA グラフタブ |
| **株価評価前提** | `storage/client_metrics.db` | `valuation.*` / `current` | 手動（VALUATION）、profile シード | DATA 自社株評価タブ |
| **調査・特殊事項** | `storage/client_records.db` | `domain` × `id` | 手動、profile シード | DATA 調査・特殊タブ |
| **経費カレンダー** | `storage/client_calendar.db` | `event_id` | 手動、legacy JSON シード | 進捗タブ、キャプチャ経費突合 |
| **コミュニケーション** | `storage/client_comms.db` | `thread_id` | 手動（COMMS）、将来: Slack/Gmail | DATA コミュニケーションタブ |
| **シミュレーション** | `storage/client_simulation.db` | `panel_key`（charts / valuation） | グラフ・試算 UI の「決定」 | 該当タブのグラフ・試算表示のみ |
| **資料スロット** | `storage/slot_documents.db` | `period_key` × `slot_id` | マトリクス・キャプチャ route | document-status、PDF ビューア |
| **会計帳簿**（計画） | 税務会計システム（外部 SSOT） | `client_id` × 仕訳 ID | handoff / CSV | 試算表・元帳 UI |
| **会計指標投影**（計画） | `storage/client_metrics.db` | `metric_key` × `period_key` | 税務会計システム → handoff metrics | CHARTS、Auto-Vouch |
| **法定基準値** | 共通マスタサービス（外部） | `master_key` × `as_of` | 法令改定 seed・運用投入 | 給与・税計算・会計の税区分計算 |

**法定基準値**（税率・社保料率・控除額・等級表）は業務 SSOT ではなく **参照専用の履歴マスタ**。詳細は [`temporal-master-pattern.md`](temporal-master-pattern.md)。

**資料充足率**（進捗タブ）は `client_metrics` ではなく、上記 **資料スロット** と必須カタログから `GET /api/document-status` で算出する読み取り専用指標。

---

## データの流れ（例）

### 給与

1. 担当者が DATA › 給与で月次台帳に数字入力 → `withholding_ledger_rows` に upsert
2. 算定基礎届・年末調整は **ledger だけ** を読んで試算
3. 「等級を反映」「年末調整を実行」は SSOT を更新したうえで結果を保存

### キャプチャ → 給与

1. アップロード → `capture_items`（`processing`）
2. 数字入力 or 解析 → `metadata`（ステージング、手入力は `manual_hints`）
3. 「源泉台帳へ」→ `marufu_submissions` + 従業員マスタ patch（**給与 SSOT へ確定**）

### グラフ（CHARTS）

1. 正規値は `client_metric_facts` から読み取り（手動・OCR・試算表取込など別経路で更新）
2. グラフタブの「変更」→シミュレーション入力→「決定」は **`client_simulation.db` に保存**（正規 metrics 非更新）
3. 正規と異なる値は `~`＋琥珀の点線下線、グラフ棒は琥珀リングで表示（ホバーで正規値）

### 自社株評価（VALUATION）

1. 前提数値の正規値は `client_metrics`（`valuation.*`）から読み取り
2. シミュレーション値は `client_simulation.db` に保存し、試算結果の表示のみに使用

---

## 実装ルール（開発者向け）

1. **新しい数字を UI に出すとき** — どの SSOT テーブル/キーかを先に決める。
2. **新しい取り込み元** — ingest 関数 → normalize 関数 → SSOT upsert の3段に分ける。
3. **試算エンジン** — SSOT を読むだけ。入力 UI を試算画面に置かない（例外はステージング用キャプチャのみ）。
4. **フロント** — SSOT への書き込みは「変更」→編集→「決定」。グラフ・試算など **シミュレーション UI** は正規値（読取専用）＋シミュレーション値（その画面のみ反映、DB 非保存）。
5. **サービス追加時** — 本ドキュメントのレジストリ表を更新する。
6. **拡張性** — 新ドメインは ingest / SSOT / カタログ / 認証境界を先に決める。[`extensibility-principles.md`](extensibility-principles.md)。
7. **会計データ** — 仕訳・試算表の正は **税務会計システム**（accounting-ui リポ）。DocuGrid は資料・指標・監査のみ SSOT。
8. **法定基準値** — 税率・料率・控除額は共通マスタ（`valid_from` / `valid_to`）。コード直書き禁止。[`temporal-master-pattern.md`](temporal-master-pattern.md)。
9. **システム間連携** — 同じ数字の手入力受け口を複数プロダクトに作らない。API を正経路とし、一覧は [`integration-port-catalog.md`](integration-port-catalog.md)。命名は [`product-naming.md`](product-naming.md)。

---

## 取り込みパイプライン（D1）

スロット PDF 保存時にバックエンドが自動実行:

```
POST /api/slots（または capture → matrix）
  → ssot_ingest.ingest_from_slot_document
  → profile_extractors（slot_id 別ルール）
  → profile_normalize_pipeline（優先順位・履歴・矛盾）
  → client_master.json / client_metrics.db / client_records（矛盾アラート）
  → レスポンス normalize_result + フロント SSOT_PROPAGATE_EVENT
```

| ファイル | 役割 |
|----------|------|
| `backend/services/ssot_ingest.py` | エントリ（PDF テキスト抽出 → normalize） |
| `backend/services/profile_extractors.py` | スロット別フィールド抽出（試算表・決算報告書含む） |
| `profile_normalize_pipeline.py` | マージ・優先順位・metrics 反映（`annual.consumption_taxable`・`valuation.net_assets_yen` 含む） |
| `backend/services/client_master_store.py` | client_master.json の patch |

詳細: [`client-data-vision.md`](client-data-vision.md) §パイプライン

---

## 関連ファイル

| 用途 | パス |
|------|------|
| **ストレージ全体・SQLite 運用見通し** | [`storage-and-sqlite.md`](storage-and-sqlite.md) |
| SSOT レジストリ（コード） | `backend/services/ssot_registry.py` |
| 給与 SSOT | `backend/services/payroll_ledger_service.py` |
| 指標 SSOT | `backend/services/client_metrics_service.py` |
| レコード SSOT | `backend/services/client_records_service.py` |
| カレンダー SSOT | `backend/services/client_calendar_service.py` |
| コミュ SSOT | `backend/services/client_comms_service.py` |
| シミュレーション | `backend/services/client_simulation_service.py` |
| キャプチャ正規化ヘルパ | `backend/services/capture_normalize.py` |
| キャプチャステージング | `backend/services/capture_service.py` |
