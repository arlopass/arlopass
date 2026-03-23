[CmdletBinding()]
param(
  [ValidateSet("setup", "validate", "watch", "bridge", "full")]
  [string]$Mode = "full",
  [switch]$SkipInstall,
  [string]$SharedSecret,
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
    Invoke-Native -FilePath "npm" -Arguments @("ci") -FailureMessage "npm ci failed"
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
  param(
    [string]$ExplicitSecret
  )

  Ensure-SharedSecret -ExplicitSecret $ExplicitSecret
  Ensure-DevTooling

  Invoke-InRepo {
    Invoke-Native `
      -FilePath "npm" `
      -Arguments @("run", "typecheck", "-w", "@byom-ai/bridge") `
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

    if (-not $SkipNativeHostRegistration.IsPresent) {
      Register-NativeHost -ExplicitExtensionId $ExtensionId
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
