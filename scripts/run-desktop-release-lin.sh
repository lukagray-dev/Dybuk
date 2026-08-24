#!/usr/bin/env bash
# ==============================================================================
# Dybuk Desktop Runner - Linux (Production Release Mode)
# ==============================================================================
# Compiles frontend TypeScript assets, generates an optimized native release
# binary/bundle (AppImage / .deb), and launches the binary.
# ==============================================================================

set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "\n${BOLD}${BLUE}=============================================================================${NC}"
echo -e "${BOLD}${BLUE}  DYBUK DESKTOP - PRODUCTION RELEASE BUILDER (LINUX)${NC}"
echo -e "${BOLD}${BLUE}=============================================================================${NC}\n"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DESKTOP_DIR="${REPO_ROOT}/desktop"

if ! command -v cargo >/dev/null 2>&1; then
    echo -e "${RED}[!] ERROR: 'cargo' not found in PATH.${NC}"
    exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
    echo -e "${RED}[!] ERROR: 'npm' not found in PATH.${NC}"
    exit 1
fi

cd "${DESKTOP_DIR}"

if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}[*]${NC} Installing frontend dependencies..."
    npm install
fi

echo -e "${BLUE}[*]${NC} Building TypeScript..."
npm run build

echo -e "${BLUE}[*]${NC} Building optimized Tauri release binary..."
if command -v cargo-tauri >/dev/null 2>&1; then
    cargo tauri build
else
    npm run tauri build
fi

RELEASE_BIN="${REPO_ROOT}/target/release/dybuk-desktop"
if [ ! -f "${RELEASE_BIN}" ]; then
    RELEASE_BIN="${DESKTOP_DIR}/src-tauri/target/release/dybuk-desktop"
fi

if [ -f "${RELEASE_BIN}" ]; then
    echo -e "\n${GREEN}[*] Launching compiled release binary: ${RELEASE_BIN}${NC}\n"
    chmod +x "${RELEASE_BIN}"
    "${RELEASE_BIN}"
else
    echo -e "\n${GREEN}[*] Release build finished. Output bundles available in target/release/bundle/${NC}"
fi
