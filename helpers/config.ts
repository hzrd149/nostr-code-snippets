import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { DEFAULT_RELAYS } from "./const";

export interface NostrConfig {
  pubkey?: string;
  relays: string[];
}

// Global config path - can be overridden by CLI option
let globalConfigPath: string | null = null;

/**
 * Set the config path (used by CLI when --config option is provided)
 */
export function setConfigPath(path: string): void {
  globalConfigPath = resolve(path);
}

/**
 * Get the config path - either from CLI option or default location
 */
export function getConfigPath(): string {
  return globalConfigPath || join(process.cwd(), ".nostr-snippets.json");
}

export function loadConfig(): NostrConfig {
  const configPath = getConfigPath();

  if (existsSync(configPath)) {
    try {
      const configData = readFileSync(configPath, "utf-8");
      return JSON.parse(configData);
    } catch (error) {
      console.warn("⚠️  Failed to load config file, using defaults");
    }
  }

  return {
    relays: DEFAULT_RELAYS,
  };
}

export function saveConfig(config: NostrConfig): void {
  const configPath = getConfigPath();
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
