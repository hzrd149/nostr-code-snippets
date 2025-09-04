import { encodeNbunksec } from "@sandwichfarm/encoded-entities";
import { NostrConnectSigner, SimpleSigner } from "applesauce-signers";
import { Command } from "commander";
import inquirer from "inquirer";
import { nsecEncode } from "nostr-tools/nip19";
import { bytesToHex } from "nostr-tools/utils";
import * as qrcode from "qrcode-terminal";
import { loadConfig } from "../../helpers/config.js";
import { DEFAULT_SIGNER_RELAY } from "../../helpers/const";
import { logger } from "../../helpers/debug.js";
import {
  getSigner,
  setSignerInKeyring,
  setSignerInstance,
  clearSignerFromKeyring,
} from "../../helpers/signer.js";
import { getPublicKey } from "../../helpers/user.js";
import type { BaseCommand } from "../types.js";

const log = logger.extend("signer");

export class SignerCommand implements BaseCommand {
  name = "signer";
  description = "Manage your Nostr signer identity";

  setup(program: Command): void {
    program
      .command(this.name)
      .description(this.description)
      .argument(
        "[signer]",
        "Optional nsec or nbunksec to sign in with (requires --connect)",
      )
      .option("-c, --connect", "Connect/sign in with a new signer")
      .option(
        "-r, --reset",
        "Clear signer from keyring (keeps pubkey in config)",
      )
      .action(async (signerArg, options) => {
        if (options.connect) {
          await this.executeConnect(signerArg);
        } else if (options.reset) {
          await this.executeReset();
        } else {
          await this.executeStatus();
        }
      });
  }

  async executeStatus(): Promise<void> {
    try {
      let signerConnected = false;

      // Check if signer is connected
      try {
        await getSigner();
        signerConnected = true;
        log("Signer is connected");
      } catch (signerError) {
        log(
          `Signer not connected: ${signerError instanceof Error ? signerError.message : signerError}`,
        );
        signerConnected = false;
      }

      // Get pubkey using the new centralized method
      const pubkey = await getPublicKey();

      if (!pubkey) {
        console.log("❌ No signer identity configured");
        console.log("\n💡 To set up your signer identity:");
        console.log("   nostr-code-snippets signer --connect");
        console.log(
          "   nostr-code-snippets signer --connect <nsec_or_nbunksec>",
        );
        process.exit(1);
      }

      // Display the signer status information
      console.log(`🆔 Public Key: ${pubkey}`);

      // Show connection status with clear indicators
      if (signerConnected) {
        console.log("📍 Status: 🟢 Connected (signer active)");
      } else {
        console.log("📍 Status: 🔴 Not connected (config only)");
        console.log("   💡 Use 'signer --connect' to activate signer");
      }

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

      // Show additional info if signer is connected
      if (signerConnected) {
        const config = loadConfig();
        console.log(`📡 Relays: ${config.relays.length} configured`);
      }
    } catch (error) {
      console.error(
        "❌ Failed to get signer status:",
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  }

  async executeConnect(signerArg?: string): Promise<void> {
    try {
      if (signerArg) {
        // Direct signin with provided signer
        await this.signInWithSigner(signerArg);
      } else {
        // Interactive signin flow
        await this.interactiveSignin();
      }
    } catch (error) {
      console.error(
        "❌ Signer connection failed:",
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  }

  async executeReset(): Promise<void> {
    try {
      // Check if there's a pubkey in config to preserve
      const config = loadConfig();

      if (!config.pubkey) {
        console.log("❌ No signer identity found to reset");
        console.log("\n💡 To set up a signer identity:");
        console.log("   nostr-code-snippets signer --connect");
        return;
      }

      console.log("\n🔄 Resetting Signer");
      console.log("─".repeat(30));
      console.log("This will clear your signer from the keyring while keeping");
      console.log("your public key in the config for read-only operations.\n");

      // Ask for confirmation
      const { confirmed } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirmed",
          message: "Are you sure you want to reset your signer?",
          default: false,
        },
      ]);

      if (!confirmed) {
        console.log("❌ Reset cancelled");
        return;
      }

      // Clear the signer from keyring
      await clearSignerFromKeyring();

      console.log("✅ Signer reset complete!");
      console.log("─".repeat(30));
      console.log(`🆔 Public Key: ${config.pubkey} (preserved)`);
      console.log("🔑 Signer: ***cleared from keyring***");
      console.log("📍 Status: 🔴 Not connected (config only)");
      console.log("\n💡 To reconnect your signer:");
      console.log("   nostr-code-snippets signer --connect");
    } catch (error) {
      console.error(
        "❌ Signer reset failed:",
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  }

  private async signInWithSigner(signerValue: string): Promise<void> {
    log(
      `Attempting to connect signer with provided value: ${signerValue.substring(0, 10)}...`,
    );

    try {
      await setSignerInKeyring(signerValue);
      console.log("✅ Signer successfully connected!");

      // Show user info
      await this.showSigninSuccess();
    } catch (error) {
      throw new Error(
        `Failed to connect signer: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private async interactiveSignin(): Promise<void> {
    console.log("\n🔐 Signer Connection");
    console.log("─".repeat(40));
    console.log("Choose how you'd like to connect your signer:\n");

    const { method } = await inquirer.prompt([
      {
        type: "list",
        name: "method",
        message: "How would you like to connect?",
        choices: [
          {
            name: "🔑 Private Key (nsec) - Enter your private key directly",
            value: "nsec",
          },
          {
            name: "🔗 Bunker URI - Connect using NIP-46 bunker://",
            value: "bunker",
          },
          {
            name: "📱 QR Code - Generate QR code for mobile apps",
            value: "qr",
          },
        ],
      },
    ]);

    switch (method) {
      case "nsec":
        await this.signInWithNsec();
        break;
      case "bunker":
        await this.signInWithBunker();
        break;
      case "qr":
        await this.signInWithQR();
        break;
    }
  }

  private async signInWithNsec(): Promise<void> {
    console.log("\n🔑 Private Key Connection");
    console.log("─".repeat(30));

    const { privateKey } = await inquirer.prompt([
      {
        type: "password",
        name: "privateKey",
        message: "Enter your private key (hex or nsec format):",
        validate: (input: string) => {
          if (!input.trim()) return "Private key is required";

          // Check if it's hex (64 chars) or nsec format
          const trimmed = input.trim();
          if (trimmed.startsWith("nsec1")) return true;

          if (trimmed.length === 64 && /^[a-fA-F0-9]+$/.test(trimmed))
            return true;

          return "Please enter a valid private key (64-char hex or nsec1...)";
        },
      },
    ]);

    try {
      let nsecKey = privateKey.trim();

      // Convert hex to nsec if needed
      if (!nsecKey.startsWith("nsec1") && nsecKey.length === 64) {
        // Convert hex to nsec using SimpleSigner
        const signer = SimpleSigner.fromKey(nsecKey);
        nsecKey = nsecEncode(signer.key);
      }

      await setSignerInKeyring(nsecKey);
      console.log("✅ Signer successfully connected with private key!");

      await this.showSigninSuccess();
    } catch (error) {
      throw new Error(
        `Failed to connect signer with private key: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private async signInWithBunker(): Promise<void> {
    console.log("\n🔗 Bunker URI Connection");
    console.log("─".repeat(30));
    console.log("Enter your NIP-46 bunker:// URI to connect\n");

    const { bunkerURI } = await inquirer.prompt([
      {
        type: "input",
        name: "bunkerURI",
        message: "Bunker URI:",
        validate: (input: string) => {
          if (!input.trim()) return "Bunker URI is required";

          if (!input.trim().startsWith("bunker://"))
            return "URI must start with bunker://";

          return true;
        },
      },
    ]);

    try {
      console.log("🔄 Connecting to bunker...");

      // Create NostrConnectSigner from bunker URI
      const signer = await NostrConnectSigner.fromBunkerURI(bunkerURI.trim());

      console.log("🔄 Testing connection...");

      // Test the connection by getting the public key
      const pubkey = await signer.getPublicKey();

      // Create nbunksec format for storage
      const nbunksec = encodeNbunksec({
        pubkey: pubkey,
        local_key: bytesToHex(signer.signer.key), // Get local key from internal signer
        relays: signer.relays || [],
        secret: signer.secret || "",
      });

      // Set the signer instance first
      setSignerInstance(signer);

      // Save to keyring using setSignerInConfig
      await setSignerInKeyring(nbunksec);

      console.log("✅ Successfully connected to bunker!");

      await this.showSigninSuccess();
    } catch (error) {
      throw new Error(
        `Failed to connect to bunker: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private async signInWithQR(): Promise<void> {
    console.log("\n📱 QR Code Connection");
    console.log("─".repeat(30));
    console.log("Creating a new connection for you to scan...\n");

    // Ask user for relay URL
    const { relayUrl } = await inquirer.prompt([
      {
        type: "input",
        name: "relayUrl",
        message: "Enter relay URL:",
        default: DEFAULT_SIGNER_RELAY,
        validate: (input: string) => {
          if (!input.trim()) {
            return "Relay URL is required";
          }

          try {
            const url = new URL(input.trim());
            if (url.protocol !== "wss:" && url.protocol !== "ws:") {
              return "Relay URL must use ws:// or wss:// protocol";
            }
            return true;
          } catch {
            return "Please enter a valid URL";
          }
        },
      },
    ]);

    try {
      // Create a new NostrConnectSigner
      const signer = new NostrConnectSigner({
        relays: [relayUrl.trim()],
      });

      // Get the nostr-connect:// URI
      const connectURI = signer.getNostrConnectURI({
        name: "nostr-code-snippets",
        permissions: NostrConnectSigner.buildSigningPermissions([1337]),
      });

      console.log("📱 Scan this QR code with your Nostr app:\n");

      // Generate and display QR code
      qrcode.generate(connectURI, { small: true });

      console.log(`\n🔗 Or copy this URI manually:`);
      console.log(`${connectURI}\n`);

      console.log("⏳ Waiting for connection...");
      console.log("   (This may take a moment after scanning)\n");

      // Wait for connection
      await signer.waitForSigner();

      // Get public key to confirm connection
      const pubkey = await signer.getPublicKey();

      // Create nbunksec for storage
      const nbunksec = encodeNbunksec({
        pubkey: pubkey,
        local_key: bytesToHex(signer.signer.key),
        relays: [relayUrl.trim()],
        secret: signer.secret || "",
      });

      // Set the signer instance
      setSignerInstance(signer);

      // Save to keyring using setSignerInConfig
      await setSignerInKeyring(nbunksec);

      console.log("✅ Successfully connected via QR code!");

      await this.showSigninSuccess();
    } catch (error) {
      throw new Error(
        `Failed to connect signer via QR code: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private async showSigninSuccess(): Promise<void> {
    try {
      const config = loadConfig();
      const pubkey = await getPublicKey();

      console.log("\n🎉 Signer Connection Complete!");
      console.log("─".repeat(30));
      console.log(`🆔 Public Key: ${pubkey || "Unable to retrieve"}`);
      console.log(`🔑 Signer: ***stored in system keyring***`);
      console.log(`📡 Relays: ${config.relays.length} configured`);
      console.log(
        "\n✨ You're now ready to publish and discover code snippets!",
      );
    } catch (error) {
      log(`Warning: Could not show connection success info: ${error}`);
    }
  }
}
