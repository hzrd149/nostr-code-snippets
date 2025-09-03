import { decodeNbunksec } from "@sandwichfarm/encoded-entities";
import {
  NostrConnectSigner,
  SimpleSigner,
  type ISigner,
} from "applesauce-signers";
import { loadConfig, saveConfig } from "../cli/utils.js";
import { logger } from "./debug.js";
import { pool } from "./nostr";

// Setup nostr connect signer
NostrConnectSigner.pool = pool;

const log = logger.extend("signer");

let signerInstance: ISigner | null = null;

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

    const nostrConnectSigner = new NostrConnectSigner({
      remote: bunker.pubkey,
      signer: SimpleSigner.fromKey(bunker.local_key),
      relays: bunker.relays,
      secret: bunker.secret,
    });

    await nostrConnectSigner.connect();
    return nostrConnectSigner;
  } else {
    throw new Error("Invalid signer format");
  }
}

/**
 * Sets the signer in the config and automatically derives and sets the pubkey
 */
export async function setSignerInConfig(signerValue: string): Promise<void> {
  try {
    // Create a signer instance to get the public key
    const signer = await createSignerFromValue(signerValue);

    // Get the public key from the signer
    const pubkey = await signer.getPublicKey();

    // Load current config, update signer and pubkey, then save
    const config = loadConfig();
    config.signer = signerValue;
    config.pubkey = pubkey;
    saveConfig(config);

    // Set the signer instance
    signerInstance = signer;

    // If the signer is a NostrConnectSigner, close it (so cli closes cleanly)
    if (signer instanceof NostrConnectSigner) await signer.close();

    log(`🔑 Signer and pubkey updated in config. Pubkey: ${pubkey}`);
  } catch (error) {
    throw new Error(
      `Failed to set signer: ${error instanceof Error ? error.message : error}`,
    );
  }
}

async function createSignerInstance(): Promise<ISigner> {
  // Check environment variable first, then config file
  const signerValue = process.env.SIGNER || getConfigSigner();

  if (!signerValue)
    throw new Error(
      "No signer configured. Please set the SIGNER environment variable or configure a signer using: nostr-code-snippets config --signer <nsec_or_nbunksec>",
    );

  log(
    `🔑 Creating signer from ${signerValue.startsWith("nsec1") ? "nsec" : signerValue.startsWith("nbunksec") ? "nbunksec" : "unknown"} format`,
  );

  try {
    return await createSignerFromValue(signerValue);
  } catch (error) {
    throw new Error(
      `Failed to create signer: ${error instanceof Error ? error.message : error}`,
    );
  }
}

function getConfigSigner(): string | undefined {
  try {
    const config = loadConfig();
    return config.signer;
  } catch (error) {
    log(
      `⚠️ Failed to load config: ${error instanceof Error ? error.message : error}`,
    );
    return undefined;
  }
}
