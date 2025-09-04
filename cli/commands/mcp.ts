import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Command } from "commander";
import { z } from "zod";
import { logger } from "../../helpers/debug.js";
import {
  displaySnippetsTable,
  fetchUserSnippets,
  formatSnippetsAsJson,
  formatSnippetsDetailed,
  type SnippetFilters,
} from "../../helpers/list.js";
import { registerShutdownHandler } from "../../helpers/shutdown.js";
import type { BaseCommand } from "../types.js";

const log = logger.extend("mcp");

export class McpCommand implements BaseCommand {
  name = "mcp";
  description = "Start the MCP (Model Context Protocol) server";

  setup(program: Command): void {
    program
      .command(this.name)
      .description(this.description)
      .option(
        "--port <port>",
        "Port to run the server on (for future TCP support)",
      )
      .option("--verbose", "Enable verbose logging")
      .action(async (options) => {
        await this.execute(options);
      });
  }

  async execute(options: any): Promise<void> {
    try {
      if (options.verbose) {
        log("🚀 Starting Nostr Code Snippets MCP Server...");
        log("📡 Server will communicate via stdin/stdout");
        log("🔧 Use Ctrl+C to stop the server");
        log("─".repeat(50));
      }

      const server = this.createMcpServer(options.verbose);
      const transport = new StdioServerTransport();

      // Register MCP server shutdown handler
      registerShutdownHandler("mcp-server", async () => {
        if (options.verbose) log("Disconnecting MCP server transport");
        try {
          // Close the transport connection gracefully
          await transport.close?.();
          if (options.verbose) log("MCP server transport closed successfully");
        } catch (error) {
          if (options.verbose)
            log("Error closing MCP server transport:", error);
        }
      });

      await server.connect(transport);
    } catch (error) {
      console.error(
        "❌ Failed to start MCP server:",
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  }

  private createMcpServer(verbose = false): McpServer {
    const server = new McpServer({
      name: "Nostr Code Snippets",
      version: "1.0.0",
    });

    if (verbose) log("🔧 Registering MCP tools...");

    server.tool(
      "search_snippets",
      "Search for code snippets on Nostr",
      {
        query: z.string().min(1).describe("Search query for code snippets"),
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
      },
      async ({ query, language, limit }) => {
        if (verbose) log(`Searching for "${query}"`);

        // TODO: Implement search logic
        return {
          content: [
            {
              type: "text",
              text: `Search results for "${query}" (implementation pending)`,
            },
          ],
        };
      },
    );

    server.tool(
      "list_my_snippets",
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
      },
      async ({ limit, language, tags, format }) => {
        if (verbose)
          log(
            `Listing user snippets (limit: ${limit}, language: ${language || "any"}, tags: ${tags.join(", ") || "any"}, format: ${format})`,
          );

        try {
          const filters: SnippetFilters = {
            limit,
            language,
            tags,
          };

          const result = await fetchUserSnippets(filters);
          const events = result.events;

          if (events.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: "🔍 No snippets found.\n💡 Publish your first snippet with: nostr-code-snippets publish <file>",
                },
              ],
            };
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

          return {
            content: [
              {
                type: "text",
                text: `Found ${events.length} snippet${events.length === 1 ? "" : "s"}:`,
              },
              { type: "text", text: formattedOutput },
            ],
          };
        } catch (error) {
          if (verbose) log(`❌ MCP: Error listing snippets: ${error}`);

          return {
            content: [
              {
                type: "text",
                text: `❌ Failed to list snippets: ${error instanceof Error ? error.message : error}`,
              },
            ],
          };
        }
      },
    );

    if (verbose) log("✅ MCP tools registered successfully");

    return server;
  }
}
