import type { ProfilePointer } from "nostr-tools/nip19";
import { firstValueFrom } from "rxjs";
import { eventStore } from "./nostr";
import { defined, simpleTimeout } from "applesauce-core";
import { getSigner } from "./signer";
import { loadConfig } from "./config";
import { logger } from "./debug";

const log = logger.extend("user");

/** Get the current user's public key - tries signer first, then falls back to config */
export async function getPublicKey(): Promise<string | undefined> {
  // Try to get pubkey from signer first
  try {
    const signer = await getSigner();
    const pubkey = await signer.getPublicKey();
    log("Got pubkey from active signer");
    return pubkey;
  } catch (signerError) {
    log(
      `Failed to get signer: ${signerError instanceof Error ? signerError.message : signerError}`,
    );

    // Fallback to config
    const config = loadConfig();
    if (config.pubkey) {
      log("Fallback to config pubkey");
      return config.pubkey;
    }

    log("No pubkey found in signer or config");
    return undefined;
  }
}

/** Get a users profile data */
export async function getProfile(user: string | ProfilePointer) {
  return await firstValueFrom(
    eventStore.profile(user).pipe(defined(), simpleTimeout(5_000)),
  );
}

/** Get a users mailboxes */
export async function getUserMailboxes(user: string | ProfilePointer) {
  return await firstValueFrom(
    eventStore.mailboxes(user).pipe(defined(), simpleTimeout(5_000)),
  );
}
