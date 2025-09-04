import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Command } from "commander";
import { logger } from "../../helpers/debug.js";
import { registerShutdownHandler } from "../../helpers/shutdown.js";
import { registerAllMcpTools } from "../mcp/index.js";
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

      const server = this.createMcpServer();
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

  private createMcpServer(): McpServer {
    const server = new McpServer({
      name: "Nostr Code Snippets",
      version: "1.0.0",
    });

    log("🔧 Registering MCP tools...");

    // Register all MCP tools from separate files
    registerAllMcpTools(server);

    log("✅ MCP tools registered successfully");

    return server;
  }
}
