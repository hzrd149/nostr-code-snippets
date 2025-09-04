import type { NostrEvent } from "nostr-tools";
import { neventEncode } from "nostr-tools/nip19";
import {
  getSnippetTitle,
  getSnippetLanguage,
  getSnippetExtension,
  getSnippetDescription,
  getSnippetRuntime,
  getSnippetLicense,
  getSnippetDependencies,
  getSnippetRepo,
  getSnippetTags,
  getSnippetCreatedAt,
  getSnippetContent,
} from "../helpers/snippet.js";

/** Create a clickable terminal link using ANSI escape sequences */
export function createClickableLink(url: string, text: string): string {
  return `\u001b]8;;${url}\u0007${text}\u001b]8;;\u0007`;
}

export function formatSnippetForDisplay(event: NostrEvent): string {
  const nevent = neventEncode({
    id: event.id,
    author: event.pubkey,
    kind: event.kind,
  });

  const url = `https://njump.me/${nevent}`;
  const clickableLink = createClickableLink(url, "View on njump.me");

  const lines = [
    `📝 ${getSnippetTitle(event)}`,
    `🆔 ID: ${event.id.substring(0, 12)}...`,
    `📅 ${getSnippetCreatedAt(event).toLocaleDateString()}`,
    `🔗 ${clickableLink}`,
  ];

  // Add NIP-C0 specific metadata
  const language = getSnippetLanguage(event);
  if (language) lines.push(`💻 Language: ${language}`);

  const extension = getSnippetExtension(event);
  if (extension) lines.push(`📄 Extension: .${extension}`);

  const description = getSnippetDescription(event);
  if (description) lines.push(`📖 Description: ${description}`);

  const runtime = getSnippetRuntime(event);
  if (runtime) lines.push(`⚙️  Runtime: ${runtime}`);

  const license = getSnippetLicense(event);
  if (license) lines.push(`⚖️  License: ${license}`);

  const dependencies = getSnippetDependencies(event);
  if (dependencies.length > 0)
    lines.push(`📦 Dependencies: ${dependencies.join(", ")}`);

  const repo = getSnippetRepo(event);
  if (repo) lines.push(`🔗 Repository: ${repo}`);

  const tags = getSnippetTags(event);
  if (tags.length > 0) lines.push(`🏷️  Tags: ${tags.join(", ")}`);

  lines.push("");

  // Show code preview
  const content = getSnippetContent(event);
  lines.push("```" + (language || ""));
  lines.push(content.substring(0, 300) + (content.length > 300 ? "\n..." : ""));
  lines.push("```");

  return lines.join("\n");
}
