[CmdletBinding()]
param(
  [ValidateSet("setup", "validate", "watch", "bridge", "full")]
  [string]$Mode = "full",
  [switch]$SkipInstall,
  [string]$ExtensionId,
  [switch]$SkipNativeHostRegistration
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$shellPath = (Get-Process -Id $PID).Path

function Invoke-InRepo {
  param(
    [Parameter(Mandatory = $true)]
    [scriptblock]$Block
  )

  Push-Location $repoRoot
  try {
    & $Block
  }
  finally {
    Pop-Location
  }
}

function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,
    [string]$FailureMessage
  )

  & $FilePath @Arguments
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    if ([string]::IsNullOrWhiteSpace($FailureMessage)) {
      $joinedArgs = $Arguments -join " "
      throw "Command failed with exit code ${exitCode}: $FilePath $joinedArgs"
    }

    throw "$FailureMessage (exit code $exitCode)."
  }
}

function Ensure-DevTooling {
  Invoke-InRepo {
    $typescriptPackage = Join-Path $repoRoot "node_modules\typescript\package.json"
    if (-not (Test-Path -LiteralPath $typescriptPackage)) {
      Write-Host "TypeScript dependency missing. Running npm install..." -ForegroundColor Yellow
      Invoke-Native -FilePath "npm" -Arguments @("install") -FailureMessage "npm install failed while installing dependencies"
    }
  }
}

function Resolve-BridgeStateDirectory {
  $baseDirectory = $env:LOCALAPPDATA
  if ([string]::IsNullOrWhiteSpace($baseDirectory)) {
    $baseDirectory = $env:TEMP
  }
  if ([string]::IsNullOrWhiteSpace($baseDirectory)) {
    $baseDirectory = [System.IO.Path]::GetTempPath()
  }

  return Join-Path $baseDirectory "Arlopass\bridge\state"
}

function Start-WatcherWindow {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$CommandText
  )

  $process = Start-Process `
    -FilePath $shellPath `
    -ArgumentList @("-NoProfile", "-Command", $CommandText) `
    -PassThru

  Write-Host "Started $Name watcher (PID: $($process.Id))."
  return $process
}

function Get-DescendantProcessIds {
  param(
    [Parameter(Mandatory = $true)]
    [int]$ParentId
  )

  $discovered = New-Object System.Collections.Generic.List[int]
  $frontier = @($ParentId)

  while ($frontier.Count -gt 0) {
    $nextFrontier = @()
    foreach ($currentParentId in $frontier) {
      $children = @(
        Get-CimInstance Win32_Process -Filter "ParentProcessId = $currentParentId" -ErrorAction SilentlyContinue |
          Select-Object -ExpandProperty ProcessId
      )

      foreach ($childId in $children) {
        if ($discovered.Contains([int]$childId)) {
          continue
        }

        $discovered.Add([int]$childId)
        $nextFrontier += [int]$childId
      }
    }

    $frontier = $nextFrontier
  }

  return @($discovered)
}

function Stop-ProcessTree {
  param(
    [Parameter(Mandatory = $true)]
    [int]$RootId
  )

  $descendants = @(Get-DescendantProcessIds -ParentId $RootId | Sort-Object -Descending)
  foreach ($childId in $descendants) {
    $childProcess = Get-Process -Id $childId -ErrorAction SilentlyContinue
    if ($null -eq $childProcess) {
      continue
    }

    try {
      if (-not $childProcess.HasExited) {
        Stop-Process -Id $childId -Force -ErrorAction SilentlyContinue
      }
    }
    catch {
      # Ignore race conditions where process exits during shutdown.
    }
  }

  $rootProcess = Get-Process -Id $RootId -ErrorAction SilentlyContinue
  if ($null -eq $rootProcess) {
    return
  }

  try {
    if (-not $rootProcess.HasExited) {
      Stop-Process -Id $RootId -Force -ErrorAction SilentlyContinue
      Wait-Process -Id $RootId -Timeout 5 -ErrorAction SilentlyContinue
    }
  }
  catch {
    # Ignore cleanup races where process exits between check and stop.
  }
}

function Start-DevWatchers {
  $escapedRepoRoot = $repoRoot.Path.Replace("'", "''")

  $bridgeWatchCommand = "Set-Location '$escapedRepoRoot'; npm run build -w @arlopass/bridge -- --watch"
  $extensionWatchCommand = "Set-Location '$escapedRepoRoot'; npm run build -w @arlopass/extension -- --watch"

  $bridgeWatcher = Start-WatcherWindow -Name "bridge" -CommandText $bridgeWatchCommand
  $extensionWatcher = Start-WatcherWindow -Name "extension" -CommandText $extensionWatchCommand

  return @($bridgeWatcher, $extensionWatcher)
}

function Stop-DevWatchers {
  param(
    [System.Diagnostics.Process[]]$Watchers
  )

  foreach ($watcher in $Watchers) {
    if ($null -eq $watcher) {
      continue
    }

    try {
      if (-not $watcher.HasExited) {
        Stop-ProcessTree -RootId $watcher.Id
        Write-Host "Stopped watcher (PID: $($watcher.Id))."
      }
    }
    catch {
      # Ignore cleanup races where process exits between check and stop.
    }
  }
}

function Invoke-Setup {
  param(
    [switch]$PreferIncrementalInstall
  )

  Invoke-InRepo {
    $nodeModulesPath = Join-Path $repoRoot "node_modules"
    $hasNodeModules = Test-Path -LiteralPath $nodeModulesPath

    if ($PreferIncrementalInstall.IsPresent -and $hasNodeModules) {
      Write-Host "Detected existing node_modules. Running npm install for incremental dependency sync..." -ForegroundColor Cyan
      Invoke-Native -FilePath "npm" -Arguments @("install") -FailureMessage "npm install failed while syncing dependencies"
      return
    }

    try {
      Invoke-Native -FilePath "npm" -Arguments @("ci") -FailureMessage "npm ci failed"
    }
    catch {
      Write-Host "npm ci failed (commonly due Windows file locks). Retrying with npm install..." -ForegroundColor Yellow
      Invoke-Native -FilePath "npm" -Arguments @("install") -FailureMessage "npm install failed after npm ci failure"
    }
  }
}

function Invoke-Validate {
  Invoke-InRepo {
    Invoke-Native -FilePath "npm" -Arguments @("run", "lint") -FailureMessage "npm run lint failed"
    Invoke-Native -FilePath "npm" -Arguments @("run", "typecheck") -FailureMessage "npm run typecheck failed"
    Invoke-Native -FilePath "npm" -Arguments @("run", "test") -FailureMessage "npm run test failed"
  }
}

function Invoke-Bridge {
  Ensure-DevTooling

  Invoke-InRepo {
    Invoke-Native `
      -FilePath "npm" `
      -Arguments @("run", "typecheck", "-w", "@arlopass/bridge") `
      -FailureMessage "Bridge typecheck failed"
    Write-Host "Bridge starting. Load extension from: $repoRoot\apps\extension" -ForegroundColor Cyan
    Invoke-Native `
      -FilePath "node" `
      -Arguments @("--loader", "./scripts/dev/ts-js-specifier-loader.mjs", "./apps/bridge/src/main.ts") `
      -FailureMessage "Bridge runtime failed to start"
  }
}

function Register-NativeHost {
  param(
    [string]$ExplicitExtensionId
  )

  Invoke-InRepo {
    $registerScript = Join-Path $repoRoot "scripts\dev\register-native-host.ps1"
    if (-not (Test-Path -LiteralPath $registerScript)) {
      throw "Native host registration script not found: $registerScript"
    }

    if ([string]::IsNullOrWhiteSpace($ExplicitExtensionId)) {
      & $registerScript
    }
    else {
      & $registerScript -ExtensionId $ExplicitExtensionId
    }
  }
}

switch ($Mode) {
  "setup" {
    Invoke-Setup
    break
  }

  "validate" {
    Invoke-Validate
    break
  }

  "watch" {
    $watchers = Start-DevWatchers
    Write-Host "Watchers are running. Press Ctrl+C in this window to stop them and close watcher terminals." -ForegroundColor Cyan
    try {
      Wait-Process -Id ($watchers | ForEach-Object { $_.Id })
    }
    finally {
      Stop-DevWatchers -Watchers $watchers
    }
    break
  }

  "bridge" {
    Invoke-Bridge
    break
  }

  "full" {
    if (-not $SkipInstall.IsPresent) {
      Invoke-Setup -PreferIncrementalInstall
    }

    if (-not $SkipNativeHostRegistration.IsPresent) {
      Register-NativeHost -ExplicitExtensionId $ExtensionId
    }

    $watchers = Start-DevWatchers
    Write-Host "Started full dev mode (watchers + bridge). Press Ctrl+C to stop all and close watcher terminals." -ForegroundColor Cyan

    try {
      Invoke-Bridge
    }
    finally {
      Stop-DevWatchers -Watchers $watchers
    }
    break
  }
}
