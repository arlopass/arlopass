[CmdletBinding()]
param(
  [ValidateSet("setup", "validate", "watch", "bridge", "full")]
  [string]$Mode = "full",
  [switch]$SkipInstall,
  [string]$SharedSecret
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

function New-RandomHexSecret {
  param(
    [int]$ByteCount = 32
  )

  $bytes = New-Object byte[] $ByteCount
  $fillMethod = [System.Security.Cryptography.RandomNumberGenerator].GetMethod(
    "Fill",
    [Type[]]@([byte[]])
  )

  if ($null -ne $fillMethod) {
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  }
  else {
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
      $rng.GetBytes($bytes)
    }
    finally {
      $rng.Dispose()
    }
  }

  return -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

function Ensure-SharedSecret {
  param(
    [string]$ExplicitSecret
  )

  if (-not [string]::IsNullOrWhiteSpace($ExplicitSecret)) {
    $env:BYOM_BRIDGE_SHARED_SECRET = $ExplicitSecret
  }

  if ([string]::IsNullOrWhiteSpace($env:BYOM_BRIDGE_SHARED_SECRET)) {
    $env:BYOM_BRIDGE_SHARED_SECRET = New-RandomHexSecret -ByteCount 32
    Write-Host "Generated ephemeral BYOM_BRIDGE_SHARED_SECRET for this shell session." -ForegroundColor Yellow
  }

  if ($env:BYOM_BRIDGE_SHARED_SECRET.Length -ne 64 -or ($env:BYOM_BRIDGE_SHARED_SECRET -notmatch "^[0-9a-fA-F]{64}$")) {
    throw "BYOM_BRIDGE_SHARED_SECRET must be exactly 64 hexadecimal characters (32 bytes)."
  }
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
    -ArgumentList @("-NoProfile", "-NoExit", "-Command", $CommandText) `
    -PassThru

  Write-Host "Started $Name watcher (PID: $($process.Id))."
  return $process
}

function Start-DevWatchers {
  $escapedRepoRoot = $repoRoot.Path.Replace("'", "''")

  $bridgeWatchCommand = "Set-Location '$escapedRepoRoot'; npm run build -w @byom-ai/bridge -- --watch"
  $extensionWatchCommand = "Set-Location '$escapedRepoRoot'; npm run build -w @byom-ai/extension -- --watch"

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
        Stop-Process -Id $watcher.Id
        Write-Host "Stopped watcher (PID: $($watcher.Id))."
      }
    }
    catch {
      # Ignore cleanup races where process exits between check and stop.
    }
  }
}

function Invoke-Setup {
  Invoke-InRepo {
    npm ci
  }
}

function Invoke-Validate {
  Invoke-InRepo {
    npm run lint
    npm run typecheck
    npm run test
  }
}

function Invoke-Bridge {
  param(
    [string]$ExplicitSecret
  )

  Ensure-SharedSecret -ExplicitSecret $ExplicitSecret

  Invoke-InRepo {
    npm run typecheck -w @byom-ai/bridge
    Write-Host "Bridge starting. Load extension from: $repoRoot\apps\extension" -ForegroundColor Cyan
    node --loader ./scripts/dev/ts-js-specifier-loader.mjs ./apps/bridge/src/main.ts
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
    Write-Host "Watchers are running. Press Ctrl+C in this window to stop them." -ForegroundColor Cyan
    try {
      Wait-Process -Id ($watchers | ForEach-Object { $_.Id })
    }
    finally {
      Stop-DevWatchers -Watchers $watchers
    }
    break
  }

  "bridge" {
    Invoke-Bridge -ExplicitSecret $SharedSecret
    break
  }

  "full" {
    if (-not $SkipInstall.IsPresent) {
      Invoke-Setup
    }

    $watchers = Start-DevWatchers
    Write-Host "Started full dev mode (watchers + bridge). Press Ctrl+C to stop all." -ForegroundColor Cyan

    try {
      Invoke-Bridge -ExplicitSecret $SharedSecret
    }
    finally {
      Stop-DevWatchers -Watchers $watchers
    }
    break
  }
}
