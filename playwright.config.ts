import { defineConfig } from "@playwright/test";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Load e2e/.env.e2e into process.env if the file exists. */
function loadEnvFile(filePath: string): void {
    if (!fs.existsSync(filePath)) return;
    const lines = fs.readFileSync(filePath, "utf-8").split("\n");
    for (const raw of lines) {
        const line = raw.trim();
        if (line.length === 0 || line.startsWith("#")) continue;
        const eqIndex = line.indexOf("=");
        if (eqIndex === -1) continue;
        const key = line.slice(0, eqIndex).trim();
        const value = line.slice(eqIndex + 1).trim();
        if (key.length > 0 && !(key in process.env)) {
            process.env[key] = value;
        }
    }
}

loadEnvFile(path.resolve(__dirname, "e2e/.env.e2e"));

const EXTENSION_DIST = path.resolve(__dirname, "apps/extension/dist/chromium");

export default defineConfig({
    testDir: "./e2e/tests",
    outputDir: "./e2e/test-results",

    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,

    reporter: [
        ["list"],
        ["html", { outputFolder: "./e2e/playwright-report", open: "never" }],
    ],

    use: {
        trace: "on-first-retry",
        screenshot: "only-on-failure",
        video: "retain-on-failure",
        actionTimeout: 15_000,
        navigationTimeout: 30_000,
    },

    projects: [
        {
            name: "extension",
            testMatch: /extension\/.*\.spec\.ts$/,
            use: {
                // Extension tests use custom fixtures that launch persistent context
            },
        },
        {
            name: "webapp",
            testMatch: /webapp\/.*\.spec\.ts$/,
            use: {
                baseURL: "http://localhost:4173",
            },
        },
        {
            name: "integration",
            testMatch: /integration\/(?!live-).*\.spec\.ts$/,
            use: {
                baseURL: "http://localhost:4173",
            },
        },
        // ── Live integration: setup → providers dependency chain ──
        {
            name: "live-setup",
            testMatch: /integration\/live-setup\.spec\.ts$/,
            use: {
                baseURL: "http://localhost:4173",
            },
        },
        {
            name: "live-providers",
            testMatch: /integration\/live-integration\.spec\.ts$/,
            dependencies: ["live-setup"],
            use: {
                baseURL: "http://localhost:4173",
            },
        },
    ],

    webServer: {
        command: "npm run build:examples && npm run preview -w @byom-ai/examples-web",
        url: "http://localhost:4173",
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
    },

    metadata: {
        extensionDist: EXTENSION_DIST,
    },
});
