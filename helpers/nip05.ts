import { nip05 } from "nostr-tools";
import { logger } from "./debug.js";

const log = logger.extend("nip05");

/**
 * Resolves a NIP-05 address to its corresponding public key.
 * @param nip05Address - The NIP-05 address (e.g., 'user@example.com').
 * @returns The hex-encoded public key or null if resolution fails.
 */
export async function resolveNip05(
  nip05Address: string,
): Promise<string | null> {
  try {
    log(`Resolving NIP-05 address: ${nip05Address}`);

    // Use nostr-tools nip05.queryProfile to resolve the address
    const profile = await nip05.queryProfile(nip05Address);

    if (profile && profile.pubkey) {
      log(`✅ Resolved ${nip05Address} to pubkey: ${profile.pubkey}`);
      return profile.pubkey;
    }

    log(`❌ No pubkey found for ${nip05Address}`);
    return null;
  } catch (error) {
    log(`❌ Failed to resolve NIP-05 address ${nip05Address}:`, error);
    return null;
  }
}

/**
 * Validates if a string looks like a NIP-05 address
 * @param input - The input string to validate
 * @returns true if it looks like a NIP-05 address
 */
export function isNip05Address(input: string): boolean {
  // Basic validation: contains @ and has valid email-like structure
  const nip05Regex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return nip05Regex.test(input);
}

/**
 * Validates if a string looks like a hex public key
 * @param input - The input string to validate
 * @returns true if it looks like a hex pubkey
 */
export function isHexPubkey(input: string): boolean {
  return /^[a-fA-F0-9]{64}$/.test(input);
}

/**
 * Validates if a string looks like an npub
 * @param input - The input string to validate
 * @returns true if it looks like an npub
 */
export function isNpub(input: string): boolean {
  return input.startsWith("npub1") && input.length === 63;
}
