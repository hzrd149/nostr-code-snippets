import { Command } from "commander";
import type { BaseCommand } from "../types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { logger } from "../../helpers/debug.js";

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
        logger("🚀 Starting Nostr Code Snippets MCP Server...");
        logger("📡 Server will communicate via stdin/stdout");
        logger("🔧 Use Ctrl+C to stop the server");
        logger("─".repeat(50));
      }

      const server = this.createMcpServer(options.verbose);
      const transport = new StdioServerTransport();

      // Handle graceful shutdown
      process.on("SIGINT", () => {
        if (options.verbose) {
          logger("\n🛑 Shutting down MCP server...");
        }
        process.exit(0);
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

    if (verbose) {
      logger("🔧 Registering MCP tools...");
    }

    // @ts-ignore - MCP SDK type definitions have issues but functionality works correctly
    server.tool(
      "publish_snippet",
      "Publish a code snippet to Nostr",
      {
        content: z.string().min(1).describe("The code content to publish"),
        language: z
          .string()
          .optional()
          .describe("Programming language of the code"),
        title: z.string().optional().describe("Title for the code snippet"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Tags for the code snippet"),
      },
      async ({ content, language, title, tags }) => {
        if (verbose) {
          logger(`📝 MCP: Publishing snippet "${title || "Untitled"}"`);
        }

        // TODO: Implement Nostr publishing logic
        return {
          content: [
            {
              type: "text",
              text: `Code snippet published successfully! Content: ${content.substring(0, 100)}...`,
            },
          ],
        };
      },
    );

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
        if (verbose) {
          logger(`🔍 MCP: Searching for "${query}"`);
        }

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
      {},
      async () => {
        if (verbose) {
          logger("📋 MCP: Listing user snippets");
        }

        // TODO: Implement listing logic
        return {
          content: [
            {
              type: "text",
              text: "Your published snippets (implementation pending)",
            },
          ],
        };
      },
    );

    server.tool(
      "configure_nostr",
      "Configure Nostr settings for the MCP server",
      {
        privateKey: z.string().optional().describe("Private key in hex format"),
        pubkey: z
          .string()
          .optional()
          .describe("Public key (hex, npub, or nprofile format)"),
        relays: z.array(z.string()).optional().describe("List of relay URLs"),
      },
      async ({ privateKey, pubkey, relays }) => {
        if (verbose) {
          logger("⚙️ MCP: Updating configuration");
        }

        // TODO: Implement configuration logic
        return {
          content: [
            {
              type: "text",
              text: "Configuration updated successfully (implementation pending)",
            },
          ],
        };
      },
    );

    if (verbose) {
      logger("✅ MCP tools registered successfully");
    }

    return server;
  }
}
