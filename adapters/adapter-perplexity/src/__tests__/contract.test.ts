import { describe, expect, it, beforeEach } from "vitest";

import {
  PerplexityAdapter,
  PERPLEXITY_CONNECTION_METHOD_IDS,
} from "../index.js";

function expectOk(result: Readonly<{ ok: boolean; reason?: string }>) {
  expect(result.ok, result.reason ?? "expected validation to succeed").toBe(true);
}

describe("PerplexityAdapter contract", () => {
  let adapter: PerplexityAdapter;

  beforeEach(() => {
    adapter = new PerplexityAdapter();
  });

  it("exposes manifest and connection methods", () => {
    expect(adapter.manifest.providerId).toBe("perplexity");
    expect(adapter.listConnectionMethods()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: PERPLEXITY_CONNECTION_METHOD_IDS.API_KEY,
          authFlow: "api-key",
        }),
      ]),
    );
  });

  it("completes API key connection with default endpoint profile and validates credential refs", async () => {
    const completed = await adapter.completeConnect({
      providerId: "perplexity",
      methodId: PERPLEXITY_CONNECTION_METHOD_IDS.API_KEY,
      input: {
        apiKey: "pplx-test-value",
      },
    });

    expect(completed).toMatchObject({
      providerId: "perplexity",
      methodId: PERPLEXITY_CONNECTION_METHOD_IDS.API_KEY,
      endpointProfile: { baseUrl: "https://api.perplexity.ai" },
    });
    const credentialRef = completed["credentialRef"];
    expect(typeof credentialRef).toBe("string");

    const validation = await adapter.validateCredentialRef({
      providerId: "perplexity",
      methodId: PERPLEXITY_CONNECTION_METHOD_IDS.API_KEY,
      credentialRef: String(credentialRef),
      endpointProfile: completed["endpointProfile"] as Readonly<Record<string, unknown>>,
    });
    expectOk(validation);

    const models = await adapter.discoverModels({
      providerId: "perplexity",
      methodId: PERPLEXITY_CONNECTION_METHOD_IDS.API_KEY,
      credentialRef: String(credentialRef),
      endpointProfile: completed["endpointProfile"] as Readonly<Record<string, unknown>>,
      correlationId: "corr-perplexity-models",
    });
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]?.["id"]).toBeTruthy();
  });

  it("rejects non-https baseUrl", async () => {
    await expect(
      adapter.completeConnect({
        providerId: "perplexity",
        methodId: PERPLEXITY_CONNECTION_METHOD_IDS.API_KEY,
        input: {
          apiKey: "pplx-test-value",
          baseUrl: "http://localhost:3000",
        },
      }),
    ).rejects.toThrow(/HTTPS/);
  });
});

