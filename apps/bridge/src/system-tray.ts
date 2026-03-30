import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { execSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import process from "node:process";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function trayScriptDir(): string {
  if (process.platform === "win32") {
    const localAppData = process.env["LOCALAPPDATA"];
    if (localAppData) {
      return join(localAppData, "Arlopass", "bridge");
    }
  }
  if (process.platform === "darwin") {
    const home = process.env["HOME"];
    if (home) {
      return join(home, "Library", "Application Support", "Arlopass");
    }
  }
  return join(tmpdir(), "arlopass-bridge");
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

// ---------------------------------------------------------------------------
// Windows — PowerShell + WinForms NotifyIcon
// ---------------------------------------------------------------------------

function buildWindowsTrayScript(bridgePid: number, bridgeExePath: string, icoPath: string | undefined, updateDir: string): string {
  const escapedExe = bridgeExePath.replace(/'/g, "''");
  const escapedIco = icoPath?.replace(/'/g, "''");
  const escapedUpdateDir = updateDir.replace(/'/g, "''");

  const iconBlock = escapedIco !== undefined
    ? `
$icoPath = '${escapedIco}'
if (Test-Path $icoPath) {
  $notifyIcon.Icon = New-Object System.Drawing.Icon($icoPath)
} else {
  try { $notifyIcon.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon('${escapedExe}') } catch {
    $notifyIcon.Icon = [System.Drawing.SystemIcons]::Application
  }
}`
    : `
try {
  $notifyIcon.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon('${escapedExe}')
} catch {
  $notifyIcon.Icon = [System.Drawing.SystemIcons]::Application
}`;

  return `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$bridgePid = ${String(bridgePid)}
$updateDir = '${escapedUpdateDir}'

$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
${iconBlock}
$notifyIcon.Text = 'Arlopass Bridge'
$notifyIcon.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip

$updateItem = New-Object System.Windows.Forms.ToolStripMenuItem('Check for Updates...')
$updateItem.Enabled = $false
$updateItem.Visible = $false
$updateSep = New-Object System.Windows.Forms.ToolStripSeparator
$updateSep.Visible = $false
$updateItem.Add_Click({
  $metaPath = Join-Path $updateDir 'update.json'
  if (Test-Path $metaPath) {
    $meta = Get-Content $metaPath -Raw | ConvertFrom-Json
    $swapScript = $meta.swapScript
    if ($swapScript -and (Test-Path $swapScript)) {
      try { Stop-Process -Id $bridgePid -Force -ErrorAction SilentlyContinue } catch {}
      Start-Process powershell.exe -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',$swapScript -WindowStyle Hidden
      $notifyIcon.Visible = $false
      [System.Windows.Forms.Application]::Exit()
    }
  }
})

$restartItem = New-Object System.Windows.Forms.ToolStripMenuItem('Restart Bridge')
$restartItem.Add_Click({
  try { Stop-Process -Id $bridgePid -Force -ErrorAction SilentlyContinue } catch {}
  $notifyIcon.Visible = $false
  [System.Windows.Forms.Application]::Exit()
})

$separator = New-Object System.Windows.Forms.ToolStripSeparator

$quitItem = New-Object System.Windows.Forms.ToolStripMenuItem('Quit Bridge')
$quitItem.Add_Click({
  try { Stop-Process -Id $bridgePid -Force -ErrorAction SilentlyContinue } catch {}
  $notifyIcon.Visible = $false
  [System.Windows.Forms.Application]::Exit()
})

[void]$menu.Items.Add($updateItem)
[void]$menu.Items.Add($updateSep)
[void]$menu.Items.Add($restartItem)
[void]$menu.Items.Add($separator)
[void]$menu.Items.Add($quitItem)
$notifyIcon.ContextMenuStrip = $menu

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 2000
$timer.Add_Tick({
  $proc = $null
  try { $proc = Get-Process -Id $bridgePid -ErrorAction SilentlyContinue } catch {}
  if (-not $proc) {
    $notifyIcon.Visible = $false
    [System.Windows.Forms.Application]::Exit()
  }

  # Check for staged update
  $metaPath = Join-Path $updateDir 'update.json'
  if ((Test-Path $metaPath) -and (-not $updateItem.Visible)) {
    try {
      $meta = Get-Content $metaPath -Raw | ConvertFrom-Json
      $v = $meta.version
      if ($v) {
        $updateItem.Text = "Update to v$v && Restart"
        $updateItem.Enabled = $true
        $updateItem.Visible = $true
        $updateSep.Visible = $true
        $notifyIcon.ShowBalloonTip(5000, 'Arlopass Bridge', "Update v$v available", [System.Windows.Forms.ToolTipIcon]::Info)
      }
    } catch {}
  }
})
$timer.Start()

[System.Windows.Forms.Application]::Run()
`;
}

function resolveIcoPath(): string | undefined {
  // In production (SEA binary), the icon is embedded in the exe — no .ico needed.
  // In dev, look for icon.ico relative to common project structures.
  const candidates = [
    join(process.cwd(), "apps", "bridge", "assets", "icon.ico"),
    join(__dirname, "..", "assets", "icon.ico"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
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

function launchWindowsTray(): void {
  const dir = trayScriptDir();
  ensureDir(dir);
  const icoPath = resolveIcoPath();
  const updateDir = resolveUpdateDir();
  const scriptPath = join(dir, "tray.ps1");
  writeFileSync(scriptPath, buildWindowsTrayScript(process.pid, process.execPath, icoPath, updateDir), "utf8");

  const logPath = join(dir, "tray-launch.log");

  // Start-Process creates a fully independent process that survives Node exit.
  // Wrap in try/catch and log to diagnose failures when launched by Chrome.
  try {
    execSync(
      `powershell.exe -NoProfile -Command "Start-Process powershell.exe -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File','${scriptPath.replace(/'/g, "''")}' -WindowStyle Hidden"`,
      { stdio: "ignore", timeout: 10_000 },
    );
    writeFileSync(logPath, `[${new Date().toISOString()}] tray launched OK pid=${String(process.pid)} exe=${process.execPath}\n`, "utf8");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    writeFileSync(logPath, `[${new Date().toISOString()}] tray launch FAILED: ${msg}\n`, "utf8");
  }
}

// ---------------------------------------------------------------------------
// macOS — Swift menu bar item (compiled once, cached)
// ---------------------------------------------------------------------------

const MACOS_TRAY_SWIFT = `
import Cocoa

class TrayDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem!
    var timer: Timer!
    let bridgePid: pid_t

    init(pid: pid_t) {
        self.bridgePid = pid
        super.init()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            button.title = "A"
            button.font = NSFont.systemFont(ofSize: 13, weight: .semibold)
        }

        let menu = NSMenu()
        let restartItem = NSMenuItem(title: "Restart Bridge", action: #selector(restartBridge), keyEquivalent: "")
        restartItem.target = self
        menu.addItem(restartItem)
        menu.addItem(.separator())
        let quitItem = NSMenuItem(title: "Quit Bridge", action: #selector(quitBridge), keyEquivalent: "")
        quitItem.target = self
        menu.addItem(quitItem)
        statusItem.menu = menu

        timer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            if kill(self.bridgePid, 0) != 0 { NSApp.terminate(nil) }
        }
    }

    @objc func restartBridge() {
        kill(bridgePid, SIGTERM)
        NSApp.terminate(nil)
    }

    @objc func quitBridge() {
        kill(bridgePid, SIGTERM)
        NSApp.terminate(nil)
    }
}

guard CommandLine.arguments.count > 1, let pid = Int32(CommandLine.arguments[1]) else {
    fputs("Usage: tray-helper <bridge-pid>\\n", stderr)
    exit(1)
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = TrayDelegate(pid: pid)
app.delegate = delegate
app.run()
`;

function resolveMacOSHelperDir(): string {
  const home = process.env["HOME"] ?? "/tmp";
  return join(home, "Library", "Application Support", "Arlopass");
}

function ensureMacOSHelper(helperDir: string): string | undefined {
  const helperBin = join(helperDir, "tray-helper");
  if (existsSync(helperBin)) {
    return helperBin;
  }

  // Compile the Swift helper (requires Xcode CLI tools)
  const swiftPath = join(helperDir, "tray-helper.swift");
  try {
    mkdirSync(helperDir, { recursive: true });
    writeFileSync(swiftPath, MACOS_TRAY_SWIFT, "utf8");
  } catch {
    return undefined;
  }

  const result = spawnSync("swiftc", [
    "-O", "-o", helperBin,
    "-framework", "Cocoa",
    swiftPath,
  ], { stdio: "ignore", timeout: 60_000 });

  if (result.status !== 0) {
    return undefined;
  }

  return helperBin;
}

function launchMacOSTray(): void {
  const helperDir = resolveMacOSHelperDir();
  const helperBin = ensureMacOSHelper(helperDir);
  if (helperBin === undefined) {
    return;
  }

  // nohup + & ensures the helper survives Node exit.
  const escaped = helperBin.replace(/'/g, "'\\''");
  spawnSync("sh", ["-c", `nohup '${escaped}' ${String(process.pid)} >/dev/null 2>&1 &`], {
    stdio: "ignore",
  });
}

// ---------------------------------------------------------------------------
// Linux — Python 3 + AppIndicator3 (available on most GTK desktops)
// ---------------------------------------------------------------------------

const LINUX_TRAY_PYTHON = `
#!/usr/bin/env python3
import sys, os, signal

try:
    import gi
    gi.require_version('Gtk', '3.0')
    try:
        gi.require_version('AyatanaAppIndicator3', '0.1')
        from gi.repository import AyatanaAppIndicator3 as AppIndicator
    except (ValueError, ImportError):
        gi.require_version('AppIndicator3', '0.1')
        from gi.repository import AppIndicator3 as AppIndicator
    from gi.repository import Gtk, GLib
except (ImportError, ValueError):
    sys.exit(0)

bridge_pid = int(sys.argv[1])

def check_bridge(*_args):
    try:
        os.kill(bridge_pid, 0)
    except ProcessLookupError:
        Gtk.main_quit()
    return True

def restart_bridge(_item):
    try:
        os.kill(bridge_pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    Gtk.main_quit()

def quit_bridge(_item):
    try:
        os.kill(bridge_pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    Gtk.main_quit()

indicator = AppIndicator.Indicator.new(
    'arlopass-bridge',
    'security-medium',
    AppIndicator.IndicatorCategory.APPLICATION_STATUS,
)
indicator.set_status(AppIndicator.IndicatorStatus.ACTIVE)
indicator.set_title('Arlopass Bridge')

menu = Gtk.Menu()
restart_item = Gtk.MenuItem(label='Restart Bridge')
restart_item.connect('activate', restart_bridge)
menu.append(restart_item)
menu.append(Gtk.SeparatorMenuItem())
quit_item = Gtk.MenuItem(label='Quit Bridge')
quit_item.connect('activate', quit_bridge)
menu.append(quit_item)
menu.show_all()
indicator.set_menu(menu)

GLib.timeout_add_seconds(2, check_bridge)
Gtk.main()
`;

function launchLinuxTray(): void {
  const dir = trayScriptDir();
  ensureDir(dir);
  const scriptPath = join(dir, "tray.py");
  writeFileSync(scriptPath, LINUX_TRAY_PYTHON, { mode: 0o755, encoding: "utf8" });

  // nohup + & ensures the helper survives Node exit.
  spawnSync("sh", ["-c", `nohup python3 '${scriptPath.replace(/'/g, "'\\''")}' ${String(process.pid)} >/dev/null 2>&1 &`], {
    stdio: "ignore",
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Launches a platform-appropriate system tray icon for the Arlopass Bridge.
 *
 * - **Windows** — WinForms NotifyIcon via PowerShell (uses embedded exe icon)
 * - **macOS** — NSStatusItem via a compiled Swift helper (menu bar "A" icon)
 * - **Linux** — AppIndicator3 via Python 3 (system theme icon)
 *
 * Each tray process is fully detached and monitors the bridge PID —
 * auto-exiting when the bridge is no longer running.  Silently no-ops
 * when the platform or required tooling is unavailable.
 */
export function launchSystemTray(): void {
  // Skip tray in development — the terminal is right there.
  if (process.env["NODE_ENV"] === "development" || process.env["ARLOPASS_BRIDGE_NO_TRAY"] === "1") {
    return;
  }

  try {
    switch (process.platform) {
      case "win32":
        launchWindowsTray();
        break;
      case "darwin":
        launchMacOSTray();
        break;
      case "linux":
        launchLinuxTray();
        break;
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `[arlopass-bridge] warning: failed to launch system tray icon: ${msg}\n`,
    );
  }
}
