@echo off
setlocal enabledelayedexpansion

:: =============================================================================
:: Dybuk Desktop Runner - Windows (Development Mode)
:: =============================================================================
:: This script compiles frontend assets via TypeScript and launches the
:: Tauri v2 desktop application in development mode with live inspection.
:: =============================================================================

title Dybuk Desktop [Dev - Windows]

echo.
echo =============================================================================
echo   DYBUK DESKTOP - DEVELOPMENT RUNNER (WINDOWS)
echo =============================================================================
echo.

:: 1. Navigate to the repository root directory relative to this script
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%.."
set "REPO_ROOT=%CD%"
set "DESKTOP_DIR=%REPO_ROOT%\desktop"

echo [*] Repository Root : %REPO_ROOT%
echo [*] Desktop App Dir : %DESKTOP_DIR%
echo.

:: 2. Verify Rust and Cargo toolchain
echo [*] Checking Rust toolchain...
where cargo >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [!] ERROR: 'cargo' was not found in your PATH.
    echo     Please install Rust from https://rustup.rs and try again.
    pause
    exit /b 1
)

:: 3. Verify Node.js and npm (required for TypeScript type-checking and compilation)
echo [*] Checking Node.js / npm environment...
where npm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [!] ERROR: 'npm' was not found in your PATH.
    echo     Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

:: 4. Navigate to the desktop directory
cd /d "%DESKTOP_DIR%"

:: 5. Install dependencies if node_modules is missing
if not exist "node_modules\" (
    echo [*] 'node_modules' not found. Installing frontend dependencies...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [!] ERROR: Failed to install frontend dependencies.
        pause
        exit /b %ERRORLEVEL%
    )
)

:: 6. Run TypeScript compiler to ensure strict type safety and build ES6 output
echo [*] Compiling TypeScript to pure ES6 modules...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [!] ERROR: TypeScript compilation failed with errors.
    pause
    exit /b %ERRORLEVEL%
)

:: 7. Launch Tauri Dev Server & Native Window
echo [*] Launching Tauri v2 Desktop Window...
echo.

where cargo-tauri >nul 2>&1
if %ERRORLEVEL% equ 0 (
    cargo tauri dev
) else (
    call npm run tauri dev
)

if %ERRORLEVEL% neq 0 (
    echo.
    echo [!] Application exited with error code: %ERRORLEVEL%
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [*] Dybuk closed successfully.
exit /b 0
