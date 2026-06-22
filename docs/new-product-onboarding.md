# 新プロダクト追加 — 引き継ぎガイド

最終更新: 2026-06-19

**別リポジトリで新しいシステム（モジュール）を作るとき**、TAXX エコシステムの設計・命名・連携をどう引き継ぐかをまとめる。

正本は DocuGrid リポの `docs/`。新リポにも **ミラー doc** を置き、双方向で同期する。

---

## 1. 最初に決めること（3問）

| 問い | 選び方 |
|------|--------|
| **新リポにする？** | 帳簿級の独立 SSOT・別リリース周期 → **別リポ**（税務会計システムと同型） |
| **DocuGrid に足す？** | 資料・OCR・指標・監査に近い → **本リポ**（ingest / SSOT 拡張） |
| **横断基盤だけ？** | 税率・認証のみ → **共通サービス**（法定マスタ / TAXX 認証） |

```
新機能のアイデア
    │
    ├─ 資料・PDF・マトリクス・監査？ ──→ DocuGrid（本リポ）に追加
    ├─ 仕訳・試算表・消込・決算？   ──→ 税務会計システム側
    ├─ 税率・控除・社保料率？       ──→ 法定マスタ（Temporal）
    └─ 固定資産・経費・法定調書…？  ──→ 新リポ（下記チェックリスト）
```

---

## 2. 引き継ぎパック（新リポに持っていくもの）

### 2.1 DocuGrid リポからコピーする doc

| コピー元（DocuGrid `docs/`） | 新リポでの置き場所（例） | 内容 |
|------------------------------|--------------------------|------|
| [`product-naming.md`](product-naming.md) §1–§2 | `docs/taxx-ecosystem-naming.md` | 三層命名 + **自プロダクト1行を追記** |
| [`extensibility-principles.md`](extensibility-principles.md) | 同 path または要約リンク | 拡張性 E1–E6（全文コピー or URL 参照） |
| [`integration-port-catalog.md`](integration-port-catalog.md) §1–§3 | `docs/integration-port-catalog.md` | ポート定義 + **自プロダクト行を追記** |
| [`auth-tenancy-design.md`](auth-tenancy-design.md) §11 | `docs/taxx-auth.md` | TAXX JWT 検証・`firm_id` |
| [`ecosystem-accounting-ui-integration.md`](ecosystem-accounting-ui-integration.md) | `docs/docugrid-integration.md` | handoff たたき台（**双方向の相手方 doc**） |
| [`handoff/accounting-ui-taxx-mirror.md`](handoff/accounting-ui-taxx-mirror.md) | テンプレとして `docs/handoff/README.md` | ミラーの書き方 |

**コピーではなくリンクだけでも可** — ただし **自プロダクトの port 行・命名行は新リポ側にも必ず書く**（DocuGrid 側カタログと同期）。

### 2.2 DocuGrid リポ側で必ず更新する doc

新プロダクトを足したら **DocuGrid リポ** で以下を同 PR / 同タイミングで更新:

| 更新ファイル | 追記内容 |
|--------------|----------|
| [`product-naming.md`](product-naming.md) §1 表 | 呼び名・スラッグ・リポ URL |
| [`integration-port-catalog.md`](integration-port-catalog.md) §4 | 連携ポート行（ingress/egress） |
| [`ssot-normalization.md`](ssot-normalization.md) レジストリ | SSOT 所有者が DocuGrid 外なら「外部」と明記 |
| [`ecosystem-accounting-ui-integration.md`](ecosystem-accounting-ui-integration.md) または successor | handoff API 章 |
| [`extensibility-principles.md`](extensibility-principles.md) §3 | 必要なら例を1行追加 |

---

## 3. 実装チェックリスト（新リポ・開発者向け）

### Phase 0 — 設計（コードを書く前）

- [ ] プロダクト名（日本語）・スラッグ（例 `fixed-assets`）を決定
- [ ] **SSOT 所有者** — このプロダクトが正のデータは何か（1リスト）
- [ ] DocuGrid / 税務会計 **どちらと handoff するか** を列挙
- [ ] [`integration-port-catalog.md`](integration-port-catalog.md) に port 行を **DocuGrid 側に先に** 追加
- [ ] 独自ログインを作らない — **TAXX JWT 検証のみ**（[`auth-tenancy-design.md`](auth-tenancy-design.md) §11）

### Phase 1 — 認証・テナント

- [ ] `Authorization: Bearer` で JWT 受信
- [ ] `firm_id` / `member_id` を検証（`iss: taxx`, `aud` に自スラッグ）
- [ ] 全業務テーブルに `firm_id`（NOT NULL）
- [ ] `client_id` 指定 API は割当チェック
- [ ] 403 / 監査ログの型を DocuGrid と揃える（可能なら）

### Phase 2 — データ・API

- [ ] 自 SSOT の DB / ストアを独立（他プロダクトのテーブルに書かない）
- [ ] 公開 API を `docs/api-contract.md` 相当に文書化
- [ ] handoff 受信: `idempotency_key` + `source.system` + `client_id` + `period_key`
- [ ] handoff 送信: 相手 port_id をカタログ参照
- [ ] 法定値は **コード直書きしない** — [`temporal-master-pattern.md`](temporal-master-pattern.md)

### Phase 3 — UX（TAXX 一体感）

- [ ] TAXX シェルから iframe / サブパス / リンクで開ける
- [ ] 顧問先・期間コンテキストを URL または JWT と一致
- [ ] 自プロダクト内の手入力と、他プロダクトの **同義フィールドを二重に作らない**

### Phase 4 — 運用

- [ ] DocuGrid `docs/handoff/` にミラー doc を追加（または新リポ `docs/handoff/docugrid-mirror.md`）
- [ ] `/dev/integration-ports` に載る port_id を確定
- [ ] 受け入れテスト: T6–T8（[`auth-tenancy-design.md`](auth-tenancy-design.md) §11.6）+ 自プロダクト固有

---

## 4. 税務会計システムをテンプレにする

2本目のプロダクトとして **税務会計システム（accounting-ui）** が既にある。新規は同じ型に揃える。

| 項目 | 税務会計（既存） | 新プロダクト（やること） |
|------|------------------|--------------------------|
| リポ | 別 GitHub リポ | 別リポ推奨 |
| SSOT | 仕訳・試算表 | 自ドメインを1つに決める |
| ログイン | 将来 TAXX JWT のみ | 最初から JWT 検証を実装 |
| DocuGrid 連携 | CSV / handoff API | カタログに port 追加 |
| ミラー doc | `handoff/accounting-ui-taxx-mirror.md` | 同様の双方向メモ |

参照: [`ecosystem-accounting-ui-integration.md`](ecosystem-accounting-ui-integration.md)

---

## 5. 最小 handoff 契約（コピペ用）

新リポの README または `docs/handoff-v0.md` に置く。

```yaml
product:
  name_ja: "（例）固定資産台帳"
  slug: fixed-assets
  ssot_owner: fixed-assets
  repo: https://github.com/...

auth:
  issuer: taxx
  audience: [fixed-assets]
  required_claims: [firm_id, member_id, sub]

ports:
  - port_id: fixed-assets.register.ingress
    direction: ingress
    from: docugrid
    api: POST /api/v1/handoff/fixed-assets
  - port_id: docugrid.metrics.depreciation
    direction: egress
    to: docugrid
    api: POST /api/handoff/metrics  # DocuGrid 側

tenancy:
  client_id_header: X-Taxx-Client-Id
  firm_from_jwt: firm_id
```

実装前に DocuGrid 側 [`integration-port-catalog.md`](integration-port-catalog.md) §4 の表と **同内容** になるよう揃える。

---

## 6. よくある質問

### Q. DocuGrid リポを fork すればいい？

**A.** 資料整理までなら DocuGrid 内拡張。帳簿・業務 SSOT が別なら **空リポ + 上記チェックリスト** がよい。`backend/core` のように DocuGrid にコピーして二重化しない。

### Q. 認証サーバーはいつ独立する？

**A.** プロダクトが2つ動いていれば DocuGrid 内 `/api/auth/*` が TAXX シェル原型で足りる。3つ目以降 or 別デプロイが増えたら `taxx-auth` 切り出し（[`product-naming.md`](product-naming.md) §2）。

### Q. ドキュメントだけ更新してコードは後でもいい？

**A.** **Phase 0（命名・SSOT・port 行）だけは先に doc** が正解。handoff コード無しで port 行がある状態が、拡張性の核。

### Q. 誰が DocuGrid 側 doc を更新する？

**A.** 新プロダクトの **最初の PR** に DocuGrid リポへの doc PR をセットで出す（または同リポに monorepo 的 `docs/ecosystem/` を置く運用を後日 ADR）。

---

## 7. 関連ドキュメント（読む順）

1. [`product-naming.md`](product-naming.md) — 名前と TAXX 認証の位置づけ  
2. [`extensibility-principles.md`](extensibility-principles.md) — 開発デフォルト  
3. [`integration-port-catalog.md`](integration-port-catalog.md) — 受け口一覧  
4. [`auth-tenancy-design.md`](auth-tenancy-design.md) — テナント・JWT  
5. [`ssot-normalization.md`](ssot-normalization.md) — データの正  
6. [`temporal-master-pattern.md`](temporal-master-pattern.md) — 法令値  
7. [`ecosystem-accounting-ui-integration.md`](ecosystem-accounting-ui-integration.md) — 既存2プロダクト連携の実例  

---

## 8. 新リポ用ミラーテンプレ

新リポに `docs/handoff/docugrid-ecosystem-mirror.md` として配置:

```markdown
# TAXX エコシステム連携（本リポ配置用）

- 命名・認証・拡張性の正本: DocuGrid リポ `docs/product-naming.md` 他
- 本プロダクト slug: （記入）
- 連携ポート: DocuGrid `docs/integration-port-catalog.md` §4 と同期
- 変更時: DocuGrid 側カタログを同時更新すること
```

---

## 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-06-19 | 初版: 引き継ぎパック、チェックリスト、handoff 最小 YAML、FAQ |
