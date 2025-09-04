import { Command } from "commander";
import { defined, simpleTimeout } from "applesauce-core";
import { isHexKey } from "applesauce-core/helpers";
import type { NostrEvent } from "nostr-tools";
import { nip19 } from "nostr-tools";
import { firstValueFrom } from "rxjs";
import { logger } from "../../helpers/debug.js";
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
import type { BaseCommand } from "../types.js";

const log = logger.extend("fetch");

export class FetchCommand implements BaseCommand {
  name = "fetch";
  description = "Fetch a single code snippet by event ID or nevent";

  setup(program: Command): void {
    program
      .command(this.name)
      .description(this.description)
      .argument(
        "<address>",
        "NIP-19 nevent1 identifier or hex event ID for the code snippet",
      )
      .option(
        "--format <format>",
        "Output format (raw|formatted|detailed)",
        "formatted",
      )
      .action(async (address: string, options) => {
        await this.execute(address, options);
      });
  }

  async execute(address: string, options: any): Promise<void> {
    try {
      console.log(`🔍 Fetching snippet: ${address}`);

      const result = await this.processSingleSnippet(address, options.format);
      console.log("\n" + result);
    } catch (error) {
      console.error(
        "❌ Failed to fetch snippet:",
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  }

  /**
   * Process a single snippet address and return the formatted result
   */
  private async processSingleSnippet(
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
}
