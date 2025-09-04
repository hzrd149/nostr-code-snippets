/**
 * Comprehensive language and file extension mapping for code snippets
 */

export interface LanguageInfo {
  name: string;
  extensions: string[];
  aliases?: string[];
}

export const LANGUAGES: Record<string, LanguageInfo> = {
  // Web Technologies
  javascript: {
    name: "JavaScript",
    extensions: ["js", "mjs", "cjs"],
    aliases: ["js", "node", "nodejs"],
  },
  typescript: {
    name: "TypeScript",
    extensions: ["ts", "mts", "cts"],
    aliases: ["ts"],
  },
  jsx: {
    name: "JSX",
    extensions: ["jsx"],
    aliases: ["react"],
  },
  tsx: {
    name: "TSX",
    extensions: ["tsx"],
    aliases: ["react-ts"],
  },
  html: {
    name: "HTML",
    extensions: ["html", "htm"],
    aliases: ["markup"],
  },
  css: {
    name: "CSS",
    extensions: ["css"],
    aliases: [],
  },
  scss: {
    name: "SCSS",
    extensions: ["scss"],
    aliases: ["sass-scss"],
  },
  sass: {
    name: "Sass",
    extensions: ["sass"],
    aliases: [],
  },
  less: {
    name: "Less",
    extensions: ["less"],
    aliases: [],
  },
  vue: {
    name: "Vue",
    extensions: ["vue"],
    aliases: ["vuejs"],
  },
  svelte: {
    name: "Svelte",
    extensions: ["svelte"],
    aliases: [],
  },

  // Systems Programming
  c: {
    name: "C",
    extensions: ["c", "h"],
    aliases: [],
  },
  cpp: {
    name: "C++",
    extensions: ["cpp", "cc", "cxx", "c++", "hpp", "hh", "hxx", "h++"],
    aliases: ["c++", "cplus", "cplusplus"],
  },
  rust: {
    name: "Rust",
    extensions: ["rs"],
    aliases: [],
  },
  go: {
    name: "Go",
    extensions: ["go"],
    aliases: ["golang"],
  },
  zig: {
    name: "Zig",
    extensions: ["zig"],
    aliases: [],
  },

  // High-level Languages
  python: {
    name: "Python",
    extensions: ["py", "pyw", "pyi"],
    aliases: ["py"],
  },
  java: {
    name: "Java",
    extensions: ["java"],
    aliases: [],
  },
  csharp: {
    name: "C#",
    extensions: ["cs"],
    aliases: ["cs", "c#", "dotnet"],
  },
  fsharp: {
    name: "F#",
    extensions: ["fs", "fsx", "fsi"],
    aliases: ["f#"],
  },
  kotlin: {
    name: "Kotlin",
    extensions: ["kt", "kts"],
    aliases: [],
  },
  scala: {
    name: "Scala",
    extensions: ["scala", "sc"],
    aliases: [],
  },
  ruby: {
    name: "Ruby",
    extensions: ["rb", "rbw"],
    aliases: [],
  },
  php: {
    name: "PHP",
    extensions: ["php", "phtml", "php3", "php4", "php5", "php7", "phps"],
    aliases: [],
  },
  swift: {
    name: "Swift",
    extensions: ["swift"],
    aliases: [],
  },
  dart: {
    name: "Dart",
    extensions: ["dart"],
    aliases: [],
  },

  // Functional Languages
  haskell: {
    name: "Haskell",
    extensions: ["hs", "lhs"],
    aliases: [],
  },
  elm: {
    name: "Elm",
    extensions: ["elm"],
    aliases: [],
  },
  clojure: {
    name: "Clojure",
    extensions: ["clj", "cljs", "cljc", "edn"],
    aliases: [],
  },
  erlang: {
    name: "Erlang",
    extensions: ["erl", "hrl"],
    aliases: [],
  },
  elixir: {
    name: "Elixir",
    extensions: ["ex", "exs"],
    aliases: [],
  },

  // Shell & Scripting
  bash: {
    name: "Bash",
    extensions: ["sh", "bash"],
    aliases: ["shell"],
  },
  zsh: {
    name: "Zsh",
    extensions: ["zsh"],
    aliases: [],
  },
  fish: {
    name: "Fish",
    extensions: ["fish"],
    aliases: [],
  },
  powershell: {
    name: "PowerShell",
    extensions: ["ps1", "psm1", "psd1"],
    aliases: ["ps"],
  },
  batch: {
    name: "Batch",
    extensions: ["bat", "cmd"],
    aliases: [],
  },

  // Data & Config
  json: {
    name: "JSON",
    extensions: ["json"],
    aliases: [],
  },
  yaml: {
    name: "YAML",
    extensions: ["yaml", "yml"],
    aliases: [],
  },
  toml: {
    name: "TOML",
    extensions: ["toml"],
    aliases: [],
  },
  xml: {
    name: "XML",
    extensions: ["xml"],
    aliases: [],
  },
  ini: {
    name: "INI",
    extensions: ["ini", "cfg", "conf"],
    aliases: ["config"],
  },

  // Database
  sql: {
    name: "SQL",
    extensions: ["sql"],
    aliases: ["mysql", "postgres", "sqlite"],
  },

  // Documentation
  markdown: {
    name: "Markdown",
    extensions: ["md", "markdown", "mdown", "mkd"],
    aliases: ["md"],
  },
  rst: {
    name: "reStructuredText",
    extensions: ["rst"],
    aliases: ["restructuredtext"],
  },

  // DevOps
  dockerfile: {
    name: "Dockerfile",
    extensions: ["dockerfile"],
    aliases: ["docker"],
  },
  yaml_k8s: {
    name: "Kubernetes YAML",
    extensions: ["k8s.yaml", "k8s.yml"],
    aliases: ["kubernetes", "k8s"],
  },
  terraform: {
    name: "Terraform",
    extensions: ["tf", "tfvars"],
    aliases: ["hcl"],
  },

  // Other
  lua: {
    name: "Lua",
    extensions: ["lua"],
    aliases: [],
  },
  perl: {
    name: "Perl",
    extensions: ["pl", "pm", "t"],
    aliases: [],
  },
  r: {
    name: "R",
    extensions: ["r", "R"],
    aliases: [],
  },
  matlab: {
    name: "MATLAB",
    extensions: ["m"],
    aliases: [],
  },
  julia: {
    name: "Julia",
    extensions: ["jl"],
    aliases: [],
  },
  text: {
    name: "Plain Text",
    extensions: ["txt"],
    aliases: ["plain", "plaintext"],
  },
};

/**
 * Get language name from file extension
 */
export function getLanguageFromExtension(
  extension: string,
): string | undefined {
  const normalizedExt = extension.toLowerCase().replace(/^\./, "");

  for (const [langKey, langInfo] of Object.entries(LANGUAGES)) {
    if (langInfo.extensions.includes(normalizedExt)) {
      return langKey;
    }
  }

  return undefined;
}

/**
 * Get language name from language identifier or alias
 */
export function normalizeLanguage(input: string): string | undefined {
  const normalized = input.toLowerCase();

  // Direct match
  if (LANGUAGES[normalized]) {
    return normalized;
  }

  // Check aliases
  for (const [langKey, langInfo] of Object.entries(LANGUAGES)) {
    if (langInfo.aliases?.includes(normalized)) {
      return langKey;
    }
  }

  // Check if it's an extension
  return getLanguageFromExtension(normalized);
}

/**
 * Get file extension for a language
 */
export function getFileExtension(language?: string): string {
  if (!language) return "txt";

  const langInfo = LANGUAGES[language.toLowerCase()];
  return langInfo?.extensions[0] || "txt";
}

/**
 * Get display name for a language
 */
export function getLanguageDisplayName(language: string): string {
  const langInfo = LANGUAGES[language.toLowerCase()];
  return langInfo?.name || language;
}

/**
 * Get all supported languages for autocomplete/selection
 */
export function getAllLanguages(): Array<{ name: string; value: string }> {
  return Object.entries(LANGUAGES).map(([key, info]) => ({
    name: info.name,
    value: key,
  }));
}

/**
 * Get all supported file extensions
 */
export function getAllExtensions(): string[] {
  const extensions = new Set<string>();
  Object.values(LANGUAGES).forEach((lang) => {
    lang.extensions.forEach((ext) => extensions.add(ext));
  });
  return Array.from(extensions).sort();
}
