import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../helpers/debug.js";
import {
  displaySnippetsTable,
  fetchUserSnippets,
  formatSnippetsAsJson,
  formatSnippetsDetailed,
  type SnippetFilters,
} from "../../helpers/list.js";
import { mcpError, mcpInfo, mcpMultiple } from "../../helpers/mcp.js";
import { getPublicKey } from "../../helpers/user";

const log = logger.extend("mcp:list");

export function registerListSnippetsTool(server: McpServer) {
  log("🔧 Registering list_my_snippets tool...");

  server.tool(
    "list_user_snippets",
    "List your published code snippets",
    {
      limit: z
        .number()
        .min(1)
        .max(100)
        .default(10)
        .describe("Maximum number of snippets to return"),
      language: z
        .string()
        .optional()
        .describe("Filter by programming language"),
      tags: z.array(z.string()).optional().describe("Filter by tags"),
      format: z
        .enum(["table", "json", "detailed"])
        .default("table")
        .describe("Output format"),
      user: z
        .string()
        .optional()
        .describe(
          "The npub of the user to list snippets for. if left empty will use the current user",
        ),
    },
    async ({ limit, language, tags, format, user }) => {
      log(
        `Listing user snippets (limit: ${limit}, language: ${language || "any"}, tags: ${tags?.join(", ") || "any"}, format: ${format})`,
      );

      try {
        const filters: SnippetFilters = {
          limit,
          language,
          tags,
        };

        user = user || (await getPublicKey());
        if (!user) return mcpError("No user public key found");

        const result = await fetchUserSnippets(user, filters);
        const events = result.events;

        if (events.length === 0) {
          return mcpInfo(
            "No snippets found.\n💡 Publish your first snippet with: nostr-code-snippets publish <file>",
          );
        }

        let formattedOutput: string;
        switch (format) {
          case "json":
            formattedOutput = formatSnippetsAsJson(events);
            break;
          case "detailed":
            formattedOutput = formatSnippetsDetailed(events);
            break;
          default: // table
            formattedOutput = displaySnippetsTable(events);
            break;
        }

        return mcpMultiple([
          `Found ${events.length} snippet${events.length === 1 ? "" : "s"}:`,
          formattedOutput,
        ]);
      } catch (error) {
        log(`❌ MCP: Error listing snippets: ${error}`);

        return mcpError(
          `Failed to list snippets: ${error instanceof Error ? error.message : error}`,
        );
      }
    },
  );

  log("✅ list_my_snippets tool registered");
}
