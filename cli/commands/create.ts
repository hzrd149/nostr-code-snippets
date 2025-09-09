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
import {
  getAllLanguages,
  getFileExtension,
  normalizeLanguage,
} from "../../helpers/languages.js";
import { eventStore, getWriteRelays, pool } from "../../helpers/nostr.js";
import { getSigner } from "../../helpers/signer.js";
import {
  getSnippetContent,
  getSnippetLanguage,
  getSnippetName,
} from "../../helpers/snippet.js";
import { getPublicKey, getUserSearchRelays } from "../../helpers/user.js";
import type { BaseCommand } from "../types.js";

interface SnippetData {
  content: string;
  language?: string;
  title: string;
  description?: string;
  tags: string[];
  dependencies: string[];
  license?: string;
  repo?: string;
}

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

      // Step 3: Interactive snippet configuration
      await this.interactiveSnippetConfig({
        content: editedContent,
        language: finalLanguage,
        title: suggestedName || "Untitled Snippet",
        description: "",
        tags: [],
        dependencies: [],
        license: "",
        repo: "",
      });
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
   * Interactive snippet configuration with menu-driven interface
   */
  private async interactiveSnippetConfig(
    initialData: SnippetData,
  ): Promise<void> {
    console.log("\n🔧 Interactive Snippet Configuration");
    console.log("─".repeat(50));

    let snippetData = { ...initialData };

    while (true) {
      this.showSnippetPreview(snippetData);
      console.log("\n");

      const { action } = await inquirer.prompt([
        {
          type: "list",
          name: "action",
          message: "What would you like to configure?",
          choices: [
            { name: "📝 Title", value: "title" },
            { name: "📄 Description", value: "description" },
            { name: "🔤 Programming Language", value: "language" },
            { name: "🏷️  Tags", value: "tags" },
            { name: "📦 Dependencies", value: "dependencies" },
            { name: "⚖️  License", value: "license" },
            { name: "🔗 Repository URL", value: "repo" },
            { name: "✏️  Edit Code Content", value: "edit_content" },
            { name: "👁️  Preview Snippet", value: "preview" },
            { name: "🚀 Publish to Nostr", value: "publish" },
            { name: "❌ Cancel", value: "cancel" },
          ],
        },
      ]);

      if (action === "cancel") {
        console.log("🚫 Snippet creation cancelled.");
        process.exit(0);
      }

      if (action === "publish") {
        await this.confirmAndPublish(snippetData);
        break;
      }

      switch (action) {
        case "title":
          await this.configureTitle(snippetData);
          break;
        case "description":
          await this.configureDescription(snippetData);
          break;
        case "language":
          await this.configureLanguage(snippetData);
          break;
        case "tags":
          await this.configureTags(snippetData);
          break;
        case "dependencies":
          await this.configureDependencies(snippetData);
          break;
        case "license":
          await this.configureLicense(snippetData);
          break;
        case "repo":
          await this.configureRepo(snippetData);
          break;
        case "edit_content":
          await this.editContent(snippetData);
          break;
        case "preview":
          await this.showDetailedPreview(snippetData);
          break;
      }
    }
  }

  /**
   * Show a compact preview of the current snippet configuration
   */
  private showSnippetPreview(snippetData: SnippetData): void {
    console.log("\n📊 Current Snippet Configuration:");
    console.log("─".repeat(40));
    console.log(`📝 Title: ${snippetData.title}`);
    console.log(`🔤 Language: ${snippetData.language || "Not set"}`);
    console.log(`📄 Description: ${snippetData.description || "Not set"}`);
    console.log(
      `🏷️  Tags: ${snippetData.tags.length > 0 ? snippetData.tags.join(", ") : "None"}`,
    );
    console.log(
      `📦 Dependencies: ${snippetData.dependencies.length > 0 ? snippetData.dependencies.join(", ") : "None"}`,
    );
    console.log(`⚖️  License: ${snippetData.license || "Not set"}`);
    console.log(`🔗 Repository: ${snippetData.repo || "Not set"}`);
    console.log(`📏 Content Size: ${snippetData.content.length} characters`);
  }

  /**
   * Show detailed preview including content sample
   */
  private async showDetailedPreview(snippetData: SnippetData): Promise<void> {
    console.log("\n📋 Detailed Snippet Preview:");
    console.log("═".repeat(60));
    console.log(`📝 Title: ${snippetData.title}`);
    console.log(`🔤 Language: ${snippetData.language || "Unknown"}`);
    console.log(`📄 Description: ${snippetData.description || "None"}`);
    console.log(
      `🏷️  Tags: ${snippetData.tags.length > 0 ? snippetData.tags.join(", ") : "None"}`,
    );
    console.log(
      `📦 Dependencies: ${snippetData.dependencies.length > 0 ? snippetData.dependencies.join(", ") : "None"}`,
    );
    console.log(`⚖️  License: ${snippetData.license || "None"}`);
    console.log(`🔗 Repository: ${snippetData.repo || "None"}`);
    console.log(`📏 Content Size: ${snippetData.content.length} characters`);

    console.log("\n📄 Content Preview (first 10 lines):");
    console.log("─".repeat(40));
    const lines = snippetData.content.split("\n");
    const previewLines = lines.slice(0, 10);
    previewLines.forEach((line, index) => {
      console.log(`${String(index + 1).padStart(3, " ")}| ${line}`);
    });
    if (lines.length > 10) {
      console.log(`... (${lines.length - 10} more lines)`);
    }
    console.log("─".repeat(40));

    // Wait for user to continue
    await inquirer.prompt([
      {
        type: "input",
        name: "continue",
        message: "Press Enter to continue...",
      },
    ]);
  }

  /**
   * Configure snippet title
   */
  private async configureTitle(snippetData: SnippetData): Promise<void> {
    console.log("\n📝 Configure Title");
    console.log("─".repeat(30));
    console.log(`Current: ${snippetData.title}`);

    const { title } = await inquirer.prompt([
      {
        type: "input",
        name: "title",
        message: "Enter snippet title:",
        default: snippetData.title,
        validate: (input: string) =>
          input.trim().length > 0 || "Title is required",
      },
    ]);

    snippetData.title = title.trim();
    console.log(`✅ Title updated: ${snippetData.title}`);
  }

  /**
   * Configure snippet description
   */
  private async configureDescription(snippetData: SnippetData): Promise<void> {
    console.log("\n📄 Configure Description");
    console.log("─".repeat(30));
    console.log(`Current: ${snippetData.description || "Not set"}`);

    const { description } = await inquirer.prompt([
      {
        type: "input",
        name: "description",
        message: "Enter description (optional):",
        default: snippetData.description || "",
      },
    ]);

    snippetData.description = description.trim() || undefined;
    console.log(`✅ Description updated: ${snippetData.description || "None"}`);
  }

  /**
   * Configure programming language
   */
  private async configureLanguage(snippetData: SnippetData): Promise<void> {
    console.log("\n🔤 Configure Programming Language");
    console.log("─".repeat(30));
    console.log(`Current: ${snippetData.language || "Not set"}`);

    const allLanguages = getAllLanguages();
    const { language } = await inquirer.prompt([
      {
        type: "list",
        name: "language",
        message: "Select programming language:",
        choices: [
          ...allLanguages,
          { name: "Other (specify manually)", value: "other" },
          { name: "Clear language", value: "clear" },
        ],
        default: snippetData.language || "text",
      },
    ]);

    if (language === "clear") {
      snippetData.language = undefined;
      console.log("✅ Language cleared");
    } else if (language === "other") {
      const { customLanguage } = await inquirer.prompt([
        {
          type: "input",
          name: "customLanguage",
          message: "Enter custom language:",
          default: snippetData.language || "text",
          validate: (input: string) =>
            input.trim().length > 0 || "Language is required",
        },
      ]);
      snippetData.language = customLanguage.trim();
      console.log(`✅ Language set to: ${snippetData.language}`);
    } else {
      snippetData.language = language;
      console.log(`✅ Language set to: ${snippetData.language}`);
    }
  }

  /**
   * Configure tags
   */
  private async configureTags(snippetData: SnippetData): Promise<void> {
    console.log("\n🏷️  Configure Tags");
    console.log("─".repeat(30));
    console.log(
      `Current: ${snippetData.tags.length > 0 ? snippetData.tags.join(", ") : "None"}`,
    );

    while (true) {
      const { tagAction } = await inquirer.prompt([
        {
          type: "list",
          name: "tagAction",
          message: "What would you like to do with tags?",
          choices: [
            { name: "➕ Add a tag", value: "add" },
            { name: "➖ Remove a tag", value: "remove" },
            { name: "🔄 Replace all tags", value: "replace" },
            { name: "🗑️  Clear all tags", value: "clear" },
            { name: "⬅️  Back", value: "back" },
          ],
        },
      ]);

      if (tagAction === "back") break;

      switch (tagAction) {
        case "add":
          await this.addTag(snippetData);
          break;
        case "remove":
          await this.removeTag(snippetData);
          break;
        case "replace":
          await this.replaceTags(snippetData);
          break;
        case "clear":
          snippetData.tags = [];
          console.log("✅ All tags cleared");
          break;
      }

      console.log(
        `Current tags: ${snippetData.tags.length > 0 ? snippetData.tags.join(", ") : "None"}`,
      );
    }
  }

  private async addTag(snippetData: SnippetData): Promise<void> {
    const { tag } = await inquirer.prompt([
      {
        type: "input",
        name: "tag",
        message: "Enter tag to add:",
        validate: (input: string) =>
          input.trim().length > 0 || "Tag cannot be empty",
      },
    ]);

    const normalizedTag = tag.trim().toLowerCase();
    if (!snippetData.tags.includes(normalizedTag)) {
      snippetData.tags.push(normalizedTag);
      console.log(`✅ Added tag: ${normalizedTag}`);
    } else {
      console.log(`⚠️  Tag already exists: ${normalizedTag}`);
    }
  }

  private async removeTag(snippetData: SnippetData): Promise<void> {
    if (snippetData.tags.length === 0) {
      console.log("⚠️  No tags to remove");
      return;
    }

    const { tagToRemove } = await inquirer.prompt([
      {
        type: "list",
        name: "tagToRemove",
        message: "Select tag to remove:",
        choices: snippetData.tags.map((tag) => ({ name: tag, value: tag })),
      },
    ]);

    const index = snippetData.tags.indexOf(tagToRemove);
    if (index > -1) {
      snippetData.tags.splice(index, 1);
      console.log(`✅ Removed tag: ${tagToRemove}`);
    }
  }

  private async replaceTags(snippetData: SnippetData): Promise<void> {
    const { tagsInput } = await inquirer.prompt([
      {
        type: "input",
        name: "tagsInput",
        message: "Enter tags (comma-separated):",
        default: snippetData.tags.join(", "),
      },
    ]);

    const newTags = tagsInput
      .split(",")
      .map((tag: string) => tag.trim().toLowerCase())
      .filter((tag: string) => tag.length > 0);

    snippetData.tags = newTags;
    console.log(
      `✅ Tags updated: ${newTags.length > 0 ? newTags.join(", ") : "None"}`,
    );
  }

  /**
   * Configure dependencies
   */
  private async configureDependencies(snippetData: SnippetData): Promise<void> {
    console.log("\n📦 Configure Dependencies");
    console.log("─".repeat(30));
    console.log(
      `Current: ${snippetData.dependencies.length > 0 ? snippetData.dependencies.join(", ") : "None"}`,
    );

    while (true) {
      const { depAction } = await inquirer.prompt([
        {
          type: "list",
          name: "depAction",
          message: "What would you like to do with dependencies?",
          choices: [
            { name: "➕ Add a dependency", value: "add" },
            { name: "➖ Remove a dependency", value: "remove" },
            { name: "🔄 Replace all dependencies", value: "replace" },
            { name: "🗑️  Clear all dependencies", value: "clear" },
            { name: "⬅️  Back", value: "back" },
          ],
        },
      ]);

      if (depAction === "back") break;

      switch (depAction) {
        case "add":
          await this.addDependency(snippetData);
          break;
        case "remove":
          await this.removeDependency(snippetData);
          break;
        case "replace":
          await this.replaceDependencies(snippetData);
          break;
        case "clear":
          snippetData.dependencies = [];
          console.log("✅ All dependencies cleared");
          break;
      }

      console.log(
        `Current dependencies: ${snippetData.dependencies.length > 0 ? snippetData.dependencies.join(", ") : "None"}`,
      );
    }
  }

  private async addDependency(snippetData: SnippetData): Promise<void> {
    const { dependency } = await inquirer.prompt([
      {
        type: "input",
        name: "dependency",
        message: "Enter dependency to add:",
        validate: (input: string) =>
          input.trim().length > 0 || "Dependency cannot be empty",
      },
    ]);

    const normalizedDep = dependency.trim();
    if (!snippetData.dependencies.includes(normalizedDep)) {
      snippetData.dependencies.push(normalizedDep);
      console.log(`✅ Added dependency: ${normalizedDep}`);
    } else {
      console.log(`⚠️  Dependency already exists: ${normalizedDep}`);
    }
  }

  private async removeDependency(snippetData: SnippetData): Promise<void> {
    if (snippetData.dependencies.length === 0) {
      console.log("⚠️  No dependencies to remove");
      return;
    }

    const { depToRemove } = await inquirer.prompt([
      {
        type: "list",
        name: "depToRemove",
        message: "Select dependency to remove:",
        choices: snippetData.dependencies.map((dep) => ({
          name: dep,
          value: dep,
        })),
      },
    ]);

    const index = snippetData.dependencies.indexOf(depToRemove);
    if (index > -1) {
      snippetData.dependencies.splice(index, 1);
      console.log(`✅ Removed dependency: ${depToRemove}`);
    }
  }

  private async replaceDependencies(snippetData: SnippetData): Promise<void> {
    const { depsInput } = await inquirer.prompt([
      {
        type: "input",
        name: "depsInput",
        message: "Enter dependencies (comma-separated):",
        default: snippetData.dependencies.join(", "),
      },
    ]);

    const newDeps = depsInput
      .split(",")
      .map((dep: string) => dep.trim())
      .filter((dep: string) => dep.length > 0);

    snippetData.dependencies = newDeps;
    console.log(
      `✅ Dependencies updated: ${newDeps.length > 0 ? newDeps.join(", ") : "None"}`,
    );
  }

  /**
   * Configure license
   */
  private async configureLicense(snippetData: SnippetData): Promise<void> {
    console.log("\n⚖️  Configure License");
    console.log("─".repeat(30));
    console.log(`Current: ${snippetData.license || "Not set"}`);

    const commonLicenses = [
      { name: "MIT", value: "MIT" },
      { name: "Apache-2.0", value: "Apache-2.0" },
      { name: "GPL-3.0", value: "GPL-3.0" },
      { name: "BSD-3-Clause", value: "BSD-3-Clause" },
      { name: "ISC", value: "ISC" },
      { name: "Unlicense", value: "Unlicense" },
      { name: "Custom license", value: "custom" },
      { name: "No license / Clear", value: "clear" },
    ];

    const { license } = await inquirer.prompt([
      {
        type: "list",
        name: "license",
        message: "Select license:",
        choices: commonLicenses,
        default: snippetData.license || "MIT",
      },
    ]);

    if (license === "clear") {
      snippetData.license = undefined;
      console.log("✅ License cleared");
    } else if (license === "custom") {
      const { customLicense } = await inquirer.prompt([
        {
          type: "input",
          name: "customLicense",
          message: "Enter custom license:",
          default: snippetData.license || "",
          validate: (input: string) =>
            input.trim().length > 0 || "License cannot be empty",
        },
      ]);
      snippetData.license = customLicense.trim();
      console.log(`✅ License set to: ${snippetData.license}`);
    } else {
      snippetData.license = license;
      console.log(`✅ License set to: ${snippetData.license}`);
    }
  }

  /**
   * Configure repository URL
   */
  private async configureRepo(snippetData: SnippetData): Promise<void> {
    console.log("\n🔗 Configure Repository URL");
    console.log("─".repeat(30));
    console.log(`Current: ${snippetData.repo || "Not set"}`);

    const { repo } = await inquirer.prompt([
      {
        type: "input",
        name: "repo",
        message: "Enter repository URL (optional):",
        default: snippetData.repo || "",
        validate: (input: string) => {
          if (!input.trim()) return true; // Empty is OK
          try {
            new URL(input.trim());
            return true;
          } catch {
            return "Please enter a valid URL";
          }
        },
      },
    ]);

    snippetData.repo = repo.trim() || undefined;
    console.log(
      `✅ Repository URL ${snippetData.repo ? `set to: ${snippetData.repo}` : "cleared"}`,
    );
  }

  /**
   * Edit code content
   */
  private async editContent(snippetData: SnippetData): Promise<void> {
    console.log("\n✏️  Edit Code Content");
    console.log("─".repeat(30));
    console.log(`Current size: ${snippetData.content.length} characters`);

    const { editChoice } = await inquirer.prompt([
      {
        type: "list",
        name: "editChoice",
        message: "How would you like to edit the content?",
        choices: [
          { name: "📝 Open in editor", value: "editor" },
          { name: "📄 View current content", value: "view" },
          { name: "⬅️  Back", value: "back" },
        ],
      },
    ]);

    if (editChoice === "back") return;

    if (editChoice === "view") {
      console.log("\n📄 Current Content:");
      console.log("─".repeat(40));
      console.log(snippetData.content);
      console.log("─".repeat(40));

      await inquirer.prompt([
        {
          type: "input",
          name: "continue",
          message: "Press Enter to continue...",
        },
      ]);
      return;
    }

    if (editChoice === "editor") {
      try {
        const editedContent = await this.openEditorForContent(
          snippetData.content,
          snippetData.language,
          snippetData.title,
        );
        snippetData.content = editedContent;
        console.log(`✅ Content updated (${editedContent.length} characters)`);
      } catch (error) {
        console.error(
          "❌ Failed to edit content:",
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  /**
   * Confirm and publish the snippet
   */
  private async confirmAndPublish(snippetData: SnippetData): Promise<void> {
    console.log("\n🚀 Ready to Publish");
    console.log("═".repeat(50));

    // Add automatic tags
    const allTags = new Set<string>([...snippetData.tags]);
    allTags.add("code");
    allTags.add("snippet");
    if (snippetData.language) {
      allTags.add(snippetData.language.toLowerCase());
    }
    const finalTags = Array.from(allTags);

    const finalSnippetData = {
      ...snippetData,
      tags: finalTags,
    };

    // Show final summary
    await this.showDetailedPreview(finalSnippetData);

    const { confirmed } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirmed",
        message: "🚀 Publish this snippet to Nostr?",
        default: true,
      },
    ]);

    if (!confirmed) {
      console.log("📝 Continue editing...");
      return;
    }

    try {
      const config = loadConfig();
      await this.publishToNostr(finalSnippetData, config);

      console.log("\n✅ Code snippet created and published successfully!");
      console.log(
        "🔗 You can now search for it using: nostr-code-snippets search",
      );
    } catch (error) {
      console.error(
        "❌ Failed to publish snippet:",
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
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
          const response = await pool.relay(relayUrl).publish(signedEvent);
          if (response.ok) {
            logger(`   ✅ Published to ${relayUrl}`);
            return { relay: relayUrl, success: true };
          } else {
            logger(
              `   ❌ Failed to publish to ${relayUrl}: ${response.message}`,
            );
            return { relay: relayUrl, success: false, error: response.message };
          }
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
