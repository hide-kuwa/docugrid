# ファイルアップロード・保管のセキュリティ

最終更新: 2026-07-04

PDF / 画像アップロード時の脅威と対策、AV スキャン方針。認可・テナント境界は [`security-status.md`](security-status.md)、Drive 連携は [`google-drive-storage-strategy.md`](google-drive-storage-strategy.md)。

---

## 1. 脅威モデル（保存ファイル）

| 脅威 | 例 |
|------|-----|
| 不正取得 | ID を知っていて認可なしで PDF を取る |
| パス操作 | `../../` で他ファイルを読む |
| 悪意ある内容 | マルウェア入り PDF、巨大ファイル DoS |
| 事務所横断 | 別 firm のストレージに触る |
| 保管時漏洩 | サーバー・バックアップ侵害 |

---

## 2. 実装済み対策（2026-07-04）

### アクセス制御

- ファイルは **認証 API 経由のみ**（`GET /api/slots/{id}/file` 等）
- ダウンロード前に **権限 + firm + 担当顧問先**（`authorize_client_permission`）
- **割当ロール**（`main` / `sub` / `reviewer` / `readonly`）で書き込み権限を追加制限

| 割当ロール | 上限（firm ロール権限との積） |
|-----------|------------------------------|
| `main` | 制限なし（firm ロールに従う） |
| `sub` / `reviewer` | 閲覧・注釈・監査リンク。`document.upload` 不可 |
| `readonly` | `document.view` 等の閲覧のみ |

コード: `ASSIGNMENT_ROLE_PERMISSION_CAPS`（`backend/services/tenancy.py`）

### 保存パス

- `storage_key` はサーバー生成: `{firm_id}/versions/{uuid}.pdf`
- `resolve_storage_path()` で `..` および storage 外パスを拒否

### アップロード検証

| チェック | 対象 API |
|----------|----------|
| 空ファイル拒否 | スロット・版・分類待ち・キャプチャ |
| PDF パース（`fitz.open`） | スロット・版・分類待ち |
| MIME ホワイトリスト | キャプチャ（画像 + PDF） |
| サイズ上限 | 全 `_read_upload_content()` 経由 |

**環境変数:** `DOCUGRID_MAX_UPLOAD_BYTES`（デフォルト 52,428,800 = 50 MiB）

### 整合性・監査

- `content_sha256` を DB に記録
- ダウンロードを `audit_events` に記録（`slot.download` / `version.download` 等）
- ソフト削除 / purge は権限付き

### 分類待ちキュー（2026-07-04 修正）

- `GET /api/classify/pending/{id}/file` に担当顧問先チェックを追加
- `POST` に PDF 検証を追加

---

## 3. 未実装・将来

| 項目 | 状態 | 備考 |
|------|------|------|
| AV スキャン | 未 | 下記 §4 参照 |
| PDF 無害化（JS 除去等） | 未 | |
| 保管時暗号化（アプリ層） | 未 | インフラ・ディスク暗号化で緩和 |
| 版 PDF の全面 Drive 同期 | 一部 | スロットのみ `google_drive_file_id` |

---

## 4. AV（マルウェア）スキャン方針

**現状:** PDF として開けるかの検証のみ。マルウェア除去はしていない。

### 一般的な選択肢

| 方式 | 難易度 | 向き |
|------|--------|------|
| **ClamAV（clamd）** 自前 / Docker | 中 | 機密 PDF を外部に出したくない事務所 |
| **スキャン API**（HTTP で clean/infected） | 低〜中 | 実装が早い。DPA・リージョン要確認 |
| **S3 + マルウェアスキャン** | 中〜高 | AWS 前提 |
| **Google Drive 保存** | — | Google 側スキャンの恩恵（完全代替ではない） |

### 推奨の進め方

1. **今:** PDF 検証 + サイズ上限 + 認可（済）
2. **次:** staging で **ClamAV** または **スキャン API** をアップロード直後に同期呼び出し
3. **本番:** Drive を canonical にする事務所は Google スキャン + ポリシー明示

### 挿入イメージ（将来）

```
アップロード受信
  → サイズ・PDF 検証（済）
  → malware_scan(content)  ← 未
  → clean なら storage 保存 + Drive 同期
  → infected なら 422 + audit denied
```

### 注意（説明用）

- AV は **偽陰性・偽陽性** がある。「スキャン済み = 安全」ではない
- 顧問先 PDF を **第三者 API に送る** 場合は DPA・利用規約が必須
- 同期スキャンはアップロード遅延が増える → 非同期キューも検討

---

## 5. テスト

```bash
cd backend && python -m pytest tests/test_security.py -q
```

関連テスト（2026-07-04 追加）:

- `test_readonly_assignment_denies_upload`
- `test_sub_assignment_denies_upload`
- `test_classify_pending_file_requires_client_access`
- `test_classify_pending_rejects_invalid_pdf`
- `test_upload_size_limit_rejected`

---

## 6. 質問パターン別

| 質問 | 答え |
|------|------|
| URL を知れば PDF が取れる？ | いいえ。API が毎回認可。UUID 推測も困難 |
| 悪意ある PDF は？ | パース検証まで。AV は未 |
| 副担当はアップロードできる？ | `sub` / `readonly` 割当では不可（2026-07-04〜） |
| ファイルサイズ制限は？ | デフォルト 50 MiB（`DOCUGRID_MAX_UPLOAD_BYTES`） |

---

## 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-07-04 | 初版（対策一覧・AV 方針・2026-07-04 実装） |
