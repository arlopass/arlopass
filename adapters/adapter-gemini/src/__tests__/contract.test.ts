import { describe, expect, it, beforeEach } from "vitest";

import {
  GeminiAdapter,
  GEMINI_CONNECTION_METHOD_IDS,
} from "../index.js";

function expectOk(result: Readonly<{ ok: boolean; reason?: string }>) {
  expect(result.ok, result.reason ?? "expected validation to succeed").toBe(true);
}

describe("GeminiAdapter contract", () => {
  let adapter: GeminiAdapter;

  beforeEach(() => {
    adapter = new GeminiAdapter();
  });

  it("exposes manifest and connection methods", () => {
    expect(adapter.manifest.providerId).toBe("gemini");
    expect(adapter.listConnectionMethods()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: GEMINI_CONNECTION_METHOD_IDS.API_KEY,
          authFlow: "api-key",
        }),
        expect.objectContaining({
          id: GEMINI_CONNECTION_METHOD_IDS.OAUTH_ACCESS_TOKEN,
          authFlow: "oauth-access-token",
        }),
      ]),
    );
  });

  it("completes API key connection and validates credential refs", async () => {
    const completed = await adapter.completeConnect({
      providerId: "gemini",
      methodId: GEMINI_CONNECTION_METHOD_IDS.API_KEY,
      input: {
        apiKey: "gemini-key",
      },
    });

    expect(completed).toMatchObject({
      providerId: "gemini",
      methodId: GEMINI_CONNECTION_METHOD_IDS.API_KEY,
      endpointProfile: { baseUrl: "https://generativelanguage.googleapis.com" },
    });
    const credentialRef = completed["credentialRef"];
    expect(typeof credentialRef).toBe("string");

    const validation = await adapter.validateCredentialRef({
      providerId: "gemini",
      methodId: GEMINI_CONNECTION_METHOD_IDS.API_KEY,
      credentialRef: String(credentialRef),
      endpointProfile: completed["endpointProfile"] as Readonly<Record<string, unknown>>,
    });
    expectOk(validation);
  });

  it("completes OAuth access token connection and validates credential refs", async () => {
    const completed = await adapter.completeConnect({
      providerId: "gemini",
      methodId: GEMINI_CONNECTION_METHOD_IDS.OAUTH_ACCESS_TOKEN,
      input: {
        accessToken: "ya29.sample-token",
      },
    });

    expect(completed).toMatchObject({
      providerId: "gemini",
      methodId: GEMINI_CONNECTION_METHOD_IDS.OAUTH_ACCESS_TOKEN,
      endpointProfile: { baseUrl: "https://generativelanguage.googleapis.com" },
    });
    const credentialRef = completed["credentialRef"];
    expect(typeof credentialRef).toBe("string");

    const validation = await adapter.validateCredentialRef({
      providerId: "gemini",
      methodId: GEMINI_CONNECTION_METHOD_IDS.OAUTH_ACCESS_TOKEN,
      credentialRef: String(credentialRef),
      endpointProfile: completed["endpointProfile"] as Readonly<Record<string, unknown>>,
    });
    expectOk(validation);
  });

  it("rejects non-https baseUrl", async () => {
    await expect(
      adapter.completeConnect({
        providerId: "gemini",
        methodId: GEMINI_CONNECTION_METHOD_IDS.API_KEY,
        input: {
          apiKey: "gemini-key",
          baseUrl: "http://localhost:3000",
        },
      }),
    ).rejects.toThrow(/HTTPS/);
  });
});

