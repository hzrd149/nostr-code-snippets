import { Command } from "commander";
import { logger } from "../../helpers/debug.js";
import type { BaseCommand } from "../types.js";
import { formatSnippetForDisplay, loadConfig } from "../utils.js";

export class SearchCommand implements BaseCommand {
  name = "search";
  description = "Search for code snippets on Nostr";

  setup(program: Command): void {
    program
      .command(this.name)
      .description(this.description)
      .argument("<query>", "Search query for code snippets")
      .option(
        "-l, --limit <number>",
        "Maximum number of results to return",
        "10",
      )
      .option("--language <language>", "Filter by programming language")
      .option("--tag <tag>", "Filter by tag")
      .option("--author <author>", "Filter by author (npub or hex)")
      .option(
        "--format <format>",
        "Output format (table|json|detailed)",
        "detailed",
      )
      .option("--sort <sort>", "Sort by (relevance|date|author)", "relevance")
      .action(async (query: string, options) => {
        await this.execute(query, options);
      });
  }

  async execute(query: string, options: any): Promise<void> {
    try {
      console.log(`🔍 Searching for: "${query}"`);

      const config = loadConfig();
      const limit = parseInt(options.limit);

      // Show search parameters
      const searchParams = [];
      if (options.language) searchParams.push(`Language: ${options.language}`);
      if (options.tag) searchParams.push(`Tag: ${options.tag}`);
      if (options.author) searchParams.push(`Author: ${options.author}`);
      if (searchParams.length > 0) {
        console.log(`   Filters: ${searchParams.join(", ")}`);
      }

      // TODO: Implement actual Nostr search logic
      const results = await this.searchSnippets(query, config, {
        limit,
        language: options.language,
        tag: options.tag,
        author: options.author,
        sort: options.sort,
      });

      if (results.length === 0) {
        console.log("\n🔍 No snippets found matching your search.");
        console.log("💡 Try different keywords or remove filters.");
        return;
      }

      console.log(
        `\n📊 Found ${results.length} matching snippet${results.length === 1 ? "" : "s"}:`,
      );

      switch (options.format) {
        case "json":
          console.log(JSON.stringify(results, null, 2));
          break;
        case "table":
          this.displayTable(results);
          break;
        default: // detailed
          results.forEach((snippet, index) => {
            console.log(`\n${index + 1}. ${formatSnippetForDisplay(snippet)}`);
            if (snippet.relevanceScore) {
              console.log(
                `🎯 Relevance: ${Math.round(snippet.relevanceScore * 100)}%`,
              );
            }
            console.log("─".repeat(50));
          });
      }
    } catch (error) {
      console.error(
        "❌ Search failed:",
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  }

  private async searchSnippets(
    query: string,
    config: any,
    filters: any,
  ): Promise<any[]> {
    // TODO: Implement actual Nostr search logic
    // This would involve:
    // 1. Connecting to relays
    // 2. Querying for events matching the search criteria
    // 3. Filtering and ranking results
    // 4. Returning sorted results

    logger("🔍 Searching across Nostr network...");
    logger(`   Relays: ${config.relays.join(", ")}`);
    logger(`   Sort by: ${filters.sort}`);

    // Simulate search delay
    await new Promise((resolve) => setTimeout(resolve, 1200));

    // Return mock search results
    const mockResults = [
      {
        id: "3",
        title: "React Custom Hook for API Calls",
        language: "javascript",
        tags: ["react", "hooks", "api", "custom-hook"],
        author: "alice@nostr.com",
        createdAt: new Date(Date.now() - 43200000), // 12 hours ago
        content:
          "function useApi(url) {\n  const [data, setData] = useState(null);\n  const [loading, setLoading] = useState(true);\n  \n  useEffect(() => {\n    fetch(url)\n      .then(res => res.json())\n      .then(setData)\n      .finally(() => setLoading(false));\n  }, [url]);\n  \n  return { data, loading };\n}",
        relevanceScore: 0.95,
      },
      {
        id: "4",
        title: "Python React-like Hook Pattern",
        language: "python",
        tags: ["python", "hooks", "pattern", "functional"],
        author: "bob@nostr.com",
        createdAt: new Date(Date.now() - 86400000), // 1 day ago
        content:
          "class StateHook:\n    def __init__(self, initial_value):\n        self._value = initial_value\n        self._listeners = []\n    \n    def get(self):\n        return self._value\n    \n    def set(self, new_value):\n        self._value = new_value\n        for listener in self._listeners:\n            listener(new_value)",
        relevanceScore: 0.75,
      },
      {
        id: "5",
        title: "Vue 3 Composition API Hook",
        language: "javascript",
        tags: ["vue", "composition-api", "hooks", "reactive"],
        author: "charlie@nostr.com",
        createdAt: new Date(Date.now() - 172800000), // 2 days ago
        content:
          "import { ref, computed } from 'vue';\n\nexport function useCounter(initialValue = 0) {\n  const count = ref(initialValue);\n  const doubled = computed(() => count.value * 2);\n  \n  const increment = () => count.value++;\n  const decrement = () => count.value--;\n  \n  return { count, doubled, increment, decrement };\n}",
        relevanceScore: 0.85,
      },
    ];

    // Filter results based on search criteria
    let filteredResults = mockResults.filter((snippet) => {
      // Basic text search in title and content
      const searchText = query.toLowerCase();
      const matchesQuery =
        snippet.title.toLowerCase().includes(searchText) ||
        snippet.content.toLowerCase().includes(searchText) ||
        snippet.tags.some((tag) => tag.toLowerCase().includes(searchText));

      if (!matchesQuery) return false;
      if (filters.language && snippet.language !== filters.language)
        return false;
      if (filters.tag && !snippet.tags.includes(filters.tag)) return false;
      if (filters.author && !snippet.author.includes(filters.author))
        return false;

      return true;
    });

    // Sort results
    switch (filters.sort) {
      case "date":
        filteredResults.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        break;
      case "author":
        filteredResults.sort((a, b) => a.author.localeCompare(b.author));
        break;
      default: // relevance
        filteredResults.sort(
          (a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0),
        );
    }

    return filteredResults.slice(0, filters.limit);
  }

  private displayTable(results: any[]): void {
    const maxTitleLength = 25;
    const maxAuthorLength = 15;

    // Header
    console.log(
      "\n┌─────┬─" +
        "─".repeat(maxTitleLength) +
        "─┬─" +
        "─".repeat(maxAuthorLength) +
        "─┬─────────────┬──────────────┐",
    );
    console.log(
      "│ #   │ " +
        "Title".padEnd(maxTitleLength) +
        " │ " +
        "Author".padEnd(maxAuthorLength) +
        " │ Language    │ Relevance    │",
    );
    console.log(
      "├─────┼─" +
        "─".repeat(maxTitleLength) +
        "─┼─" +
        "─".repeat(maxAuthorLength) +
        "─┼─────────────┼──────────────┤",
    );

    // Rows
    results.forEach((snippet, index) => {
      const num = (index + 1).toString().padEnd(3);
      const title = (snippet.title || "Untitled")
        .substring(0, maxTitleLength)
        .padEnd(maxTitleLength);
      const author = (snippet.author || "Unknown")
        .substring(0, maxAuthorLength)
        .padEnd(maxAuthorLength);
      const language = (snippet.language || "Unknown")
        .substring(0, 11)
        .padEnd(11);
      const relevance = (
        snippet.relevanceScore
          ? `${Math.round(snippet.relevanceScore * 100)}%`
          : "N/A"
      ).padEnd(12);

      console.log(
        `│ ${num} │ ${title} │ ${author} │ ${language} │ ${relevance} │`,
      );
    });

    console.log(
      "└─────┴─" +
        "─".repeat(maxTitleLength) +
        "─┴─" +
        "─".repeat(maxAuthorLength) +
        "─┴─────────────┴──────────────┘",
    );
  }
}
