#!/usr/bin/env bash
# ==============================================================================
# Dybuk Desktop Runner - macOS (Production Release Mode)
# ==============================================================================
# Compiles frontend assets and builds optimized native macOS .app / .dmg bundle.
# ==============================================================================

set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "\n${BOLD}${BLUE}=============================================================================${NC}"
echo -e "${BOLD}${BLUE}  DYBUK DESKTOP - PRODUCTION RELEASE BUILDER (MACOS)${NC}"
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

echo -e "${BLUE}[*]${NC} Building optimized Tauri release bundle for macOS..."
if command -v cargo-tauri >/dev/null 2>&1; then
    cargo tauri build
else
    npm run tauri build
fi

echo -e "\n${GREEN}[*] macOS release build completed. Output .app / .dmg generated in target/release/bundle/dmg/${NC}"
