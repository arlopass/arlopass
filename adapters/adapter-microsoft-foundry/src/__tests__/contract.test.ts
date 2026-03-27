import { afterEach, describe, expect, it, vi } from "vitest";

import { MANIFEST_SCHEMA_VERSION, type CloudAdapterContractV2 } from "@arlopass/adapter-runtime";

import { MicrosoftFoundryAdapter, MICROSOFT_FOUNDRY_MANIFEST } from "../index.js";

function makeAdapter(): MicrosoftFoundryAdapter {
  return new MicrosoftFoundryAdapter();
}

function makeCloudAdapter(): CloudAdapterContractV2 {
  return new MicrosoftFoundryAdapter();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MicrosoftFoundryAdapter – manifest", () => {
  it("declares deterministic manifest metadata", () => {
    expect(MICROSOFT_FOUNDRY_MANIFEST.schemaVersion).toBe(MANIFEST_SCHEMA_VERSION);
    expect(MICROSOFT_FOUNDRY_MANIFEST.providerId).toBe("microsoft-foundry");
    expect(MICROSOFT_FOUNDRY_MANIFEST.authType).toBe("api_key");
    expect(MICROSOFT_FOUNDRY_MANIFEST.connectionMethods?.map((m) => m.id)).toEqual(
      expect.arrayContaining(["foundry.api_key"]),
    );
  });

  it("declares strict non-wildcard egress rules", () => {
    expect(MICROSOFT_FOUNDRY_MANIFEST.egressRules.length).toBeGreaterThan(0);
    expect(MICROSOFT_FOUNDRY_MANIFEST.egressRules.every((rule) => rule.host !== "*")).toBe(true);
  });
});

describe("MicrosoftFoundryAdapter – compatibility contract", () => {
  it("implements all AdapterContract methods", () => {
    const adapter = makeAdapter();
    expect(typeof adapter.describeCapabilities).toBe("function");
    expect(typeof adapter.listModels).toBe("function");
    expect(typeof adapter.createSession).toBe("function");
    expect(typeof adapter.sendMessage).toBe("function");
    expect(typeof adapter.streamMessage).toBe("function");
    expect(typeof adapter.healthCheck).toBe("function");
    expect(typeof adapter.shutdown).toBe("function");
  });
});

describe("MicrosoftFoundryAdapter – cloud contract v2", () => {
  it("pins expected method id and endpoint profile fields", () => {
    const adapter = makeAdapter();
    expect(adapter.listConnectionMethods().map((method) => method.id)).toEqual(
      expect.arrayContaining(["foundry.api_key"]),
    );
    expect(adapter.requiredEndpointProfileFields).toEqual(expect.arrayContaining(["apiUrl"]));
  });

  it("returns deterministic begin/complete/connect lifecycle values", async () => {
    const adapter = makeCloudAdapter();
    const begin = await adapter.beginConnect({
      providerId: MICROSOFT_FOUNDRY_MANIFEST.providerId,
      methodId: "foundry.api_key",
    });
    expect(begin["requiredFields"]).toEqual(expect.arrayContaining(["apiUrl", "apiKey"]));

    const complete = await adapter.completeConnect({
      providerId: MICROSOFT_FOUNDRY_MANIFEST.providerId,
      methodId: "foundry.api_key",
      input: {
        apiUrl: "https://foundry-resource.openai.azure.com/openai/v1",
        apiVersion: "v1",
        deployment: "gpt-4o-mini",
        apiKey: "foundry-api-key-secret",
      },
    });

    const credentialRef = complete["credentialRef"];
    expect(typeof credentialRef).toBe("string");
    if (typeof credentialRef !== "string") {
      throw new Error("Expected credentialRef to be a string.");
    }

    const endpointProfile = complete["endpointProfile"];
    expect(endpointProfile).toEqual(
      expect.objectContaining({
        apiUrl: "https://foundry-resource.openai.azure.com/openai/v1",
        apiVersion: "v1",
      }),
    );

    const valid = await adapter.validateCredentialRef({
      providerId: MICROSOFT_FOUNDRY_MANIFEST.providerId,
      methodId: "foundry.api_key",
      credentialRef,
      endpointProfile: endpointProfile as Readonly<Record<string, unknown>>,
    });
    expect(valid).toEqual({ ok: true });
  });

  it("returns { ok:false } for invalid refs and supports revoke", async () => {
    const adapter = makeCloudAdapter();
    const invalid = await adapter.validateCredentialRef({
      providerId: MICROSOFT_FOUNDRY_MANIFEST.providerId,
      methodId: "foundry.api_key",
      credentialRef: "invalid",
    });
    expect(invalid.ok).toBe(false);
    expect(typeof invalid.reason).toBe("string");

    const complete = await adapter.completeConnect({
      providerId: MICROSOFT_FOUNDRY_MANIFEST.providerId,
      methodId: "foundry.api_key",
      input: {
        apiUrl: "https://resource-b.openai.azure.com/openai/v1",
        apiVersion: "v1",
        apiKey: "foundry-api-key-b",
      },
    });

    const credentialRef = complete["credentialRef"];
    expect(typeof credentialRef).toBe("string");
    if (typeof credentialRef !== "string") {
      throw new Error("Expected credentialRef to be a string.");
    }

    await adapter.revokeCredentialRef({
      providerId: MICROSOFT_FOUNDRY_MANIFEST.providerId,
      methodId: "foundry.api_key",
      credentialRef,
      reason: "contract-test",
    });

    const revoked = await adapter.validateCredentialRef({
      providerId: MICROSOFT_FOUNDRY_MANIFEST.providerId,
      methodId: "foundry.api_key",
      credentialRef,
    });
    expect(revoked.ok).toBe(false);
  });

  it("discovers models live from the configured Foundry endpoint and capabilities", async () => {
    const adapter = makeCloudAdapter();
    const complete = await adapter.completeConnect({
      providerId: MICROSOFT_FOUNDRY_MANIFEST.providerId,
      methodId: "foundry.api_key",
      input: {
        apiUrl: "https://resource-c.openai.azure.com/openai/v1",
        apiVersion: "v1",
        deployment: "gpt-4o-mini",
        apiKey: "foundry-api-key-c",
      },
    });
    const fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [
            { id: "gpt-4o", name: "GPT-4o" },
            { id: "o3-mini" },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchSpy as unknown as typeof fetch);

    const credentialRef = complete["credentialRef"];
    const endpointProfile = complete["endpointProfile"];
    expect(typeof credentialRef).toBe("string");
    if (typeof credentialRef !== "string") {
      throw new Error("Expected credentialRef to be a string.");
    }

    const context = {
      providerId: MICROSOFT_FOUNDRY_MANIFEST.providerId,
      methodId: "foundry.api_key",
      credentialRef,
      endpointProfile: (endpointProfile ?? {}) as Readonly<Record<string, unknown>>,
      correlationId: "corr-foundry-1",
    };

    const models = await adapter.discoverModels(context);
    expect(models).toEqual([
      expect.objectContaining({ id: "gpt-4o", displayName: "GPT-4o" }),
      expect.objectContaining({ id: "o3-mini", displayName: "o3-mini" }),
    ]);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const firstCall = fetchSpy.mock.calls[0] as unknown[] | undefined;
    expect(firstCall).toBeDefined();
    const modelsRequestUrl = String(firstCall?.[0] ?? "");
    const modelsRequestInit = firstCall?.[1] as RequestInit | undefined;
    expect(modelsRequestUrl).toContain("/models");
    expect(modelsRequestUrl).toContain("api-version=v1");
    expect(modelsRequestInit?.method).toBe("GET");
    expect((modelsRequestInit?.headers as Record<string, string> | undefined)?.[
      "api-key"
    ]).toBe("foundry-api-key-c");

    const capsA = await adapter.discoverCapabilities(context);
    const capsB = await adapter.discoverCapabilities(context);
    expect(capsA).toEqual(capsB);
    expect(capsA.capabilities.length).toBeGreaterThan(0);
  });

  it("discovers models from stateless connection input when credentialRef is unavailable", async () => {
    const adapter = makeCloudAdapter();
    const fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [{ id: "gpt-4o", name: "GPT-4o" }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchSpy as unknown as typeof fetch);

    const models = await adapter.discoverModels({
      providerId: MICROSOFT_FOUNDRY_MANIFEST.providerId,
      methodId: "foundry.api_key",
      credentialRef: "credref.missing",
      endpointProfile: {},
      correlationId: "corr-foundry-stateless",
      connectionInput: {
        apiUrl: "https://resource-stateless.openai.azure.com/openai/v1",
        apiVersion: "v1",
        apiKey: "foundry-stateless-secret",
      },
    } as unknown as Parameters<MicrosoftFoundryAdapter["discoverModels"]>[0]);

    expect(models).toEqual([
      expect.objectContaining({ id: "gpt-4o", displayName: "GPT-4o" }),
    ]);
    const firstCall = fetchSpy.mock.calls[0] as unknown[] | undefined;
    const modelsRequestInit = firstCall?.[1] as RequestInit | undefined;
    expect((modelsRequestInit?.headers as Record<string, string> | undefined)?.[
      "api-key"
    ]).toBe("foundry-stateless-secret");
  });

  it("sends real Foundry chat request using credential reference material", async () => {
    const adapter = makeCloudAdapter();
    const complete = await adapter.completeConnect({
      providerId: MICROSOFT_FOUNDRY_MANIFEST.providerId,
      methodId: "foundry.api_key",
      input: {
        apiUrl: "https://resource-chat.openai.azure.com/openai/v1",
        apiVersion: "v1",
        deployment: "gpt-4o-mini",
        apiKey: "foundry-real-secret",
      },
    });

    const credentialRef = complete["credentialRef"];
    const endpointProfile = complete["endpointProfile"];
    expect(typeof credentialRef).toBe("string");
    if (typeof credentialRef !== "string") {
      throw new Error("Expected credentialRef to be a string.");
    }

    const sessionId = await adapter.createSession({
      model: "gpt-4o-mini",
      methodId: "foundry.api_key",
      credentialRef,
      endpointProfile: (endpointProfile ?? {}) as Readonly<Record<string, unknown>>,
    });

    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      void _input;
      void _init;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: "assistant", content: "Credential isolation uses bridge-only refs." } }],
        }),
        text: async () => "",
      };
    });
    vi.stubGlobal("fetch", fetchSpy as unknown as typeof fetch);

    const output = await adapter.sendMessage(
      sessionId,
      "Explain how Arlopass protects provider credentials.",
    );

    expect(output).toBe("Credential isolation uses bridge-only refs.");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const firstCall = fetchSpy.mock.calls[0];
    expect(firstCall).toBeDefined();
    if (firstCall === undefined) {
      throw new Error("Expected fetch call arguments.");
    }
    const [requestUrl, requestInit] = firstCall;
    expect(String(requestUrl)).toContain("https://resource-chat.openai.azure.com/openai/v1/chat/completions");
    expect(String(requestUrl)).toContain("api-version=v1");
    expect(requestInit?.method).toBe("POST");
    if (requestInit === undefined) {
      throw new Error("Expected fetch request init.");
    }
    const headers = requestInit.headers as Record<string, string>;
    expect(headers["api-key"]).toBe("foundry-real-secret");
    const payload = JSON.parse(String(requestInit.body ?? "{}")) as {
      model?: string;
      messages?: Array<{ role?: string; content?: string }>;
    };
    expect(payload.model).toBe("gpt-4o-mini");
    expect(payload.messages?.at(-1)?.content).toBe(
      "Explain how Arlopass protects provider credentials.",
    );
  });
});

