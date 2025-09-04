import { EventStore } from "applesauce-core";
import {
  createAddressLoader,
  createEventLoader,
} from "applesauce-loaders/loaders";
import { RelayPool } from "applesauce-relay";
import { loadConfig } from "./config";

export const eventStore = new EventStore();
export const pool = new RelayPool();

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
