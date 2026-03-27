#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Renames files or folders with case-sensitive changes on Windows (case-insensitive filesystem).

.DESCRIPTION
    On Windows, direct case-only renames (e.g., MyFile.ts -> myFile.ts) fail because the OS
    treats them as the same path. This script uses a two-step git mv (source -> temp -> target)
    to safely perform case-sensitive renames tracked by git.

.PARAMETER Path
    The current relative path of the file or folder to rename.

.PARAMETER NewName
    The new name (just the filename/foldername, not the full path) with the desired casing.

.PARAMETER NewPath
    Alternative to NewName: the full relative target path. Use when also moving the file.

.EXAMPLE
    .\scripts\dev\case-rename.ps1 -Path src/MyComponent.tsx -NewName myComponent.tsx

.EXAMPLE
    .\scripts\dev\case-rename.ps1 -Path src/Utils -NewName utils

.EXAMPLE
    .\scripts\dev\case-rename.ps1 -Path src/old/File.ts -NewPath src/new/file.ts
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $false)]
    [string]$NewName,

    [Parameter(Mandatory = $false)]
    [string]$NewPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Validate parameters
if (-not $NewName -and -not $NewPath) {
    Write-Error "You must provide either -NewName or -NewPath."
    exit 1
}
if ($NewName -and $NewPath) {
    Write-Error "Provide only one of -NewName or -NewPath, not both."
    exit 1
}

# Ensure we're in a git repo
$gitRoot = git rev-parse --show-toplevel 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Error "Not inside a git repository."
    exit 1
}

# Normalize path separators to forward slashes for git
$Path = $Path -replace '\\', '/'

# Compute the target path
if ($NewName) {
    $parent = Split-Path $Path -Parent
    if ($parent) {
        $parent = $parent -replace '\\', '/'
        $TargetPath = "$parent/$NewName"
    } else {
        $TargetPath = $NewName
    }
} else {
    $TargetPath = $NewPath -replace '\\', '/'
}

# Check if source exists
if (-not (Test-Path $Path)) {
    Write-Error "Source path does not exist: $Path"
    exit 1
}

# Check if this is actually a case-only rename
$sourceLower = $Path.ToLowerInvariant()
$targetLower = $TargetPath.ToLowerInvariant()
$isCaseOnly = $sourceLower -eq $targetLower

if (-not $isCaseOnly) {
    # Standard rename — git mv handles it directly
    Write-Host "Renaming: $Path -> $TargetPath"
    
    $targetDir = Split-Path $TargetPath -Parent
    if ($targetDir -and -not (Test-Path $targetDir)) {
        New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    }
    
    git mv $Path $TargetPath
    if ($LASTEXITCODE -ne 0) {
        Write-Error "git mv failed."
        exit 1
    }
    Write-Host "Done." -ForegroundColor Green
    exit 0
}

# Case-only rename: use two-step approach via a temporary name
$tempSuffix = "_case_rename_temp_$([System.Guid]::NewGuid().ToString('N').Substring(0,8))"
$parent = Split-Path $Path -Parent
$fileName = Split-Path $Path -Leaf

if ($parent) {
    $parent = $parent -replace '\\', '/'
    $tempPath = "$parent/${fileName}${tempSuffix}"
} else {
    $tempPath = "${fileName}${tempSuffix}"
}

Write-Host "Case-sensitive rename: $Path -> $TargetPath"
Write-Host "  Step 1: $Path -> $tempPath"

git mv $Path $tempPath
if ($LASTEXITCODE -ne 0) {
    Write-Error "git mv (step 1) failed."
    exit 1
}

Write-Host "  Step 2: $tempPath -> $TargetPath"

git mv $tempPath $TargetPath
if ($LASTEXITCODE -ne 0) {
    # Try to recover
    Write-Warning "git mv (step 2) failed. Attempting to restore original..."
    git mv $tempPath $Path
    Write-Error "Rename failed. Original file restored."
    exit 1
}

Write-Host "Done." -ForegroundColor Green
