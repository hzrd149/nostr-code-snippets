import type { NostrEvent } from "nostr-tools";

/**
 * Helper functions for parsing NIP-C0 code snippet events
 */

/** Get the programming language from a code snippet event */
export function getSnippetLanguage(event: NostrEvent): string | undefined {
  return event.tags.find((tag) => tag[0] === "l")?.[1];
}

/** Get the name/filename from a code snippet event */
export function getSnippetName(event: NostrEvent): string | undefined {
  return event.tags.find((tag) => tag[0] === "name")?.[1];
}

/** Get the file extension from a code snippet event */
export function getSnippetExtension(event: NostrEvent): string | undefined {
  return event.tags.find((tag) => tag[0] === "extension")?.[1];
}

/** Get the description from a code snippet event */
export function getSnippetDescription(event: NostrEvent): string | undefined {
  return event.tags.find((tag) => tag[0] === "description")?.[1];
}

/** Get the runtime specification from a code snippet event */
export function getSnippetRuntime(event: NostrEvent): string | undefined {
  return event.tags.find((tag) => tag[0] === "runtime")?.[1];
}

/** Get the license from a code snippet event */
export function getSnippetLicense(event: NostrEvent): string | undefined {
  return event.tags.find((tag) => tag[0] === "license")?.[1];
}

/** Get the repository URL from a code snippet event */
export function getSnippetRepo(event: NostrEvent): string | undefined {
  return event.tags.find((tag) => tag[0] === "repo")?.[1];
}

/** Get all dependencies from a code snippet event */
export function getSnippetDependencies(event: NostrEvent): string[] {
  return event.tags
    .filter((tag) => tag[0] === "dep" && tag[1])
    .map((tag) => tag[1]!);
}

/** Get a display title for the snippet (name, description, or fallback) */
export function getSnippetTitle(event: NostrEvent): string {
  const name = getSnippetName(event);
  const description = getSnippetDescription(event);
  return name || description || "Untitled Snippet";
}

/** Get tags for display purposes (language, extension, and other custom tags) */
export function getSnippetTags(event: NostrEvent): string[] {
  return event.tags
    .filter((t) => t[0] === "t" && t[1])
    .map((t) => t[1]!.toLocaleLowerCase());
}

/** Get the creation date of the snippet */
export function getSnippetCreatedAt(event: NostrEvent): Date {
  return new Date(event.created_at * 1000);
}

/** Get the content of the code snippet */
export function getSnippetContent(event: NostrEvent): string {
  return event.content;
}

/** Check if an event matches language filter */
export function snippetMatchesLanguage(
  event: NostrEvent,
  language: string,
): boolean {
  const snippetLanguage = getSnippetLanguage(event);
  return snippetLanguage?.toLowerCase() === language.toLowerCase();
}

/** Check if an event matches tag filter */
export function snippetMatchesTag(event: NostrEvent, tag: string): boolean {
  const displayTags = getSnippetTags(event);
  return displayTags.some((t) => t.toLowerCase().includes(tag.toLowerCase()));
}
