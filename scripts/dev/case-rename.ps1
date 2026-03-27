#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Bulk find-and-replace rename of files and folders using git mv, with case-sensitive support on Windows.

.DESCRIPTION
    Searches all git-tracked file and folder names for a substring, replaces it with a new value,
    and renames via git mv. Handles case-only renames (e.g., Byom -> arlopass) using a two-step
    rename through a temp name to work around Windows case-insensitive filesystem.

    Renames deepest paths first (bottom-up) so parent renames don't break child paths.

.PARAMETER Find
    The substring to search for in file/folder names (case-sensitive match).

.PARAMETER Replace
    The replacement string.

.PARAMETER DryRun
    Preview changes without renaming anything.

.PARAMETER IncludeContent
    Also find-and-replace inside file contents (uses git grep + sed-style replacement).

.EXAMPLE
    .\scripts\dev\case-rename.ps1 -Find arlopass-bridge -Replace arlopass-bridge -DryRun

.EXAMPLE
    .\scripts\dev\case-rename.ps1 -Find arlopass -Replace arlopass

.EXAMPLE
    .\scripts\dev\case-rename.ps1 -Find MyComponent -Replace myComponent
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Find,

    [Parameter(Mandatory = $true)]
    [string]$Replace,

    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Ensure we're in a git repo
$gitRoot = git rev-parse --show-toplevel 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Error "Not inside a git repository."
    exit 1
}

# ── Helper: perform a single git mv (handles case-only renames via temp) ──
function Invoke-GitMv {
    param([string]$Source, [string]$Target)

    $sourceLower = $Source.ToLowerInvariant()
    $targetLower = $Target.ToLowerInvariant()
    $isCaseOnly = $sourceLower -eq $targetLower

    if (-not $isCaseOnly) {
        $targetDir = Split-Path $Target -Parent
        if ($targetDir -and -not (Test-Path $targetDir)) {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        }
        git mv $Source $Target
        if ($LASTEXITCODE -ne 0) { throw "git mv failed: $Source -> $Target" }
        return
    }

    # Case-only: two-step via temp name
    $tempSuffix = "_case_rename_temp_$([System.Guid]::NewGuid().ToString('N').Substring(0,8))"
    $parent = Split-Path $Source -Parent
    $leaf = Split-Path $Source -Leaf
    $tempPath = if ($parent) { "$($parent -replace '\\','/')/${leaf}${tempSuffix}" } else { "${leaf}${tempSuffix}" }

    git mv $Source $tempPath
    if ($LASTEXITCODE -ne 0) { throw "git mv (step 1) failed: $Source -> $tempPath" }

    git mv $tempPath $Target
    if ($LASTEXITCODE -ne 0) {
        git mv $tempPath $Source 2>$null
        throw "git mv (step 2) failed: $tempPath -> $Target. Restored original."
    }
}

# ── Collect all git-tracked paths that contain the search string ──
Write-Host "`nSearching for paths containing '$Find'..." -ForegroundColor Cyan

$allPaths = git ls-files | ForEach-Object { $_ -replace '\\', '/' }

# Collect unique directory segments and files that contain the Find string
$renames = [System.Collections.Generic.List[PSCustomObject]]::new()
$seenDirs = [System.Collections.Generic.HashSet[string]]::new()

foreach ($filePath in $allPaths) {
    $parts = $filePath -split '/'

    # Check each directory segment
    $accumulated = ''
    for ($i = 0; $i -lt $parts.Length - 1; $i++) {
        $segment = $parts[$i]
        $accumulated = if ($accumulated) { "$accumulated/$segment" } else { $segment }
        if ($segment.Contains($Find) -and $seenDirs.Add($accumulated)) {
            $newSegment = $segment.Replace($Find, $Replace)
            $parentDir = ($parts[0..($i - 1)] -join '/')
            $source = $accumulated
            $target = if ($parentDir) { "$parentDir/$newSegment" } else { $newSegment }
            $renames.Add([PSCustomObject]@{ Source = $source; Target = $target; Type = 'dir' })
        }
    }

    # Check the file name itself
    $fileName = $parts[-1]
    if ($fileName.Contains($Find)) {
        $newFileName = $fileName.Replace($Find, $Replace)
        $parentDir = if ($parts.Length -gt 1) { ($parts[0..($parts.Length - 2)] -join '/') } else { '' }
        $source = $filePath
        $target = if ($parentDir) { "$parentDir/$newFileName" } else { $newFileName }
        $renames.Add([PSCustomObject]@{ Source = $source; Target = $target; Type = 'file' })
    }
}

if ($renames.Count -eq 0) {
    Write-Host "No files or folders found containing '$Find'." -ForegroundColor Yellow
    exit 0
}

# Sort: deepest paths first (most slashes), files before dirs at same depth
# This ensures children are renamed before parents
$renames = $renames | Sort-Object {
    ($_.Source -split '/').Length
}, { $_.Type -eq 'dir' } -Descending

# Deduplicate: after a parent dir rename, child paths change — recompute targets
# We process in order and track accumulated renames
Write-Host "`nPlanned renames ($($renames.Count)):" -ForegroundColor Cyan
Write-Host ("-" * 60)
foreach ($r in $renames) {
    $arrow = if ($r.Type -eq 'dir') { '[DIR] ' } else { '      ' }
    Write-Host "  ${arrow}$($r.Source)" -ForegroundColor Yellow -NoNewline
    Write-Host " -> " -NoNewline
    Write-Host "$($r.Target)" -ForegroundColor Green
}
Write-Host ("-" * 60)

if ($DryRun) {
    Write-Host "`nDry run — no changes made." -ForegroundColor Magenta
    exit 0
}

# ── Execute renames bottom-up ──
# Track path substitutions so child renames apply to the already-renamed parent paths
$pathMap = [System.Collections.Generic.Dictionary[string,string]]::new()

$successCount = 0
$failCount = 0

foreach ($r in $renames) {
    # Apply any parent renames that already happened to this source/target
    $currentSource = $r.Source
    $currentTarget = $r.Target
    foreach ($kv in $pathMap.GetEnumerator()) {
        $currentSource = $currentSource.Replace($kv.Key, $kv.Value)
        $currentTarget = $currentTarget.Replace($kv.Key, $kv.Value)
    }

    if ($currentSource -ceq $currentTarget) { continue }
    if (-not (Test-Path $currentSource)) {
        Write-Warning "Skipping (not found): $currentSource"
        $failCount++
        continue
    }

    try {
        Write-Host "  Renaming: $currentSource -> $currentTarget"
        Invoke-GitMv -Source $currentSource -Target $currentTarget
        $pathMap[$r.Source] = $r.Target
        $successCount++
    }
    catch {
        Write-Warning "Failed: $currentSource -> $currentTarget ($_)"
        $failCount++
    }
}

Write-Host "`nComplete: $successCount renamed, $failCount failed." -ForegroundColor $(if ($failCount -eq 0) { 'Green' } else { 'Yellow' })
