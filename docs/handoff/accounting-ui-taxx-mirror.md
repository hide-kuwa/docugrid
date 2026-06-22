# DocuGrid 連携メモ（税務会計システム側配置用）

> **配置場所:** [accounting-ui](https://github.com/hide-kuwa/accounting-ui) リポジトリに  
> `docs/docugrid-integration.md` としてコピーし、DocuGrid 側マスターと同期すること。

最終更新: 2026-06-19

## プロダクト名（重要）

| 呼び名 | リポジトリ | 役割 |
|--------|------------|------|
| **DocuGrid** | hide-kuwa/TAXX（本番フォルダ名 `TAXX`） | 資料整理・マトリクス・OCR・監査 |
| **税務会計システム** | **本リポ（accounting-ui）** | 仕訳・試算表・財務諸表・消込 |
| **TAXX** | エコシステム総称 | **ログイン・JWT 発行**・統合ナビ（業務 SSOT は持たない） |

## 認証

- 本番: **TAXX シェル**で1回ログイン → 本リポ API は **TAXX 発行 JWT を検証**（独自の事務所ログインは作らない）
- 詳細: DocuGrid リポ `docs/auth-tenancy-design.md` §11

## 本リポ（税務会計システム）が担うもの

仕訳・試算表・元帳・消込・決算・DMN — **帳簿 SSOT はここが正**

## DocuGrid が担うもの

資料 PDF、顧問先マトリクス、`client_metrics`、給与ハブ、Auto-Vouch

## DocuGrid 側マスター文書

- 命名: `docs/product-naming.md`
- 統合: `docs/ecosystem-accounting-ui-integration.md`
- 連携ポート: `docs/integration-port-catalog.md`
- 拡張性: `docs/extensibility-principles.md`

## 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-06-19 | 初版（旧 accounting-ui-taxx-mirror を命名整理） |
