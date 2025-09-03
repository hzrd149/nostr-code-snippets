import { Command } from "commander";
import type { BaseCommand } from "../types.js";
import { loadConfig, formatSnippetForDisplay } from "../utils.js";
import { logger } from "../../helpers/debug.js";

export class ListCommand implements BaseCommand {
  name = "list";
  description = "List your published code snippets";

  setup(program: Command): void {
    program
      .command(this.name)
      .description(this.description)
      .option(
        "-l, --limit <number>",
        "Maximum number of snippets to display",
        "10",
      )
      .option("--language <language>", "Filter by programming language")
      .option("--tag <tag>", "Filter by tag")
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

      const config = loadConfig();
      const limit = parseInt(options.limit);

      // TODO: Implement actual Nostr querying logic
      const snippets = await this.fetchUserSnippets(config, {
        limit,
        language: options.language,
        tag: options.tag,
      });

      if (snippets.length === 0) {
        console.log("\n🔍 No snippets found.");
        console.log(
          "💡 Publish your first snippet with: nostr-code-snippets publish <file>",
        );
        return;
      }

      console.log(
        `\n📊 Found ${snippets.length} snippet${snippets.length === 1 ? "" : "s"}:`,
      );

      switch (options.format) {
        case "json":
          console.log(JSON.stringify(snippets, null, 2));
          break;
        case "detailed":
          snippets.forEach((snippet, index) => {
            console.log(`\n${index + 1}. ${formatSnippetForDisplay(snippet)}`);
            console.log("─".repeat(50));
          });
          break;
        default: // table
          this.displayTable(snippets);
      }
    } catch (error) {
      console.error(
        "❌ Failed to list snippets:",
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  }

  private async fetchUserSnippets(config: any, filters: any): Promise<any[]> {
    // TODO: Implement actual Nostr querying logic
    // This would involve:
    // 1. Connecting to relays
    // 2. Querying for user's events
    // 3. Filtering by criteria
    // 4. Parsing and returning results

    logger("🔍 Searching your snippets...");
    logger(`   Relays: ${config.relays.join(", ")}`);
    if (filters.language) logger(`   Language: ${filters.language}`);
    if (filters.tag) logger(`   Tag: ${filters.tag}`);

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Return mock data for now
    return [
      {
        id: "1",
        title: "React Hook Example",
        language: "javascript",
        tags: ["react", "hooks", "code"],
        author: "you",
        createdAt: new Date(Date.now() - 86400000), // 1 day ago
        content:
          "const [count, setCount] = useState(0);\n\nreturn (\n  <button onClick={() => setCount(count + 1)}>\n    Count: {count}\n  </button>\n);",
      },
      {
        id: "2",
        title: "Python List Comprehension",
        language: "python",
        tags: ["python", "list-comprehension", "code"],
        author: "you",
        createdAt: new Date(Date.now() - 172800000), // 2 days ago
        content:
          "squares = [x**2 for x in range(10) if x % 2 == 0]\nprint(squares)  # [0, 4, 16, 36, 64]",
      },
    ]
      .filter((snippet) => {
        if (filters.language && snippet.language !== filters.language)
          return false;
        if (filters.tag && !snippet.tags.includes(filters.tag)) return false;
        return true;
      })
      .slice(0, filters.limit);
  }

  private displayTable(snippets: any[]): void {
    const maxTitleLength = 30;
    const maxLanguageLength = 12;

    // Header
    console.log(
      "\n┌─────┬─" +
        "─".repeat(maxTitleLength) +
        "─┬─" +
        "─".repeat(maxLanguageLength) +
        "─┬─────────────┬──────────────┐",
    );
    console.log(
      "│ ID  │ " +
        "Title".padEnd(maxTitleLength) +
        " │ " +
        "Language".padEnd(maxLanguageLength) +
        " │ Tags        │ Created      │",
    );
    console.log(
      "├─────┼─" +
        "─".repeat(maxTitleLength) +
        "─┼─" +
        "─".repeat(maxLanguageLength) +
        "─┼─────────────┼──────────────┤",
    );

    // Rows
    snippets.forEach((snippet, index) => {
      const id = (index + 1).toString().padEnd(3);
      const title = (snippet.title || "Untitled")
        .substring(0, maxTitleLength)
        .padEnd(maxTitleLength);
      const language = (snippet.language || "Unknown")
        .substring(0, maxLanguageLength)
        .padEnd(maxLanguageLength);
      const tags = snippet.tags
        .slice(0, 2)
        .join(",")
        .substring(0, 11)
        .padEnd(11);
      const created = new Date(snippet.createdAt)
        .toLocaleDateString()
        .padEnd(12);

      console.log(`│ ${id} │ ${title} │ ${language} │ ${tags} │ ${created} │`);
    });

    console.log(
      "└─────┴─" +
        "─".repeat(maxTitleLength) +
        "─┴─" +
        "─".repeat(maxLanguageLength) +
        "─┴─────────────┴──────────────┘",
    );
  }
}
