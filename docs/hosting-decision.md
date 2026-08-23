# ホスティング方針メモ（②）

最終更新: 2026-06-27  
**ドメインは取得済み。** 以下の `YOUR_DOMAIN` を実際のドメインに置き換えて保存してください。

---

## 3行で決める（コピーして編集）

```
フロント: Vercel（Next.js）          → https://app.YOUR_DOMAIN
API:      VPS + Docker（永続 storage）→ https://api.YOUR_DOMAIN
DNS:      app → Vercel / api → VPS の A レコード（または CNAME）
```

### 記入例（taxx.jp）

| 項目 | 決定内容 | メモ |
|------|----------|------|
| ルートドメイン | `taxx.jp` | 取得済み |
| フロント URL | `https://app.taxx.jp` | Vercel にデプロイ |
| API URL | `https://api.taxx.jp` | Render または VPS + Docker |
| VPS 候補 | Render（`render.yaml`）または ConoHa / さくら 等 | API は永続 disk 必須 |
| TLS | Vercel 自動 + Render 自動（または VPS は Caddy） | |

---

## なぜこの分け方か

| 部分 | 置き場所 | 理由 |
|------|----------|------|
| 画面（Next.js） | **Vercel** | 設定が簡単・HTTPS 自動・Next.js 向き |
| API + データ | **VPS + Docker** | PDF / SQLite / JSON が **消えないディスク** に必要 |

API を Vercel だけに載せられないのは、`backend/storage/` が永続ボリューム必須だからです（[`production-deployment.md`](production-deployment.md) §1）。

Vercel をブラウザ入口の中継層として使う場合の注意点は [`vercel-render-proxy-pattern.md`](vercel-render-proxy-pattern.md) にまとめています。

---

## DNS の向け方（イメージ）

| 名前 | 種類 | 向き先 |
|------|------|--------|
| `app` | CNAME | Vercel が案内する値（例: `cname.vercel-dns.com`） |
| `api` | A | VPS のグローバル IP |

Vercel でカスタムドメインを追加すると、DNS の設定値が表示されます。

---

## 本番 env に反映するとき（③以降）

ドメインが決まったら:

```bash
npm run bootstrap:production -- --domain app.taxx.jp --api-domain api.taxx.jp --strip-dev-emails
npm run validate:production
```

生成される主な値:

- `DOCUGRID_CORS_ORIGINS=https://app.taxx.jp`
- `DOCUGRID_FRONTEND_URL=https://app.taxx.jp`
- `NEXT_PUBLIC_API_BASE=https://api.taxx.jp/api`
- Google OAuth「承認済み JavaScript 生成元」に `https://app.taxx.jp`

Moneytree 本番連携時は追加:

- `MONEYTREE_LINK_REDIRECT_URI=https://api.YOUR_DOMAIN/api/integrations/moneytree/callback`

---

## 出口チェック（デプロイ前に全部 ✓）

- [ ] `YOUR_DOMAIN` をこのファイルに実ドメインで記入した
- [ ] VPS を 1 台契約した（または契約予定日を決めた）
- [ ] `app` / `api` の DNS を向けた
- [ ] `bootstrap:production` を実ドメインで実行した
- [ ] [`production-smoke-checklist.md`](production-smoke-checklist.md) を本番 URL で実施

---

## まだ決めなくていいこと

- Stripe Webhook（公開 API URL ができてから）
- Moneytree 本番 client_id（契約後）
- フロントを Vercel 以外に載せるか（最初は Vercel 推奨で十分）

---

## AI 検索・MCP（次章）

ホストが固まったあとの OCR → RAG → MCP の実装順は [`future-plan-ocr-rag-mcp.md`](future-plan-ocr-rag-mcp.md) を正本とする。
