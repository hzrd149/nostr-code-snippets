import chalk from "chalk";
import { highlight } from "cli-highlight";

/**
 * Syntax highlighting utility for code snippets in the CLI
 */

export interface HighlightOptions {
  /** Programming language for syntax highlighting */
  language?: string;
  /** Whether to show line numbers */
  lineNumbers?: boolean;
  /** Maximum number of lines to display */
  maxLines?: number;
}

/**
 * Apply syntax highlighting to code content for terminal display
 */
export function highlightCode(
  code: string,
  options: HighlightOptions = {},
): string {
  const { language, lineNumbers = false, maxLines } = options;

  try {
    // Truncate code if maxLines is specified
    let processedCode = code;
    if (maxLines) {
      const lines = code.split("\n");
      if (lines.length > maxLines) {
        processedCode =
          lines.slice(0, maxLines).join("\n") + "\n" + chalk.gray("...");
      }
    }

    // Apply syntax highlighting
    const highlighted = highlight(processedCode, {
      language: language || "text",
      ignoreIllegals: true,
    });

    // Add line numbers if requested
    if (lineNumbers) {
      return addLineNumbers(highlighted);
    }

    return highlighted;
  } catch (error) {
    // Fallback to plain text with basic styling if highlighting fails
    console.warn(
      `Warning: Failed to highlight ${language || "unknown"} code:`,
      error,
    );
    return chalk.gray(code);
  }
}

/**
 * Add line numbers to highlighted code
 */
function addLineNumbers(highlightedCode: string): string {
  const lines = highlightedCode.split("\n");
  const maxLineNumWidth = lines.length.toString().length;

  return lines
    .map((line, index) => {
      const lineNum = (index + 1).toString().padStart(maxLineNumWidth, " ");
      return `${chalk.gray(lineNum + " │")} ${line}`;
    })
    .join("\n");
}

/**
 * Create a formatted code block with syntax highlighting
 */
export function formatCodeBlock(
  code: string,
  language?: string,
  options: HighlightOptions = {},
): string {
  const highlighted = highlightCode(code, { ...options, language });

  // Create a bordered code block
  const border = chalk.gray("─".repeat(60));
  const languageLabel = language
    ? chalk.cyan(`[${language.toUpperCase()}]`)
    : "";

  return [
    chalk.gray("┌") + border + chalk.gray("┐"),
    languageLabel ? `${chalk.gray("│")} ${languageLabel}` : "",
    highlighted
      .split("\n")
      .map((line) => `${chalk.gray("│")} ${line}`)
      .join("\n"),
    chalk.gray("└") + border + chalk.gray("┘"),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Format a code snippet preview with syntax highlighting
 */
export function formatSnippetPreview(
  content: string,
  language?: string,
  maxLength: number = 300,
): string {
  const truncated =
    content.length > maxLength
      ? content.substring(0, maxLength) + "\n" + chalk.gray("...")
      : content;

  return highlightCode(truncated, {
    language,
    maxLines: 10,
  });
}
