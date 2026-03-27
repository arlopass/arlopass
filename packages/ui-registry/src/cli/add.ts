import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Registry, Config } from "./types.js";
import { resolveBlocks } from "./resolve.js";

const DEFAULT_CONFIG: Config = {
  outDir: "src/components/arlopass",
  overwrite: false,
};

function loadRegistry(): Registry {
  const registryPath = join(dirname(fileURLToPath(import.meta.url)), "../../registry.json");
  return JSON.parse(readFileSync(registryPath, "utf-8"));
}

function loadConfig(): Config {
  const configPath = join(process.cwd(), "arlopass-ui.json");
  if (existsSync(configPath)) {
    const userConfig = JSON.parse(readFileSync(configPath, "utf-8")) as Partial<Config>;
    return {
      outDir: userConfig.outDir ?? DEFAULT_CONFIG.outDir,
      overwrite: userConfig.overwrite ?? DEFAULT_CONFIG.overwrite,
    };
  }
  return { ...DEFAULT_CONFIG };
}

function parseFlags(args: string[]): { ids: string[]; outDir: string | undefined; force: boolean; dryRun: boolean } {
  const ids: string[] = [];
  let outDir: string | undefined;
  let force = false;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--force" || arg === "-f") {
      force = true;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--out" || arg === "-o") {
      outDir = args[++i];
    } else if (arg !== undefined && !arg.startsWith("-")) {
      ids.push(arg);
    }
  }

  return { ids, outDir, force, dryRun };
}

export function addCommand(args: string[]): void {
  const { ids, outDir: flagOutDir, force, dryRun } = parseFlags(args);

  if (ids.length === 0) {
    console.error("Usage: arlopass-ui add <block-id> [...block-ids] [--out <dir>] [--force] [--dry-run]");
    process.exit(1);
  }

  const registry = loadRegistry();
  const config = loadConfig();
  const targetDir = flagOutDir ?? config.outDir;
  const overwrite = force || config.overwrite;

  const blocks = resolveBlocks(ids, registry.blocks);

  const blocksDir = join(dirname(fileURLToPath(import.meta.url)), "../../src/blocks");
  const written: string[] = [];
  const skipped: string[] = [];

  for (const block of blocks) {
    for (const file of block.files) {
      const sourcePath = join(blocksDir, file);
      const targetPath = join(process.cwd(), targetDir, file);

      if (!existsSync(sourcePath)) {
        console.error(`  ✗ Source not found: ${file}`);
        continue;
      }

      if (existsSync(targetPath) && !overwrite) {
        console.log(`  ⊘ Skipped ${file} (exists, use --force to overwrite)`);
        skipped.push(file);
        continue;
      }

      if (dryRun) {
        console.log(`  → Would write ${targetPath}`);
        written.push(file);
        continue;
      }

      mkdirSync(dirname(targetPath), { recursive: true });
      writeFileSync(targetPath, readFileSync(sourcePath, "utf-8"));
      console.log(`  ✓ ${file} → ${targetPath}`);
      written.push(file);
    }
  }

  const peerDeps = [...new Set(blocks.flatMap((b) => b.peerDependencies))];
  console.log(`\n  ${written.length} file(s) written, ${skipped.length} skipped.`);
  if (peerDeps.length > 0) {
    console.log(`  Required peer dependencies: ${peerDeps.join(", ")}`);
  }
}
