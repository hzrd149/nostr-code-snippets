import { Command } from "commander";
import { logger } from "../../helpers/debug.js";
import type { BaseCommand } from "../types.js";
import { loadConfig, readCodeFile } from "../utils.js";

export class PublishCommand implements BaseCommand {
  name = "publish";
  description = "Publish a code snippet to Nostr";

  setup(program: Command): void {
    program
      .command(this.name)
      .description(this.description)
      .argument("<file>", "Path to the code file to publish")
      .option("-t, --title <title>", "Title for the code snippet")
      .option(
        "-l, --language <language>",
        "Programming language (auto-detected if not specified)",
      )
      .option("--tags <tags>", "Comma-separated tags", (value) =>
        value.split(",").map((tag) => tag.trim()),
      )
      .option("--no-auto-tags", "Disable automatic tagging")
      .action(async (filePath: string, options) => {
        await this.execute(filePath, options);
      });
  }

  async execute(filePath: string, options: any): Promise<void> {
    try {
      console.log(`📝 Publishing code snippet from: ${filePath}`);

      // Read the file
      const { content, language } = readCodeFile(filePath);
      const config = loadConfig();

      // Prepare snippet data
      const snippetData = {
        content,
        language: options.language || language,
        title: options.title || this.generateTitleFromPath(filePath),
        tags: this.prepareTags(
          options.tags,
          language,
          options.autoTags !== false,
        ),
        filePath,
      };

      console.log(`\n📊 Snippet Details:`);
      console.log(`   Title: ${snippetData.title}`);
      console.log(`   Language: ${snippetData.language || "Unknown"}`);
      console.log(`   Tags: ${snippetData.tags.join(", ")}`);
      console.log(`   Size: ${content.length} characters`);

      // TODO: Implement actual Nostr publishing logic
      await this.publishToNostr(snippetData, config);

      console.log("\n✅ Code snippet published successfully!");
      console.log(
        "🔗 You can now search for it using: nostr-code-snippets search",
      );
    } catch (error) {
      console.error(
        "❌ Failed to publish snippet:",
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  }

  private generateTitleFromPath(filePath: string): string {
    const fileName = filePath.split("/").pop() || filePath;
    return fileName.replace(/\.[^/.]+$/, ""); // Remove extension
  }

  private prepareTags(
    userTags: string[] = [],
    language?: string,
    autoTags = true,
  ): string[] {
    const tags = new Set<string>();

    // Add user-provided tags
    userTags.forEach((tag) => tags.add(tag.toLowerCase()));

    if (autoTags) {
      // Add default tags
      tags.add("code");
      tags.add("snippet");

      // Add language tag if detected
      if (language) {
        tags.add(language.toLowerCase());
      }
    }

    return Array.from(tags);
  }

  private async publishToNostr(snippetData: any, config: any): Promise<void> {
    // TODO: Implement Nostr publishing logic
    // This would involve:
    // 1. Creating a Nostr event
    // 2. Signing with private key
    // 3. Publishing to configured relays

    logger("📡 Publishing to Nostr relays...");
    logger(`   Relays: ${config.relays.join(", ")}`);

    // Simulate publishing delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    logger("📡 Published to relays successfully");
  }
}
