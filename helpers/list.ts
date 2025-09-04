import {
  mapEventsToStore,
  mapEventsToTimeline,
  simpleTimeout,
} from "applesauce-core";
import { type Filter, type NostrEvent } from "nostr-tools";
import { neventEncode } from "nostr-tools/nip19";
import { lastValueFrom } from "rxjs";
import { logger } from "./debug.js";
import { eventStore, getReadRelays, pool } from "./nostr.js";
import {
  getSnippetCreatedAt,
  getSnippetLanguage,
  getSnippetTags,
  getSnippetTitle,
} from "./snippet.js";
import { getPublicKey } from "./user.js";

const log = logger.extend("list");

export interface SnippetFilters {
  limit?: number;
  language?: string;
  tags?: string[];
}

export interface SnippetListResult {
  events: NostrEvent[];
  total: number;
}

/**
 * Fetch user's published code snippets from Nostr relays
 */
export async function fetchUserSnippets(
  filters: SnippetFilters = {},
): Promise<SnippetListResult> {
  log("🔍 Searching your snippets...");
  if (filters.language) log(`   Language: ${filters.language}`);
  if (filters.tags) log(`   Tags: ${filters.tags.join(", ")}`);

  try {
    // Get user's public key using the centralized method
    const userPubkey = await getPublicKey();

    if (!userPubkey) {
      throw new Error(
        "No pubkey found in config and no signer available. Please run 'nostr-code-snippets signer --connect' first.",
      );
    }

    log(`   Searching for snippets from pubkey: ${userPubkey}`);

    // Get the optimal set of relays to read from (includes outbox relays)
    const readRelays = await getReadRelays();
    log(
      `   Reading from ${readRelays.length} relays: ${readRelays.join(", ")}`,
    );

    // Query for kind 1337 events from the user
    const nostrFilter: Filter = {
      kinds: [1337], // Code snippet kind from NIP-C0
      authors: [userPubkey],
      limit: filters.limit || 10,
    };

    if (filters.language) nostrFilter["#l"] = [filters.language];
    if (filters.tags)
      nostrFilter["#t"] = filters.tags.map((tag) => tag.toLowerCase());

    log(`   Querying with filter: ${JSON.stringify(nostrFilter)}`);

    // Get events from relays
    const events = await lastValueFrom(
      pool.request(readRelays, nostrFilter).pipe(
        // Deduplicate events
        mapEventsToStore(eventStore),
        // Map to timeline
        mapEventsToTimeline(),
        // Timeout after 10 seconds
        simpleTimeout(10_000),
      ),
    );

    log(`   Found ${events.length} snippets`);
    return {
      events,
      total: events.length,
    };
  } catch (error) {
    log(`   Error fetching snippets: ${error}`);
    throw error;
  }
}

/**
 * Create a clickable terminal link using ANSI escape sequences
 */
export function createClickableLink(url: string, text: string): string {
  return `\u001b]8;;${url}\u0007${text}\u001b]8;;\u0007`;
}

/**
 * Display snippets in a formatted table
 */
export function displaySnippetsTable(events: NostrEvent[]): string {
  const maxTitleLength = 30;
  const maxLanguageLength = 12;

  let output = "";

  // Header
  output +=
    "\n┌────────┬─" +
    "─".repeat(maxTitleLength) +
    "─┬─" +
    "─".repeat(maxLanguageLength) +
    "─┬─────────────┬──────────────┐\n";
  output +=
    "│ ID     │ " +
    "Title".padEnd(maxTitleLength) +
    " │ " +
    "Language".padEnd(maxLanguageLength) +
    " │ Tags        │ Created      │\n";
  output +=
    "├────────┼─" +
    "─".repeat(maxTitleLength) +
    "─┼─" +
    "─".repeat(maxLanguageLength) +
    "─┼─────────────┼──────────────┤\n";

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
    const created = getSnippetCreatedAt(event).toLocaleDateString().padEnd(12);

    output += `│ ${clickableId} │ ${title} │ ${language} │ ${tags} │ ${created} │\n`;
  });

  output +=
    "└────────┴─" +
    "─".repeat(maxTitleLength) +
    "─┴─" +
    "─".repeat(maxLanguageLength) +
    "─┴─────────────┴──────────────┘\n";

  return output;
}

/**
 * Format snippets as JSON string
 */
export function formatSnippetsAsJson(events: NostrEvent[]): string {
  return JSON.stringify(events, null, 2);
}

/**
 * Format snippets for detailed display
 */
export function formatSnippetsDetailed(events: NostrEvent[]): string {
  let output = "";
  events.forEach((event, index) => {
    // Import formatSnippetForDisplay from utils to avoid circular dependency
    const nevent = neventEncode({
      id: event.id,
      author: event.pubkey,
      kind: event.kind,
    });
    const url = `https://njump.me/${nevent}`;
    const clickableLink = createClickableLink(url, "View on njump.me");

    const lines = [
      `📝 ${getSnippetTitle(event)}`,
      `🆔 ID: ${event.id.substring(0, 12)}...`,
      `📅 ${getSnippetCreatedAt(event).toLocaleDateString()}`,
      `🔗 ${clickableLink}`,
    ];

    const language = getSnippetLanguage(event);
    if (language) lines.push(`💻 Language: ${language}`);

    const tags = getSnippetTags(event);
    if (tags.length > 0) lines.push(`🏷️  Tags: ${tags.join(", ")}`);

    output += `\n${index + 1}. ${lines.join("\n")}\n`;
    output += "─".repeat(50) + "\n";
  });
  return output;
}
