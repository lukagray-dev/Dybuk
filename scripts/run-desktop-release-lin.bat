@echo off
setlocal enabledelayedexpansion

:: =============================================================================
:: Dybuk Desktop Runner - Linux Release via WSL / Cross-Platform Trigger (Batch)
:: =============================================================================
:: Runs optimized production Linux build inside WSL or provides execution commands.
:: =============================================================================

title Dybuk Desktop [Release - Linux]

echo.
echo =============================================================================
echo   DYBUK DESKTOP - LINUX PRODUCTION RELEASE RUNNER
echo =============================================================================
echo.

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%.."
set "REPO_ROOT=%CD%"

where wsl >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [*] Windows Subsystem for Linux (WSL) detected.
    echo [*] Executing Linux release build inside WSL...
    echo.
    wsl bash -c "cd '$(wslpath '%REPO_ROOT%')' && chmod +x scripts/run-desktop-release-lin.sh && ./scripts/run-desktop-release-lin.sh"
    goto :done
)

echo [i] On a native Linux system, run the release script directly:
echo     chmod +x scripts/run-desktop-release-lin.sh
echo     ./scripts/run-desktop-release-lin.sh
echo.

:done
if %ERRORLEVEL% neq 0 (
    echo [!] Process completed with status code: %ERRORLEVEL%
    pause
)
exit /b %ERRORLEVEL%
