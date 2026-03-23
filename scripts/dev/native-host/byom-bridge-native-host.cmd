@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%\..\..\..") do set "REPO_ROOT=%%~fI"

pushd "%REPO_ROOT%"
node --loader "./scripts/dev/ts-js-specifier-loader.mjs" "./apps/bridge/src/main.ts"
set "EXIT_CODE=%ERRORLEVEL%"
popd

exit /b %EXIT_CODE%
