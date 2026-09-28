import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { VaultConfig } from "./config.js";

export function createServer(config: VaultConfig): McpServer {
  const server = new McpServer({ name: "obsidian-chatgpt-plugin", version: "0.1.0" });
  server.registerTool("get_vault_context", {
    title: "Get configured Vault context",
    description: "Returns the configured Vault ID and implemented capabilities. Does not read notes or expose the local absolute path.",
    inputSchema: {},
    outputSchema: { vaultId: z.string(), capabilities: z.array(z.string()) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async () => {
    const result = { vaultId: config.id, capabilities: ["get_vault_context"] };
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
  });
  return server;
}
