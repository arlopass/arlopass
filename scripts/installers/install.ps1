#Requires -Version 5.1
<#
.SYNOPSIS
    Install the Arlopass Bridge daemon.
.DESCRIPTION
    Downloads and installs the latest Arlopass Bridge binary from GitHub Releases.
    Verifies SHA256 checksums. Registers native messaging hosts for Chrome, Edge and Firefox.
.PARAMETER Uninstall
    Remove the Arlopass Bridge installation.
.PARAMETER ChromeExtId
    Override the Chrome extension ID (32 lowercase a-p characters).
.PARAMETER EdgeExtId
    Override the Edge extension ID (32 lowercase a-p characters).
.PARAMETER FirefoxExtId
    Override the Firefox add-on ID (e.g. addon@domain or {uuid}).
#>
[CmdletBinding()]
param(
    [switch]$Uninstall,
    [string]$ChromeExtId,
    [string]$EdgeExtId,
    [string]$FirefoxExtId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$REPO = "Arlopass/arlopass"
$INSTALL_DIR = Join-Path $env:LOCALAPPDATA "Arlopass\bin"
$BINARY_NAME = "arlopass-bridge.exe"
$NATIVE_HOST_NAME = "com.arlopass.bridge"

function Get-Architecture {
    $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
    switch ($arch) {
        'X64'   { return 'x64' }
        'Arm64' { return 'arm64' }
        default { throw "Unsupported architecture: $arch" }
    }
}

function Get-LatestRelease {
    $releases = Invoke-RestMethod -Uri "https://api.github.com/repos/$REPO/releases?per_page=20" -UseBasicParsing
    foreach ($release in $releases) {
        if ($release.tag_name -match '^bridge/v') {
            if (-not $release.draft) {
                return $release
            }
        }
    }
    throw "No bridge release found"
}

# ---- Default extension IDs ----
# Priority: CLI param > env var > hardcoded default
$DEFAULT_CHROME_EXT_ID  = if ($env:ARLOPASS_CHROME_EXTENSION_ID)  { $env:ARLOPASS_CHROME_EXTENSION_ID  } else { "gebhamhhckkjfjibomllkpicongnebkh" }
$DEFAULT_EDGE_EXT_ID    = if ($env:ARLOPASS_EDGE_EXTENSION_ID)    { $env:ARLOPASS_EDGE_EXTENSION_ID    } else { "" }
$DEFAULT_FIREFOX_EXT_ID = if ($env:ARLOPASS_FIREFOX_EXTENSION_ID) { $env:ARLOPASS_FIREFOX_EXTENSION_ID } else { "arlopass-wallet@arlopass.com" }

function Register-NativeHosts {
    param(
        [Parameter(Mandatory)] [string]$BinaryPath,
        [Parameter(Mandatory)] [string]$ManifestDir
    )

    $chromeId  = if ($ChromeExtId)  { $ChromeExtId  } else { $DEFAULT_CHROME_EXT_ID }
    $edgeId    = if ($EdgeExtId)    { $EdgeExtId    } else { $DEFAULT_EDGE_EXT_ID }
    $firefoxId = if ($FirefoxExtId) { $FirefoxExtId } else { $DEFAULT_FIREFOX_EXT_ID }

    # ---- Chromium manifest (Chrome + Edge share the allowed_origins format) ----
    $chromiumOrigins = @()
    if ($chromeId) { $chromiumOrigins += "chrome-extension://$chromeId/" }
    if ($edgeId)   { $chromiumOrigins += "chrome-extension://$edgeId/" }

    if ($chromiumOrigins.Count -gt 0) {
        $chromiumManifest = @{
            name             = $NATIVE_HOST_NAME
            description      = "Arlopass Bridge native messaging host"
            path             = $BinaryPath
            type             = "stdio"
            allowed_origins  = $chromiumOrigins
        } | ConvertTo-Json
        $chromiumManifestPath = Join-Path $ManifestDir "$NATIVE_HOST_NAME.json"
        Set-Content -Path $chromiumManifestPath -Value $chromiumManifest

        # Chrome registry
        if ($chromeId) {
            $chromeReg = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$NATIVE_HOST_NAME"
            $chromeParent = Split-Path $chromeReg
            if (-not (Test-Path $chromeParent)) { New-Item -Path $chromeParent -Force | Out-Null }
            New-Item -Path $chromeReg -Force | Out-Null
            Set-ItemProperty -Path $chromeReg -Name '(Default)' -Value $chromiumManifestPath
        }

        # Edge registry
        if ($edgeId) {
            $edgeReg = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$NATIVE_HOST_NAME"
            $edgeParent = Split-Path $edgeReg
            if (-not (Test-Path $edgeParent)) { New-Item -Path $edgeParent -Force | Out-Null }
            New-Item -Path $edgeReg -Force | Out-Null
            Set-ItemProperty -Path $edgeReg -Name '(Default)' -Value $chromiumManifestPath
        }
    }

    # ---- Firefox manifest (uses allowed_extensions, not allowed_origins) ----
    if ($firefoxId) {
        $firefoxManifest = @{
            name                = $NATIVE_HOST_NAME
            description         = "Arlopass Bridge native messaging host"
            path                = $BinaryPath
            type                = "stdio"
            allowed_extensions  = @($firefoxId)
        } | ConvertTo-Json
        $firefoxManifestPath = Join-Path $ManifestDir "$NATIVE_HOST_NAME.firefox.json"
        Set-Content -Path $firefoxManifestPath -Value $firefoxManifest

        $firefoxReg = "HKCU:\Software\Mozilla\NativeMessagingHosts\$NATIVE_HOST_NAME"
        $firefoxParent = Split-Path $firefoxReg
        if (-not (Test-Path $firefoxParent)) { New-Item -Path $firefoxParent -Force | Out-Null }
        New-Item -Path $firefoxReg -Force | Out-Null
        Set-ItemProperty -Path $firefoxReg -Name '(Default)' -Value $firefoxManifestPath
    }

    # ---- Write config file for easy post-install edits ----
    $configPath = Join-Path $ManifestDir "allowed-extensions.json"
    $config = @{
        chromium = [ordered]@{
            chrome = $chromeId
            edge   = $edgeId
        }
        firefox = @{
            id = $firefoxId
        }
    } | ConvertTo-Json -Depth 3
    Set-Content -Path $configPath -Value $config

    Write-Host "Native messaging hosts registered." -ForegroundColor Green
    if ($chromeId)  { Write-Host "  Chrome:  $chromeId" }
    if ($edgeId)    { Write-Host "  Edge:    $edgeId" }
    if ($firefoxId) { Write-Host "  Firefox: $firefoxId" }
    if (-not $edgeId) {
        Write-Host "  Edge:    (not configured — set after Edge Add-ons publishing with -EdgeExtId)" -ForegroundColor Yellow
    }
}

function Install-Bridge {
    $arch = Get-Architecture
    $release = Get-LatestRelease
    $version = $release.tag_name -replace '^bridge/', ''

    Write-Host "Installing Arlopass Bridge $version ($arch)..." -ForegroundColor Cyan

    $binaryAsset = "arlopass-bridge-win-${arch}.exe"
    $binaryUrl = ($release.assets | Where-Object { $_.name -eq $binaryAsset }).browser_download_url
    $checksumsUrl = ($release.assets | Where-Object { $_.name -eq 'SHA256SUMS.txt' }).browser_download_url

    if (-not $binaryUrl) { throw "No binary found for $binaryAsset in release $version" }
    if (-not $checksumsUrl) { throw "No checksums found in release $version" }

    $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "arlopass-install-$(Get-Random)"
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

    try {
        $binaryPath = Join-Path $tempDir $binaryAsset
        $checksumsPath = Join-Path $tempDir "SHA256SUMS.txt"

        Write-Host "Downloading $binaryAsset..."
        Invoke-WebRequest -Uri $binaryUrl -OutFile $binaryPath -UseBasicParsing
        Invoke-WebRequest -Uri $checksumsUrl -OutFile $checksumsPath -UseBasicParsing

        # Verify checksum (mandatory)
        $expectedHash = (Get-Content $checksumsPath | Where-Object { $_ -match $binaryAsset }) -split '\s+' | Select-Object -First 1
        $actualHash = (Get-FileHash -Path $binaryPath -Algorithm SHA256).Hash.ToLower()
        if ($actualHash -ne $expectedHash) {
            throw "CHECKSUM MISMATCH! Expected: $expectedHash Got: $actualHash — aborting installation."
        }
        Write-Host "Checksum verified." -ForegroundColor Green

        # Install binary
        New-Item -ItemType Directory -Path $INSTALL_DIR -Force | Out-Null
        Copy-Item -Path $binaryPath -Destination (Join-Path $INSTALL_DIR $BINARY_NAME) -Force

        # Add to PATH
        $userPath = [Environment]::GetEnvironmentVariable('PATH', 'User')
        if ($userPath -notlike "*$INSTALL_DIR*") {
            [Environment]::SetEnvironmentVariable('PATH', "$userPath;$INSTALL_DIR", 'User')
            Write-Host "Added $INSTALL_DIR to PATH." -ForegroundColor Yellow
        }

        # Register native messaging hosts
        Register-NativeHosts -BinaryPath (Join-Path $INSTALL_DIR $BINARY_NAME) -ManifestDir $INSTALL_DIR

        Write-Host ""
        Write-Host "Arlopass Bridge $version installed successfully!" -ForegroundColor Green
        Write-Host "  Binary: $(Join-Path $INSTALL_DIR $BINARY_NAME)"
        Write-Host "  Restart your terminal to update PATH."
    }
    finally {
        Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Uninstall-Bridge {
    Write-Host "Uninstalling Arlopass Bridge..." -ForegroundColor Yellow

    $binaryPath = Join-Path $INSTALL_DIR $BINARY_NAME
    if (Test-Path $binaryPath) { Remove-Item $binaryPath -Force }

    # Remove all native messaging manifest files
    $manifestPath = Join-Path $INSTALL_DIR "$NATIVE_HOST_NAME.json"
    if (Test-Path $manifestPath) { Remove-Item $manifestPath -Force }
    $firefoxManifestPath = Join-Path $INSTALL_DIR "$NATIVE_HOST_NAME.firefox.json"
    if (Test-Path $firefoxManifestPath) { Remove-Item $firefoxManifestPath -Force }
    $configPath = Join-Path $INSTALL_DIR "allowed-extensions.json"
    if (Test-Path $configPath) { Remove-Item $configPath -Force }

    $regPaths = @(
        "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$NATIVE_HOST_NAME",
        "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$NATIVE_HOST_NAME",
        "HKCU:\Software\Mozilla\NativeMessagingHosts\$NATIVE_HOST_NAME"
    )
    foreach ($regPath in $regPaths) {
        if (Test-Path $regPath) { Remove-Item $regPath -Force }
    }

    $userPath = [Environment]::GetEnvironmentVariable('PATH', 'User')
    $newPath = ($userPath -split ';' | Where-Object { $_ -ne $INSTALL_DIR }) -join ';'
    [Environment]::SetEnvironmentVariable('PATH', $newPath, 'User')

    if ((Test-Path $INSTALL_DIR) -and -not (Get-ChildItem $INSTALL_DIR)) {
        Remove-Item $INSTALL_DIR -Force
    }

    Write-Host "Arlopass Bridge uninstalled." -ForegroundColor Green
}

if ($Uninstall) {
    Uninstall-Bridge
} else {
    Install-Bridge
}
