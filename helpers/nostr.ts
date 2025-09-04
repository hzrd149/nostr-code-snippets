import { EventStore } from "applesauce-core";
import { mergeRelaySets } from "applesauce-core/helpers";
import {
  createAddressLoader,
  createEventLoader,
} from "applesauce-loaders/loaders";
import { RelayPool } from "applesauce-relay";
import { loadConfig } from "./config";
import { getPublicKey, getUserMailboxes } from "./user";

export const eventStore = new EventStore();
export const pool = new RelayPool({
  keepAlive: 0,
});

// Create loaders
export const addressLoader = createAddressLoader(pool, {
  eventStore,
  extraRelays: loadConfig().relays,
});
export const eventLoader = createEventLoader(pool, {
  eventStore,
  extraRelays: loadConfig().relays,
});

// Attach loaders to event store
eventStore.addressableLoader = addressLoader;
eventStore.replaceableLoader = addressLoader;
eventStore.eventLoader = eventLoader;

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
