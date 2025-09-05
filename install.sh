#!/bin/bash

# nostr-code-snippets installer script
# Downloads and installs the latest binary release
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/hzrd149/nostr-code-snippets/master/install.sh | bash
#   wget -qO- https://raw.githubusercontent.com/hzrd149/nostr-code-snippets/master/install.sh | bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# GitHub repository
REPO="nostr-code-snippets"
GITHUB_USER="hzrd149"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Detect platform and architecture
detect_platform() {
    local os=$(uname -s | tr '[:upper:]' '[:lower:]')
    local arch=$(uname -m)

    case "$os" in
        linux*)
            PLATFORM="linux"
            ;;
        darwin*)
            PLATFORM="darwin"
            ;;
        mingw*|msys*|cygwin*)
            PLATFORM="windows"
            ;;
        *)
            print_error "Unsupported operating system: $os"
            exit 1
            ;;
    esac

    case "$arch" in
        x86_64|amd64)
            ARCH="x64"
            ;;
        arm64|aarch64)
            ARCH="arm64"
            ;;
        *)
            print_error "Unsupported architecture: $arch"
            exit 1
            ;;
    esac

    PLATFORM_ARCH="${PLATFORM}-${ARCH}"
    print_status "Detected platform: $PLATFORM_ARCH"
}

# Get the latest release info from GitHub API
get_latest_release() {
    print_status "Fetching latest release information..."

    local api_url="https://api.github.com/repos/${GITHUB_USER}/${REPO}/releases/latest"
    print_status "Checking: $api_url"

    if command -v curl &> /dev/null; then
        RELEASE_INFO=$(curl -s "$api_url")
    elif command -v wget &> /dev/null; then
        RELEASE_INFO=$(wget -qO- "$api_url")
    else
        print_error "Neither curl nor wget is available. Please install one of them."
        exit 1
    fi

    # Check if we got valid JSON
    if ! echo "$RELEASE_INFO" | grep -q '"tag_name"'; then
        print_error "Failed to fetch release information. Please check:"
        print_error "1. Repository exists: https://github.com/${GITHUB_USER}/${REPO}"
        print_error "2. Repository has releases"
        print_error "3. Your internet connection"
        exit 1
    fi

    TAG_NAME=$(echo "$RELEASE_INFO" | grep '"tag_name"' | cut -d'"' -f4)
    print_success "Latest release: $TAG_NAME"
}

# Download and install the binary
install_binary() {
    # Determine file extension and install directory
    if [[ "$PLATFORM" == "windows" ]]; then
        FILE_EXT=".zip"
        BINARY_NAME="nostr-code-snippets-${PLATFORM_ARCH}.exe"
        INSTALL_DIR="$HOME/AppData/Local/bin"
    else
        FILE_EXT=".tar.gz"
        BINARY_NAME="nostr-code-snippets-${PLATFORM_ARCH}"
        if [[ "$PLATFORM" == "darwin" ]]; then
            INSTALL_DIR="$HOME/.local/bin"
        else
            INSTALL_DIR="$HOME/.local/bin"
        fi
    fi

    ARCHIVE_NAME="nostr-code-snippets-${PLATFORM_ARCH}${FILE_EXT}"
    DOWNLOAD_URL="https://github.com/${GITHUB_USER}/${REPO}/releases/download/${TAG_NAME}/${ARCHIVE_NAME}"

    print_status "Download URL: $DOWNLOAD_URL"
    print_status "Installing to: $INSTALL_DIR"

    # Create install directory
    mkdir -p "$INSTALL_DIR"

    # Create temporary directory
    TEMP_DIR=$(mktemp -d)
    cd "$TEMP_DIR"

    print_status "Downloading $ARCHIVE_NAME..."
    if command -v curl &> /dev/null; then
        if ! curl -L -o "$ARCHIVE_NAME" "$DOWNLOAD_URL"; then
            print_error "Failed to download $ARCHIVE_NAME"
            print_error "Please check your internet connection and try again"
            exit 1
        fi
    elif command -v wget &> /dev/null; then
        if ! wget -O "$ARCHIVE_NAME" "$DOWNLOAD_URL"; then
            print_error "Failed to download $ARCHIVE_NAME"
            print_error "Please check your internet connection and try again"
            exit 1
        fi
    fi

    # Extract archive
    print_status "Extracting archive..."
    if [[ "$FILE_EXT" == ".zip" ]]; then
        if command -v unzip &> /dev/null; then
            unzip -q "$ARCHIVE_NAME"
        else
            print_error "unzip is required to extract Windows binaries"
            exit 1
        fi
    else
        tar -xzf "$ARCHIVE_NAME"
    fi

    # Move binary to install directory
    print_status "Installing binary..."
    if [[ "$PLATFORM" == "windows" ]]; then
        mv "$BINARY_NAME" "$INSTALL_DIR/nostr-code-snippets.exe"
        FINAL_BINARY="$INSTALL_DIR/nostr-code-snippets.exe"
    else
        mv "$BINARY_NAME" "$INSTALL_DIR/nostr-code-snippets"
        chmod +x "$INSTALL_DIR/nostr-code-snippets"
        FINAL_BINARY="$INSTALL_DIR/nostr-code-snippets"
    fi

    # Cleanup
    cd - > /dev/null
    rm -rf "$TEMP_DIR"

    print_success "Successfully installed nostr-code-snippets to $FINAL_BINARY"

    # Check if install directory is in PATH
    if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
        print_warning "Install directory is not in your PATH."
        print_warning "Add the following line to your shell configuration file:"
        if [[ "$PLATFORM" == "windows" ]]; then
            print_warning "  set PATH=%PATH%;$INSTALL_DIR"
        else
            print_warning "  export PATH=\"\$PATH:$INSTALL_DIR\""
        fi
    fi

    # Test installation
    print_status "Testing installation..."
    if "$FINAL_BINARY" --version 2>/dev/null || "$FINAL_BINARY" --help 2>/dev/null; then
        print_success "Installation verified successfully!"
    else
        print_warning "Binary installed but may not be working correctly."
    fi
}

# Main execution
main() {
    print_status "Starting nostr-code-snippets installation..."

    detect_platform
    get_latest_release
    install_binary

    print_success "Installation complete!"
    print_status "You can now run: nostr-code-snippets --help"
}

# Run main function
main "$@"
