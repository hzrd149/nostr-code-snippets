import { EventStore } from "applesauce-core";
import { mergeRelaySets } from "applesauce-core/helpers";
import { createEventLoaderForStore } from "applesauce-loaders/loaders";
import { RelayPool } from "applesauce-relay";
import { NostrConnectSigner } from "applesauce-signers";
import { loadConfig } from "./config";
import { logger } from "./debug.js";
import { registerShutdownHandler } from "./shutdown.js";
import { getPublicKey, getUserMailboxes } from "./user";

const log = logger.extend("nostr");

export const eventStore = new EventStore();
export const pool = new RelayPool({
  keepAlive: 5000,
});

NostrConnectSigner.pool = pool;

// Attach loaders to event store
export const eventLoader = createEventLoaderForStore(eventStore, pool, {
  lookupRelays: loadConfig().relays,
  extraRelays: loadConfig().relays,
});
export const addressLoader = eventLoader;

// Register shutdown handler to clean up relay connections
registerShutdownHandler("nostr-pool", async () => {
  log("Closing relay pool connections");
  try {
    for (const [url, relay] of pool.relays) await relay.close();

    log("Relay pool connections closed successfully");
  } catch (error) {
    log("Error closing relay pool:", error);
  }
});

/** Get the list of relays to read from */
export async function getReadRelays() {
  const config = loadConfig();
  const user = await getPublicKey();
  if (!user) return config.relays;

  const outboxes = await getUserMailboxes(user)
    .then((m) => m.outboxes)
    .catch(() => []);

  return mergeRelaySets(config.relays, outboxes);
}

/** Get the list of relays to write to */
export async function getWriteRelays() {
  const config = loadConfig();
  const user = await getPublicKey();
  if (!user) return config.relays;

  const outboxes = await getUserMailboxes(user)
    .then((m) => m.outboxes)
    .catch(() => []);

  return mergeRelaySets(config.relays, outboxes);
}
