import { Command } from "commander";
import { logger } from "../../helpers/debug.js";
import type { BaseCommand } from "../types.js";
import { formatSnippetForDisplay } from "../utils.js";
import {
  searchCodeSnippets,
  type SearchFilters,
} from "../../helpers/search.js";
import type { NostrEvent } from "nostr-tools";

export class SearchCommand implements BaseCommand {
  name = "search";
  description = "Search for code snippets on Nostr";

  setup(program: Command): void {
    program
      .command(this.name)
      .description(this.description)
      .argument("<query>", "Search query for code snippets")
      .option("--limit <number>", "Maximum number of results to return", "10")
      .option("-l, --language <language>", "Filter by programming language")
      .option(
        "-t, --tag <tag>",
        "Filter by tag (can be used multiple times)",
        (value: string, previous: string[]) => {
          return previous ? [...previous, value] : [value];
        },
        [] as string[],
      )
      .option("-a, --author <author>", "Filter by author (npub or hex)")
      .option(
        "--format <format>",
        "Output format (table|json|detailed)",
        "detailed",
      )
      .option("--sort <sort>", "Sort by (relevance|date|author)", "relevance")
      .option(
        "-r, --relay <relay>",
        "Additional relay to search (can be used multiple times)",
        (value: string, previous: string[]) => {
          return previous ? [...previous, value] : [value];
        },
        [] as string[],
      )
      .action(async (query: string, options) => {
        await this.execute(query, options);
      });
  }

  async execute(query: string, options: any): Promise<void> {
    try {
      console.log(`🔍 Searching for: "${query}"`);

      const limit = parseInt(options.limit);

      // Show search parameters
      const searchParams = [];
      if (options.language) searchParams.push(`Language: ${options.language}`);
      if (options.tag && options.tag.length > 0)
        searchParams.push(`Tags: ${options.tag.join(", ")}`);
      if (options.author) searchParams.push(`Author: ${options.author}`);
      if (options.relay && options.relay.length > 0)
        searchParams.push(`Extra relays: ${options.relay.join(", ")}`);
      if (searchParams.length > 0) {
        console.log(`   Filters: ${searchParams.join(", ")}`);
      }

      // Build search filters
      const searchFilters: SearchFilters = {
        query,
        limit,
        language: options.language,
        tags: options.tag.length > 0 ? options.tag : undefined,
        author: options.author,
        extraRelays: options.relay.length > 0 ? options.relay : undefined,
      };

      // Execute search using NIP-50
      const searchResult = await searchCodeSnippets(searchFilters);

      if (searchResult.events.length === 0) {
        console.log("\n🔍 No snippets found matching your search.");
        console.log("💡 Try different keywords or remove filters.");

        // Show search info
        if (searchResult.nip50SupportedRelays.length > 0) {
          console.log(
            `   Searched ${searchResult.nip50SupportedRelays.length} NIP-50 relays`,
          );
        } else {
          console.log(
            `   Used fallback search on ${searchResult.searchedRelays.length} relays`,
          );
        }
        return;
      }

      console.log(
        `\n📊 Found ${searchResult.events.length} matching snippet${searchResult.events.length === 1 ? "" : "s"}:`,
      );

      // Show search method info
      if (searchResult.nip50SupportedRelays.length > 0) {
        console.log(
          `   📡 Searched ${searchResult.nip50SupportedRelays.length} NIP-50 relays`,
        );
      } else {
        console.log(
          `   📡 Used fallback search (${searchResult.searchedRelays.length} relays, no NIP-50 support)`,
        );
      }

      // Sort results if needed
      let sortedEvents = [...searchResult.events];
      switch (options.sort) {
        case "date":
          sortedEvents.sort((a, b) => b.created_at - a.created_at);
          break;
        case "author":
          sortedEvents.sort((a, b) => a.pubkey.localeCompare(b.pubkey));
          break;
        // For relevance, keep original order from search results
      }

      switch (options.format) {
        case "json":
          console.log(JSON.stringify(sortedEvents, null, 2));
          break;
        case "table":
          this.displayTable(sortedEvents);
          break;
        default: // detailed
          sortedEvents.forEach((event, index) => {
            console.log(`\n${index + 1}. ${formatSnippetForDisplay(event)}`);
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

  private displayTable(events: NostrEvent[]): void {
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
        " │ Language    │ Date         │",
    );
    console.log(
      "├─────┼─" +
        "─".repeat(maxTitleLength) +
        "─┼─" +
        "─".repeat(maxAuthorLength) +
        "─┼─────────────┼──────────────┤",
    );

    // Rows
    events.forEach((event, index) => {
      const num = (index + 1).toString().padEnd(3);
      const title = (
        event.tags.find((tag) => tag[0] === "title")?.[1] || "Untitled"
      )
        .substring(0, maxTitleLength)
        .padEnd(maxTitleLength);
      const authorShort = event.pubkey
        .substring(0, maxAuthorLength)
        .padEnd(maxAuthorLength);
      const language = (
        event.tags.find((tag) => tag[0] === "l")?.[1] || "Unknown"
      )
        .substring(0, 11)
        .padEnd(11);
      const date = new Date(event.created_at * 1000)
        .toLocaleDateString()
        .substring(0, 12)
        .padEnd(12);

      console.log(
        `│ ${num} │ ${title} │ ${authorShort} │ ${language} │ ${date} │`,
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
