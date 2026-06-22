# ペルソナ別 UI 設計（画面差し替えの土台）

最終更新: 2026-06-10

## 目的

税理士事務所・クライアント・外部機関など、**見るべき情報と操作が根本的に違うユーザー**ごとに、ホーム画面とナビを差し替える。

- **RBAC（`AppRole`）** … できる操作（権限）
- **ペルソナ（`PersonaId`）** … 見せる画面・導線（UX）

## ペルソナ一覧

| PersonaId | ラベル | シェル | ホーム |
|-----------|--------|--------|--------|
| `firm_director` | 税理士事務所・所長 | matrix | `/` |
| `firm_staff_main` | 担当スタッフ | matrix | `/` |
| `firm_staff_support` | 補佐スタッフ | matrix | `/` |
| `client_accounting` | クライアント・担当経理 | workspace | `/workspace/client_accounting` |
| `client_executive` | クライアント・社長 | workspace | `/workspace/client_executive` |
| `client_sales_expense` | クライアント・営業 | workspace | `/workspace/client_sales_expense` |
| `client_controller` | クライアント・管理会計 | workspace | `/workspace/client_controller` |
| `bank` | 銀行 | workspace | `/workspace/bank` |
| `tax_office` | 税務署 | workspace | `/workspace/tax_office` |
| `platform_admin` | プラットフォーム管理者 | matrix | `/` |

## 画面設計の3層（非エンジニア向けカスタマイズ）

```
プラットフォーム全体デフォルト → 事務所ごと → 自分専用 → 表示
```

詳細: [`screen-design-guide.md`](screen-design-guide.md)

| 層 | API |
|----|-----|
| 合成結果 | `GET /api/screen-design/resolved` |
| 編集用 | `GET /api/screen-design/editor` |
| 保存 | `PUT /api/screen-design/{platform\|firm\|member}` |

## 実装の置き場所

| 層 | ファイル |
|----|----------|
| 定義（フロント） | `frontend/src/config/personas.ts` |
| 画面設計型 | `frontend/src/config/screen-design-types.ts` |
| 解決ロジック | `frontend/src/lib/persona.ts` |
| プレースホルダー UI | `frontend/src/features/persona/PersonaHomeShell.tsx` |
| 設定 UI | `frontend/src/features/screen-design/ScreenDesignPanel.tsx` |
| 動的ルート | `frontend/src/app/workspace/[personaId]/page.tsx` |
| サーバー解決 | `backend/services/personas.py`, `screen_design.py` |
| DB | `firm_members.persona_id` |
| API | `GET /api/auth/me` → `persona_id`, `persona_label` |

## ログイン後の遷移

1. ログイン成功 → `/api/auth/me` で `persona_id` 取得
2. `getPostLoginPath(user)` でホームへ
3. `shell === "workspace"` のユーザーが `/` に来た場合は自動リダイレクト

## 開発用アカウント（パスワード: `password`）

| メール | ペルソナ |
|--------|----------|
| `admin@tax.co.jp` | platform_admin |
| `yamamoto@tax.co.jp` | firm_director（所長） |
| `tanaka@tax.co.jp` | firm_staff_main |
| `sato@tax.co.jp` | firm_staff_support |
| `c1@client.example` | client_accounting |
| `ceo@client.example` | client_executive |
| `sales@client.example` | client_sales_expense |
| `controller@client.example` | client_controller |
| `bank@example.com` | bank |
| `taxoffice@example.go.jp` | tax_office |

## 業務・必要情報の洗い出し

各ペルソナの「何をするか」「何が必要か」は [`persona-work-requirements.md`](persona-work-requirements.md) を参照。  
コード上のプロファイル: `frontend/src/config/persona-work-profiles.ts`

## 次の実装ステップ（各ペルソナ別）

> **2026-06-10:** 以下は **保留**。詳細な作業リスト・完了条件は [`persona-ui-roadmap.md`](persona-ui-roadmap.md)。

1. ~~`PersonaHomeShell` をペルソナ別コンポーネントに分割~~ → `features/persona/homes/`（`client_accounting` 実装済み）
2. ~~所長: マトリクス上部ダッシュボード~~ → `FirmDirectorDashboard`（承認キュー + 顧問先進捗）
3. ~~担当: 今日やること~~ → `FirmStaffMainDashboard`（不足資料一覧）
4. 補佐: `FirmStaffSupportDashboard`（レビュー待ち・差戻し履歴）— **未着手**
5. ナビを `PersonaNav` として共通化し、権限で項目フィルタ — **未着手**
6. クライアント系 workspace（社長・経費・管理会計）— **未着手**
7. 銀行・税務署は閲覧専用＋監査ログ強化 — **未着手**

関連: [`auth-tenancy-design.md`](auth-tenancy-design.md)、[`dev-quickstart.md`](dev-quickstart.md)、[`persona-ui-roadmap.md`](persona-ui-roadmap.md)
