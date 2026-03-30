import { createHash } from "node:crypto";
import { createWriteStream, existsSync, unlinkSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { get as httpsGet } from "node:https";
import { join } from "node:path";
import { execSync, spawnSync } from "node:child_process";
import process from "node:process";

// Replaced by esbuild --define at bundle time; falls back to "0.0.0-dev" in dev.
declare const ARLOPASS_BRIDGE_VERSION: string;

const CURRENT_VERSION: string =
  typeof ARLOPASS_BRIDGE_VERSION === "string" ? ARLOPASS_BRIDGE_VERSION : "0.0.0-dev";

const REPO = "arlopass/arlopass";
const GITHUB_API = `https://api.github.com/repos/${REPO}/releases`;
const USER_AGENT = `arlopass-bridge/${CURRENT_VERSION}`;

export type UpdateInfo = Readonly<{
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
  checksumsUrl: string;
  releaseUrl: string;
}>;

export type UpdateResult = Readonly<{
  staged: boolean;
  stagedPath?: string;
  swapScript?: string;
  version?: string;
  error?: string;
}>;

// ---------------------------------------------------------------------------
// Version helpers
// ---------------------------------------------------------------------------

export function getCurrentVersion(): string {
  return CURRENT_VERSION;
}

function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// GitHub API
// ---------------------------------------------------------------------------

function httpGetJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    httpsGet(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/vnd.github+json" } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const location = res.headers["location"];
        if (location) {
          httpGetJson(location).then(resolve, reject);
          return;
        }
      }
      if (res.statusCode !== 200) {
        reject(new Error(`GitHub API returned ${String(res.statusCode)}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch (e) {
          reject(e);
        }
      });
      res.on("error", reject);
    }).on("error", reject);
  });
}

function httpDownload(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    httpsGet(url, { headers: { "User-Agent": USER_AGENT } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const location = res.headers["location"];
        if (location) {
          httpDownload(location, dest).then(resolve, reject);
          return;
        }
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Download returned ${String(res.statusCode)}`));
        return;
      }
      const stream = createWriteStream(dest);
      res.pipe(stream);
      stream.on("finish", () => { stream.close(); resolve(); });
      stream.on("error", reject);
      res.on("error", reject);
    }).on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Check for updates
// ---------------------------------------------------------------------------

export async function checkForUpdate(): Promise<UpdateInfo | undefined> {
  if (CURRENT_VERSION === "0.0.0-dev") {
    return undefined;
  }

  const releases = (await httpGetJson(`${GITHUB_API}?per_page=20`)) as readonly Record<string, unknown>[];
  for (const release of releases) {
    const tag = typeof release["tag_name"] === "string" ? release["tag_name"] : "";
    if (!tag.startsWith("bridge/v")) continue;
    if (release["draft"] === true) continue;

    const latestVersion = tag.replace("bridge/v", "");
    if (compareVersions(latestVersion, CURRENT_VERSION) <= 0) {
      return undefined; // Already up to date
    }

    const assets = Array.isArray(release["assets"]) ? release["assets"] as Record<string, unknown>[] : [];
    const binaryName = resolveBinaryAssetName();
    if (binaryName === undefined) return undefined;

    const binaryAsset = assets.find((a) => a["name"] === binaryName);
    const checksumsAsset = assets.find((a) => a["name"] === "SHA256SUMS.txt");
    if (!binaryAsset || !checksumsAsset) return undefined;

    return {
      currentVersion: CURRENT_VERSION,
      latestVersion,
      downloadUrl: String(binaryAsset["browser_download_url"]),
      checksumsUrl: String(checksumsAsset["browser_download_url"]),
      releaseUrl: typeof release["html_url"] === "string" ? release["html_url"] : "",
    };
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Download and stage update
// ---------------------------------------------------------------------------

function resolveBinaryAssetName(): string | undefined {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  switch (process.platform) {
    case "win32": return `arlopass-bridge-win-${arch}.exe`;
    case "darwin": return `arlopass-bridge-macos-${arch}`;
    case "linux": return `arlopass-bridge-linux-${arch}`;
    default: return undefined;
  }
}

function resolveUpdateDir(): string {
  if (process.platform === "win32") {
    const localAppData = process.env["LOCALAPPDATA"];
    if (localAppData) {
      return join(localAppData, "Arlopass", "bridge", "update");
    }
  }
  if (process.platform === "darwin") {
    const home = process.env["HOME"];
    if (home) {
      return join(home, "Library", "Application Support", "Arlopass", "update");
    }
  }
  const home = process.env["HOME"] ?? "/tmp";
  return join(home, ".arlopass", "update");
}

export async function downloadAndStageUpdate(info: UpdateInfo): Promise<UpdateResult> {
  const updateDir = resolveUpdateDir();
  mkdirSync(updateDir, { recursive: true });

  const binaryName = resolveBinaryAssetName();
  if (binaryName === undefined) {
    return { staged: false, error: "Unsupported platform" };
  }

  const stagedPath = join(updateDir, binaryName);
  const checksumsPath = join(updateDir, "SHA256SUMS.txt");

  // Download binary and checksums
  await httpDownload(info.downloadUrl, stagedPath);
  await httpDownload(info.checksumsUrl, checksumsPath);

  // Verify checksum
  const checksums = readFileSync(checksumsPath, "utf8");
  const line = checksums.split("\n").find((l) => l.includes(binaryName));
  if (!line) {
    unlinkSync(stagedPath);
    return { staged: false, error: "Binary not found in checksums file" };
  }

  const expectedHash = line.trim().split(/\s+/)[0]?.toLowerCase();
  const actualHash = createHash("sha256").update(readFileSync(stagedPath)).digest("hex");

  if (actualHash !== expectedHash) {
    unlinkSync(stagedPath);
    return { staged: false, error: `Checksum mismatch: expected ${expectedHash ?? "?"}, got ${actualHash}` };
  }

  // Write platform-specific swap script
  const installedBinary = process.execPath;
  const swapScript = writeSwapScript(updateDir, stagedPath, installedBinary);

  // Write update metadata
  writeFileSync(join(updateDir, "update.json"), JSON.stringify({
    version: info.latestVersion,
    stagedPath,
    swapScript,
    verifiedAt: new Date().toISOString(),
    checksum: actualHash,
  }, null, 2), "utf8");

  return { staged: true, stagedPath, swapScript, version: info.latestVersion };
}

// ---------------------------------------------------------------------------
// Swap scripts — replace running binary after exit
// ---------------------------------------------------------------------------

function writeSwapScript(updateDir: string, stagedPath: string, installedBinary: string): string {
  if (process.platform === "win32") {
    return writeWindowsSwapScript(updateDir, stagedPath, installedBinary);
  }
  return writeUnixSwapScript(updateDir, stagedPath, installedBinary);
}

function writeWindowsSwapScript(updateDir: string, stagedPath: string, installedBinary: string): string {
  const scriptPath = join(updateDir, "swap.ps1");
  const escaped = (s: string) => s.replace(/'/g, "''");
  const script = `
$ErrorActionPreference = 'Stop'
$bridgeExe = '${escaped(installedBinary)}'
$stagedExe = '${escaped(stagedPath)}'
$backupExe = '${escaped(installedBinary + ".bak")}'

# Wait for bridge process to exit
$maxWait = 30
for ($i = 0; $i -lt $maxWait; $i++) {
  $running = Get-Process -Name "arlopass-bridge*" -ErrorAction SilentlyContinue
  if (-not $running) { break }
  Start-Sleep -Seconds 1
}

# Swap binary
if (Test-Path $bridgeExe) {
  if (Test-Path $backupExe) { Remove-Item $backupExe -Force }
  Rename-Item $bridgeExe $backupExe -Force
}
Copy-Item $stagedExe $bridgeExe -Force

# Clean up
Remove-Item $stagedExe -Force -ErrorAction SilentlyContinue
Remove-Item $backupExe -Force -ErrorAction SilentlyContinue
`;
  writeFileSync(scriptPath, script, "utf8");
  return scriptPath;
}

function writeUnixSwapScript(updateDir: string, stagedPath: string, installedBinary: string): string {
  const scriptPath = join(updateDir, "swap.sh");
  const escaped = (s: string) => s.replace(/'/g, "'\\''");
  const script = `#!/bin/sh
set -e
BRIDGE='${escaped(installedBinary)}'
STAGED='${escaped(stagedPath)}'

# Wait for bridge to exit (up to 30s)
i=0
while [ $i -lt 30 ]; do
  if ! kill -0 $$ 2>/dev/null; then break; fi
  sleep 1
  i=$((i + 1))
done

# Swap binary
chmod +x "$STAGED"
mv "$STAGED" "$BRIDGE"
`;
  writeFileSync(scriptPath, script, { mode: 0o755, encoding: "utf8" });
  return scriptPath;
}

// ---------------------------------------------------------------------------
// Apply staged update
// ---------------------------------------------------------------------------

export function applyUpdate(swapScript: string): void {
  if (process.platform === "win32") {
    execSync(
      `powershell.exe -NoProfile -Command "Start-Process powershell.exe -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File','${swapScript.replace(/'/g, "''")}' -WindowStyle Hidden"`,
      { stdio: "ignore" },
    );
  } else {
    spawnSync("sh", ["-c", `nohup '${swapScript.replace(/'/g, "'\\''")}' >/dev/null 2>&1 &`], {
      stdio: "ignore",
    });
  }
}

// ---------------------------------------------------------------------------
// Check for pending staged update (from previous run)
// ---------------------------------------------------------------------------

export function checkForStagedUpdate(): UpdateResult | undefined {
  const updateDir = resolveUpdateDir();
  const metadataPath = join(updateDir, "update.json");
  if (!existsSync(metadataPath)) return undefined;

  try {
    const raw = JSON.parse(readFileSync(metadataPath, "utf8")) as Record<string, unknown>;
    const stagedPath = typeof raw["stagedPath"] === "string" ? raw["stagedPath"] : undefined;
    const swapScript = typeof raw["swapScript"] === "string" ? raw["swapScript"] : undefined;
    const version = typeof raw["version"] === "string" ? raw["version"] : undefined;

    if (stagedPath && existsSync(stagedPath) && swapScript) {
      return { staged: true, stagedPath, swapScript, version: version ?? "unknown" };
    }

    // Clean up stale metadata
    unlinkSync(metadataPath);
  } catch {
    // Ignore corrupt metadata
  }
  return undefined;
}

export function clearStagedUpdate(): void {
  const updateDir = resolveUpdateDir();
  const metadataPath = join(updateDir, "update.json");
  try {
    if (existsSync(metadataPath)) unlinkSync(metadataPath);
  } catch {
    // Ignore
  }
}
