# プロダクト命名規約（TAXX エコシステム）

最終更新: 2026-06-19

開発・ドキュメント・連携 API で **呼び名を統一** する。リポジトリ名（フォルダ名）とプロダクト名は別物として扱う。

---

## 1. 三層の名前

| 層 | 呼び名（日本語） | スラッグ | リポジトリ / コードベース | 一言で |
|----|------------------|----------|---------------------------|--------|
| **エコシステム** | TAXX | `taxx` | （単一リポではない） | 税務会計コックピット全体のブランド |
| **資料整理** | **DocuGrid** | `docugrid` | **本リポジトリ**（ローカルフォルダ名 `TAXX` のこと） | 顧問先 × 期間 × 資料マトリクス・PDF・OCR・監査 |
| **会計・税務本体** | **税務会計システム** | `tax-accounting` | [hide-kuwa/accounting-ui](https://github.com/hide-kuwa/accounting-ui) | 仕訳・試算表・財務諸表・消込・決算 |

### やめる呼び方（ドキュメント・会話）

| 誤り | 正しく |
|------|--------|
| 「TAXX リポ」「TAXX 本体」＝今のコード一式 | **DocuGrid**（本リポ） |
| 「TAXX」＝資料マトリクスだけ | **DocuGrid** |
| 「accounting-ui」＝プロダクト名として口頭説明 | **税務会計システム**（リポ名 `accounting-ui` は開発用に残してよい） |
| DocuGrid ＝ TAXX 全体 | DocuGrid は **資料整理アプリ**。全体は **TAXX** |

### ユーザーから見た一体感

ログイン後の **TAXX シェル**（認証・ナビの入口）から、**DocuGrid** タブ（資料）と **税務会計システム** タブ（帳簿）に遷移するイメージ。

---

## 2. TAXX の役割 — 認証シェル（Identity Layer）

**推奨:** TAXX は **ログイン・認証・事務所テナント（`firm_id`）・メンバー権限** の正とし、DocuGrid・税務会計システムは **同じ認証情報を検証して動く**。

| TAXX（認証シェル）が持つ | 各プロダクトが持つ |
|--------------------------|-------------------|
| ログイン UI（Google / メール等） | 業務 API・画面 |
| JWT / セッション発行 | トークン **検証**（必須） |
| `firm_id` / `member_id` / ロール | 自ドメインの SSOT データ |
| 顧問先割当の参照 | `client_id` スコープの強制 |
| 統合ナビ（タブ切替） | handoff・帳簿・資料 |

**やらないこと:** TAXX 認証層に仕訳・PDF・指標の SSOT を置かない（[`auth-tenancy-design.md`](auth-tenancy-design.md) のテナント境界と併用）。

### 移行の現実的な段階

| 段階 | 状態 |
|------|------|
| **今（暫定）** | ログイン UI は **DocuGrid リポ内**（`backend/main.py` の JWT）。実質 TAXX シェルの原型 |
| **中期** | 認証ルートを `taxx-auth` モジュール or サブドメインに切り出し。税務会計は **独自 NextAuth を廃止**し同一 JWT を検証 |
| **本番** | OIDC または共有 Cookie + 各 API が `firm_id` を必須検証。handoff も同一テナントコンテキスト |

詳細: [`auth-tenancy-design.md`](auth-tenancy-design.md) §11  
拡張性: [`extensibility-principles.md`](extensibility-principles.md) §1

---

## 3. ドキュメントでの表記

| 文脈 | 表記 |
|------|------|
| 本リポの機能・API・SSOT | DocuGrid |
| 別リポの仕訳・試算表 | 税務会計システム（初出で `accounting-ui` リポジトリと併記可） |
| 両方を含むビジョン・Phase | TAXX エコシステム |
| 連携カタログの `ssot_owner` | `docugrid` / `tax-accounting` / `legal-master` |
| 旧ドキュメントの `taxx` スラッグ | `docugrid` に読み替え（移行中は併記可） |

---

## 4. 関連ドキュメントの対応

| 旧ファイル名・旧タイトル | 扱い |
|--------------------------|------|
| `ecosystem-accounting-ui-integration.md` | 内容は本命名に合わせて更新。ファイル名は互換のため当面維持（先頭に命名へのリンク） |
| `handoff/accounting-ui-taxx-mirror.md` | 税務会計システム側ミラー。同期時に命名 §1 を転記 |
| `taxx-ecosystem-development-plan.md` | ファイル名は維持（TAXX ＝エコシステム計画書として正しい） |
| `extensibility-principles.md` | **拡張性の横断原則**（全機能の開発デフォルト） |
| `new-product-onboarding.md` | **新リポ追加時の引き継ぎガイド** |
| `no-code-config-vision.md` | **ノーコード優先** — dev コンフィグ・YAML |

---

## 5. 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-06-19 | 初版: DocuGrid / 税務会計システム / TAXX 三層の整理 |
| 2026-06-19 | §2 追加: TAXX ＝認証シェル、各プロダクトはトークン検証 |

