# 連携ポートカタログ（税務会計システム側配置用）

> **配置場所:** [accounting-ui](https://github.com/hide-kuwa/accounting-ui) に  
> `docs/integration-port-catalog.md` としてコピー。DocuGrid 側マスターと同期。

最終更新: 2026-06-19

## 命名

- **DocuGrid** = 資料整理（相手リポ）
- **税務会計システム** = 本リポ（accounting-ui）
- **TAXX** = 統合ブランド

## 設計方針

- 同じ数字の手入力を DocuGrid と税務会計の両方に作らない
- 帳簿は税務会計 SSOT、指標投影は DocuGrid
- 本番確定は API ファースト

## 正本

DocuGrid リポ `docs/integration-port-catalog.md`  
命名 `docs/product-naming.md`

## 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-06-19 | 命名整理に合わせて更新 |
