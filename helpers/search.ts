import {
  mapEventsToStore,
  mapEventsToTimeline,
  simpleTimeout,
} from "applesauce-core";
import {
  getTagValue,
  mergeRelaySets,
  normalizeToPubkey,
} from "applesauce-core/helpers";
import { Index } from "flexsearch";
import { type Filter, type NostrEvent } from "nostr-tools";
import { endWith, firstValueFrom, lastValueFrom, startWith } from "rxjs";
import { DEFAULT_SEARCH_RELAYS } from "./const.js";
import { logger } from "./debug.js";
import { normalizeLanguage } from "./languages.js";
import { eventStore, getReadRelays, pool } from "./nostr.js";
import { getPublicKey, getUserSearchRelays } from "./user.js";

const log = logger.extend("search");

export interface SearchFilters {
  query: string;
  tags?: string[];
  language?: string;
  author?: string;
  limit?: number;
}

export interface RelayInfo {
  name?: string;
  description?: string;
  pubkey?: string;
  contact?: string;
  supported_nips?: number[];
  software?: string;
  version?: string;
  limitation?: {
    max_message_length?: number;
    max_subscriptions?: number;
    max_filters?: number;
    max_limit?: number;
    max_subid_length?: number;
    max_event_tags?: number;
    max_content_length?: number;
    min_pow_difficulty?: number;
    auth_required?: boolean;
    payment_required?: boolean;
  };
}

export interface SearchResult {
  events: NostrEvent[];
  total: number;
  searchedRelays: string[];
  nip50SupportedRelays: string[];
}

/**
 * Check if a relay supports NIP-50 search
 */
function supportsNIP50(relayInfo: RelayInfo): boolean {
  return relayInfo.supported_nips?.includes(50) ?? false;
}

/**
 * Get search relays, checking NIP-50 support
 */
async function getSearchRelays(): Promise<string[]> {
  let searchRelays: string[] = [];

  try {
    // Try to get user's search relays first
    const userPubkey = await getPublicKey();
    if (userPubkey) {
      try {
        const userSearchRelays = await getUserSearchRelays(userPubkey);
        if (userSearchRelays.length > 0) {
          searchRelays = userSearchRelays;
          log(`Using user's search relays: ${searchRelays.join(", ")}`);
        }
      } catch (error) {
        log(`Failed to get user search relays: ${error}`);
      }
    }
  } catch (error) {
    log(`Error getting user pubkey: ${error}`);
  }

  // Fallback to default search relays if no user relays found
  if (searchRelays.length === 0) {
    searchRelays = DEFAULT_SEARCH_RELAYS;
    log(`Using default search relays: ${searchRelays.join(", ")}`);
  }

  return searchRelays;
}

/**
 * Filter relays that support NIP-50
 */
async function filterNIP50SupportedRelays(relays: string[]): Promise<string[]> {
  const supportedRelays: string[] = [];

  log(`Checking NIP-50 support for ${relays.length} relays...`);

  // Check each relay for NIP-50 support
  const relayChecks = relays.map(async (relay) => {
    const relayInfo = await firstValueFrom(
      pool.relay(relay).information$.pipe(endWith(null)),
    );
    if (relayInfo && supportsNIP50(relayInfo)) {
      supportedRelays.push(relay);
      log(`✓ ${relay} supports NIP-50`);
      return true;
    } else {
      log(`✗ ${relay} does not support NIP-50`);
      return false;
    }
  });

  await Promise.all(relayChecks);

  log(`Found ${supportedRelays.length} relays supporting NIP-50`);
  return supportedRelays;
}

/**
 * Build Nostr filter for search with NIP-50 support
 */
function buildSearchFilter(filters: SearchFilters): Filter {
  const nostrFilter: Filter & { search?: string } = {
    kinds: [1337], // Code snippet kind from NIP-C0
    search: filters.query, // NIP-50 search field
    // Don't set limit in nostr filter. we want more data from the relay and then filter it down
    // limit: filters.limit || 10,
  };

  // Add optional filters
  if (filters.language) nostrFilter["#l"] = [filters.language];

  if (filters.tags && filters.tags.length > 0)
    nostrFilter["#t"] = filters.tags.map((tag) => tag.toLowerCase());

  if (filters.author) {
    // Support both hex pubkey and npub format
    let authorPubkey = filters.author;
    if (filters.author.startsWith("npub1")) {
      try {
        const { nip19 } = require("nostr-tools");
        const decoded = nip19.decode(filters.author);
        if (decoded.type === "npub") {
          authorPubkey = decoded.data;
        }
      } catch (error) {
        log(`Failed to decode npub: ${error}`);
      }
    }
    nostrFilter.authors = [authorPubkey];
  }

  return nostrFilter;
}

/**
 * Search for code snippets using NIP-50 and fallback search
 */
export async function searchCodeSnippets(
  filters: SearchFilters,
  extraRelays?: string[],
): Promise<SearchResult> {
  // Normalize input
  if (filters.author) {
    const key = normalizeToPubkey(filters.author);
    if (!key) throw new Error("Invalid author");
    filters.author = key;
  }
  if (filters.language)
    filters.language = normalizeLanguage(filters.language) || filters.language;

  log(`🔍 Searching for: "${filters.query}"`);
  if (filters.language) log(`   Language: ${filters.language}`);
  if (filters.tags) log(`   Tags: ${filters.tags.join(", ")}`);
  if (filters.author) log(`   Author: ${filters.author}`);

  try {
    // Get search relays
    const searchRelays = await getSearchRelays();
    const readRelays = await getReadRelays();

    const relays = mergeRelaySets(searchRelays, readRelays, extraRelays);

    if (relays.length === 0) throw new Error("No search relays available");

    // Filter relays that support NIP-50
    const nip50SupportedRelays = await filterNIP50SupportedRelays(relays);
    const nonNip50Relays = relays.filter(
      (relay) => !nip50SupportedRelays.includes(relay),
    );

    log(
      `   NIP-50 relays: ${nip50SupportedRelays.length}, Fallback relays: ${nonNip50Relays.length}`,
    );

    // Execute searches in parallel
    const searchPromises: Promise<NostrEvent[]>[] = [];

    // Search non-NIP-50 relays with fallback method if any
    if (nonNip50Relays.length > 0) {
      log(
        `   Searching ${nonNip50Relays.length} non-NIP-50 relays with fallback: ${nonNip50Relays.join(", ")}`,
      );

      const fallbackPromise = fallbackSearchEvents(filters, nonNip50Relays);
      searchPromises.push(fallbackPromise);
    }

    // Search NIP-50 supporting relays if any
    if (nip50SupportedRelays.length > 0) {
      log(
        `   Searching ${nip50SupportedRelays.length} NIP-50 relays: ${nip50SupportedRelays.join(", ")}`,
      );

      const searchFilter = buildSearchFilter(filters);

      const nip50Promise = lastValueFrom(
        pool.request(nip50SupportedRelays, searchFilter).pipe(
          // Deduplicate events
          mapEventsToStore(eventStore),
          // Map to timeline
          mapEventsToTimeline(),
          // Timeout after 15 seconds for search
          simpleTimeout(15_000),
          // Start with an empty array if no events are found
          startWith([]),
        ),
      );
      searchPromises.push(nip50Promise);
    }

    // Wait for all searches to complete
    const searchResults = await Promise.all(searchPromises);

    // Combine and deduplicate results
    const seen = new Set<string>();
    const allEvents = searchResults.flat().filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });

    // Apply final limit
    const finalEvents = filters.limit
      ? allEvents.slice(0, filters.limit)
      : allEvents;

    log(`   Combined results: ${finalEvents.length} snippets`);

    return {
      events: finalEvents,
      total: finalEvents.length,
      searchedRelays: searchRelays,
      nip50SupportedRelays,
    };
  } catch (error) {
    log(`   Error searching snippets: ${error}`);
    throw error;
  }
}

/**
 * Fuzzy search events using FlexSearch
 */
async function fuzzySearchEvents(
  events: NostrEvent[],
  query: string,
): Promise<NostrEvent[]> {
  if (!query.trim()) return events;

  // Create FlexSearch index
  const index = new Index({
    tokenize: "forward",
    resolution: 3,
    cache: true,
  });

  // Index events with combined searchable text
  const eventMap = new Map<number, NostrEvent>();

  events.forEach((event, idx) => {
    const title = getTagValue(event, "title") || "";
    const tags = event.tags
      .filter((tag) => tag[0] === "t")
      .map((tag) => tag[1] || "")
      .join(" ");

    // Combine content, title, and tags for comprehensive search
    const searchableText = `${event.content} ${title} ${tags}`;

    index.add(idx, searchableText);
    eventMap.set(idx, event);
  });

  // Perform fuzzy search
  const results = index.search(query, {
    limit: events.length, // Get all matches, we'll sort them
    suggest: true,
  });

  // Convert search results back to events
  const matchedEvents = results
    .map((idx) => eventMap.get(idx as number))
    .filter((event): event is NostrEvent => event !== undefined);

  return matchedEvents;
}

/**
 * Execute fallback search and return events only (for use in parallel searches)
 */
async function fallbackSearchEvents(
  filters: SearchFilters,
  relays: string[],
): Promise<NostrEvent[]> {
  log("🔄 Using fallback search for non-NIP-50 relays");

  // Build basic filter without search field
  const basicFilter: Filter = {
    kinds: [1337],
  };

  // Add optional filters
  if (filters.language) basicFilter["#l"] = [filters.language];

  if (filters.tags && filters.tags.length > 0)
    basicFilter["#t"] = filters.tags.map((tag) => tag.toLowerCase());

  if (filters.author) {
    const key = normalizeToPubkey(filters.author);
    if (!key) throw new Error("Invalid author");
    const authorPubkey = key;
    basicFilter.authors = [authorPubkey];
  }

  log(`   Fallback filter: ${JSON.stringify(basicFilter)}`);

  // Execute basic search
  const events = await lastValueFrom(
    pool.request(relays, basicFilter).pipe(
      // Deduplicate events
      mapEventsToStore(eventStore),
      // Map to timeline
      mapEventsToTimeline(),
      // Timeout after 15 seconds for search
      simpleTimeout(15_000),
      // Start with an empty array if no events are found
      startWith([]),
    ),
  );

  // Client-side fuzzy filtering using FlexSearch
  const filteredEvents = await fuzzySearchEvents(events, filters.query);

  log(`   Fallback search found ${filteredEvents.length} snippets`);
  return filteredEvents;
}

/**
 * Fallback search without NIP-50 (basic text matching) - legacy function for backward compatibility
 */
async function fallbackSearch(
  filters: SearchFilters,
  relays: string[],
): Promise<SearchResult> {
  log("🔄 Using legacy fallback search without NIP-50");

  const events = await fallbackSearchEvents(filters, relays);

  // Limit results
  const limitedEvents = events.slice(0, filters.limit || 10);

  return {
    events: limitedEvents,
    total: limitedEvents.length,
    searchedRelays: relays,
    nip50SupportedRelays: [],
  };
}
