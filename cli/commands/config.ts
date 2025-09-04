import { Helpers } from "applesauce-core";
import { Command } from "commander";
import inquirer from "inquirer";
import { nip19 } from "nostr-tools";
import {
  loadConfig,
  saveConfig,
  type NostrConfig,
} from "../../helpers/config.js";
import { DEFAULT_RELAYS } from "../../helpers/const";
import {
  isHexPubkey,
  isNip05Address,
  isNpub,
  resolveNip05,
} from "../../helpers/nip05.js";
import type { BaseCommand } from "../types.js";

export class ConfigCommand implements BaseCommand {
  name = "config";
  description = "Configure Nostr settings";

  setup(program: Command): void {
    program
      .command(this.name)
      .description(this.description)
      .action(async () => {
        await this.execute();
      });
  }

  async execute(): Promise<void> {
    try {
      await this.interactiveConfig();
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

    console.log(`🔑 Signer: ***stored in system keyring***`);
    console.log(`🆔 Public Key: ${config.pubkey ? config.pubkey : "Not set"}`);
    console.log(
      `📝 Editor: ${config.editor || "Not set (uses $EDITOR, $VISUAL, or vi)"}`,
    );
    console.log(`📡 Relays (${config.relays.length}):`);
    config.relays.forEach((relay) => {
      console.log(`   • ${relay}`);
    });

    console.log("\n💡 Tips:");
    console.log(
      "   • Set a signer: nostr-code-snippets config --signer <nsec_or_nbunksec>",
    );
    console.log("   • Add more relays for better discovery");
    console.log("   • Signer is securely stored in your system's keyring");
  }

  private async interactiveConfig(): Promise<void> {
    console.log("\n🔧 Interactive Configuration");
    console.log("─".repeat(40));

    const config = loadConfig();
    this.showConfig(config);

    while (true) {
      console.log("\n");
      const { action } = await inquirer.prompt([
        {
          type: "list",
          name: "action",
          message: "What would you like to configure?",
          choices: [
            { name: "🔑 Public Key (npub/hex/NIP-05)", value: "pubkey" },
            { name: "📝 Editor", value: "editor" },
            { name: "📡 Relays", value: "relays" },
            { name: "👁️  View Current Config", value: "show" },
            { name: "🔄 Reset to Defaults", value: "reset" },
            { name: "✅ Done", value: "exit" },
          ],
        },
      ]);

      if (action === "exit") {
        console.log("✅ Configuration complete!");
        break;
      }

      switch (action) {
        case "pubkey":
          await this.configurePubkey();
          break;
        case "editor":
          await this.configureEditor();
          break;
        case "relays":
          await this.configureRelays();
          break;
        case "show":
          this.showConfig(loadConfig());
          break;
        case "reset":
          await this.resetConfig();
          break;
      }
    }
  }

  private async configurePubkey(): Promise<void> {
    console.log("\n🔑 Configure Public Key");
    console.log("─".repeat(30));

    const config = loadConfig();
    if (config.pubkey) {
      console.log(`Current: ${config.pubkey}`);
      try {
        const npub = nip19.npubEncode(config.pubkey);
        console.log(`(npub: ${npub})`);
      } catch {
        // Invalid hex key, ignore
      }
    }

    const { pubkeyInput } = await inquirer.prompt([
      {
        type: "input",
        name: "pubkeyInput",
        message: "Enter your public key (npub, hex, or NIP-05 address):",
        validate: async (input: string) => {
          if (!input.trim()) return "Please enter a public key";

          const trimmed = input.trim();

          // Check if it's a NIP-05 address
          if (isNip05Address(trimmed)) {
            return true; // We'll resolve it later
          }

          // Check if it's an npub or hex
          if (isNpub(trimmed) || isHexPubkey(trimmed)) {
            return true;
          }

          // Try to normalize with applesauce helper (handles more formats)
          try {
            Helpers.normalizeToPubkey(trimmed);
            return true;
          } catch {
            return "Invalid format. Please provide a valid hex public key, npub, or NIP-05 address (user@domain.com).";
          }
        },
      },
    ]);

    if (pubkeyInput.trim()) {
      const trimmed = pubkeyInput.trim();
      let hexPubkey: string;

      try {
        if (isNip05Address(trimmed)) {
          console.log("🔍 Resolving NIP-05 address...");
          const resolvedPubkey = await resolveNip05(trimmed);

          if (!resolvedPubkey) {
            console.error(
              "❌ Failed to resolve NIP-05 address. Please check the address and try again.",
            );
            return;
          }

          hexPubkey = resolvedPubkey;
          console.log(`✅ Resolved NIP-05 address: ${trimmed}`);
        } else {
          // Use applesauce helper for npub/hex normalization
          hexPubkey = Helpers.normalizeToPubkey(trimmed);
        }

        config.pubkey = hexPubkey;
        saveConfig(config);
        console.log("✅ Public key updated successfully!");

        // Show both hex and npub versions
        console.log(`   Hex: ${hexPubkey}`);
        try {
          const npub = nip19.npubEncode(hexPubkey);
          console.log(`   npub: ${npub}`);
        } catch {
          // Ignore encoding errors
        }
      } catch (error) {
        console.error(
          "❌ Failed to process public key:",
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  private async configureEditor(): Promise<void> {
    console.log("\n📝 Configure Editor");
    console.log("─".repeat(30));

    const config = loadConfig();
    if (config.editor) {
      console.log(`Current: ${config.editor}`);
    } else {
      console.log("Current: Not set (uses $EDITOR, $VISUAL, or vi)");
    }

    const editorPresets = [
      { name: "Visual Studio Code (code --wait)", value: "code --wait" },
      {
        name: "Visual Studio Code Insiders (code-insiders --wait)",
        value: "code-insiders --wait",
      },
      { name: "Cursor (cursor --wait)", value: "cursor --wait" },
      { name: "Sublime Text (subl --wait)", value: "subl --wait" },
      { name: "Atom (atom --wait)", value: "atom --wait" },
      { name: "Vim (vim)", value: "vim" },
      { name: "Neovim (nvim)", value: "nvim" },
      { name: "Emacs (emacs)", value: "emacs" },
      { name: "Nano (nano)", value: "nano" },
      { name: "Gedit (gedit --wait)", value: "gedit --wait" },
      { name: "Kate (kate --block)", value: "kate --block" },
      { name: "Custom command", value: "custom" },
      { name: "Use system default ($EDITOR)", value: "default" },
    ];

    const { editorChoice } = await inquirer.prompt([
      {
        type: "list",
        name: "editorChoice",
        message: "Select your preferred editor:",
        choices: editorPresets,
      },
    ]);

    let editorCommand = editorChoice;

    if (editorChoice === "custom") {
      const { customEditor } = await inquirer.prompt([
        {
          type: "input",
          name: "customEditor",
          message:
            "Enter your custom editor command (include --wait flag if needed):",
          validate: (input: string) => {
            if (!input.trim()) return "Please enter an editor command";
            return true;
          },
        },
      ]);
      editorCommand = customEditor.trim();
    } else if (editorChoice === "default") {
      editorCommand = undefined;
    }

    config.editor = editorCommand;
    saveConfig(config);

    if (editorCommand) {
      console.log(`✅ Editor set to: ${editorCommand}`);
    } else {
      console.log("✅ Editor reset to system default");
    }
  }

  private async configureRelays(): Promise<void> {
    console.log("\n📡 Configure Relays");
    console.log("─".repeat(30));

    let config = loadConfig();

    while (true) {
      console.log(`\nCurrent relays (${config.relays.length}):`);
      config.relays.forEach((relay, index) => {
        console.log(`   ${index + 1}. ${relay}`);
      });

      const { relayAction } = await inquirer.prompt([
        {
          type: "list",
          name: "relayAction",
          message: "What would you like to do?",
          choices: [
            { name: "➕ Add a relay", value: "add" },
            { name: "➖ Remove a relay", value: "remove" },
            { name: "🔄 Reset to defaults", value: "reset" },
            { name: "⬅️  Back to main menu", value: "back" },
          ],
        },
      ]);

      if (relayAction === "back") break;

      switch (relayAction) {
        case "add":
          await this.addRelay(config);
          break;
        case "remove":
          await this.removeRelay(config);
          break;
        case "reset":
          await this.resetRelays(config);
          break;
      }

      // Reload config after changes
      config = loadConfig();
    }
  }

  private async addRelay(config: NostrConfig): Promise<void> {
    const { relayUrl } = await inquirer.prompt([
      {
        type: "input",
        name: "relayUrl",
        message: "Enter relay URL (wss://...):",
        validate: (input: string) => {
          if (!input.trim()) return "Please enter a relay URL";
          if (!this.validateRelayUrl(input.trim())) {
            return "Invalid relay URL format. Must start with ws:// or wss://";
          }
          return true;
        },
      },
    ]);

    const trimmedUrl = relayUrl.trim();
    if (config.relays.includes(trimmedUrl)) {
      console.log(`⚠️  Relay already exists: ${trimmedUrl}`);
      return;
    }

    config.relays.push(trimmedUrl);
    saveConfig(config);
    console.log(`✅ Added relay: ${trimmedUrl}`);
  }

  private async removeRelay(config: NostrConfig): Promise<void> {
    if (config.relays.length === 0) {
      console.log("⚠️  No relays to remove");
      return;
    }

    const choices = config.relays.map((relay, index) => ({
      name: relay,
      value: index,
    }));

    const { relayIndex } = await inquirer.prompt([
      {
        type: "list",
        name: "relayIndex",
        message: "Select relay to remove:",
        choices,
      },
    ]);

    const removedRelay = config.relays[relayIndex];
    config.relays.splice(relayIndex, 1);
    saveConfig(config);
    console.log(`✅ Removed relay: ${removedRelay}`);
  }

  private async resetRelays(config: NostrConfig): Promise<void> {
    const { confirmed } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirmed",
        message:
          "Reset relays to defaults? This will remove all custom relays.",
        default: false,
      },
    ]);

    if (confirmed) {
      config.relays = [...DEFAULT_RELAYS];
      saveConfig(config);
      console.log("✅ Relays reset to defaults");
    }
  }

  private async resetConfig(): Promise<void> {
    const { confirmed } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirmed",
        message:
          "Reset entire configuration to defaults? This will remove all settings except the signer.",
        default: false,
      },
    ]);

    if (confirmed) {
      const defaultConfig = this.getDefaultConfig();
      saveConfig(defaultConfig);
      console.log("✅ Configuration reset to defaults");
      this.showConfig(defaultConfig);
    }
  }

  private getDefaultConfig(): NostrConfig {
    return {
      relays: DEFAULT_RELAYS,
    };
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
