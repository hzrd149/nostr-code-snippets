import { Command } from "commander";
import { loadConfig } from "../../helpers/config.js";
import { logger } from "../../helpers/debug.js";
import { getSigner } from "../../helpers/signer.js";
import type { BaseCommand } from "../types.js";

const log = logger.extend("whoami");

export class WhoamiCommand implements BaseCommand {
  name = "whoami";
  description = "Show your current Nostr identity (public key)";

  setup(program: Command): void {
    program
      .command(this.name)
      .description(this.description)
      .option("--read-only", "Only read from config, don't access signer")
      .action(async (options) => {
        await this.execute(options);
      });
  }

  async execute(options: any): Promise<void> {
    try {
      let pubkey: string | undefined;
      let source: string;

      if (options.readOnly) {
        // Read-only mode: only get pubkey from config
        const config = loadConfig();
        pubkey = config.pubkey;
        source = "config";
        log("Using read-only mode, getting pubkey from config");
      } else {
        // Try to get pubkey from signer first, fallback to config
        try {
          const signer = await getSigner();
          pubkey = await signer.getPublicKey();
          source = "signer";
          log("Got pubkey from active signer");
        } catch (signerError) {
          log(
            `Failed to get signer: ${signerError instanceof Error ? signerError.message : signerError}`,
          );

          // Fallback to config
          const config = loadConfig();
          pubkey = config.pubkey;
          source = "config";
          log("Fallback to config pubkey");
        }
      }

      if (!pubkey) {
        console.log("❌ No identity configured");
        console.log("\n💡 To set up your identity:");
        console.log(
          "   nostr-code-snippets config --signer <nsec_or_nbunksec>",
        );
        console.log("   nostr-code-snippets signin");
        process.exit(1);
      }

      // Display the identity information
      console.log("\n👤 Your Nostr Identity:");
      console.log("─".repeat(50));
      console.log(`🆔 Public Key: ${pubkey}`);
      console.log(
        `📍 Source: ${source === "signer" ? "Active signer" : "Config file"}`,
      );

      // Convert to npub format for easier sharing
      try {
        const { nip19 } = await import("nostr-tools");
        const npub = nip19.npubEncode(pubkey);
        console.log(`🔗 npub: ${npub}`);
      } catch (error) {
        log(
          `Failed to encode npub: ${error instanceof Error ? error.message : error}`,
        );
      }
    } catch (error) {
      console.error(
        "❌ Failed to get identity:",
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  }
}
