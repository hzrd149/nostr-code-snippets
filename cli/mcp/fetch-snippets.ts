import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { defined, simpleTimeout } from "applesauce-core";
import { isHexKey } from "applesauce-core/helpers";
import type { NostrEvent } from "nostr-tools";
import { nip19 } from "nostr-tools";
import { firstValueFrom } from "rxjs";
import { z } from "zod";
import { logger } from "../../helpers/debug.js";
import { mcpError, mcpSuccess, mcpMultiple } from "../../helpers/mcp.js";
import { eventStore } from "../../helpers/nostr.js";
import {
  getSnippetContent,
  getSnippetCreatedAt,
  getSnippetDependencies,
  getSnippetDescription,
  getSnippetLanguage,
  getSnippetLicense,
  getSnippetName,
  getSnippetRepo,
  getSnippetTags,
  getSnippetTitle,
} from "../../helpers/snippet.js";

const log = logger.extend("mcp:fetch-snippets");

/**
 * Process a single snippet address and return the formatted result
 */
async function processSingleSnippet(
  address: string,
  format: string,
): Promise<string> {
  let eventId: string;
  let eventPointer: any;

  // Check if it's a hex ID or nevent
  if (isHexKey(address)) {
    // It's a hex event ID
    eventId = address;
    eventPointer = address; // eventStore.event can accept just the hex ID
    log(`Using hex event ID: ${eventId}`);
  } else {
    // Try to decode as nevent
    let decoded;
    try {
      decoded = nip19.decode(address);
    } catch (error) {
      throw new Error(
        `Invalid address format: Expected either a 64-character hex event ID or NIP-19 nevent identifier. Error: ${error instanceof Error ? error.message : error}`,
      );
    }

    if (decoded.type !== "nevent") {
      throw new Error(`Expected nevent, got ${decoded.type}`);
    }

    eventPointer = decoded.data;
    eventId = eventPointer.id;
    log(`Using nevent, Event ID: ${eventId}`);
  }

  // Load the event
  let event: NostrEvent | undefined;
  try {
    event = await firstValueFrom(
      eventStore.event(eventPointer).pipe(defined(), simpleTimeout(5_000)),
    );
  } catch (error) {
    log(`Failed to load event: ${error}`);
    throw new Error(
      `Failed to load event: ${error instanceof Error ? error.message : error}`,
    );
  }

  if (!event) {
    throw new Error(`Event not found: ${eventId}`);
  }

  // Verify it's a code snippet event (kind 1337)
  if (event.kind !== 1337) {
    throw new Error(
      `Event is not a code snippet (kind ${event.kind}, expected 1337)`,
    );
  }

  log(`✅ Found code snippet: ${getSnippetTitle(event)}`);

  // Format the output based on the requested format
  switch (format) {
    case "raw":
      return getSnippetContent(event);

    case "detailed":
      const title = getSnippetTitle(event);
      const language = getSnippetLanguage(event) || "unknown";
      const name = getSnippetName(event);
      const description = getSnippetDescription(event);
      const tags = getSnippetTags(event);
      const createdAt = getSnippetCreatedAt(event);
      const dependencies = getSnippetDependencies(event);
      const license = getSnippetLicense(event);
      const repo = getSnippetRepo(event);
      const content = getSnippetContent(event);

      let detailedText = `# ${title}\n\n`;

      if (name) detailedText += `**Name:** ${name}\n`;
      if (description) detailedText += `**Description:** ${description}\n`;
      detailedText += `**Language:** ${language}\n`;
      detailedText += `**Author:** ${event.pubkey.substring(0, 16)}...\n`;
      detailedText += `**Created:** ${createdAt.toLocaleString()}\n`;

      if (tags.length > 0) detailedText += `**Tags:** ${tags.join(", ")}\n`;
      if (dependencies.length > 0)
        detailedText += `**Dependencies:** ${dependencies.join(", ")}\n`;
      if (license) detailedText += `**License:** ${license}\n`;
      if (repo) detailedText += `**Repository:** ${repo}\n`;

      detailedText += `\n## Code\n\n\`\`\`${language}\n${content}\n\`\`\``;

      return detailedText;

    default: // formatted
      const snippetTitle = getSnippetTitle(event);
      const snippetLanguage = getSnippetLanguage(event) || "unknown";
      const snippetContent = getSnippetContent(event);

      return `**${snippetTitle}**
Language: ${snippetLanguage}
Author: ${event.pubkey.substring(0, 16)}...

\`\`\`${snippetLanguage}
${snippetContent}
\`\`\``;
  }
}

export function registerFetchSnippetsTool(server: McpServer) {
  log("🔧 Registering fetch_code_snippets tool...");

  server.registerTool(
    "fetch_code_snippets",
    {
      title: "Fetch code snippets by event ID or nevent",
      description: "Fetch multiple code snippets from Nostr",
      inputSchema: {
        addresses: z
          .string()
          .min(10)
          .describe(
            "NIP-19 nevent1 identifier(s) or hex id(s) for code snippets. Multiple addresses can be provided separated by newlines.",
          ),
        format: z
          .enum(["raw", "formatted", "detailed"])
          .default("formatted")
          .describe("Output format for the snippet"),
      },
    },
    async ({ addresses: addressInput, format }) => {
      // Parse addresses - split on newlines and filter out empty lines
      const addresses = addressInput
        .split("\n")
        .map((addr) => addr.trim())
        .filter((addr) => addr.length > 0);

      if (addresses.length === 0)
        return mcpError("No valid addresses provided");

      log(`Processing ${addresses.length} address(es)`);

      const results: string[] = [];

      // Process each address
      for (const addr of addresses) {
        try {
          const result = await processSingleSnippet(addr, format);
          results.push(result);
        } catch (error) {
          const errorMsg = `❌ Failed to fetch snippet ${addr}: ${error instanceof Error ? error.message : error}`;
          log(errorMsg);
          results.push(errorMsg);
        }
      }

      // Return multiple results
      if (results.length === 1) {
        return mcpSuccess(results[0]!);
      } else {
        return mcpMultiple(results);
      }
    },
  );

  log("✅ fetch_code_snippets tool registered");
}
