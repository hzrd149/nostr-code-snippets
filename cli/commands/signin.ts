import { encodeNbunksec } from "@sandwichfarm/encoded-entities";
import { NostrConnectSigner, SimpleSigner } from "applesauce-signers";
import { Command } from "commander";
import inquirer from "inquirer";
import { nsecEncode } from "nostr-tools/nip19";
import { bytesToHex } from "nostr-tools/utils";
import * as qrcode from "qrcode-terminal";
import { logger } from "../../helpers/debug.js";
import { setSignerInKeyring, setSignerInstance } from "../../helpers/signer.js";
import type { BaseCommand } from "../types.js";
import { loadConfig } from "../../helpers/config.js";
import { DEFAULT_SIGNER_RELAY } from "../../helpers/const";

const log = logger.extend("signin");

export class SigninCommand implements BaseCommand {
  name = "signin";
  description = "Sign in with your Nostr identity";

  setup(program: Command): void {
    program
      .command(this.name)
      .description(this.description)
      .argument("[signer]", "Optional nsec or nbunksec to sign in with")
      .action(async (signer) => {
        await this.execute(signer);
      });
  }

  async execute(signerArg?: string): Promise<void> {
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
        "❌ Signin failed:",
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  }

  private async signInWithSigner(signerValue: string): Promise<void> {
    log(
      `Attempting to sign in with provided signer: ${signerValue.substring(0, 10)}...`,
    );

    try {
      await setSignerInKeyring(signerValue);
      console.log("✅ Successfully signed in!");

      // Show user info
      await this.showSigninSuccess();
    } catch (error) {
      throw new Error(
        `Failed to sign in with provided signer: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private async interactiveSignin(): Promise<void> {
    console.log("\n🔐 Nostr Sign-In");
    console.log("─".repeat(40));
    console.log("Choose how you'd like to sign in:\n");

    const { method } = await inquirer.prompt([
      {
        type: "list",
        name: "method",
        message: "How would you like to sign in?",
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
    console.log("\n🔑 Private Key Sign-In");
    console.log("─".repeat(30));

    const { privateKey } = await inquirer.prompt([
      {
        type: "password",
        name: "privateKey",
        message: "Enter your private key (hex or nsec format):",
        validate: (input: string) => {
          if (!input.trim()) {
            return "Private key is required";
          }

          // Check if it's hex (64 chars) or nsec format
          const trimmed = input.trim();
          if (trimmed.startsWith("nsec1")) {
            return true;
          }

          if (trimmed.length === 64 && /^[a-fA-F0-9]+$/.test(trimmed)) {
            return true;
          }

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
      console.log("✅ Successfully signed in with private key!");

      await this.showSigninSuccess();
    } catch (error) {
      throw new Error(
        `Failed to sign in with private key: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private async signInWithBunker(): Promise<void> {
    console.log("\n🔗 Bunker URI Sign-In");
    console.log("─".repeat(30));
    console.log("Enter your NIP-46 bunker:// URI to connect\n");

    const { bunkerURI } = await inquirer.prompt([
      {
        type: "input",
        name: "bunkerURI",
        message: "Bunker URI:",
        validate: (input: string) => {
          if (!input.trim()) {
            return "Bunker URI is required";
          }

          if (!input.trim().startsWith("bunker://")) {
            return "URI must start with bunker://";
          }

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
    console.log("\n📱 QR Code Sign-In");
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
        `Failed to sign in via QR code: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private async showSigninSuccess(): Promise<void> {
    try {
      const config = loadConfig();

      console.log("\n🎉 Sign-in Complete!");
      console.log("─".repeat(30));
      console.log(`🆔 Public Key: ${config.pubkey}`);
      console.log(`🔑 Signer: ***stored in system keyring***`);
      console.log(`📡 Relays: ${config.relays.length} configured`);
      console.log(
        "\n✨ You're now ready to publish and discover code snippets!",
      );
    } catch (error) {
      log(`Warning: Could not show signin success info: ${error}`);
    }
  }
}
