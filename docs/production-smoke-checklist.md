# 本番スモークチェック

[`smoke-checklist.md`](smoke-checklist.md)（開発・パスワードログイン向け）に加え、**本番 URL + Google SSO** で確認する項目です。

## 前提

- API: `https://api.example.com` — `GET /health` → `{"status":"ok"}`
- フロント: `https://app.example.com`
- `NEXT_PUBLIC_API_BASE=https://api.example.com/api`
- テスト用 Google アカウントが `member_directory.json` に登録済み
- [`production-deployment.md`](production-deployment.md) フェーズ 1–5 完了

## デプロイ前（自動）

```bash
npm run test
cd backend && python scripts/validate_production_env.py --env-file .env.production
```

## チェックリスト

### 認証

1. **Google ログイン**  
   - `/login` で Google ボタン → 登録済みアカウントでログインできる  
   - 未登録アカウントは拒否（403 相当のメッセージ）

2. **パスワードログイン不可**  
   - 本番ビルドで開発用パスワード欄が出ない、または利用できない

3. **セッション維持**  
   - リロード後もログイン状態が維持される（httpOnly Cookie）

4. **ログアウト**  
   - ログアウト後、保護 API が 401

### マルチテナント・権限

5. **担当外顧問先**  
   - 権限のない `client_id` の API が 403

6. **監査**  
   - 拒否操作が設定 → 操作履歴に残る（可能なら）

### コア機能

7. **PDF アップロード**  
   - スロットへドロップ → 保存 → プレビュー表示

8. **版・監査**  
   - 注釈後の版更新、監査タイムライン表示（開発スモークと同様）

### 課金（Stripe 有効時のみ）

9. **課金ステータス**  
   - 設定 → 課金タブが開き、プラン情報が表示される

10. **Checkout（テストカード or 本番小額）**  
    - Checkout 完了後、ステータスが `active` 等に更新

11. **Webhook**  
    - Stripe Dashboard で直近イベントが成功

### AI（有効時のみ）

12. **システム設定**  
    - API キー設定後、分類/OCR が動く

13. **従量課金同意**  
    - 設定 → 課金で paygo 同意フロー

## 記録

| 日付 | 環境 URL | 実施者 | 結果 |
|------|----------|--------|------|
| | | | |
