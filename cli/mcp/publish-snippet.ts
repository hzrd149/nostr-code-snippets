import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mergeRelaySets } from "applesauce-core/helpers";
import { spawn } from "child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { z } from "zod";
import { loadConfig } from "../../helpers/config.js";
import { DEFAULT_SEARCH_RELAYS } from "../../helpers/const.js";
import { logger } from "../../helpers/debug.js";
import {
  getFileExtension,
  normalizeLanguage,
} from "../../helpers/languages.js";
import { mcpError, mcpSuccess } from "../../helpers/mcp.js";
import { getWriteRelays, pool } from "../../helpers/nostr.js";
import { getSigner } from "../../helpers/signer.js";
import { getPublicKey, getUserSearchRelays } from "../../helpers/user.js";

const log = logger.extend("mcp:publish-snippet");

/**
 * Create temporary file and open in user's default editor
 */
async function openEditorForContent(
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
    log(`📝 Created temporary file: ${tempFilePath}`);

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
 * Publish snippet to Nostr
 */
async function publishToNostr(snippetData: {
  content: string;
  title: string;
  language?: string;
  description?: string;
  tags: string[];
  dependencies: string[];
  license?: string;
  repo?: string;
}): Promise<{
  eventId: string;
  publishedRelays: number;
  failedRelays: number;
}> {
  log("📡 Publishing to Nostr relays...");
  log(`   Event kind: 1337 (NIP-C0 code snippet)`);
  log(`   Content size: ${snippetData.content.length} characters`);
  log(`   Title: ${snippetData.title}`);
  log(`   Language: ${snippetData.language || "Unknown"}`);

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

    log(`   Created event with ${tags.length} tags`);

    // Sign the event
    const signedEvent = await signer.signEvent(event);
    log(`   Event signed with ID: ${signedEvent.id}`);

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
    log(
      `   Publishing to ${allRelays.length} relays (${writeRelays.length} outbox + ${searchRelays.length} search): ${allRelays.join(", ")}`,
    );

    // Publish to relays
    const publishPromises = allRelays.map(async (relayUrl) => {
      try {
        const response = await pool.relay(relayUrl).publish(signedEvent);
        if (response.ok) {
          log(`   ✅ Published to ${relayUrl}`);
          return { relay: relayUrl, success: true };
        } else {
          log(`   ❌ Failed to publish to ${relayUrl}: ${response.message}`);
          return { relay: relayUrl, success: false, error: response.message };
        }
      } catch (error) {
        return { relay: relayUrl, success: true };
      }
    });

    const results = await Promise.allSettled(publishPromises);
    const successful = results.filter(
      (r) => r.status === "fulfilled" && r.value.success,
    ).length;
    const failed = results.length - successful;

    if (successful > 0) {
      log(
        `📡 Published successfully to ${successful}/${allRelays.length} relays`,
      );
      if (failed > 0) {
        log(`⚠️  Failed to publish to ${failed} relays`);
      }
      return {
        eventId: signedEvent.id,
        publishedRelays: successful,
        failedRelays: failed,
      };
    } else {
      throw new Error(`Failed to publish to any relays (${failed} failures)`);
    }
  } catch (error) {
    throw new Error(
      `Failed to publish snippet: ${error instanceof Error ? error.message : error}`,
    );
  }
}

export function registerPublishSnippetTool(server: McpServer) {
  log("🔧 Registering publish_snippet tool...");

  server.registerTool(
    "publish_snippet",
    {
      title: "Publish a code snippet to Nostr",
      description:
        "Create and publish a code snippet to Nostr with AI-provided content and metadata. Opens the code in the user's editor for review/editing before publishing.",
      inputSchema: {
        content: z.string().min(1).describe("The code content for the snippet"),
        title: z.string().min(1).describe("Title/name for the code snippet"),
        language: z
          .string()
          .optional()
          .describe(
            "Programming language (e.g. 'javascript', 'python', 'rust'). Will be normalized automatically.",
          ),
        description: z
          .string()
          .optional()
          .describe("Optional description of what the code does"),
        tags: z
          .array(z.string())
          .default([])
          .describe(
            "Optional tags for categorization (will be automatically lowercased)",
          ),
        dependencies: z
          .array(z.string())
          .default([])
          .describe("Optional list of dependencies/packages required"),
        license: z
          .string()
          .optional()
          .describe("Optional license for the code (e.g. 'MIT', 'Apache-2.0')"),
        repo: z
          .string()
          .optional()
          .describe("Optional repository URL where this code originates"),
      },
    },
    async ({
      content,
      title,
      language,
      description,
      tags = [],
      dependencies = [],
      license,
      repo,
    }) => {
      try {
        log(`📝 Creating snippet: ${title}`);

        // Normalize language if provided
        const finalLanguage = language
          ? normalizeLanguage(language) || language
          : undefined;

        // Open editor for user to review/edit content
        log("📝 Opening code in editor for review...");
        const editedContent = await openEditorForContent(
          content,
          finalLanguage,
          title.toLowerCase().replace(/[^a-z0-9]/g, "-"),
        );

        // If content is empty after editing, user likely cancelled
        if (!editedContent.trim()) {
          return mcpSuccess("🚫 Snippet creation cancelled (empty content).");
        }

        // Prepare snippet data with automatic tags
        const allTags = new Set<string>([
          ...tags
            .map((tag) => tag.trim().toLowerCase())
            .filter((tag) => tag.length > 0),
        ]);
        allTags.add("code");
        allTags.add("snippet");
        if (finalLanguage) {
          allTags.add(finalLanguage.toLowerCase());
        }

        const snippetData = {
          content: editedContent,
          title,
          language: finalLanguage,
          description,
          tags: Array.from(allTags),
          dependencies: dependencies.filter((dep) => dep.trim().length > 0),
          license,
          repo,
        };

        // Publish to Nostr
        const publishResult = await publishToNostr(snippetData);

        return mcpSuccess(
          `✅ Code snippet "${title}" published successfully!

📊 **Snippet Details:**
- Event ID: ${publishResult.eventId}
- Language: ${finalLanguage || "Unknown"}
- Content size: ${editedContent.length} characters
- Tags: ${Array.from(allTags).join(", ")}
- Published to: ${publishResult.publishedRelays} relays
${publishResult.failedRelays > 0 ? `- Failed relays: ${publishResult.failedRelays}` : ""}

🔗 The snippet is now available on Nostr and can be searched using the search_snippets tool.`,
        );
      } catch (error) {
        log(`❌ Failed to publish snippet: ${error}`);
        return mcpError(
          `Failed to publish snippet: ${error instanceof Error ? error.message : error}`,
        );
      }
    },
  );

  log("✅ publish_snippet tool registered");
}
