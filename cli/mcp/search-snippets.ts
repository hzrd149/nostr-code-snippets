import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../helpers/debug.js";
import { mcpError, mcpSuccess } from "../../helpers/mcp.js";
import { searchCodeSnippets } from "../../helpers/search";
import { normalizeLanguage } from "../../helpers/languages.js";

const log = logger.extend("mcp:search");

export function registerSearchSnippetsTool(server: McpServer) {
  log("🔧 Registering search_snippets tool...");

  server.registerTool(
    "search_snippets",
    {
      title: "Search for code snippets on Nostr",
      description: "Search for code snippets on Nostr",
      inputSchema: {
        query: z.string().min(2).describe("Search query for code snippets"),
        language: z
          .string()
          .optional()
          .describe("Filter by programming language"),
        limit: z
          .number()
          .min(1)
          .max(50)
          .default(10)
          .describe("Maximum number of results"),
        extraRelays: z
          .array(z.string())
          .optional()
          .describe(
            "Additional relays to search (will be checked for NIP-50 support)",
          ),
      },
    },
    async ({ query, language, limit, extraRelays }) => {
      log(`Searching for "${query}"`);

      try {
        const normalizedLanguage = language
          ? normalizeLanguage(language)
          : undefined;

        const searchResult = await searchCodeSnippets(
          {
            query,
            language: normalizedLanguage,
            limit,
          },
          extraRelays,
        );

        if (searchResult.events.length === 0) {
          return mcpSuccess(
            `No code snippets found for query: "${query}"${language ? ` (language: ${language})` : ""}`,
          );
        }

        const resultsText = searchResult.events
          .map((event, index) => {
            const title =
              event.tags.find((tag) => tag[0] === "title")?.[1] || "Untitled";
            const lang =
              event.tags.find((tag) => tag[0] === "l")?.[1] || "unknown";
            const tags = event.tags
              .filter((tag) => tag[0] === "t")
              .map((tag) => tag[1])
              .join(", ");
            const content =
              event.content.length > 200
                ? event.content.substring(0, 200) + "..."
                : event.content;

            return `${index + 1}. **${title}**
Language: ${lang}
Tags: ${tags || "none"}
Author: ${event.pubkey.substring(0, 16)}...
Content:
\`\`\`${lang}
${content}
\`\`\`
---`;
          })
          .join("\n\n");

        const searchInfo =
          searchResult.nip50SupportedRelays.length > 0
            ? `Searched ${searchResult.nip50SupportedRelays.length} NIP-50 relays`
            : `Used fallback search on ${searchResult.searchedRelays.length} relays`;

        return mcpSuccess(`Found ${searchResult.events.length} code snippets for "${query}":

${searchInfo}

${resultsText}`);
      } catch (error) {
        return mcpError(
          `Error searching for "${query}": ${error instanceof Error ? error.message : error}`,
        );
      }
    },
  );

  log("✅ search_snippets tool registered");
}
