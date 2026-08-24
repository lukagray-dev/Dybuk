@echo off
setlocal enabledelayedexpansion

:: =============================================================================
:: Dybuk Desktop Runner - macOS Production Release Helper (Batch)
:: =============================================================================
:: Informs the developer on Windows about macOS release build requirements.
:: =============================================================================

title Dybuk Desktop [Release - macOS]

echo.
echo =============================================================================
echo   DYBUK DESKTOP - MACOS PRODUCTION RELEASE RUNNER
echo =============================================================================
echo.

echo [i] macOS release bundles (.app / .dmg) must be compiled natively on macOS.
echo.
echo     On your Mac, open Terminal in the repository root and run:
echo     chmod +x scripts/run-desktop-release-mac.sh
echo     ./scripts/run-desktop-release-mac.sh
echo.
pause
exit /b 0
