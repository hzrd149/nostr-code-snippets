import { decodeNbunksec } from "@sandwichfarm/encoded-entities";
import {
  NostrConnectSigner,
  SimpleSigner,
  type ISigner,
} from "applesauce-signers";
import { deletePassword, getPassword, setPassword } from "keytar";
import { getConfigPath } from "./config";
import { logger } from "./debug.js";
import { pool } from "./nostr";
import { registerShutdownHandler } from "./shutdown.js";

// Setup nostr connect signer
NostrConnectSigner.pool = pool;

const log = logger.extend("signer");

let signerInstance: ISigner | null = null;

// Register shutdown handler to clean up signer connections
registerShutdownHandler("signer", async () => {
  if (signerInstance && signerInstance instanceof NostrConnectSigner) {
    log("Closing NostrConnect signer connection");
    try {
      await signerInstance.close();
      log("NostrConnect signer connection closed successfully");
    } catch (error) {
      log("Error closing NostrConnect signer:", error);
    }
  }
  signerInstance = null;
});

/**
 * Gets a singleton ISigner instance based on the "signer" config field or "SIGNER" env var.
 * Supports NIP-19 nsec and nbunksec formats.
 */
export async function getSigner(): Promise<ISigner> {
  if (!signerInstance) signerInstance = await createSignerInstance();

  return signerInstance;
}

/**
 * Creates a signer instance from a signer value (nsec or nbunksec format)
 */
async function createSignerFromValue(signerValue: string): Promise<ISigner> {
  // Validate the signer format
  if (!signerValue.startsWith("nsec1") && !signerValue.startsWith("nbunksec")) {
    throw new Error(
      `Unsupported signer format. Expected nsec1... or nbunksec..., got: ${signerValue.substring(0, 10)}...`,
    );
  }

  if (signerValue.startsWith("nsec1")) {
    // Handle NIP-19 nsec format
    return SimpleSigner.fromKey(signerValue);
  } else if (signerValue.startsWith("nbunksec")) {
    // Handle nbunksec format using @sandwichfarm/encoded-entities
    const bunker = decodeNbunksec(signerValue);

    return new NostrConnectSigner({
      remote: bunker.pubkey,
      signer: SimpleSigner.fromKey(bunker.local_key),
      relays: bunker.relays,
      secret: bunker.secret,
    });
  } else {
    throw new Error("Invalid signer format");
  }
}

/**
 * Sets the signer in the system keyring
 */
export async function setSignerInKeyring(signerValue: string): Promise<void> {
  try {
    // Create a signer instance to validate it works
    const signer = await createSignerFromValue(signerValue);

    // Store the signer in the system keyring using the config file path as username
    const configPath = getConfigPath();
    log(`Setting signer in keyring for config file: ${configPath}`);
    await setPassword("nostr-code-snippets", configPath, signerValue);

    // Set the signer instance
    signerInstance = signer;

    // If the signer is a NostrConnectSigner, close it (so cli closes cleanly)
    if (signer instanceof NostrConnectSigner) await signer.close();

    log(`Signer stored in keyring successfully`);
  } catch (error) {
    throw new Error(
      `Failed to set signer: ${error instanceof Error ? error.message : error}`,
    );
  }
}

/**
 * Sets the signer instance directly without recreating it
 */
export function setSignerInstance(signer: ISigner): void {
  signerInstance = signer;
  log(`Signer instance set directly`);
}

/**
 * Clears the current signer instance
 */
export function clearSignerInstance(): void {
  signerInstance = null;
  log(`Signer instance cleared`);
}

async function createSignerInstance(): Promise<ISigner> {
  // Check environment variable first, then keyring
  const signerValue = process.env.SIGNER || (await getKeyringSigner());
  if (!signerValue) throw new Error("No signer configured.");

  log(
    `Creating signer from ${signerValue.startsWith("nsec1") ? "nsec" : signerValue.startsWith("nbunksec") ? "nbunksec" : "unknown"} format`,
  );

  try {
    return await createSignerFromValue(signerValue);
  } catch (error) {
    throw new Error(
      `Failed to create signer: ${error instanceof Error ? error.message : error}`,
    );
  }
}

/**
 * Clears the signer from the system keyring while keeping the pubkey in config
 */
export async function clearSignerFromKeyring(): Promise<void> {
  try {
    const configPath = getConfigPath();
    log(`Clearing signer from keyring for config file: ${configPath}`);

    // Delete the signer from keyring
    const deleted = await deletePassword("nostr-code-snippets", configPath);

    if (deleted) {
      log("Signer successfully cleared from keyring");
    } else {
      log("No signer found in keyring to clear");
    }

    // Clear the signer instance
    clearSignerInstance();
  } catch (error) {
    throw new Error(
      `Failed to clear signer from keyring: ${error instanceof Error ? error.message : error}`,
    );
  }
}

/**
 * Gets the signer from the system keyring
 */
async function getKeyringSigner(): Promise<string | null> {
  try {
    const configPath = getConfigPath();
    log(`Getting signer from keyring for config file: ${configPath}`);
    const signerValue = await getPassword("nostr-code-snippets", configPath);
    return signerValue;
  } catch (error) {
    log(
      `⚠️ Failed to get signer from keyring: ${error instanceof Error ? error.message : error}`,
    );
    return null;
  }
}
