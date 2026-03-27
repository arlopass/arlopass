[CmdletBinding()]
param(
  [string]$ExtensionId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$extensionManifestPath = Join-Path $repoRoot "apps\extension\manifest.json"
$hostLauncherPath = Join-Path $repoRoot "scripts\dev\native-host\arlopass-bridge-native-host.cmd"

if (-not (Test-Path -LiteralPath $extensionManifestPath)) {
  throw "Extension manifest not found at: $extensionManifestPath"
}

if (-not (Test-Path -LiteralPath $hostLauncherPath)) {
  throw "Native host launcher not found at: $hostLauncherPath"
}

function Convert-KeyToExtensionId {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ManifestKey
  )

  $keyBytes = [Convert]::FromBase64String($ManifestKey)
  $hashDataMethod = [System.Security.Cryptography.SHA256].GetMethod(
    "HashData",
    [Type[]]@([byte[]])
  )

  if ($null -ne $hashDataMethod) {
    $hashBytes = [System.Security.Cryptography.SHA256]::HashData($keyBytes)
  }
  else {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
      $hashBytes = $sha.ComputeHash($keyBytes)
    }
    finally {
      $sha.Dispose()
    }
  }
  $chars = New-Object System.Collections.Generic.List[char]

  for ($index = 0; $index -lt 16; $index += 1) {
    $byte = $hashBytes[$index]
    $chars.Add([char](97 + ($byte -shr 4)))
    $chars.Add([char](97 + ($byte -band 0x0F)))
  }

  return -join $chars
}

$manifest = Get-Content -LiteralPath $extensionManifestPath -Raw | ConvertFrom-Json
$resolvedExtensionId = $ExtensionId

if ([string]::IsNullOrWhiteSpace($resolvedExtensionId)) {
  if (-not [string]::IsNullOrWhiteSpace($manifest.key)) {
    $resolvedExtensionId = Convert-KeyToExtensionId -ManifestKey $manifest.key
  } else {
    throw "Extension ID was not provided and manifest.json has no 'key'. Pass -ExtensionId <id>."
  }
}

if ($resolvedExtensionId -notmatch "^[a-p]{32}$") {
  throw "Invalid extension ID '$resolvedExtensionId'. Expected 32 lowercase characters in range a-p."
}

$hostManifestDirectory = Join-Path $env:LOCALAPPDATA "Arlopass\bridge"
$null = New-Item -Path $hostManifestDirectory -ItemType Directory -Force

$hostManifestPath = Join-Path $hostManifestDirectory "com.arlopass.bridge.json"
$nativeHostManifest = [ordered]@{
  name = "com.arlopass.bridge"
  description = "Arlopass Bridge - Secure native messaging host"
  path = $hostLauncherPath
  type = "stdio"
  allowed_origins = @("chrome-extension://$resolvedExtensionId/")
}

$manifestJson = $nativeHostManifest | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText(
  $hostManifestPath,
  $manifestJson,
  [System.Text.UTF8Encoding]::new($false)
)

$chromeRegistryKey = "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.arlopass.bridge"
$edgeRegistryKey = "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.arlopass.bridge"

& reg add $chromeRegistryKey /ve /t REG_SZ /d $hostManifestPath /f | Out-Null
& reg add $edgeRegistryKey /ve /t REG_SZ /d $hostManifestPath /f | Out-Null

Write-Host "Registered native host manifest at: $hostManifestPath" -ForegroundColor Green
Write-Host "Allowed extension origin: chrome-extension://$resolvedExtensionId/" -ForegroundColor Green
Write-Host "Launcher path: $hostLauncherPath" -ForegroundColor Green
