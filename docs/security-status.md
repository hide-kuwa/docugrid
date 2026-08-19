# セキュリティ現状とギャップ（2026-07-04）

チーム向けの要約文書。脅威モデル・チェックリストの詳細は [`security-checklist.md`](security-checklist.md)、設計は [`auth-tenancy-design.md`](auth-tenancy-design.md)。

**検証コマンド**

```bash
cd backend && python -m pytest tests/test_security.py -q
cd backend && python scripts/validate_production_env.py --env-file .env.production
```

---

## 1. 30秒で言える「なぜ今安全か」

DocuGrid は **マルチテナント（事務所ごとのデータ分離）** を前提に、**フロントの表示制御は UX のみ**、境界判定は **すべてサーバー** で行う。

- ログイン後の JWT に `firm_id` と権限が入る
- API は毎回「この事務所の、この担当顧問先のデータか」を検証（`backend/services/tenancy.py`）
- 別事務所・担当外・ID だけ知っているアクセスは 403（主要パターンは `tests/test_security.py` で回帰）

**開発環境だけ緩い点:** 共有パスワードログイン、デフォルト JWT 秘密鍵、ヘッダ認証（`X-Docugrid-*`）。本番は `validate_auth_config()` が misconfig で起動失敗させる設計。

---

## 2. 守りの層（実装済みの要点）

| 層 | 内容 | コード |
|----|------|--------|
| 事務所境界 | JWT `firm_id`、一覧 SQL の firm フィルタ、PDF は `storage/{firm_id}/` | `tenancy.py`, `main.py` |
| 顧問先スコープ | `client_assignments` + `authorize_client_access` + **`assignment_role` 上限** | `tenancy.py` |
| IDOR（R1） | resource → client → firm 解決後に認可 | `main.py` 各 ID ルート |
| 認証 | httpOnly Cookie、CSRF、ログイン rate limit、Google OAuth（本番） | `docugrid_auth.py` |
| ファイル取得 | 認証 API 経由のみ。直リンクなし | `GET /api/slots/{id}/file` 等 |
| SQL | 値は `?` プレースホルダ（動的 WHERE の列名はコード固定） | 各 `*_service.py` |
| MCP | ツール呼び出し前にスコープ再確認、本番 JWT/HTTPS 厳格 | `mcp-server/src/guards.ts` |

---

## 3. 古典的 Web 攻撃（SQLi 等）

| 攻撃 | 状態 | 補足 |
|------|------|------|
| SQL インジェクション | 実装あり | プレースホルダ中心。**専用 pytest なし** |
| パストラバーサル | 設計で緩和 | `storage_key` はサーバー生成。レガシー `/files` は `resolve()` で親ディレクトリチェック |
| CSRF | あり | Cookie 認証時 `docugrid_csrf` + `X-CSRF-Token` |
| XSS | 一部 | httpOnly Cookie + React エスケープ。**CSP 未設定** |
| ブルートフォース | 一部 | ログイン IP rate limit。**WAF は本番推奨のみ** |

---

## 4. 保存ファイルへの脅威

詳細: [`file-upload-security.md`](file-upload-security.md)

| 項目 | 状態 |
|------|------|
| ダウンロード前の認可（権限・firm・担当・割当ロール） | ✅ 主要 API |
| 保存パス（UUID・firm 配下・`..` 拒否） | ✅ |
| アップロード PDF 検証（`fitz.open`） | ✅ スロット・版・分類待ち |
| アップロードサイズ上限 | ✅ `DOCUGRID_MAX_UPLOAD_BYTES`（デフォルト 50MiB） |
| SHA-256 記録 | ✅ 版・スロット・キャプチャ |
| ソフト削除 / purge 権限 | ✅ |
| ダウンロード監査 | ✅ `audit_events` |
| AV スキャン / PDF 無害化 | ❌ 方針のみ（`file-upload-security.md` §4） |
| 保管時暗号化（アプリ層） | ❌ インフラ任せ |
| 事務所別 Google Drive ミラー | ✅ スロット（オプション）。戦略は [`google-drive-storage-strategy.md`](google-drive-storage-strategy.md) |
| マイナンバー（特定個人情報） | ✅ SPI 暗号化レーン（Drive/AI 除外・専用権限）。[`my-number-handling.md`](my-number-handling.md) |

---

## 5. 未実装・未完了一覧

凡例: **P0** 本番前必須 / **P1** コードギャップ（早め） / **P2** 強化・運用 / **P3** 将来

### 5.1 コードギャップ

| 優先 | 項目 | 現状 |
|------|------|------|
| ~~**P1**~~ | ~~`assignment_role` 権限連動~~ | ✅ 2026-07-04 |
| ~~**P1**~~ | ~~分類待ちファイル GET の担当チェック~~ | ✅ 2026-07-04 |
| ~~**P1**~~ | ~~分類待ちアップロード PDF 検証~~ | ✅ 2026-07-04 |
| ~~**P2**~~ | ~~アップロードサイズ上限~~ | ✅ `DOCUGRID_MAX_UPLOAD_BYTES`（デフォルト 50MiB） |
| ~~**P2**~~ | ~~`resolve_storage_path` の `..` 拒否~~ | ✅ 2026-07-04 |
| ~~**P2**~~ | ~~メンバー管理 API / UI~~ | ✅ list/invite/patch + 設定画面（ロール・ペルソナ編集） |
| **P2** | firm 単位 RBAC | platform グローバル行列のみ |
| **P2** | DocuGrid `Document.owner_user_id` | 定数のまま |
| **P2** | AV スキャン / PDF 無害化 | なし |
| **P2** | SQLi 専用 pytest | なし |
| **P2** | CSP | 未設定 |
| **P2** | T3「全 SQL に firm 条件」テスト網羅 | 主要 API のみ |
| **P3** | MCP ユーザー単位クォータ / 専用スコープ | §D-3 将来 |
| **P3** | MCP OAuth / デバイスコード | 将来 |

### 5.2 本番運用（検証スクリプトはあるが dev では未適用）

| 優先 | 項目 |
|------|------|
| **P0** | Google OAuth のみ（パスワードログイン off） |
| **P0** | `DOCUGRID_JWT_SECRET` 32 文字以上 |
| **P0** | `DOCUGRID_ALLOW_HEADER_AUTH=false` |
| **P0** | `DOCUGRID_ENV=production` 起動確認（T5） |
| **P0** | `DOCUGRID_CORS_ORIGINS`・HTTPS・Cookie Secure |
| **P0** | `GOOGLE_OAUTH_CLIENT_ID` 実値 |
| **P0** | `member_directory` から dev メール除去 |
| **P0** | `admin@taxx.jp` 恒久 super-admin の本番無効化（本番デフォルト無効 / `DOCUGRID_SUPER_ADMIN_EMAIL`） |
| **P0** | MCP 公開前チェック §D-2（`security-checklist.md`） |

### 5.3 インフラ・データ保管

| 優先 | 項目 |
|------|------|
| **P0** | ディスク / バックアップ暗号化 |
| **P0** | `storage/` ファイル権限（world readable 禁止） |
| **P2** | レガシー `storage/versions/` 完全移行・削除 |
| **P3** | PostgreSQL + オブジェクトストレージ |
| **P3** | AI キーのシークレットマネージャー化 |

### 5.4 ポリシー・監査

| 優先 | 項目 |
|------|------|
| **P2** | AI 外部送信の同意・オプトアウト・送信前マスキング |
| **P2** | 監査ログ `detail` の PII / 保持期間ポリシー |
| **P2** | スモーク手動のマルチテナント項目追加 |
| **P2** | MCP `channel=mcp` の定期レビュー |
| **P3** | 本番ビルドでログイン画面のパスワード UI 非表示 |

### 5.5 フロント（軽微）

| 優先 | 項目 |
|------|------|
| **P3** | 初回ログイン前の `canAccessClient` 静的フォールバック |
| **P3** | `localStorage` にレイアウト等（トークンは載せない） |

---

## 6. 次にやること（推奨順）

作業計画の要約: [`production-go-live-plan.md`](production-go-live-plan.md)

1. **P0** 実ホスト向け `.env.production` に Google Client ID / CORS / HTTPS を入れ、`validate_production_env.py` 通過 + production 起動確認（staging-local は除外）
2. **P2** firm 単位 RBAC（権限行列の事務所オーバーライド）
3. **P2** AV スキャン / PDF 無害化（必要に応じて）
4. **P2** SQLi / ファイル認可の pytest 拡張
5. **P2** CSP 設定

---

## 7. 質問パターン別の短い答え

| 質問 | 答え |
|------|------|
| フロントで隠してるだけ？ | いいえ。API が毎回サーバーで firm・担当を検証し 403 |
| URL の ID を変えたら見れる？ | IDOR 対策済み。resource → client → firm を解決してから認可 |
| 別事務所のデータは？ | JWT `firm_id` + DB/ストレージ分離。pytest で 403 確認 |
| SQL インジェクションは？ | プレースホルダ実装。専用テストは未 |
| 悪意ある PDF は？ | パース検証 + サイズ上限。AV・無害化は未（方針は `file-upload-security.md`） |
| 副担当はアップロードできる？ | `sub`/`readonly` 割当では不可（`assignment_role` 連動済み） |
| 本番に出して大丈夫？ | コア境界は ready 寄り。§5.2 の本番設定・インフラが必須 |
| Drive をストレージにできる？ | 事務所別ミラー実装済み。正式保管庫としての戦略は `google-drive-storage-strategy.md` |

---

## 8. 2026-07-04 コード変更サマリ

| 変更 | ファイル |
|------|----------|
| `assignment_role` 権限上限・`authorize_client_permission` | `services/tenancy.py` |
| `get_assignment_role()` | `services/client_assignments.py` |
| `_require_client_permission()`、顧問先 API への適用 | `main.py` |
| アップロードサイズ上限 | `services/upload_limits.py` |
| `storage_key` の `..` 拒否 | `services/storage_paths.py` |
| セキュリティテスト 5 件追加 | `tests/test_security.py` |

---

## 9. 関連ドキュメント

| 文書 | 用途 |
|------|------|
| [`security-checklist.md`](security-checklist.md) | 脅威モデル・チェックリスト・本番 pre-flight |
| [`auth-tenancy-design.md`](auth-tenancy-design.md) | テナント・認可設計 |
| [`file-upload-security.md`](file-upload-security.md) | ファイル脅威・AV 方針・アップロード検証 |
| [`google-drive-storage-strategy.md`](google-drive-storage-strategy.md) | 事務所別 Drive 戦略 |
| [`production-deployment.md`](production-deployment.md) | 本番デプロイ手順 |
| [`storage-and-sqlite.md`](storage-and-sqlite.md) | ストレージ・SQLite 運用 |
| `backend/tests/test_security.py` | 境界の自動テスト |
| `backend/services/tenancy.py` | 認可の実装中心 |

---

## 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-07-04 | `file-upload-security.md` / `google-drive-storage-strategy.md` 追加。§4 実装状況を更新 |
| 2026-07-04 | §B-2: `assignment_role` 権限連動、分類待ち認可・PDF検証、アップロード上限、storage path 防御 |
| 2026-07-04 | 初版（セキュリティ説明・SQLi/ファイル脅威・ギャップ洗い出しを統合） |
