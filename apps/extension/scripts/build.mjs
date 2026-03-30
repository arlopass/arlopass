#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  copyFile,
  mkdir,
  readFile,
  rm,
  writeFile,
  access,
} from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build, context } from "esbuild";

// ---- Load .env from workspace root (env vars take precedence) ----
const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

async function loadDotEnv() {
  const dotenvPath = path.join(workspaceRoot, ".env");
  try {
    const content = await readFile(dotenvPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      // Only set if not already in environment (env vars take precedence)
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env file is optional
  }
}
await loadDotEnv();

const FIREFOX_EXTENSION_ID =
  process.env.ARLOPASS_FIREFOX_EXTENSION_ID || "arlopass-wallet@arlopass.com";

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
  options: path.join(sourceRoot, "options-react.tsx"),
  "options-onboarding": path.join(sourceRoot, "options-onboarding.tsx"),
  index: path.join(sourceRoot, "index.ts"),
};

const sharedBuildOptions = {
  bundle: true,
  target: [isFirefox ? "firefox109" : "chrome120"],
  platform: "browser",
  tsconfig: path.join(packageRoot, "tsconfig.json"),
  // Production builds should ship lean artifacts. Keep sourcemaps only for watch mode.
  sourcemap: isWatchMode,
  minify: !isWatchMode,
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

async function buildTailwindCSS() {
  const cliPkgDir = path.dirname(
    require.resolve("@tailwindcss/cli/package.json"),
  );
  const tailwindCli = path.join(cliPkgDir, "dist", "index.mjs");
  const inputCss = path.join(sourceRoot, "styles", "app.css");
  const outputCss = path.join(distRoot, "app.css");
  await runCommand(
    process.execPath,
    [tailwindCli, "-i", inputCss, "-o", outputCss, "--minify"],
    packageRoot,
  );
}

async function runOneShotBuild() {
  await buildTypeDeclarations();
  await Promise.all([
    build(createModuleBundleConfig()),
    build(createContentScriptBundleConfig()),
    buildTailwindCSS(),
  ]);
  await processManifest();
  await copyStaticAssets();
  await copyExtensionIcons();
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

  // The `key` field pins the extension ID during local unpacked development.
  // Strip it only for production builds — store uploads get their own key.
  if (!isWatchMode) {
    delete manifest.key;
  }

  if (isFirefox) {
    // Firefox uses background.scripts instead of background.service_worker
    if (manifest.background?.service_worker) {
      const bgScript = manifest.background.service_worker;
      manifest.background = {
        scripts: [bgScript],
        type: manifest.background.type,
      };
    }
    // Add Firefox-specific settings
    manifest.browser_specific_settings = {
      gecko: {
        id: FIREFOX_EXTENSION_ID,
        strict_min_version: "109.0",
        data_collection_permissions: {
          required: ["none"],
        },
      },
    };
    // Remove Chrome-only fields
    delete manifest.minimum_chrome_version;
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

  // Copy _locales directory for i18n (required by default_locale in manifest)
  const localesSrc = path.join(packageRoot, "_locales");
  const localesDst = path.join(distRoot, "_locales");
  try {
    await access(localesSrc);
    const { readdir } = await import("node:fs/promises");
    const locales = await readdir(localesSrc, { withFileTypes: true });
    for (const entry of locales) {
      if (entry.isDirectory()) {
        const langDir = path.join(localesDst, entry.name);
        await mkdir(langDir, { recursive: true });
        await copyFile(
          path.join(localesSrc, entry.name, "messages.json"),
          path.join(langDir, "messages.json"),
        );
      }
    }
  } catch {
    // _locales directory is optional
  }
}

async function copyExtensionIcons() {
  const assetsDir = path.join(packageRoot, "assets");
  const iconsDir = path.join(distRoot, "icons");
  await mkdir(iconsDir, { recursive: true });

  const sizes = ["16", "24", "48", "128"];
  await Promise.all(
    sizes.map((size) =>
      copyFile(
        path.join(assetsDir, `icon-${size}.png`),
        path.join(iconsDir, `icon-${size}.png`),
      ),
    ),
  );
}

async function copyProviderIcons() {
  const iconsDir = path.join(distRoot, "icons");
  await mkdir(iconsDir, { recursive: true });

  const svgPkgDir = path.dirname(
    require.resolve("@lobehub/icons-static-svg/package.json"),
  );
  const svgSrcDir = path.join(svgPkgDir, "icons");

  // Copy the entire @lobehub/icons-static-svg icons directory
  const { readdir } = await import("node:fs/promises");
  const svgFiles = (await readdir(svgSrcDir)).filter((f) => f.endsWith(".svg"));
  await Promise.all(
    svgFiles.map((file) =>
      copyFile(path.join(svgSrcDir, file), path.join(iconsDir, file)),
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
    "app.css",
  ];

  for (const asset of runtimeAssets) {
    const source = path.join(distRoot, asset);
    try {
      await access(source);
    } catch {
      continue;
    }
    await copyFile(source, path.join(legacyDistRoot, asset));
  }
}

/** esbuild plugin that re-copies static assets after every rebuild. */
function staticAssetCopyPlugin() {
  return {
    name: "static-asset-copy",
    setup(b) {
      b.onEnd(async () => {
        try {
          await Promise.all([
            processManifest(),
            copyStaticAssets(),
            syncLegacyDistRuntimeAssets(),
          ]);
        } catch {
          // Non-fatal — files may not exist on first run.
        }
      });
    },
  };
}

async function runWatchBuild() {
  // Run static asset copies first (manifest, HTML, icons) so the
  // extension directory is complete before esbuild starts watching.
  await processManifest();
  await copyStaticAssets();
  await copyExtensionIcons();
  await copyProviderIcons();
  await buildTailwindCSS();

  const copyPlugin = staticAssetCopyPlugin();
  const moduleContext = await context({
    ...createModuleBundleConfig(),
    plugins: [copyPlugin],
  });
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
