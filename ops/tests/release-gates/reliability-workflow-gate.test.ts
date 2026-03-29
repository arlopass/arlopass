import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const RELIABILITY_WORKFLOW_PATH = path.join(
  REPO_ROOT,
  ".github",
  "workflows",
  "reliability-gates.yml",
);

function readReliabilityWorkflow(): string {
  return readFileSync(RELIABILITY_WORKFLOW_PATH, "utf8");
}

function readWorkflowJobBlockLines(workflow: string, jobId: string): readonly string[] {
  const lines = workflow.split(/\r\n|\n|\r/);
  const jobKey = `  ${jobId}:`;
  const startIndex = lines.findIndex((line) => line === jobKey);
  if (startIndex < 0) {
    throw new Error(`Workflow job "${jobId}" is missing from reliability-gates.yml.`);
  }

  const blockLines: string[] = [];
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (index > startIndex && /^  [a-zA-Z0-9_-]+:$/.test(line)) {
      break;
    }
    blockLines.push(line);
  }

  return blockLines;
}

describe("Release gate: reliability workflow conformance", () => {
  it("runs release-gate adapter conformance suite in CI", () => {
    const workflow = readReliabilityWorkflow();
    const adapterConformanceJobLines = readWorkflowJobBlockLines(
      workflow,
      "adapter-conformance-tests",
    );

    expect(adapterConformanceJobLines).toContain("        run: pnpm run test -- ops/tests/release-gates");
  });

  it("requires adapter conformance before reliability gate can pass", () => {
    const workflow = readReliabilityWorkflow();
    const reliabilityGateJobLines = readWorkflowJobBlockLines(workflow, "reliability-gate");

    expect(reliabilityGateJobLines).toContain("      - adapter-conformance-tests");
    expect(
      reliabilityGateJobLines.some((line) => line.includes("| Adapter conformance tests | ✅ Passed |")),
    ).toBe(true);
  });
});
