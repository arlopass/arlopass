import { describe, expect, it } from "vitest";

import {
  isCloudAdapterContractV2,
  loadAdapter,
  parseAdapterManifest,
  parseConnectionMethods,
  type AdapterContract,
} from "@byom-ai/adapter-runtime";
import { AmazonBedrockAdapter } from "@byom-ai/adapter-amazon-bedrock";
import { ClaudeSubscriptionAdapter } from "@byom-ai/adapter-claude-subscription";
import { GeminiAdapter } from "@byom-ai/adapter-gemini";
import { GoogleVertexAiAdapter } from "@byom-ai/adapter-google-vertex-ai";
import { LocalCliBridgeAdapter } from "@byom-ai/adapter-local-cli-bridge";
import { MicrosoftFoundryAdapter } from "@byom-ai/adapter-microsoft-foundry";
import { OllamaAdapter } from "@byom-ai/adapter-ollama";
import { OpenAiAdapter } from "@byom-ai/adapter-openai";
import { PerplexityAdapter } from "@byom-ai/adapter-perplexity";

type FirstPartyAdapterSpec = Readonly<{
  providerId: string;
  instantiate: () => AdapterContract;
}>;

const FIRST_PARTY_ADAPTERS: readonly FirstPartyAdapterSpec[] = Object.freeze([
  {
    providerId: "amazon-bedrock",
    instantiate: () => new AmazonBedrockAdapter(),
  },
  {
    providerId: "claude-subscription",
    instantiate: () =>
      new ClaudeSubscriptionAdapter({
        auth: { authType: "api_key", apiKey: "test-api-key" },
      }),
  },
  {
    providerId: "gemini",
    instantiate: () => new GeminiAdapter(),
  },
  {
    providerId: "google-vertex-ai",
    instantiate: () => new GoogleVertexAiAdapter(),
  },
  {
    providerId: "local-cli-bridge",
    instantiate: () => new LocalCliBridgeAdapter({ command: "node", args: ["--version"] }),
  },
  {
    providerId: "microsoft-foundry",
    instantiate: () => new MicrosoftFoundryAdapter(),
  },
  {
    providerId: "ollama",
    instantiate: () => new OllamaAdapter(),
  },
  {
    providerId: "openai",
    instantiate: () => new OpenAiAdapter(),
  },
  {
    providerId: "perplexity",
    instantiate: () => new PerplexityAdapter(),
  },
]);

function sortStrings(values: readonly string[]): readonly string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function assertCanonicalStringList(values: readonly string[], field: string): void {
  const normalizedValues = values.map((value) => value.trim());
  expect(
    values,
    `"${field}" entries must be canonical (trimmed) to avoid relying on runtime normalization.`,
  ).toEqual(normalizedValues);
  expect(
    new Set(normalizedValues).size,
    `"${field}" must not include duplicates that runtime parsing would silently normalize.`,
  ).toBe(normalizedValues.length);
}

describe("Release gate: first-party adapter conformance", () => {
  it("tracks the expected first-party adapter provider IDs", () => {
    expect(sortStrings(FIRST_PARTY_ADAPTERS.map((spec) => spec.providerId))).toEqual([
      "amazon-bedrock",
      "claude-subscription",
      "gemini",
      "google-vertex-ai",
      "local-cli-bridge",
      "microsoft-foundry",
      "ollama",
      "openai",
      "perplexity",
    ]);
  });

  it("loads each first-party adapter through runtime manifest parse + adapter loader", async () => {
    for (const spec of FIRST_PARTY_ADAPTERS) {
      const contract = spec.instantiate();
      try {
        const parsedManifest = parseAdapterManifest(contract.manifest);
        const loaded = await loadAdapter(contract.manifest, () => contract, {
          requireSignatureVerification: false,
        });

        expect(loaded.providerId).toBe(spec.providerId);
        expect(loaded.manifest).toEqual(parsedManifest);
        expect(sortStrings(loaded.contract.describeCapabilities())).toEqual(parsedManifest.capabilities);
      } finally {
        await contract.shutdown();
      }
    }
  });

  it("enforces CloudAdapterContractV2 alignment for adapters declaring connection methods", async () => {
    for (const spec of FIRST_PARTY_ADAPTERS) {
      const contract = spec.instantiate();
      try {
        const parsedManifest = parseAdapterManifest(contract.manifest);
        const manifestConnectionMethods = parsedManifest.connectionMethods;

        if (manifestConnectionMethods === undefined) {
          expect(isCloudAdapterContractV2(contract)).toBe(false);
          continue;
        }

        expect(isCloudAdapterContractV2(contract)).toBe(true);
        if (!isCloudAdapterContractV2(contract)) {
          continue;
        }

        const runtimeMethods = parseConnectionMethods(contract.listConnectionMethods());
        expect(runtimeMethods).toEqual(parseConnectionMethods(manifestConnectionMethods));
      } finally {
        await contract.shutdown();
      }
    }
  });

  it("ensures first-party manifests are canonical (no duplicate entries hidden by parser normalization)", async () => {
    for (const spec of FIRST_PARTY_ADAPTERS) {
      const contract = spec.instantiate();
      try {
        assertCanonicalStringList(contract.manifest.capabilities, `${spec.providerId}.capabilities`);
        assertCanonicalStringList(
          contract.manifest.requiredPermissions,
          `${spec.providerId}.requiredPermissions`,
        );

        const connectionMethods = contract.manifest.connectionMethods;
        if (connectionMethods !== undefined) {
          const methodIds = connectionMethods.map((method) => method.id);
          assertCanonicalStringList(methodIds, `${spec.providerId}.connectionMethods`);
          expect(parseConnectionMethods(connectionMethods)).toHaveLength(connectionMethods.length);
        }
      } finally {
        await contract.shutdown();
      }
    }
  });
});
