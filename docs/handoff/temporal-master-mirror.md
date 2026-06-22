# 法定マスタ連携メモ（accounting-ui 側配置用）

> **配置場所:** [accounting-ui](https://github.com/hide-kuwa/accounting-ui) に  
> `docs/temporal-master-pattern.md` としてコピーし、TAXX 側  
> [`temporal-master-pattern.md`](../temporal-master-pattern.md) と同期すること。

最終更新: 2026-06-19

## 要点

- 消費税率・社保料率・源泉税額表・控除額など **法令基準値をソースコードにハードコードしない**
- 共通マスタサービス（別リポジトリ推奨）で `valid_from` / `valid_to` により履歴管理
- 計算 API は必ず `as_of` / `transaction_date` を受け取り、当時有効なレコードを返す
- 過去の仕訳・試算・申告の再表示は **最新マスタで上書きしない**（`applied_rates` または `master_version_id` を業務データに保存）

## accounting-ui の責務

| やること | やらないこと |
|----------|--------------|
| 仕訳・税区分計算時に共通マスタ API を `transaction_date` 付きで呼ぶ | 税率定数を `if (date > ...)` で分岐 |
| 確定仕訳に適用マスタのスナップショットを保存 | 過去仕訳の税額を最新税率で自動更新 |
| 消込・請求の税計算で同じ API を使用 | 会計独自の税率テーブルを重複管理 |

## TAXX 側マスター文書

詳細スキーマ・API たたき台・移行フェーズ: TAXX `docs/temporal-master-pattern.md`

## 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-06-19 | 初版（TAXX からミラー） |
