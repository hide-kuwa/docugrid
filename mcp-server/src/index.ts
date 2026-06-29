#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { DocugridApiClient } from "./api-client.js";
import { registerTools } from "./tools.js";

async function main() {
  const config = loadConfig();
  const api = new DocugridApiClient(config);

  const profile = await api.session.require();
  console.error(
    `[docugrid-mcp] production=${config.isProduction} strict=${config.strictAuth} actor=${profile.email} role=${profile.role} visible_clients=${profile.visible_client_ids.length}`,
  );

  const server = new McpServer({
    name: "docugrid",
    version: "1.0.0",
  });

  registerTools(server, api);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("[docugrid-mcp] fatal:", err);
  process.exit(1);
});
