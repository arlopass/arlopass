import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Registry } from "./types.js";

export function listCommand(): void {
  const registryPath = join(dirname(fileURLToPath(import.meta.url)), "../../registry.json");
  const registry: Registry = JSON.parse(readFileSync(registryPath, "utf-8"));

  console.log("\nAvailable blocks:\n");
  console.log("  ID                  Name                Description");
  console.log("  ─────────────────── ─────────────────── ─────────────────────────────────────────");
  for (const block of registry.blocks) {
    console.log(`  ${block.id.padEnd(20)}${block.name.padEnd(20)}${block.description}`);
  }
  console.log(`\n  ${registry.blocks.length} blocks available. Install with: npx @arlopass/ui add <id>\n`);
}
