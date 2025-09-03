#!/usr/bin/env bun
import { runCli } from "./cli/index.js";

// Main execution logic
async function main() {
  // Always run as CLI - MCP server is now a dedicated command
  await runCli();
}

// Run the application
await main();
