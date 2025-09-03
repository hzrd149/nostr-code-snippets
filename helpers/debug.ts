import debug from "debug";

const logger = debug("nostr-code-snippets");

// Enable debug logging when verbose mode is requested
export function enableDebugLogging(): void {
  debug.enable("nostr-code-snippets,nostr-code-snippets:*");
}

export { logger };
export default logger;
