import { Command } from "commander";
import { setConfigPath } from "../helpers/config.js";
import { enableDebugLogging } from "../helpers/debug.js";
import { ConfigCommand } from "./commands/config.js";
import { ListCommand } from "./commands/list.js";
import { McpCommand } from "./commands/mcp.js";
import { PublishCommand } from "./commands/publish.js";
import { SearchCommand } from "./commands/search.js";
import { SigninCommand } from "./commands/signin.js";
import { WhoamiCommand } from "./commands/whoami.js";

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
    new SigninCommand(),
    new WhoamiCommand(),
    new PublishCommand(),
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
    console.log("  $ nostr-code-snippets signin");
    console.log("  $ nostr-code-snippets signin nsec1...");
    console.log("  $ nostr-code-snippets whoami");
    console.log(
      '  $ nostr-code-snippets publish ./my-script.js --title "Useful Script"',
    );
    console.log(
      '  $ nostr-code-snippets search "react hooks" --language javascript',
    );
    console.log("  $ nostr-code-snippets list --format table --limit 5");
    console.log(
      "  $ nostr-code-snippets config --add-relay wss://relay.nostr.band",
    );
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

  // Parse command line arguments
  await program.parseAsync(process.argv);
}
