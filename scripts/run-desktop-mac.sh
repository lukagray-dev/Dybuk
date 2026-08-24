#!/usr/bin/env bash
# ==============================================================================
# Dybuk Desktop Runner - macOS (Development Mode)
# ==============================================================================
# Compiles frontend assets and launches Tauri v2 desktop application on macOS.
# ==============================================================================

set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "\n${BOLD}${BLUE}=============================================================================${NC}"
echo -e "${BOLD}${BLUE}  DYBUK DESKTOP - DEVELOPMENT RUNNER (MACOS)${NC}"
echo -e "${BOLD}${BLUE}=============================================================================${NC}\n"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DESKTOP_DIR="${REPO_ROOT}/desktop"

echo -e "${BLUE}[*]${NC} Repository Root : ${REPO_ROOT}"
echo -e "${BLUE}[*]${NC} Desktop App Dir : ${DESKTOP_DIR}\n"

if ! command -v cargo >/dev/null 2>&1; then
    echo -e "${RED}[!] ERROR: 'cargo' not found. Install Rust via https://rustup.rs${NC}"
    exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
    echo -e "${RED}[!] ERROR: 'npm' not found. Install Node.js via https://nodejs.org or Homebrew.${NC}"
    exit 1
fi

cd "${DESKTOP_DIR}"

if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}[*]${NC} Installing frontend dependencies..."
    npm install
fi

echo -e "${BLUE}[*]${NC} Compiling TypeScript to pure ES6..."
npm run build

echo -e "${GREEN}[*] Launching Dybuk Desktop on macOS...${NC}\n"
if command -v cargo-tauri >/dev/null 2>&1; then
    cargo tauri dev
else
    npm run tauri dev
fi
