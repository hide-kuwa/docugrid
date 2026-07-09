# 事務所別 Google Drive ストレージ戦略

最終更新: 2026-07-04

税理士事務所ごとに Google Drive を「正式保管庫」として使い、DocuGrid は認可付きの索引・キャッシュ層とする方針の整理。実装の中心は `backend/services/slot_drive_sync.py`、`drive.py`、`drive_context.py`。

関連: [`security-status.md`](security-status.md)、[`storage-and-sqlite.md`](storage-and-sqlite.md)、[`roadmap.md`](roadmap.md)

---

## 1. 結論（30秒）

| やること | やらないこと |
|----------|--------------|
| 事務所ごとに **共有ドライブ + ルートフォルダ ID** を分ける | Drive の共有 URL をアプリの主経路にする |
| PDF 実体を Drive に **ミラー / バックアップ** | Drive だけを唯一のストレージにする（API・版管理が重い） |
| DB に `google_drive_file_id` を保持 | 認可を Drive の共有設定に任せる |
| アップロード・ダウンロードは **DocuGrid API 経由** | 顧問先にルート Drive への直接編集権限 |

---

## 2. いまの実装（ハイブリッド）

```
アップロード
  → 認可（tenancy.py）
  → ローカル storage/{firm_id}/versions/  （Hot・編集・OCR向き）
  → オプション: maybe_upload_slot_to_drive()  （Drive ミラー）

ダウンロード
  → 認可
  → ローカルファイルがあれば返す
  → なければ google_drive_file_id で fetch_slot_from_drive()
```

### 事務所別設定

| 項目 | パス / 設定 |
|------|-------------|
| サービスアカウント JSON | `storage/firms/{firm_id}/drive_credentials.json` |
| 連携 ON/OFF | `system_config.json` の `google_drive_connected` |
| ルートフォルダ | `drive_root_folder_id`（共有ドライブ内フォルダ ID） |
| 接続テスト | `POST /api/drive/test`（Settings → 外部連携） |

### Drive 上のフォルダ構造

```
{drive_root_folder_id}/
  TAXX/                          # 製品フォルダ（将来 DocuGrid にリネーム可）
    {client_id}/
      {period_key}/
        {client_id}_{period}_{slot_label}.pdf
```

コード: `build_drive_folder_segments()` / `build_drive_slot_filename()`（`drive_context.py`）

### 認証方式

| 方式 | 状態 | 用途 |
|------|------|------|
| **サービスアカウント（SA）** | 実装済み | サーバー同期・バックアップ |
| **OAuth（所長の Google）** | roadmap 未着手 | 「うちの Drive に接続」UX |

本番は **Google Workspace の共有ドライブ** を事務所ごとに用意し、SA をその共有ドライブのメンバー（コンテンツ管理者等）に追加する運用が定番。

---

## 3. 推奨アーキテクチャ（3層）

| 層 | 役割 | 現状 |
|----|------|------|
| **Hot** | ローカル `storage/{firm_id}/` — プレビュー・版管理・OCR | 主アクセス経路 |
| **Canonical** | 事務所の Google Drive — 正式保管・DR・所内 Drive UI からの閲覧 | ミラー + フォールバック |
| **Cold** | 古い版は Drive のみ、ローカル TTL 削除 | 未実装（将来） |

**原則:** DocuGrid の SQLite / JSON が **索引と認可の正**。Drive はバイナリ実体の置き場。

---

## 4. Drive を「うまく使う」パターン

### A. バックアップ / ディザスタリカバリ（いま近い）

- アップロードのたびに Drive へ同期
- サーバー障害時も `google_drive_file_id` から復元可能
- **次の改善:** 同期失敗を警告ログだけでなく運用アラートに

### B. 顧問先インボックス（将来・現場ニーズ大）

- Drive 上に顧問先ごとの `inbox/` フォルダ
- 顧問先が PDF をドロップ → DocuGrid が取り込み → 分類待ちキュー
- 「メール添付ではなく Drive に置いてください」が通りやすい

### C. 顧問先への返却フォルダ

- 承認・共有済み PDF を `client_shared/` 配下に配置
- 顧問先 Google アカウントに **フォルダ単位・閲覧のみ** 共有
- DocuGrid クライアントポータルと併用可

### D. 所内オペレーション

- 所長・パートナーが Drive UI からも資料を確認できる escape hatch
- DocuGrid 外の閲覧は **Drive 共有範囲** に限定（全顧問先ルートは開かない）

### E. マルウェアスキャンの一部代替

- Google Drive に保存されたファイルは **Google 側のスキャン** の対象になり得る（Workspace 機能）
- 自前 ClamAV の優先度を下げられる場合がある（完全代替ではない）

---

## 5. Drive を唯一のストレージにしない理由

| 課題 | 内容 |
|------|------|
| レイテンシ | プレビュー・監査のたびに Drive API |
| クォータ | API 呼び出し上限 |
| 版管理 | immutable 版はローカル + DB で設計済み |
| 認可 | Drive 共有の誤設定 = DocuGrid 外からの漏洩 |
| 開発 | ローカル `storage/` がないと dev が重い |

---

## 6. セキュリティ上の注意

1. **firm ごとに `drive_root_folder_id` を分離** — 他事務所のフォルダ ID を設定できない UI/API を維持
2. **SA キーは `storage/firms/{firm_id}/`** — git に含めない
3. **ダウンロードは API 経由** — Drive 直リンクをユーザーに配らない
4. **共有ドライブメンバー管理** — 退職者・不要 SA の定期棚卸し
5. **DPA** — 顧問先 PDF が Google クラウドに置かれることを利用規約で明示

---

## 7. ロードマップ（推奨順）

| 優先 | 項目 |
|------|------|
| P1 | 共有ドライブ + firm ごとルートの **運用手順書**（本番チェックリスト） |
| P2 | スロット PDF の Drive 同期失敗を監視（必須化の検討） |
| P2 | `document_versions` の版 PDF にも `google_drive_file_id` を保存 |
| P3 | 顧問先 inbox → 分類待ちキュー |
| P3 | OAuth 連携（SA 以外の接続 UX） |
| P3 | Drive Webhook / Changes API による取り込み |

---

## 8. コード参照

| モジュール | 役割 |
|-----------|------|
| `services/drive.py` | Drive API ラッパ（upload / download / folder） |
| `services/drive_context.py` | firm 別クレデンシャル・パス構築 |
| `services/slot_drive_sync.py` | スロット PDF の upload / fetch |
| `services/firm_settings.py` | `drive_credentials_path()` |
| `main.py` | `/api/drive/*`、スロット保存時の `maybe_upload_slot_to_drive` |

---

## 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-07-04 | 初版（事務所別 Drive 戦略・現実装・将来パターン） |
