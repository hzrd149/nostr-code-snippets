import type { ProfilePointer } from "nostr-tools/nip19";
import { firstValueFrom } from "rxjs";
import { eventStore } from "./nostr";
import { defined, simpleTimeout } from "applesauce-core";

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
