import type { Block } from "./types.js";

export function resolveBlocks(
  requestedIds: string[],
  allBlocks: Block[],
): Block[] {
  const blockMap = new Map(allBlocks.map((b) => [b.id, b]));
  const resolved: Block[] = [];
  const visited = new Set<string>();

  function visit(id: string): void {
    if (visited.has(id)) return;
    visited.add(id);
    const block = blockMap.get(id);
    if (!block) throw new Error(`Unknown block: ${id}`);
    for (const dep of block.dependencies) {
      visit(dep);
    }
    resolved.push(block);
  }

  for (const id of requestedIds) visit(id);
  return resolved;
}
