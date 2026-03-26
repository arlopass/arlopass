#!/usr/bin/env node

import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build, context } from "esbuild";

const isWatchMode = process.argv.includes("--watch");
const targetArg = process.argv.find((a) => a.startsWith("--target="));
const target = targetArg ? targetArg.split("=")[1] : "chromium";
if (!["chromium", "firefox"].includes(target)) {
  console.error(
    `Unknown target: ${target}. Use --target=chromium or --target=firefox`,
  );
  process.exit(1);
}
const isFirefox = target === "firefox";

const require = createRequire(import.meta.url);

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sourceRoot = path.join(packageRoot, "src");
const distRoot = path.join(packageRoot, "dist", target);
const legacyDistRoot = path.join(packageRoot, "dist");

const moduleEntryPoints = {
  background: path.join(sourceRoot, "background.ts"),
  popup: path.join(sourceRoot, "popup.tsx"),
  options: path.join(sourceRoot, "options.ts"),
  index: path.join(sourceRoot, "index.ts"),
};

const sharedBuildOptions = {
  bundle: true,
  target: [isFirefox ? "firefox109" : "chrome120"],
  platform: "browser",
  tsconfig: path.join(packageRoot, "tsconfig.json"),
  sourcemap: true,
  logLevel: "info",
  legalComments: "none",
  jsx: "automatic",
  loader: { ".tsx": "tsx", ".ts": "ts" },
  alias: {
    react: path.join(packageRoot, "node_modules", "react"),
    "react-dom": path.join(packageRoot, "node_modules", "react-dom"),
    "react/jsx-runtime": path.join(
      packageRoot,
      "node_modules",
      "react",
      "jsx-runtime",
    ),
    "react/jsx-dev-runtime": path.join(
      packageRoot,
      "node_modules",
      "react",
      "jsx-dev-runtime",
    ),
  },
};

async function prepareDistDirectory() {
  await rm(distRoot, { recursive: true, force: true });
  await mkdir(distRoot, { recursive: true });
}

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: process.env,
      shell: false,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} exited with code ${String(code)}.`,
        ),
      );
    });
  });
}

async function buildTypeDeclarations() {
  const tscBinaryPath = require.resolve("typescript/bin/tsc");
  await runCommand(
    process.execPath,
    [tscBinaryPath, "-p", "tsconfig.build.json"],
    packageRoot,
  );
}

function createModuleBundleConfig() {
  return {
    ...sharedBuildOptions,
    format: "esm",
    entryPoints: moduleEntryPoints,
    outdir: distRoot,
  };
}

function createContentScriptBundleConfig() {
  return {
    ...sharedBuildOptions,
    format: "iife",
    entryPoints: {
      "content-script": path.join(sourceRoot, "content-script.ts"),
      "inpage-provider": path.join(sourceRoot, "inpage-provider.ts"),
    },
    outdir: distRoot,
    define: {
      __INPAGE_SCRIPT_PATH__: JSON.stringify("inpage-provider.js"),
    },
  };
}

async function runOneShotBuild() {
  await buildTypeDeclarations();
  await Promise.all([
    build(createModuleBundleConfig()),
    build(createContentScriptBundleConfig()),
  ]);
  await processManifest();
  await copyStaticAssets();
  await copyProviderIcons();
  await syncLegacyDistRuntimeAssets();
}

async function processManifest() {
  const manifestPath = path.join(packageRoot, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));

  // Update dist/ paths to be relative (assets are now in the same directory)
  if (manifest.background?.service_worker) {
    manifest.background.service_worker =
      manifest.background.service_worker.replace("dist/", "");
  }
  if (manifest.content_scripts) {
    for (const cs of manifest.content_scripts) {
      cs.js = cs.js.map((j) => j.replace("dist/", ""));
    }
  }
  if (manifest.web_accessible_resources) {
    for (const war of manifest.web_accessible_resources) {
      war.resources = war.resources.map((r) => r.replace("dist/", ""));
    }
  }

  if (isFirefox) {
    // Add Firefox-specific settings
    manifest.browser_specific_settings = {
      gecko: {
        id: "byom-ai-wallet@byomai.com",
        strict_min_version: "109.0",
      },
    };
    // Remove Chrome-only fields
    delete manifest.minimum_chrome_version;
    delete manifest.key;
  }

  await writeFile(
    path.join(distRoot, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
}

async function copyStaticAssets() {
  // Copy HTML files, rewriting dist/ prefixes since in dist/chromium/
  // all assets are siblings (no dist/ subdirectory).
  for (const asset of ["popup.html", "options.html"]) {
    const content = await readFile(path.join(packageRoot, asset), "utf-8");
    const rewritten = content
      .replace(/src="dist\//g, 'src="')
      .replace(/href="dist\//g, 'href="');
    await writeFile(path.join(distRoot, asset), rewritten);
  }
  // Copy the hand-written CSS (shared reset + options page styles).
  // Source popup.css is referenced by options.html for its BEM styles.
  // In dist/ the esbuild-generated popup.css (Mantine) overwrites it,
  // so we also write it as legacy.css for the popup to load separately.
  await copyFile(
    path.join(packageRoot, "popup.css"),
    path.join(distRoot, "legacy.css"),
  );
}

async function copyProviderIcons() {
  const iconsDir = path.join(distRoot, "icons");
  await mkdir(iconsDir, { recursive: true });

  const svgPkgDir = path.dirname(
    require.resolve("@lobehub/icons-static-svg/package.json"),
  );
  const svgSrcDir = path.join(svgPkgDir, "icons");

  const slugs = [
    "anthropic",
    "openai",
    "ollama",
    "gemini-color",
    "microsoft-color",
    "githubcopilot",
    "opencode",
    "bedrock-color",
    "perplexity-color",
    "claude-color",
    "google-color",
  ];

  await Promise.all(
    slugs.map((slug) =>
      copyFile(
        path.join(svgSrcDir, `${slug}.svg`),
        path.join(iconsDir, `${slug}.svg`),
      ),
    ),
  );
}

async function syncLegacyDistRuntimeAssets() {
  if (isFirefox) {
    return;
  }

  const runtimeAssets = [
    "background.js",
    "background.js.map",
    "content-script.js",
    "content-script.js.map",
    "index.js",
    "index.js.map",
    "inpage-provider.js",
    "inpage-provider.js.map",
    "options.js",
    "options.js.map",
    "popup.js",
    "popup.js.map",
    "popup.css",
    "popup.css.map",
  ];

  for (const asset of runtimeAssets) {
    await copyFile(
      path.join(distRoot, asset),
      path.join(legacyDistRoot, asset),
    );
  }
}

async function runWatchBuild() {
  // Run static asset copies first (manifest, HTML, icons) so the
  // extension directory is complete before esbuild starts watching.
  await processManifest();
  await copyStaticAssets();
  await copyProviderIcons();

  const moduleContext = await context(createModuleBundleConfig());
  const contentContext = await context(createContentScriptBundleConfig());

  await Promise.all([moduleContext.watch(), contentContext.watch()]);

  // After the initial watch build completes, sync legacy dist.
  try {
    await syncLegacyDistRuntimeAssets();
  } catch {
    // Non-fatal — legacy dist sync may fail on first run before files exist.
  }

  console.log("Extension build watcher is running.");

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    await Promise.allSettled([
      moduleContext.dispose(),
      contentContext.dispose(),
    ]);
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });

  await new Promise(() => {});
}

async function main() {
  await prepareDistDirectory();
  if (isWatchMode) {
    await runWatchBuild();
    return;
  }

  await runOneShotBuild();
}

main().catch((error) => {
  console.error("Extension build failed.", error);
  process.exit(1);
});
