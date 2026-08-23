# DocuGrid module map

画面 → `frontend/src/features/` → 主要 API（FastAPI `backend/api/routers/`）

| 画面 / ルート | Feature モジュール | 主要 API |
|---------------|-------------------|----------|
| `/` マトリクス | `matrix/MatrixHomePage`, `matrix/hooks/useSlotDocuments`, `matrix/MatrixShellLayout`, `components/MatrixGrid` | `slots`, `documents`, `pdf`, `review-events` |
| `/templates` 文書ひな形 | `authoring/TemplatesWorkspacePage`, `authoring/components/AuthoringTemplatesPanel` | `authoring-templates` |
| `/flowchart` 判定フロー | `flowchart-templates/FlowchartWorkspacePage`, `ClientFlowchartSection`, `FlowchartDefinitionEditor` | `flowchart-templates` |
| `/pdf` PDF 単体 | `pdf-viewer/` | `pdf`, `document-versions` |
| 設定 | `settings/ClientMasterSettingsTab`, `settings/StakeholderSettingsTab`, `config/`, `addons/AddonsSettingsTab` | `integrations` (client-master), `firm`, `addons` |
| カルテ（マトリクス内） | `client-data/DataWorkspace` | `client-records` |
| 関係図 | `client-data/RelationDiagramCanvas`, `lib/client-relations-layout`, `lib/relation-diagram-pdf` | `integrations` (`relationLayouts`) |
| ヘルプ | `help/HelpCenter` | `support-assistant` |
| 連携 DM | `integrations/MessagingChannelsPanel` | `messaging-channels`, `dm-inbox` |
| 請求ゲート | `billing/BillingGatePanel` | Stripe Connect（`integrations`） |
| オンボーディング | `onboarding/FeatureTour` | — |

**境界ルール**

- Page (`app/*/page.tsx`) = 認可チェック + feature 配線のみ
- 顧客マスタ型 SSOT: `frontend/src/lib/client-master-api.ts` ↔ `backend/api/schemas.py`
- 新タブ = `features/<domain>/` に 1 フォルダ、500 行超えたら hook / lib へ分割
