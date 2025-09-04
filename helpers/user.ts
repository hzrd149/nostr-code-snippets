import { defined, simpleTimeout } from "applesauce-core";
import { getRelaysFromList } from "applesauce-core/helpers";
import { type ISigner } from "applesauce-signers";
import { kinds } from "nostr-tools";
import type { ProfilePointer } from "nostr-tools/nip19";
import { firstValueFrom, map } from "rxjs";
import { loadConfig } from "./config";
import { logger } from "./debug";
import { eventStore, getReadRelays } from "./nostr";
import { getSigner } from "./signer";

const log = logger.extend("user");

const pubkeyCache = new Map<ISigner, string>();

/** Get the current user's public key - tries signer first, then falls back to config */
export async function getPublicKey(): Promise<string | undefined> {
  const config = loadConfig();
  if (config.pubkey) return config.pubkey;

  // Try to get pubkey from signer first
  try {
    const signer = await getSigner();
    if (pubkeyCache.has(signer)) return pubkeyCache.get(signer)!;

    log("Getting pubkey from active signer");
    const pubkey = await signer.getPublicKey();
    pubkeyCache.set(signer, pubkey);
    return pubkey;
  } catch (signerError) {
    log(
      `Failed to get signer: ${signerError instanceof Error ? signerError.message : signerError}`,
    );

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

/** Returns the list of the users search relays */
export async function getUserSearchRelays(user: string | ProfilePointer) {
  const pubkey = typeof user === "string" ? user : user.pubkey;
  const relays = await getReadRelays();

  return await firstValueFrom(
    eventStore
      .replaceable({ pubkey, relays, kind: kinds.SearchRelaysList })
      .pipe(
        defined(),
        map((e) => getRelaysFromList(e)),
        simpleTimeout(5_000),
      ),
  );
}
