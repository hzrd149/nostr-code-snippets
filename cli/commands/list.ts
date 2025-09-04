import { Command } from "commander";
import { SimplePool, type NostrEvent } from "nostr-tools";
import { neventEncode } from "nostr-tools/nip19";
import { loadConfig } from "../../helpers/config.js";
import { logger } from "../../helpers/debug.js";
import { getReadRelays } from "../../helpers/nostr.js";
import { getSigner } from "../../helpers/signer.js";
import {
  getSnippetCreatedAt,
  getSnippetLanguage,
  getSnippetTags,
  getSnippetTitle,
  snippetMatchesLanguage,
  snippetMatchesTag,
} from "../../helpers/snippet.js";
import type { BaseCommand } from "../types.js";
import { formatSnippetForDisplay, createClickableLink } from "../utils.js";

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

      const events = await this.fetchUserSnippets(config, {
        limit,
        language: options.language,
        tag: options.tag,
      });

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
          console.log(JSON.stringify(events, null, 2));
          break;
        case "detailed":
          events.forEach((event, index) => {
            console.log(`\n${index + 1}. ${formatSnippetForDisplay(event)}`);
            console.log("─".repeat(50));
          });
          break;
        default: // table
          this.displayTable(events);
      }
    } catch (error) {
      console.error(
        "❌ Failed to list snippets:",
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  }

  private async fetchUserSnippets(
    config: any,
    filters: any,
  ): Promise<NostrEvent[]> {
    logger("🔍 Searching your snippets...");
    if (filters.language) logger(`   Language: ${filters.language}`);
    if (filters.tag) logger(`   Tag: ${filters.tag}`);

    try {
      // Get user's public key
      let userPubkey = config.pubkey;

      if (!userPubkey) {
        try {
          const signer = await getSigner();
          userPubkey = await signer.getPublicKey();
        } catch (error) {
          throw new Error(
            "No pubkey found in config and no signer available. Please run 'nostr-code-snippets signer --connect' first.",
          );
        }
      }

      logger(`   Searching for snippets from pubkey: ${userPubkey}`);

      // Get the optimal set of relays to read from (includes outbox relays)
      const readRelays = await getReadRelays();
      logger(
        `   Reading from ${readRelays.length} relays: ${readRelays.join(", ")}`,
      );

      // Create a simple pool for querying
      const simplePool = new SimplePool();

      // Query for kind 1337 events from the user
      const filter = {
        kinds: [1337], // Code snippet kind from NIP-C0
        authors: [userPubkey],
        limit: filters.limit * 2, // Get more to account for filtering
      };

      logger(`   Querying with filter: ${JSON.stringify(filter)}`);

      // Get events from relays
      const events = await simplePool.querySync(readRelays, filter);

      logger(`   Found ${events.length} raw events`);

      // Close the pool to clean up connections
      simplePool.close(readRelays);

      // Filter and sort events
      const filteredEvents = events
        .filter((event) => {
          // Apply filters
          if (
            filters.language &&
            !snippetMatchesLanguage(event, filters.language)
          ) {
            return false;
          }
          if (filters.tag && !snippetMatchesTag(event, filters.tag)) {
            return false;
          }
          return true;
        })
        .sort(
          (a, b) =>
            getSnippetCreatedAt(b).getTime() - getSnippetCreatedAt(a).getTime(),
        ) // Sort by newest first
        .slice(0, filters.limit);

      logger(`   Filtered to ${filteredEvents.length} matching snippets`);
      return filteredEvents;
    } catch (error) {
      logger(`   Error fetching snippets: ${error}`);
      throw error;
    }
  }

  private displayTable(events: NostrEvent[]): void {
    const maxTitleLength = 30;
    const maxLanguageLength = 12;

    // Header
    console.log(
      "\n┌────────┬─" +
        "─".repeat(maxTitleLength) +
        "─┬─" +
        "─".repeat(maxLanguageLength) +
        "─┬─────────────┬──────────────┐",
    );
    console.log(
      "│ ID     │ " +
        "Title".padEnd(maxTitleLength) +
        " │ " +
        "Language".padEnd(maxLanguageLength) +
        " │ Tags        │ Created      │",
    );
    console.log(
      "├────────┼─" +
        "─".repeat(maxTitleLength) +
        "─┼─" +
        "─".repeat(maxLanguageLength) +
        "─┼─────────────┼──────────────┤",
    );

    // Rows
    events.forEach((event) => {
      const nevent = neventEncode({
        id: event.id,
        author: event.pubkey,
        kind: event.kind,
      });
      const url = `https://njump.me/${nevent}`;
      const shortId = event.id.substring(0, 6);
      const clickableId = createClickableLink(url, shortId.padEnd(6));

      const title = getSnippetTitle(event)
        .substring(0, maxTitleLength)
        .padEnd(maxTitleLength);
      const language = (getSnippetLanguage(event) || "Unknown")
        .substring(0, maxLanguageLength)
        .padEnd(maxLanguageLength);
      const tags = getSnippetTags(event)
        .slice(0, 2)
        .join(",")
        .substring(0, 11)
        .padEnd(11);
      const created = getSnippetCreatedAt(event)
        .toLocaleDateString()
        .padEnd(12);

      console.log(
        `│ ${clickableId} │ ${title} │ ${language} │ ${tags} │ ${created} │`,
      );
    });

    console.log(
      "└────────┴─" +
        "─".repeat(maxTitleLength) +
        "─┴─" +
        "─".repeat(maxLanguageLength) +
        "─┴─────────────┴──────────────┘",
    );
  }
}
