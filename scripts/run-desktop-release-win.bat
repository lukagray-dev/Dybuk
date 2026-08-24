@echo off
setlocal enabledelayedexpansion

:: =============================================================================
:: Dybuk Desktop Runner - Windows (Production Release Mode)
:: =============================================================================
:: This script compiles the frontend, builds optimized Rust release binaries,
:: and runs the final standalone Dybuk desktop executable.
:: =============================================================================

title Dybuk Desktop [Release - Windows]

echo.
echo =============================================================================
echo   DYBUK DESKTOP - PRODUCTION RELEASE RUNNER (WINDOWS)
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

:: 2. Verify toolchains
where cargo >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [!] ERROR: 'cargo' was not found in your PATH. Install from https://rustup.rs
    pause
    exit /b 1
)

where npm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [!] ERROR: 'npm' was not found in your PATH. Install from https://nodejs.org
    pause
    exit /b 1
)

:: 3. Navigate to desktop folder
cd /d "%DESKTOP_DIR%"

:: 4. Ensure dependencies are up-to-date
if not exist "node_modules\" (
    echo [*] Installing frontend dependencies...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [!] ERROR: npm install failed.
        pause
        exit /b %ERRORLEVEL%
    )
)

:: 5. Compile TypeScript
echo [*] Building TypeScript to ES6...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [!] ERROR: TypeScript compilation failed.
    pause
    exit /b %ERRORLEVEL%
)

:: 6. Build Tauri in release mode
echo [*] Building optimized release bundle (cargo tauri build)...
where cargo-tauri >nul 2>&1
if %ERRORLEVEL% equ 0 (
    cargo tauri build
) else (
    call npm run tauri build
)

if %ERRORLEVEL% neq 0 (
    echo [!] ERROR: Tauri release build failed.
    pause
    exit /b %ERRORLEVEL%
)

:: 7. Locate and launch the built release executable
set "RELEASE_EXE=%REPO_ROOT%\target\release\dybuk-desktop.exe"
if not exist "%RELEASE_EXE%" (
    set "RELEASE_EXE=%DESKTOP_DIR%\src-tauri\target\release\dybuk-desktop.exe"
)

if exist "%RELEASE_EXE%" (
    echo.
    echo [*] Launching standalone release binary: %RELEASE_EXE%
    start "" "%RELEASE_EXE%"
) else (
    echo.
    echo [*] Release bundle created successfully in target/release directory.
)

echo.
echo [*] Done.
exit /b 0
