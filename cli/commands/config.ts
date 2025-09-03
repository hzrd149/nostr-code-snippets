import { Command } from "commander";
import type { BaseCommand, NostrConfig } from "../types.js";
import { loadConfig, saveConfig } from "../utils.js";
import { Helpers } from "applesauce-core";

export class ConfigCommand implements BaseCommand {
  name = "config";
  description = "Configure Nostr settings";

  setup(program: Command): void {
    program
      .command(this.name)
      .description(this.description)
      .option("--show", "Show current configuration")
      .option("--reset", "Reset configuration to defaults")
      .option("--private-key <key>", "Set your private key (hex format)")
      .option(
        "--pubkey <key>",
        "Set your public key (hex, npub, or nprofile format)",
      )
      .option("--add-relay <relay>", "Add a relay URL")
      .option("--remove-relay <relay>", "Remove a relay URL")
      .option("--set-relays <relays>", "Set relay URLs (comma-separated)")

      .action(async (options) => {
        await this.execute(options);
      });
  }

  async execute(options: any): Promise<void> {
    try {
      let config = loadConfig();

      // Handle different configuration operations
      if (options.show) {
        this.showConfig(config);
        return;
      }

      if (options.reset) {
        config = this.getDefaultConfig();
        saveConfig(config);
        console.log("✅ Configuration reset to defaults");
        this.showConfig(config);
        return;
      }

      let configChanged = false;

      // Private key configuration
      if (options.privateKey) {
        if (this.validatePrivateKey(options.privateKey)) {
          config.privateKey = options.privateKey;
          configChanged = true;
          console.log("🔑 Private key updated");
        } else {
          console.error(
            "❌ Invalid private key format. Please provide a valid hex private key.",
          );
          process.exit(1);
        }
      }

      // Public key configuration
      if (options.pubkey) {
        try {
          const hexPubkey = Helpers.normalizeToPubkey(options.pubkey);
          config.pubkey = hexPubkey;
          configChanged = true;
          console.log("🔑 Public key updated");
        } catch (error) {
          console.error(
            "❌ Invalid public key format. Please provide a valid hex public key, npub, or nprofile.",
          );
          process.exit(1);
        }
      }

      // Relay configuration
      if (options.addRelay) {
        if (this.validateRelayUrl(options.addRelay)) {
          if (!config.relays.includes(options.addRelay)) {
            config.relays.push(options.addRelay);
            configChanged = true;
            console.log(`📡 Added relay: ${options.addRelay}`);
          } else {
            console.log(`⚠️  Relay already exists: ${options.addRelay}`);
          }
        } else {
          console.error("❌ Invalid relay URL format");
          process.exit(1);
        }
      }

      if (options.removeRelay) {
        const index = config.relays.indexOf(options.removeRelay);
        if (index > -1) {
          config.relays.splice(index, 1);
          configChanged = true;
          console.log(`📡 Removed relay: ${options.removeRelay}`);
        } else {
          console.log(`⚠️  Relay not found: ${options.removeRelay}`);
        }
      }

      if (options.setRelays) {
        const relays = options.setRelays
          .split(",")
          .map((r: string) => r.trim());
        const validRelays = relays.filter((relay: string) =>
          this.validateRelayUrl(relay),
        );

        if (validRelays.length !== relays.length) {
          console.error("❌ Some relay URLs are invalid");
          process.exit(1);
        }

        config.relays = validRelays;
        configChanged = true;
        console.log(`📡 Set relays: ${validRelays.join(", ")}`);
      }

      // Save configuration if changed
      if (configChanged) {
        saveConfig(config);
      } else if (!options.show && !options.reset) {
        // No options provided, start interactive configuration
        await this.interactiveConfig();
      }
    } catch (error) {
      console.error(
        "❌ Configuration failed:",
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  }

  private showConfig(config: NostrConfig): void {
    console.log("\n⚙️  Current Configuration:");
    console.log("─".repeat(40));

    console.log(
      `🔑 Private Key: ${config.privateKey ? "***configured***" : "Not set"}`,
    );
    console.log(`🆔 Public Key: ${config.pubkey ? config.pubkey : "Not set"}`);
    console.log(`📡 Relays (${config.relays.length}):`);
    config.relays.forEach((relay) => {
      console.log(`   • ${relay}`);
    });

    console.log("\n💡 Tips:");
    console.log(
      "   • Generate a private key: nostr-code-snippets config --generate-key",
    );
    console.log("   • Add more relays for better discovery");
  }

  private async interactiveConfig(): Promise<void> {
    console.log("\n🔧 Interactive Configuration Setup");
    console.log("─".repeat(40));
    console.log(
      "This will guide you through setting up your Nostr configuration.\n",
    );

    // TODO: Implement interactive configuration using a library like inquirer
    // For now, just show the current config and instructions
    const config = loadConfig();
    this.showConfig(config);

    console.log("\n📖 Configuration Help:");
    console.log("Use the following commands to configure your settings:");
    console.log("  --private-key <key>     Set your private key");
    console.log(
      "  --pubkey <key>          Set your public key (hex, npub, or nprofile)",
    );
    console.log("  --add-relay <url>       Add a relay");
    console.log("  --show                  Show current config");
    console.log("\nExample:");
    console.log(
      "  nostr-code-snippets config --add-relay wss://relay.nostr.band",
    );
  }

  private getDefaultConfig(): NostrConfig {
    return {
      relays: [
        "wss://relay.damus.io",
        "wss://nos.lol",
        "wss://relay.nostr.band",
      ],
    };
  }

  private validatePrivateKey(key: string): boolean {
    // Basic validation for hex private key (64 characters)
    return /^[a-fA-F0-9]{64}$/.test(key);
  }

  private validateRelayUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "ws:" || parsed.protocol === "wss:";
    } catch {
      return false;
    }
  }
}
