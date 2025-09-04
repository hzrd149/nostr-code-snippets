import { Command } from "commander";
import { type NostrEvent } from "nostr-tools";
import { logger } from "../../helpers/debug.js";
import {
  fetchUserSnippets,
  displaySnippetsTable,
  formatSnippetsAsJson,
  formatSnippetsDetailed,
  type SnippetFilters,
} from "../../helpers/list.js";
import type { BaseCommand } from "../types.js";
import { formatSnippetForDisplay } from "../utils.js";

const log = logger.extend("list");

export class ListCommand implements BaseCommand {
  name = "list";
  description = "List your published code snippets";

  setup(program: Command): void {
    program
      .command(this.name)
      .description(this.description)
      .option("--limit <number>", "Maximum number of snippets to display", "10")
      .option("-l, --language <language>", "Filter by programming language")
      .option("-t, --tag <tag>", "Filter by tag")
      .option(
        "--format <format>",
        "Output format (table|json|detailed)",
        "table",
      )
      .action(async (options) => {
        await this.execute(options);
      });
  }

  async execute(options: any): Promise<void> {
    try {
      console.log("📋 Your published code snippets:");

      const limit = parseInt(options.limit);

      const filters: SnippetFilters = {
        limit,
        language: options.language?.toLowerCase(),
        tags: options.tag,
      };

      const result = await fetchUserSnippets(filters);
      const events = result.events;

      if (events.length === 0) {
        console.log("\n🔍 No snippets found.");
        console.log(
          "💡 Publish your first snippet with: nostr-code-snippets publish <file>",
        );
        return;
      }

      console.log(
        `\n📊 Found ${events.length} snippet${events.length === 1 ? "" : "s"}:`,
      );

      switch (options.format) {
        case "json":
          console.log(formatSnippetsAsJson(events));
          break;
        case "detailed":
          console.log(formatSnippetsDetailed(events));
          break;
        default: // table
          console.log(displaySnippetsTable(events));
      }
    } catch (error) {
      console.error(
        "❌ Failed to list snippets:",
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  }
}
