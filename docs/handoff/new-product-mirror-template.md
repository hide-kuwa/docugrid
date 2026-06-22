# TAXX エコシステム — 新リポ用ミラーテンプレ

> **使い方:** 新プロダクトリポジトリに `docs/handoff/docugrid-ecosystem-mirror.md` としてコピーし、**太字箇所** を埋める。

最終更新: 2026-06-19

## 本プロダクト

| 項目 | 値 |
|------|-----|
| 呼び名（日本語） | **（例: 固定資産台帳）** |
| スラッグ | **`fixed-assets`** |
| リポジトリ | **（URL）** |
| SSOT | **（自プロダクトが正のデータ）** |

## DocuGrid 側マスター（同期必須）

| 文書 | パス（DocuGrid リポ） |
|------|------------------------|
| 命名 | `docs/product-naming.md` |
| 拡張性 | `docs/extensibility-principles.md` |
| 連携ポート | `docs/integration-port-catalog.md` |
| 新規追加手順 | `docs/new-product-onboarding.md` |
| 認証 | `docs/auth-tenancy-design.md` §11 |

**ルール:** 連携 port や命名を変えたら **DocuGrid 側 doc も同 PR で更新**。

## 認証

- ログインは **TAXX シェル**（DocuGrid リポ `/api/auth/*` が暫定ホスト）
- 本リポ API は JWT 検証のみ（`iss: taxx`, `aud` に自スラッグ, `firm_id` 必須）

## 連携先

| 相手 | port / API |
|------|------------|
| DocuGrid | **（port_id 列挙）** |
| 税務会計システム | **（必要なら）** |

## 変更履歴

| 日付 | 内容 |
|------|------|
| （日付） | 初版 |
