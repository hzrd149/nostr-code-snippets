import { Command } from "commander";
import { setConfigPath } from "../helpers/config.js";
import { enableDebugLogging } from "../helpers/debug.js";
import { gracefulShutdown } from "../helpers/shutdown.js";
import { ConfigCommand } from "./commands/config.js";
import { FetchCommand } from "./commands/fetch.js";
import { ListCommand } from "./commands/list.js";
import { McpCommand } from "./commands/mcp.js";
import { CreateCommand } from "./commands/create.js";
import { SearchCommand } from "./commands/search.js";
import { SignerCommand } from "./commands/signer.js";

export function createCliProgram(): Command {
  const program = new Command();

  program
    .name("nostr-code-snippets")
    .description("Publish and discover code snippets on Nostr")
    .version("1.0.0");

  // Add global options
  program
    .option("-v, --verbose", "Enable verbose output")
    .option("--config <path>", "Path to config file");

  // Initialize and register commands
  const commands = [
    new SignerCommand(),
    new CreateCommand(),
    new FetchCommand(),
    new ListCommand(),
    new SearchCommand(),
    new ConfigCommand(),
    new McpCommand(),
  ];

  commands.forEach((command) => {
    command.setup(program);
  });

  // Add help examples
  program.on("--help", () => {
    console.log("");
    console.log("Examples:");
    console.log("  $ nostr-code-snippets signer");
    console.log("  $ nostr-code-snippets signer --connect");
    console.log("  $ nostr-code-snippets signer --connect nsec1...");
    console.log("  $ nostr-code-snippets signer --reset");
    console.log("  $ nostr-code-snippets create ./my-script.js");
    console.log(
      "  $ nostr-code-snippets fetch nevent1abc123... --format detailed",
    );
    console.log(
      '  $ nostr-code-snippets search "react hooks" --language javascript',
    );
    console.log("  $ nostr-code-snippets list --format table --limit 5");
    console.log(
      "  $ nostr-code-snippets config --add-relay wss://relay.nostr.band",
    );
    console.log("  $ nostr-code-snippets config --editor code");
    console.log("");
    console.log("MCP Server Mode:");
    console.log("  $ nostr-code-snippets mcp");
    console.log("  $ nostr-code-snippets mcp --verbose");
    console.log("");
  });

  return program;
}

export async function runCli(): Promise<void> {
  const program = createCliProgram();

  // Check for verbose flag early to enable debug logging
  const args = process.argv;
  if (args.includes("-v") || args.includes("--verbose")) {
    enableDebugLogging();
  }

  // Check for config path option and set it before parsing
  const configIndex = args.indexOf("--config");
  if (configIndex !== -1 && configIndex + 1 < args.length) {
    const configPath = args[configIndex + 1];
    if (configPath) setConfigPath(configPath);
  }

  try {
    // Parse command line arguments
    await program.parseAsync(process.argv);

    // For non-MCP commands, trigger graceful shutdown after completion
    // The MCP command handles its own shutdown lifecycle
    if (!args.includes("mcp")) await gracefulShutdown(0);
  } catch (error) {
    console.error("Command failed:", error);
    await gracefulShutdown(1);
  }
}
