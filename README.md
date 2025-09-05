# nostr-code-snippets

A MCP server and command-line tool for managing and sharing Nostr code snippets.

## Installation

### Quick Install (Recommended)

Download and install the latest binary for your system:

```bash
# Download and run the installer script
curl -fsSL https://raw.githubusercontent.com/hzrd149/nostr-code-snippets/master/install.sh | bash

# Or if you prefer wget
wget -qO- https://raw.githubusercontent.com/hzrd149/nostr-code-snippets/master/install.sh | bash
```

The installer will:

- Detect your platform (Linux, macOS, or Windows)
- Download the appropriate binary from the latest GitHub release
- Install it to `$HOME/.local/bin` (or equivalent on Windows/macOS)
- Make it executable and ready to use

### Manual Installation

1. Go to the [Releases page](https://github.com/hzrd149/nostr-code-snippets/releases)
2. Download the appropriate binary for your platform:
   - **Linux x64**: `nostr-code-snippets-linux-x64.tar.gz`
   - **Linux ARM64**: `nostr-code-snippets-linux-arm64.tar.gz`
   - **macOS x64**: `nostr-code-snippets-darwin-x64.tar.gz`
   - **macOS ARM64**: `nostr-code-snippets-darwin-arm64.tar.gz`
   - **Windows x64**: `nostr-code-snippets-windows-x64.zip`
3. Extract the archive
4. Move the binary to a directory in your PATH (e.g., `$HOME/.local/bin`)
5. Make it executable (Linux/macOS): `chmod +x nostr-code-snippets`

### Verify Installation

```bash
nostr-code-snippets --help
```

## MCP Server Integration

This tool includes a Model Context Protocol (MCP) server that can be integrated with AI coding assistants like Cursor.

### Setup Requirements

Before using the MCP server, you need to configure your Nostr identity:

**Option 1: Set a public key (Read-only)**

```bash
nostr-code-snippets config --pubkey <npub1...>
```

_This allows the MCP server to search and fetch snippets using your relays, but won't be able to publish new snippets._

**Option 2: Connect a Nostr signer (Read/Write)**

```bash
nostr-code-snippets signer --connect
```

_This enables full functionality including publishing new snippets to Nostr through the MCP server._

### Using with Cursor

#### Method 1: Add to Cursor Settings (Recommended)

Add the following to your Cursor settings JSON (`~/.cursor-tutor/User/settings.json` or via Settings → Open Settings JSON):

```json
{
  "mcp.servers": {
    "nostr-code-snippets": {
      "command": "nostr-code-snippets",
      "args": ["mcp"]
    }
  }
}
```

#### Method 2: Manual MCP Server Start

You can also start the MCP server manually:

```bash
nostr-code-snippets mcp
```

Then connect your AI assistant to the running MCP server.

### MCP Features

The MCP server provides access to:

- Search and fetch Nostr code snippets
- Publish new code snippets to Nostr
- List your published snippets
- Integration with the broader Nostr code snippet ecosystem

## Development

### Prerequisites

This project uses [Bun](https://bun.com) as the JavaScript runtime.

### Setup

To install dependencies:

```bash
bun install
```

To run in development:

```bash
bun run index.ts
```

To build:

```bash
bun run build
```

### Building Binaries

The project includes GitHub Actions workflows that automatically build binaries for multiple platforms when you create a release tag.

To build locally:

```bash
# Build for your current platform
bun build index.ts --compile --outfile=nostr-code-snippets

# Build for specific platform (example for Linux x64)
bun build index.ts --compile --target=bun-linux-x64 --outfile=nostr-code-snippets-linux-x64
```

This project was created using `bun init` in bun v1.2.21. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
