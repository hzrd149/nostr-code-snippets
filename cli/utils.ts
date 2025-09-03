import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { NostrConfig } from "./types.js";

export function loadConfig(): NostrConfig {
  const configPath = join(process.cwd(), ".nostr-snippets.json");

  if (existsSync(configPath)) {
    try {
      const configData = readFileSync(configPath, "utf-8");
      return JSON.parse(configData);
    } catch (error) {
      console.warn("⚠️  Failed to load config file, using defaults");
    }
  }

  return {
    relays: ["wss://relay.damus.io", "wss://nos.lol"],
  };
}

export function saveConfig(config: NostrConfig): void {
  const configPath = join(process.cwd(), ".nostr-snippets.json");
  try {
    const configData = JSON.stringify(config, null, 2);
    require("fs").writeFileSync(configPath, configData);
    console.log("✅ Configuration saved successfully");
  } catch (error) {
    console.error("❌ Failed to save configuration:", error);
  }
}

export function readCodeFile(filePath: string): {
  content: string;
  language?: string;
} {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = readFileSync(filePath, "utf-8");
  const extension = filePath.split(".").pop()?.toLowerCase();

  // Map file extensions to language identifiers
  const languageMap: Record<string, string> = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    cpp: "cpp",
    c: "c",
    cs: "csharp",
    php: "php",
    sh: "bash",
    bash: "bash",
    zsh: "zsh",
    fish: "fish",
    ps1: "powershell",
    sql: "sql",
    html: "html",
    css: "css",
    scss: "scss",
    sass: "sass",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
    md: "markdown",
    dockerfile: "dockerfile",
  };

  return {
    content,
    language: extension ? languageMap[extension] : undefined,
  };
}

export function formatSnippetForDisplay(snippet: any): string {
  const lines = [
    `📝 ${snippet.title || "Untitled"}`,
    `🏷️  ${snippet.tags?.join(", ") || "No tags"}`,
    `📅 ${new Date(snippet.createdAt).toLocaleDateString()}`,
    `👤 ${snippet.author || "Unknown"}`,
    "",
  ];

  if (snippet.language) {
    lines.push(`Language: ${snippet.language}`);
  }

  lines.push("```");
  lines.push(
    snippet.content.substring(0, 200) +
      (snippet.content.length > 200 ? "..." : ""),
  );
  lines.push("```");

  return lines.join("\n");
}
