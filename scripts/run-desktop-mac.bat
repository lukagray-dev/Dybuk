@echo off
setlocal enabledelayedexpansion

:: =============================================================================
:: Dybuk Desktop Runner - macOS Helper (Batch)
:: =============================================================================
:: Informs the developer on Windows about macOS execution requirements, or runs
:: the companion bash script on macOS environments.
:: =============================================================================

title Dybuk Desktop [Dev - macOS]

echo.
echo =============================================================================
echo   DYBUK DESKTOP - MACOS RUNNER
echo =============================================================================
echo.

echo [i] macOS builds require native Darwin kernel and Xcode Command Line Tools.
echo.
echo     On your Mac, open Terminal in the repository root and run:
echo     chmod +x scripts/run-desktop-mac.sh
echo     ./scripts/run-desktop-mac.sh
echo.
pause
exit /b 0
