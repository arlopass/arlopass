import { describe, expect, it, beforeEach } from "vitest";

import {
  OpenAiAdapter,
  OPENAI_CONNECTION_METHOD_IDS,
} from "../index.js";

function expectOk(result: Readonly<{ ok: boolean; reason?: string }>) {
  expect(result.ok, result.reason ?? "expected validation to succeed").toBe(true);
}

describe("OpenAiAdapter contract", () => {
  let adapter: OpenAiAdapter;

  beforeEach(() => {
    adapter = new OpenAiAdapter();
  });

  it("exposes manifest and connection methods", () => {
    expect(adapter.manifest.providerId).toBe("openai");
    expect(adapter.listConnectionMethods()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: OPENAI_CONNECTION_METHOD_IDS.API_KEY,
          authFlow: "api-key",
        }),
      ]),
    );
  });

  it("completes API key connection with default endpoint profile and validates credential refs", async () => {
    const completed = await adapter.completeConnect({
      providerId: "openai",
      methodId: OPENAI_CONNECTION_METHOD_IDS.API_KEY,
      input: {
        apiKey: "sk-test-value",
      },
    });

    expect(completed).toMatchObject({
      providerId: "openai",
      methodId: OPENAI_CONNECTION_METHOD_IDS.API_KEY,
      endpointProfile: { baseUrl: "https://api.openai.com/v1" },
    });
    const credentialRef = completed["credentialRef"];
    expect(typeof credentialRef).toBe("string");

    const validation = await adapter.validateCredentialRef({
      providerId: "openai",
      methodId: OPENAI_CONNECTION_METHOD_IDS.API_KEY,
      credentialRef: String(credentialRef),
      endpointProfile: completed["endpointProfile"] as Readonly<Record<string, unknown>>,
    });
    expectOk(validation);

    const models = await adapter.discoverModels({
      providerId: "openai",
      methodId: OPENAI_CONNECTION_METHOD_IDS.API_KEY,
      credentialRef: String(credentialRef),
      endpointProfile: completed["endpointProfile"] as Readonly<Record<string, unknown>>,
      correlationId: "corr-openai-models",
    });
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]?.["id"]).toBeTruthy();
  });

  it("rejects non-https baseUrl", async () => {
    await expect(
      adapter.completeConnect({
        providerId: "openai",
        methodId: OPENAI_CONNECTION_METHOD_IDS.API_KEY,
        input: {
          apiKey: "sk-test-value",
          baseUrl: "http://localhost:3000",
        },
      }),
    ).rejects.toThrow(/HTTPS/);
  });
});

