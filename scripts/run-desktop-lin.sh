#!/usr/bin/env bash
# ==============================================================================
# Dybuk Desktop Runner - Linux (Development Mode)
# ==============================================================================
# Compiles frontend TypeScript assets to pure ES6 and launches the Tauri v2
# desktop application with live inspection on Linux.
# ==============================================================================

set -euo pipefail

# ANSI color codes for rich terminal feedback
BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "\n${BOLD}${BLUE}=============================================================================${NC}"
echo -e "${BOLD}${BLUE}  DYBUK DESKTOP - DEVELOPMENT RUNNER (LINUX)${NC}"
echo -e "${BOLD}${BLUE}=============================================================================${NC}\n"

# 1. Resolve repository and desktop paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DESKTOP_DIR="${REPO_ROOT}/desktop"

echo -e "${BLUE}[*]${NC} Repository Root : ${REPO_ROOT}"
echo -e "${BLUE}[*]${NC} Desktop App Dir : ${DESKTOP_DIR}\n"

# 2. Check Rust toolchain
echo -e "${BLUE}[*]${NC} Checking Rust toolchain..."
if ! command -v cargo >/dev/null 2>&1; then
    echo -e "${RED}[!] ERROR: 'cargo' not found. Install Rust from https://rustup.rs${NC}"
    exit 1
fi

# 3. Check Node.js / npm
echo -e "${BLUE}[*]${NC} Checking Node.js / npm..."
if ! command -v npm >/dev/null 2>&1; then
    echo -e "${RED}[!] ERROR: 'npm' not found. Install Node.js (v18+) from https://nodejs.org${NC}"
    exit 1
fi

# 4. Check Linux system prerequisites (WebKitGTK, GTK3)
echo -e "${BLUE}[*]${NC} Checking Linux webview dependencies..."
if command -v pkg-config >/dev/null 2>&1; then
    if ! pkg-config --exists webkit2gtk-4.1 && ! pkg-config --exists webkit2gtk-4.0; then
        echo -e "${YELLOW}[!] WARNING: 'webkit2gtk' package not detected via pkg-config.${NC}"
        echo -e "${YELLOW}    If compilation fails, install: libwebkit2gtk-4.1-dev or libwebkit2gtk-4.0-dev${NC}"
    fi
fi

# 5. Enter desktop directory
cd "${DESKTOP_DIR}"

# 6. Ensure frontend dependencies are installed
if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}[*]${NC} Installing frontend dependencies..."
    npm install
fi

# 7. Compile TypeScript to ES6
echo -e "${BLUE}[*]${NC} Compiling TypeScript to pure ES6 (src/ts -> src/js)..."
npm run build

# 8. Launch Tauri application
echo -e "${GREEN}[*] Launching Dybuk Desktop application...${NC}\n"
if command -v cargo-tauri >/dev/null 2>&1; then
    cargo tauri dev
else
    npm run tauri dev
fi

echo -e "\n${GREEN}[*] Dybuk session ended successfully.${NC}"
