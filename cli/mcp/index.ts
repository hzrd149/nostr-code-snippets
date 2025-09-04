import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSearchSnippetsTool } from "./search-snippets.js";
import { registerListSnippetsTool } from "./list-snippets.js";
import { registerFetchSnippetsTool } from "./fetch-snippets.js";

export function registerAllMcpTools(server: McpServer) {
  registerSearchSnippetsTool(server);
  registerListSnippetsTool(server);
  registerFetchSnippetsTool(server);
}

export {
  registerSearchSnippetsTool,
  registerListSnippetsTool,
  registerFetchSnippetsTool as registerReadSnippetTool,
};
