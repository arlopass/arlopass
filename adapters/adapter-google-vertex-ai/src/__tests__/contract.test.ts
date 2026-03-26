import { describe, expect, it } from "vitest";

import { MANIFEST_SCHEMA_VERSION, type CloudAdapterContractV2 } from "@byom-ai/adapter-runtime";

import { GoogleVertexAiAdapter, GOOGLE_VERTEX_AI_MANIFEST } from "../index.js";

function makeAdapter(): GoogleVertexAiAdapter {
  return new GoogleVertexAiAdapter();
}

function makeCloudAdapter(): CloudAdapterContractV2 {
  return new GoogleVertexAiAdapter();
}

describe("GoogleVertexAiAdapter – manifest", () => {
  it("declares deterministic manifest metadata", () => {
    expect(GOOGLE_VERTEX_AI_MANIFEST.schemaVersion).toBe(MANIFEST_SCHEMA_VERSION);
    expect(GOOGLE_VERTEX_AI_MANIFEST.providerId).toBe("google-vertex-ai");
    expect(GOOGLE_VERTEX_AI_MANIFEST.authType).toBe("oauth2");
    expect(GOOGLE_VERTEX_AI_MANIFEST.connectionMethods?.map((m) => m.id)).toEqual(
      expect.arrayContaining([
        "vertex.api_key",
        "vertex.service_account",
        "vertex.workload_identity_federation",
      ]),
    );
  });

  it("declares strict non-wildcard egress rules", () => {
    expect(GOOGLE_VERTEX_AI_MANIFEST.egressRules.length).toBeGreaterThan(0);
    expect(GOOGLE_VERTEX_AI_MANIFEST.egressRules.every((rule) => rule.host !== "*")).toBe(true);
  });
});

describe("GoogleVertexAiAdapter – compatibility contract", () => {
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

describe("GoogleVertexAiAdapter – cloud contract v2", () => {
  it("pins expected method ids and endpoint profile fields", () => {
    const adapter = makeAdapter();
    expect(adapter.listConnectionMethods().map((method) => method.id)).toEqual(
      expect.arrayContaining([
        "vertex.api_key",
        "vertex.service_account",
        "vertex.workload_identity_federation",
      ]),
    );
    expect(adapter.requiredEndpointProfileFields).toEqual(
      expect.arrayContaining(["projectId", "location"]),
    );
  });

  it("supports api key flow with express-mode defaults", async () => {
    const adapter = makeCloudAdapter();
    const begin = await adapter.beginConnect({
      providerId: GOOGLE_VERTEX_AI_MANIFEST.providerId,
      methodId: "vertex.api_key",
    });
    expect(begin["requiredFields"]).toEqual(expect.arrayContaining(["apiKey"]));

    const complete = await adapter.completeConnect({
      providerId: GOOGLE_VERTEX_AI_MANIFEST.providerId,
      methodId: "vertex.api_key",
      input: {
        apiKey: "vertex-api-key-secret",
      },
    });

    const endpointProfile = complete["endpointProfile"];
    expect(endpointProfile).toEqual(
      expect.objectContaining({
        projectId: "express-mode",
        location: "global",
      }),
    );
  });

  it("returns deterministic begin and complete metadata for service account", async () => {
    const adapter = makeCloudAdapter();
    const begin = await adapter.beginConnect({
      providerId: GOOGLE_VERTEX_AI_MANIFEST.providerId,
      methodId: "vertex.service_account",
    });
    expect(begin["requiredFields"]).toEqual(
      expect.arrayContaining(["projectId", "location", "serviceAccountJson"]),
    );

    const complete = await adapter.completeConnect({
      providerId: GOOGLE_VERTEX_AI_MANIFEST.providerId,
      methodId: "vertex.service_account",
      input: {
        projectId: "project-a",
        location: "us-central1",
        serviceAccountJson: "{\"type\":\"service_account\"}",
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
        projectId: "project-a",
        location: "us-central1",
      }),
    );

    const valid = await adapter.validateCredentialRef({
      providerId: GOOGLE_VERTEX_AI_MANIFEST.providerId,
      methodId: "vertex.service_account",
      credentialRef,
      endpointProfile: endpointProfile as Readonly<Record<string, unknown>>,
    });
    expect(valid).toEqual({ ok: true });
  });

  it("supports workload identity federation and invalid refs return {ok:false}", async () => {
    const adapter = makeCloudAdapter();

    const invalid = await adapter.validateCredentialRef({
      providerId: GOOGLE_VERTEX_AI_MANIFEST.providerId,
      methodId: "vertex.workload_identity_federation",
      credentialRef: "not-a-valid-ref",
    });
    expect(invalid.ok).toBe(false);

    const complete = await adapter.completeConnect({
      providerId: GOOGLE_VERTEX_AI_MANIFEST.providerId,
      methodId: "vertex.workload_identity_federation",
      input: {
        projectId: "project-b",
        location: "us-west1",
        audience: "//iam.googleapis.com/projects/123/locations/global/workloadIdentityPools/pool/providers/provider",
        subjectTokenType: "urn:ietf:params:oauth:token-type:jwt",
      },
    });

    const credentialRef = complete["credentialRef"];
    expect(typeof credentialRef).toBe("string");
    if (typeof credentialRef !== "string") {
      throw new Error("Expected credentialRef to be a string.");
    }

    await adapter.revokeCredentialRef({
      providerId: GOOGLE_VERTEX_AI_MANIFEST.providerId,
      methodId: "vertex.workload_identity_federation",
      credentialRef,
      reason: "contract-test",
    });

    const revoked = await adapter.validateCredentialRef({
      providerId: GOOGLE_VERTEX_AI_MANIFEST.providerId,
      methodId: "vertex.workload_identity_federation",
      credentialRef,
    });
    expect(revoked.ok).toBe(false);
  });

  it("discovers deterministic models and capabilities", async () => {
    const adapter = makeCloudAdapter();
    const complete = await adapter.completeConnect({
      providerId: GOOGLE_VERTEX_AI_MANIFEST.providerId,
      methodId: "vertex.service_account",
      input: {
        projectId: "project-c",
        location: "europe-west4",
        serviceAccountJson: "{\"type\":\"service_account\",\"client_email\":\"svc@example.com\"}",
      },
    });

    const credentialRef = complete["credentialRef"];
    const endpointProfile = complete["endpointProfile"];
    expect(typeof credentialRef).toBe("string");
    if (typeof credentialRef !== "string") {
      throw new Error("Expected credentialRef to be a string.");
    }

    const context = {
      providerId: GOOGLE_VERTEX_AI_MANIFEST.providerId,
      methodId: "vertex.service_account",
      credentialRef,
      endpointProfile: (endpointProfile ?? {}) as Readonly<Record<string, unknown>>,
      correlationId: "corr-vertex-1",
    };

    const modelsA = await adapter.discoverModels(context);
    const modelsB = await adapter.discoverModels(context);
    expect(modelsA).toEqual(modelsB);
    expect(modelsA.length).toBeGreaterThan(0);

    const capsA = await adapter.discoverCapabilities(context);
    const capsB = await adapter.discoverCapabilities(context);
    expect(capsA).toEqual(capsB);
    expect(capsA.capabilities.length).toBeGreaterThan(0);
  });
});
