import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { DEFAULT_RELAYS } from "./const";
import { getLanguageFromExtension } from "./languages.js";

export interface NostrConfig {
  pubkey?: string;
  relays: string[];
  editor?: string;
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

  return {
    content,
    language: extension ? getLanguageFromExtension(extension) : undefined,
  };
}
