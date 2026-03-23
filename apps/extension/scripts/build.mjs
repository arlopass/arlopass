#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build, context } from "esbuild";

const isWatchMode = process.argv.includes("--watch");
const require = createRequire(import.meta.url);

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sourceRoot = path.join(packageRoot, "src");
const distRoot = path.join(packageRoot, "dist");

const moduleEntryPoints = {
  background: path.join(sourceRoot, "background.ts"),
  popup: path.join(sourceRoot, "popup.ts"),
  options: path.join(sourceRoot, "options.ts"),
  index: path.join(sourceRoot, "index.ts"),
};

const sharedBuildOptions = {
  bundle: true,
  target: ["chrome120"],
  platform: "browser",
  tsconfig: path.join(packageRoot, "tsconfig.json"),
  sourcemap: true,
  logLevel: "info",
  legalComments: "none",
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
  };
}

async function runOneShotBuild() {
  await buildTypeDeclarations();
  await Promise.all([
    build(createModuleBundleConfig()),
    build(createContentScriptBundleConfig()),
  ]);
}

async function runWatchBuild() {
  const moduleContext = await context(createModuleBundleConfig());
  const contentContext = await context(createContentScriptBundleConfig());

  await Promise.all([moduleContext.watch(), contentContext.watch()]);
  console.log("Extension build watcher is running.");

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    await Promise.allSettled([moduleContext.dispose(), contentContext.dispose()]);
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

