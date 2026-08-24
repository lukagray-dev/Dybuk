@echo off
setlocal enabledelayedexpansion

:: =============================================================================
:: Dybuk Desktop Runner - Linux via WSL or Cross-Platform Trigger (Batch)
:: =============================================================================
:: Checks for WSL environment on Windows to launch Linux desktop environment,
:: or redirects to the native Linux bash runner (run-desktop-lin.sh).
:: =============================================================================

title Dybuk Desktop [Dev - Linux]

echo.
echo =============================================================================
echo   DYBUK DESKTOP - LINUX RUNNER
echo =============================================================================
echo.

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%.."
set "REPO_ROOT=%CD%"

:: Check if WSL is installed on Windows
where wsl >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [*] Windows Subsystem for Linux (WSL) detected.
    echo [*] Executing native Linux runner inside WSL...
    echo.
    wsl bash -c "cd '$(wslpath '%REPO_ROOT%')' && chmod +x scripts/run-desktop-lin.sh && ./scripts/run-desktop-lin.sh"
    goto :done
)

echo [i] On a native Linux system, run the bash script directly:
echo     chmod +x scripts/run-desktop-lin.sh
echo     ./scripts/run-desktop-lin.sh
echo.

:done
if %ERRORLEVEL% neq 0 (
    echo [!] Process completed with status code: %ERRORLEVEL%
    pause
)
exit /b %ERRORLEVEL%
