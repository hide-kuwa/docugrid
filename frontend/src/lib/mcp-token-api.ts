import { API_BASE } from "@/config/api";
import { authFetch, buildAuthHeaders } from "@/lib/api-auth";

export type McpTokenPayload = {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: string;
  audience: string;
};

export async function issueMcpToken(): Promise<McpTokenPayload> {
  const res = await authFetch(`${API_BASE}/auth/mcp-token`, {
    method: "POST",
    headers: buildAuthHeaders(),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail || "MCP トークンの発行に失敗しました");
  }
  return (await res.json()) as McpTokenPayload;
}

export function buildMcpCursorConfig(token: string, mcpServerPath?: string): string {
  const pathHint =
    mcpServerPath?.trim() ||
    "<リポジトリ絶対パス>/mcp-server/dist/index.js";
  return JSON.stringify(
    {
      mcpServers: {
        docugrid: {
          command: "node",
          args: [pathHint.replace(/\\/g, "/")],
          env: {
            DOCUGRID_API_BASE: API_BASE,
            DOCUGRID_ACCESS_TOKEN: token,
            DOCUGRID_MCP_STRICT: "true",
          },
        },
      },
    },
    null,
    2,
  );
}

export function formatExpiresAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
