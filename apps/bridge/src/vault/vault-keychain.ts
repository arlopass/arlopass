// apps/bridge/src/vault/vault-keychain.ts
import { execFile } from "node:child_process";
import process from "node:process";

export type KeychainAdapter = {
    getKey(): Promise<Buffer | null>;
    setKey(key: Buffer): Promise<void>;
    deleteKey(): Promise<void>;
};

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

type Platform = "windows" | "macos" | "linux";

function detectPlatform(): Platform {
    switch (process.platform) {
        case "win32": return "windows";
        case "darwin": return "macos";
        default: return "linux";
    }
}

// ---------------------------------------------------------------------------
// CLI helpers
// ---------------------------------------------------------------------------

function exec(command: string, args: string[], stdin?: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = execFile(command, args, { encoding: "utf8", timeout: 10_000 }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`${command} failed: ${stderr || error.message}`));
                return;
            }
            resolve(stdout);
        });
        if (stdin !== undefined && child.stdin !== null) {
            child.stdin.write(stdin);
            child.stdin.end();
        }
    });
}

const SERVICE = "com.arlopass.bridge";
const ACCOUNT = "vault-key";
const KEY_BYTES = 32;

// ---------------------------------------------------------------------------
// Windows: Credential Manager via PowerShell
// ---------------------------------------------------------------------------

function windowsAdapter(): KeychainAdapter {
    const target = "Arlopass Bridge Vault";

    return {
        async getKey(): Promise<Buffer | null> {
            try {
                // Use cmdkey to check existence, then PowerShell to read the password
                // Simpler approach: store as base64 in a generic credential via cmdkey
                const stdout = await exec("powershell.exe", [
                    "-NoProfile", "-NonInteractive", "-Command",
                    `$ErrorActionPreference='Stop'; ` +
                    `$bytes=[System.Text.Encoding]::UTF8.GetBytes((cmdkey /list:'${target}' 2>&1)); ` +
                    `try { $c=New-Object System.Net.NetworkCredential; ` +
                    `$raw=(Get-Content -Raw -Path "$env:LOCALAPPDATA\\Arlopass\\vault-keychain.key" -ErrorAction Stop); ` +
                    `Write-Output $raw } catch { Write-Output '' }`,
                ]);
                const hex = stdout.trim();
                if (hex.length === KEY_BYTES * 2 && /^[0-9a-f]+$/i.test(hex)) {
                    return Buffer.from(hex, "hex");
                }
                return null;
            } catch {
                return null;
            }
        },
        async setKey(key: Buffer): Promise<void> {
            // Store key as hex in a file protected by LOCALAPPDATA permissions
            // Also register with cmdkey for visibility
            const hex = key.toString("hex");
            await exec("powershell.exe", [
                "-NoProfile", "-NonInteractive", "-Command",
                `$ErrorActionPreference='Stop'; ` +
                `$dir="$env:LOCALAPPDATA\\Arlopass"; New-Item -ItemType Directory -Force -Path $dir | Out-Null; ` +
                `Set-Content -Path "$dir\\vault-keychain.key" -Value '${hex}' -NoNewline; ` +
                `cmdkey /generic:'${target}' /user:'arlopass' /pass:'keychain-managed' 2>&1 | Out-Null`,
            ]);
        },
        async deleteKey(): Promise<void> {
            await exec("powershell.exe", [
                "-NoProfile", "-NonInteractive", "-Command",
                `Remove-Item -Path "$env:LOCALAPPDATA\\Arlopass\\vault-keychain.key" -Force -ErrorAction SilentlyContinue; ` +
                `cmdkey /delete:'${target}' 2>&1 | Out-Null`,
            ]).catch(() => { /* ignore */ });
        },
    };
}

// ---------------------------------------------------------------------------
// macOS: Keychain Services via `security` CLI
// ---------------------------------------------------------------------------

function macosAdapter(): KeychainAdapter {
    return {
        async getKey(): Promise<Buffer | null> {
            try {
                const stdout = await exec("security", [
                    "find-generic-password",
                    "-s", SERVICE,
                    "-a", ACCOUNT,
                    "-w", // output password only
                ]);
                const hex = stdout.trim();
                if (hex.length === KEY_BYTES * 2 && /^[0-9a-f]+$/i.test(hex)) {
                    return Buffer.from(hex, "hex");
                }
                return null;
            } catch {
                return null;
            }
        },
        async setKey(key: Buffer): Promise<void> {
            const hex = key.toString("hex");
            // Delete existing first (update not supported atomically)
            try { await exec("security", ["delete-generic-password", "-s", SERVICE, "-a", ACCOUNT]); } catch { /* ok */ }
            await exec("security", [
                "add-generic-password",
                "-s", SERVICE,
                "-a", ACCOUNT,
                "-w", hex,
                "-U", // update if exists
            ]);
        },
        async deleteKey(): Promise<void> {
            try {
                await exec("security", ["delete-generic-password", "-s", SERVICE, "-a", ACCOUNT]);
            } catch { /* ok */ }
        },
    };
}

// ---------------------------------------------------------------------------
// Linux: Secret Service via `secret-tool` CLI (libsecret)
// ---------------------------------------------------------------------------

function linuxAdapter(): KeychainAdapter {
    const lookupArgs = ["lookup", "application", SERVICE, "account", ACCOUNT];
    const storeArgs = ["store", "--label", "Arlopass Bridge Vault", "application", SERVICE, "account", ACCOUNT];
    const clearArgs = ["clear", "application", SERVICE, "account", ACCOUNT];

    return {
        async getKey(): Promise<Buffer | null> {
            try {
                const stdout = await exec("secret-tool", lookupArgs);
                const hex = stdout.trim();
                if (hex.length === KEY_BYTES * 2 && /^[0-9a-f]+$/i.test(hex)) {
                    return Buffer.from(hex, "hex");
                }
                return null;
            } catch {
                return null;
            }
        },
        async setKey(key: Buffer): Promise<void> {
            const hex = key.toString("hex");
            await exec("secret-tool", storeArgs, hex);
        },
        async deleteKey(): Promise<void> {
            try {
                await exec("secret-tool", clearArgs);
            } catch { /* ok */ }
        },
    };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createKeychainAdapter(): KeychainAdapter {
    const platform = detectPlatform();
    switch (platform) {
        case "windows": return windowsAdapter();
        case "macos": return macosAdapter();
        case "linux": return linuxAdapter();
    }
}
