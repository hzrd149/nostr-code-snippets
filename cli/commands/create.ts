import { defined, simpleTimeout } from "applesauce-core";
import { isHexKey, mergeRelaySets } from "applesauce-core/helpers";
import { spawn } from "child_process";
import { Command } from "commander";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import inquirer from "inquirer";
import type { NostrEvent } from "nostr-tools";
import { nip19 } from "nostr-tools";
import { tmpdir } from "os";
import { basename, extname, join } from "path";
import { firstValueFrom } from "rxjs";
import { loadConfig, readCodeFile } from "../../helpers/config.js";
import { DEFAULT_SEARCH_RELAYS } from "../../helpers/const.js";
import { logger } from "../../helpers/debug.js";
import { eventStore, getWriteRelays, pool } from "../../helpers/nostr.js";
import { getSigner } from "../../helpers/signer.js";
import {
  getSnippetContent,
  getSnippetLanguage,
  getSnippetName,
} from "../../helpers/snippet.js";
import {
  getFileExtension,
  normalizeLanguage,
  getAllLanguages,
  getLanguageDisplayName,
} from "../../helpers/languages.js";
import { getPublicKey, getUserSearchRelays } from "../../helpers/user.js";
import type { BaseCommand } from "../types.js";

export class CreateCommand implements BaseCommand {
  name = "create";
  description = "Create and publish a code snippet to Nostr";

  setup(program: Command): void {
    program
      .command(this.name)
      .description(this.description)
      .argument(
        "[source]",
        "Path to code file or nevent address of existing snippet (optional)",
      )
      .option(
        "-l, --language <language>",
        "Programming language or file extension (overrides auto-detection)",
      )
      .action(async (source: string | undefined, options) => {
        await this.execute(source, options);
      });
  }

  async execute(source: string | undefined, options: any): Promise<void> {
    try {
      console.log("📝 Creating a new code snippet...");

      // Step 1: Get initial content
      const { content, language, suggestedName } =
        await this.getInitialContent(source);

      // Handle language override from command line
      const finalLanguage = options.language
        ? normalizeLanguage(options.language) || options.language
        : language;

      // Step 2: Create temporary file and open editor
      const editedContent = await this.openEditorForContent(
        content,
        finalLanguage,
        suggestedName,
      );

      // Step 3: Collect metadata from user
      const metadata = await this.collectSnippetMetadata(
        editedContent,
        finalLanguage,
        suggestedName,
      );

      // Step 4: Prepare and publish snippet
      const snippetData = {
        content: editedContent,
        language: metadata.language,
        title: metadata.title,
        description: metadata.description,
        tags: metadata.tags,
        dependencies: metadata.dependencies,
        license: metadata.license,
        repo: metadata.repo,
      };

      console.log(`\n📊 Snippet Details:`);
      console.log(`   Title: ${snippetData.title}`);
      console.log(`   Language: ${snippetData.language || "Unknown"}`);
      console.log(`   Description: ${snippetData.description || "None"}`);
      console.log(`   Tags: ${snippetData.tags.join(", ")}`);
      console.log(`   Size: ${editedContent.length} characters`);

      const config = loadConfig();
      await this.publishToNostr(snippetData, config);

      console.log("\n✅ Code snippet created and published successfully!");
      console.log(
        "🔗 You can now search for it using: nostr-code-snippets search",
      );
    } catch (error) {
      console.error(
        "❌ Failed to create snippet:",
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  }

  /**
   * Get initial content from file path or nevent address
   */
  private async getInitialContent(source?: string): Promise<{
    content: string;
    language?: string;
    suggestedName?: string;
  }> {
    if (!source) {
      // No source provided, start with empty content
      return {
        content: "",
        language: undefined,
        suggestedName: "new-snippet",
      };
    }

    // Check if it's a file path
    if (existsSync(source)) {
      console.log(`📄 Reading file: ${source}`);
      const { content, language } = readCodeFile(source);
      const suggestedName = basename(source, extname(source));
      return { content, language, suggestedName };
    }

    // Try to parse as nevent address
    try {
      console.log(`🔍 Fetching snippet: ${source}`);
      const { content, language, suggestedName } =
        await this.fetchSnippetFromNevent(source);
      return { content, language, suggestedName };
    } catch (error) {
      throw new Error(
        `Source '${source}' is neither a valid file path nor a valid nevent address: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Fetch snippet content from nevent address
   */
  private async fetchSnippetFromNevent(address: string): Promise<{
    content: string;
    language?: string;
    suggestedName?: string;
  }> {
    let eventId: string;
    let eventPointer: any;

    // Check if it's a hex ID or nevent
    if (isHexKey(address)) {
      eventId = address;
      eventPointer = address;
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

      if (decoded.type !== "nevent")
        throw new Error(`Expected nevent, got ${decoded.type}`);

      eventPointer = decoded.data;
      eventId = eventPointer.id;
    }

    // Load the event
    let event: NostrEvent | undefined;
    try {
      event = await firstValueFrom(
        eventStore.event(eventPointer).pipe(defined(), simpleTimeout(5_000)),
      );
    } catch (error) {
      throw new Error(
        `Failed to load event: ${error instanceof Error ? error.message : error}`,
      );
    }

    if (!event) throw new Error(`Event not found: ${eventId}`);

    // Verify it's a code snippet event (kind 1337)
    if (event.kind !== 1337)
      throw new Error(
        `Event is not a code snippet (kind ${event.kind}, expected 1337)`,
      );

    const content = getSnippetContent(event);
    const language = getSnippetLanguage(event);
    const suggestedName = getSnippetName(event) || "copied-snippet";

    return { content, language, suggestedName };
  }

  /**
   * Create temporary file and open in user's default editor
   */
  private async openEditorForContent(
    content: string,
    language?: string,
    suggestedName?: string,
  ): Promise<string> {
    // Determine file extension
    const extension = getFileExtension(language);

    // Generate a safe filename with random component to avoid conflicts
    const baseName = suggestedName || "snippet";
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const fileName = `${baseName}-${randomSuffix}.${extension}`;
    const tempFilePath = join(tmpdir(), fileName);

    try {
      // Write content to temp file
      writeFileSync(tempFilePath, content, "utf-8");
      console.log(`📝 Created temporary file: ${tempFilePath}`);
      console.log(`📝 Opening in your default editor...`);
      console.log(`📝 (Save and close the file when you're done editing)`);

      // Get editor from config, environment, or default
      const config = loadConfig();
      const editor =
        config.editor || process.env.EDITOR || process.env.VISUAL || "open";

      // Open editor and wait for completion
      await new Promise<void>((resolve, reject) => {
        const child = spawn(editor, [tempFilePath], {
          stdio: "inherit",
          shell: true,
        });

        child.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Editor exited with code ${code}`));
          }
        });

        child.on("error", (error) => {
          reject(new Error(`Failed to open editor: ${error.message}`));
        });
      });

      // Read the edited content
      const editedContent = readFileSync(tempFilePath, "utf-8");

      // Clean up temp file
      unlinkSync(tempFilePath);

      return editedContent;
    } catch (error) {
      // Clean up temp file on error
      try {
        if (existsSync(tempFilePath)) {
          unlinkSync(tempFilePath);
        }
      } catch {}
      throw error;
    }
  }

  /**
   * Collect snippet metadata from user
   */
  private async collectSnippetMetadata(
    content: string,
    detectedLanguage?: string,
    suggestedName?: string,
  ): Promise<{
    title: string;
    description?: string;
    language?: string;
    tags: string[];
    dependencies: string[];
    license?: string;
    repo?: string;
  }> {
    console.log("\n📝 Please provide details for your code snippet:");

    const titleAnswer = await inquirer.prompt([
      {
        type: "input",
        name: "title",
        message: "Title for the snippet:",
        default: suggestedName || "Untitled Snippet",
        validate: (input: string) =>
          input.trim().length > 0 || "Title is required",
      },
    ]);

    const descriptionAnswer = await inquirer.prompt([
      {
        type: "input",
        name: "description",
        message: "Description (optional):",
      },
    ]);

    const allLanguages = getAllLanguages();
    const languageAnswer = await inquirer.prompt([
      {
        type: "list",
        name: "language",
        message: "Programming language:",
        choices: [
          ...allLanguages,
          { name: "Other (specify manually)", value: "other" },
        ],
        default: detectedLanguage || "text",
      },
    ]);

    let finalLanguage = languageAnswer.language;
    if (finalLanguage === "other") {
      const customLanguageAnswer = await inquirer.prompt([
        {
          type: "input",
          name: "customLanguage",
          message: "Enter custom language:",
          default: detectedLanguage || "text",
        },
      ]);
      finalLanguage = customLanguageAnswer.customLanguage;
    }

    const tagsAnswer = await inquirer.prompt([
      {
        type: "input",
        name: "tags",
        message: "Tags (comma-separated, optional):",
      },
    ]);

    const dependenciesAnswer = await inquirer.prompt([
      {
        type: "input",
        name: "dependencies",
        message: "Dependencies (comma-separated, optional):",
      },
    ]);

    const licenseAnswer = await inquirer.prompt([
      {
        type: "input",
        name: "license",
        message: "License (optional):",
      },
    ]);

    const repoAnswer = await inquirer.prompt([
      {
        type: "input",
        name: "repo",
        message: "Repository URL (optional):",
      },
    ]);

    const confirmAnswer = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: "Publish this snippet to Nostr?",
        default: true,
      },
    ]);

    // Combine all answers
    const answers = {
      title: titleAnswer.title,
      description: descriptionAnswer.description,
      language: finalLanguage,
      tags: tagsAnswer.tags
        ? tagsAnswer.tags
            .split(",")
            .map((tag: string) => tag.trim().toLowerCase())
            .filter((tag: string) => tag.length > 0)
        : [],
      dependencies: dependenciesAnswer.dependencies
        ? dependenciesAnswer.dependencies
            .split(",")
            .map((dep: string) => dep.trim())
            .filter((dep: string) => dep.length > 0)
        : [],
      license: licenseAnswer.license,
      repo: repoAnswer.repo,
      confirm: confirmAnswer.confirm,
    };

    if (!answers.confirm) {
      console.log("🚫 Snippet creation cancelled.");
      process.exit(0);
    }

    // Add automatic tags
    const allTags = new Set<string>([...answers.tags]);
    allTags.add("code");
    allTags.add("snippet");
    if (answers.language) {
      allTags.add(answers.language.toLowerCase());
    }

    return {
      title: answers.title,
      description: answers.description || undefined,
      language: answers.language || undefined,
      tags: Array.from(allTags),
      dependencies: answers.dependencies,
      license: answers.license || undefined,
      repo: answers.repo || undefined,
    };
  }

  private async publishToNostr(snippetData: any, config: any): Promise<void> {
    logger("📡 Publishing to Nostr relays...");
    logger(`   Event kind: 1337 (NIP-C0 code snippet)`);
    logger(`   Content size: ${snippetData.content.length} characters`);
    logger(`   Title: ${snippetData.title}`);
    logger(`   Language: ${snippetData.language || "Unknown"}`);

    try {
      // Get signer and user public key
      const signer = await getSigner();
      const pubkey = await getPublicKey();

      if (!pubkey) {
        throw new Error(
          "No public key found. Please configure a signer first using: nostr-code-snippets signer --connect",
        );
      }

      // Build tags array for the event
      const tags: string[][] = [];

      // Add language tag
      if (snippetData.language) {
        tags.push(["l", snippetData.language]);
      }

      // Add name/title tag
      tags.push(["name", snippetData.title]);

      // Add description tag if provided
      if (snippetData.description) {
        tags.push(["description", snippetData.description]);
      }

      // Add file extension tag
      if (snippetData.language) {
        const extension = getFileExtension(snippetData.language);
        tags.push(["extension", extension]);
      }

      // Add all user tags
      snippetData.tags.forEach((tag: string) => {
        tags.push(["t", tag]);
      });

      // Add dependencies
      snippetData.dependencies.forEach((dep: string) => {
        tags.push(["dep", dep]);
      });

      // Add license if provided
      if (snippetData.license) {
        tags.push(["license", snippetData.license]);
      }

      // Add repository URL if provided
      if (snippetData.repo) {
        tags.push(["repo", snippetData.repo]);
      }

      // Create the event
      const event = {
        kind: 1337, // NIP-C0 code snippet kind
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: snippetData.content,
        pubkey,
      };

      logger(`   Created event with ${tags.length} tags`);

      // Sign the event
      const signedEvent = await signer.signEvent(event);
      logger(`   Event signed with ID: ${signedEvent.id}`);

      // Get write relays (outbox relays + configured relays)
      const writeRelays = await getWriteRelays();

      // Get search relays for broader discoverability
      let searchRelays: string[] = [];
      try {
        const userSearchRelays = await getUserSearchRelays(pubkey);
        searchRelays = userSearchRelays;
      } catch {
        searchRelays = DEFAULT_SEARCH_RELAYS;
      }

      // Merge all relays for publishing
      const allRelays = mergeRelaySets(writeRelays, searchRelays);
      logger(
        `   Publishing to ${allRelays.length} relays (${writeRelays.length} outbox + ${searchRelays.length} search): ${allRelays.join(", ")}`,
      );

      // Publish to relays
      const publishPromises = allRelays.map(async (relayUrl) => {
        try {
          await pool.publish([relayUrl], signedEvent);
          logger(`   ✅ Published to ${relayUrl}`);
          return { relay: relayUrl, success: true };
        } catch (error) {
          logger(`   ❌ Failed to publish to ${relayUrl}: ${error}`);
          return { relay: relayUrl, success: false, error };
        }
      });

      const results = await Promise.allSettled(publishPromises);
      const successful = results.filter(
        (r) => r.status === "fulfilled" && r.value.success,
      ).length;
      const failed = results.length - successful;

      if (successful > 0) {
        logger(
          `📡 Published successfully to ${successful}/${allRelays.length} relays`,
        );
        if (failed > 0) {
          logger(`⚠️  Failed to publish to ${failed} relays`);
        }
      } else {
        throw new Error(`Failed to publish to any relays (${failed} failures)`);
      }
    } catch (error) {
      throw new Error(
        `Failed to publish snippet: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
