import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DocugridApiClient, CatalogRow } from "./api-client.js";
import { withUserScope } from "./guards.js";
import { McpAuthError, type MeProfile } from "./session.js";

function jsonText(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function matchesKeyword(text: string, keyword: string): boolean {
  return text.toLowerCase().includes(keyword.toLowerCase());
}

function filterCatalogRows(rows: CatalogRow[], keyword?: string): CatalogRow[] {
  if (!keyword?.trim()) return rows;
  const kw = keyword.trim();
  return rows.filter((row) => {
    const haystack = [
      row.client_name,
      row.client_id,
      row.slot_label,
      row.original_name,
      row.category_id,
      row.logical_status,
    ]
      .filter(Boolean)
      .join(" ");
    return matchesKeyword(haystack, kw);
  });
}

function scopedClientSummary(profile: MeProfile) {
  return {
    actor: profile.email,
    role: profile.role,
    firm_id: profile.firm_id,
    visible_client_count: profile.visible_client_ids.length,
  };
}

export function registerTools(server: McpServer, api: DocugridApiClient) {
  const session = api.session;

  server.registerTool(
    "get_me",
    {
      description:
        "現在のログインユーザー（ロール・権限・visible_client_ids）を取得します。他ツール実行前の権限確認に使います。",
    },
    async () => {
      const result = await withUserScope(session, async (profile) => profile);
      if ("isError" in result && result.isError) return result;
      return jsonText(result);
    },
  );

  server.registerTool(
    "list_clients",
    {
      description:
        "ログインユーザーがアクセス可能な顧問先のみ一覧します（サーバー割当と一致）。",
    },
    async () => {
      const result = await withUserScope(session, async (profile) => {
        session.assertPermission(profile, "client.view");
        const master = await api.getClientMaster();
        const clients = session.filterByVisible(profile, master.clients);
        return {
          ...scopedClientSummary(profile),
          count: clients.length,
          clients: clients.map((c) => ({
            id: c.id,
            name: c.name,
            fiscalMonth: c.fiscalMonth,
            category: c.category,
            tags: c.tags,
          })),
        };
      });
      if ("isError" in result && result.isError) return result;
      return jsonText(result);
    },
  );

  server.registerTool(
    "search_clients",
    {
      description:
        "アクセス可能な顧問先のうち、名前・ID・タグにキーワードが部分一致するものを検索します。",
      inputSchema: {
        keyword: z.string().min(1).describe("検索キーワード（例: 製造, 株式会社A）"),
      },
    },
    async ({ keyword }) => {
      const result = await withUserScope(session, async (profile) => {
        session.assertPermission(profile, "client.view");
        const master = await api.getClientMaster();
        const visible = session.filterByVisible(profile, master.clients);
        const hits = visible.filter((c) => {
          const haystack = [c.name, c.id, c.category, ...c.tags].join(" ");
          return matchesKeyword(haystack, keyword);
        });
        return { keyword, ...scopedClientSummary(profile), count: hits.length, clients: hits };
      });
      if ("isError" in result && result.isError) return result;
      return jsonText(result);
    },
  );

  server.registerTool(
    "update_client_tags",
    {
      description:
        "指定顧問先のタグを置き換えます。settings.manage 権限と当該顧問先への割当が必要です。",
      inputSchema: {
        client_id: z.string().min(1).describe("顧問先 ID"),
        tags: z.array(z.string()).describe("新しいタグ一覧（完全置換）"),
      },
    },
    async ({ client_id, tags }) => {
      const result = await withUserScope(session, async (profile) => {
        session.assertPermission(profile, "settings.manage");
        session.assertClientAccess(profile, client_id);

        const master = await api.getClientMaster();
        const target = master.clients.find((c) => c.id === client_id);
        if (!target) {
          throw new McpAuthError(`顧問先が見つかりません: ${client_id}`);
        }

        const previous = target.tags;
        const saved = await api.putClientMaster({
          clients: [{ ...target, tags }],
          groups: [],
        });
        const updated = saved.clients.find((c) => c.id === client_id);
        return {
          ...scopedClientSummary(profile),
          client_id,
          previous_tags: previous,
          tags: updated?.tags ?? tags,
          updated_at: saved.updated_at,
        };
      });
      if ("isError" in result && result.isError) return result;
      return jsonText(result);
    },
  );

  server.registerTool(
    "list_slot_documents",
    {
      description: "アクセス可能な顧問先のマトリクス資料（PDF）一覧を取得します。",
      inputSchema: {
        client_id: z.string().min(1).describe("顧問先 ID"),
        period_key: z
          .string()
          .optional()
          .describe("期間キー（例: perm, year:1, month:3）。省略時は全期間"),
      },
    },
    async ({ client_id, period_key }) => {
      const result = await withUserScope(session, async (profile) => {
        session.assertPermission(profile, "document.view");
        session.assertClientAccess(profile, client_id);
        const items = await api.listSlots(client_id, period_key);
        return {
          ...scopedClientSummary(profile),
          client_id,
          period_key: period_key ?? null,
          count: items.length,
          documents: items,
        };
      });
      if ("isError" in result && result.isError) return result;
      return jsonText(result);
    },
  );

  server.registerTool(
    "get_document_status",
    {
      description: "アクセス可能な顧問先について、不足資料・承認待ちの状況を返します。",
      inputSchema: {
        client_id: z.string().min(1).describe("顧問先 ID"),
        period_key: z
          .string()
          .optional()
          .describe("期間キー。省略時はアップロード実績のある全期間サマリ"),
      },
    },
    async ({ client_id, period_key }) => {
      const result = await withUserScope(session, async (profile) => {
        session.assertPermission(profile, "document.view");
        session.assertClientAccess(profile, client_id);
        const status = await api.getDocumentStatus(client_id, period_key);
        return { ...scopedClientSummary(profile), client_id, ...status };
      });
      if ("isError" in result && result.isError) return result;
      return jsonText(result);
    },
  );

  server.registerTool(
    "list_catalog_categories",
    {
      description: "書類カタログで使える category_id 一覧を取得します（document.view 必須）。",
    },
    async () => {
      const result = await withUserScope(session, async (profile) => {
        session.assertPermission(profile, "document.view");
        const scopeClient = session.resolveScopeClient(profile);
        const payload = await api.listCatalogCategories(scopeClient);
        return { ...scopedClientSummary(profile), ...payload };
      });
      if ("isError" in result && result.isError) return result;
      return jsonText(result);
    },
  );

  server.registerTool(
    "search_document_catalog",
    {
      description:
        "アクセス可能な顧問先の書類カタログを横断取得し、キーワードで絞り込みます。",
      inputSchema: {
        category_id: z
          .string()
          .min(1)
          .describe(
            "tax_return_corporate / tax_return_consumption / corporate_registry / articles_of_incorporation",
          ),
        keyword: z.string().optional().describe("部分一致キーワード（省略可）"),
        period_key: z.string().optional().describe("期間キー（省略時はカテゴリのデフォルト）"),
        client_id: z.string().optional().describe("特定顧問先に限定（担当外は拒否）"),
        metadata_status: z.string().optional().describe("抽出メタの status フィルタ"),
      },
    },
    async ({ category_id, keyword, period_key, client_id, metadata_status }) => {
      const result = await withUserScope(session, async (profile) => {
        session.assertPermission(profile, "document.view");
        if (client_id) {
          session.assertClientAccess(profile, client_id);
        }

        const payload = await api.getDocumentCatalog({
          categoryId: category_id,
          periodKey: period_key,
          clientId: client_id,
          metadataStatus: metadata_status,
        });
        const scopedRows = session.filterCatalogRows(profile, payload.rows);
        const filtered = filterCatalogRows(scopedRows, keyword);
        return {
          ...scopedClientSummary(profile),
          category_id: payload.category_id,
          period_key: payload.period_key,
          keyword: keyword ?? null,
          total: scopedRows.length,
          matched: filtered.length,
          rows: filtered,
        };
      });
      if ("isError" in result && result.isError) return result;
      return jsonText(result);
    },
  );

  server.registerTool(
    "list_firm_tasks",
    {
      description:
        "ログインユーザーが見える顧問先について、不足資料・承認待ちタスクを集約取得します。",
    },
    async () => {
      const result = await withUserScope(session, async (profile) => {
        session.assertPermission(profile, "dashboard.view");
        const tasks = await api.getFirmTasks();
        return { ...scopedClientSummary(profile), ...tasks };
      });
      if ("isError" in result && result.isError) return result;
      return jsonText(result);
    },
  );

  server.registerTool(
    "list_pending_classify",
    {
      description: "アクセス可能な顧問先の自動分類・確認待ちキューを取得します。",
      inputSchema: {
        client_id: z.string().min(1).describe("顧問先 ID"),
        period_key: z.string().min(1).describe("期間キー（例: year:1）"),
      },
    },
    async ({ client_id, period_key }) => {
      const result = await withUserScope(session, async (profile) => {
        session.assertPermission(profile, "document.view");
        session.assertClientAccess(profile, client_id);
        const items = await api.listPendingClassify(client_id, period_key);
        return {
          ...scopedClientSummary(profile),
          client_id,
          period_key,
          count: items.length,
          items,
        };
      });
      if ("isError" in result && result.isError) return result;
      return jsonText(result);
    },
  );
}
