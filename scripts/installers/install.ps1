#Requires -Version 5.1
<#
.SYNOPSIS
    Install the BYOM AI Bridge daemon.
.DESCRIPTION
    Downloads and installs the latest BYOM Bridge binary from GitHub Releases.
    Verifies SHA256 checksums. Registers native messaging hosts for Chrome, Edge and Firefox.
.PARAMETER Uninstall
    Remove the BYOM Bridge installation.
#>
[CmdletBinding()]
param(
    [switch]$Uninstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$REPO = "AltClick/byom-web"
$INSTALL_DIR = Join-Path $env:LOCALAPPDATA "BYOM\bin"
$BINARY_NAME = "byom-bridge.exe"
$NATIVE_HOST_NAME = "com.byom.bridge"

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

function Install-Bridge {
    $arch = Get-Architecture
    $release = Get-LatestRelease
    $version = $release.tag_name -replace '^bridge/', ''

    Write-Host "Installing BYOM Bridge $version ($arch)..." -ForegroundColor Cyan

    $binaryAsset = "byom-bridge-win-${arch}.exe"
    $binaryUrl = ($release.assets | Where-Object { $_.name -eq $binaryAsset }).browser_download_url
    $checksumsUrl = ($release.assets | Where-Object { $_.name -eq 'SHA256SUMS.txt' }).browser_download_url

    if (-not $binaryUrl) { throw "No binary found for $binaryAsset in release $version" }
    if (-not $checksumsUrl) { throw "No checksums found in release $version" }

    $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "byom-install-$(Get-Random)"
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
        $nativeHostManifest = @{
            name             = $NATIVE_HOST_NAME
            description      = "BYOM AI Bridge native messaging host"
            path             = (Join-Path $INSTALL_DIR $BINARY_NAME)
            type             = "stdio"
            allowed_origins  = @("chrome-extension://*")
        } | ConvertTo-Json
        $manifestPath = Join-Path $INSTALL_DIR "$NATIVE_HOST_NAME.json"
        Set-Content -Path $manifestPath -Value $nativeHostManifest

        # Chrome and Edge (same registry path pattern)
        $regPaths = @(
            "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$NATIVE_HOST_NAME",
            "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$NATIVE_HOST_NAME"
        )
        foreach ($regPath in $regPaths) {
            $parent = Split-Path $regPath
            if (-not (Test-Path $parent)) { New-Item -Path $parent -Force | Out-Null }
            New-Item -Path $regPath -Force | Out-Null
            Set-ItemProperty -Path $regPath -Name '(Default)' -Value $manifestPath
        }

        # Firefox
        $firefoxRegPath = "HKCU:\Software\Mozilla\NativeMessagingHosts\$NATIVE_HOST_NAME"
        $firefoxParent = Split-Path $firefoxRegPath
        if (-not (Test-Path $firefoxParent)) { New-Item -Path $firefoxParent -Force | Out-Null }
        New-Item -Path $firefoxRegPath -Force | Out-Null
        Set-ItemProperty -Path $firefoxRegPath -Name '(Default)' -Value $manifestPath

        Write-Host ""
        Write-Host "BYOM Bridge $version installed successfully!" -ForegroundColor Green
        Write-Host "  Binary: $(Join-Path $INSTALL_DIR $BINARY_NAME)"
        Write-Host "  Restart your terminal to update PATH."
    }
    finally {
        Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Uninstall-Bridge {
    Write-Host "Uninstalling BYOM Bridge..." -ForegroundColor Yellow

    $binaryPath = Join-Path $INSTALL_DIR $BINARY_NAME
    if (Test-Path $binaryPath) { Remove-Item $binaryPath -Force }

    $manifestPath = Join-Path $INSTALL_DIR "$NATIVE_HOST_NAME.json"
    if (Test-Path $manifestPath) { Remove-Item $manifestPath -Force }

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

    Write-Host "BYOM Bridge uninstalled." -ForegroundColor Green
}

if ($Uninstall) {
    Uninstall-Bridge
} else {
    Install-Bridge
}
