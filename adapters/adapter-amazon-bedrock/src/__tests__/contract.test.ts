import { describe, expect, it } from "vitest";

import { MANIFEST_SCHEMA_VERSION, type CloudAdapterContractV2 } from "@byom-ai/adapter-runtime";

import { AmazonBedrockAdapter, AMAZON_BEDROCK_MANIFEST } from "../index.js";

function makeAdapter(): AmazonBedrockAdapter {
  return new AmazonBedrockAdapter();
}

function makeCloudAdapter(): CloudAdapterContractV2 {
  return new AmazonBedrockAdapter();
}

describe("AmazonBedrockAdapter – manifest", () => {
  it("declares deterministic manifest metadata", () => {
    expect(AMAZON_BEDROCK_MANIFEST.schemaVersion).toBe(MANIFEST_SCHEMA_VERSION);
    expect(AMAZON_BEDROCK_MANIFEST.providerId).toBe("amazon-bedrock");
    expect(AMAZON_BEDROCK_MANIFEST.authType).toBe("api_key");
    expect(AMAZON_BEDROCK_MANIFEST.connectionMethods?.map((m) => m.id)).toEqual(
      expect.arrayContaining(["bedrock.api_key", "bedrock.aws_access_key", "bedrock.assume_role"]),
    );
  });

  it("declares strict non-wildcard egress rules", () => {
    expect(AMAZON_BEDROCK_MANIFEST.egressRules.length).toBeGreaterThan(0);
    expect(AMAZON_BEDROCK_MANIFEST.egressRules.every((rule) => rule.host !== "*")).toBe(true);
  });
});

describe("AmazonBedrockAdapter – compatibility contract", () => {
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

describe("AmazonBedrockAdapter – cloud contract v2", () => {
  it("pins expected method ids and endpoint profile fields", () => {
    const adapter = makeAdapter();
    expect(adapter.listConnectionMethods().map((method) => method.id)).toEqual(
      expect.arrayContaining(["bedrock.api_key", "bedrock.aws_access_key", "bedrock.assume_role"]),
    );
    expect(adapter.requiredEndpointProfileFields).toEqual(
      expect.arrayContaining(["region", "modelAccessPolicy"]),
    );
  });

  it("supports bedrock api key flow", async () => {
    const adapter = makeCloudAdapter();
    const begin = await adapter.beginConnect({
      providerId: AMAZON_BEDROCK_MANIFEST.providerId,
      methodId: "bedrock.api_key",
    });
    expect(begin["requiredFields"]).toEqual(
      expect.arrayContaining(["region", "modelAccessPolicy", "apiKey"]),
    );

    const complete = await adapter.completeConnect({
      providerId: AMAZON_BEDROCK_MANIFEST.providerId,
      methodId: "bedrock.api_key",
      input: {
        region: "us-east-1",
        modelAccessPolicy: "allow-listed",
        apiKey: "bedrock-api-key-secret",
      },
    });

    expect(typeof complete["credentialRef"]).toBe("string");
  });

  it("assume-role method defines required and optional fields", () => {
    const adapter = makeAdapter();
    const assumeRoleMethod = adapter
      .listConnectionMethods()
      .find((method) => method.id === "bedrock.assume_role");
    expect(assumeRoleMethod).toBeDefined();
    expect(assumeRoleMethod?.["requiredFields"]).toEqual(expect.arrayContaining(["roleArn"]));
    expect(assumeRoleMethod?.["optionalFields"]).toEqual(expect.arrayContaining(["externalId"]));
  });

  it("returns deterministic begin and complete metadata for aws access key flow", async () => {
    const adapter = makeCloudAdapter();
    const begin = await adapter.beginConnect({
      providerId: AMAZON_BEDROCK_MANIFEST.providerId,
      methodId: "bedrock.aws_access_key",
    });
    expect(begin["requiredFields"]).toEqual(
      expect.arrayContaining(["region", "modelAccessPolicy", "accessKeyId", "secretAccessKey"]),
    );

    const complete = await adapter.completeConnect({
      providerId: AMAZON_BEDROCK_MANIFEST.providerId,
      methodId: "bedrock.aws_access_key",
      input: {
        region: "us-east-1",
        modelAccessPolicy: "allow-listed",
        roleArn: "arn:aws:iam::111122223333:role/byom-bedrock-role",
        accessKeyId: "AKIAEXAMPLEKEY",
        secretAccessKey: "secret-example",
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
        region: "us-east-1",
        modelAccessPolicy: "allow-listed",
        roleArn: "arn:aws:iam::111122223333:role/byom-bedrock-role",
      }),
    );

    const valid = await adapter.validateCredentialRef({
      providerId: AMAZON_BEDROCK_MANIFEST.providerId,
      methodId: "bedrock.aws_access_key",
      credentialRef,
      endpointProfile: endpointProfile as Readonly<Record<string, unknown>>,
    });
    expect(valid).toEqual({ ok: true });
  });

  it("rejects invalid refs as { ok:false } and supports revoke", async () => {
    const adapter = makeCloudAdapter();
    const invalid = await adapter.validateCredentialRef({
      providerId: AMAZON_BEDROCK_MANIFEST.providerId,
      methodId: "bedrock.aws_access_key",
      credentialRef: "invalid",
    });
    expect(invalid.ok).toBe(false);

    const complete = await adapter.completeConnect({
      providerId: AMAZON_BEDROCK_MANIFEST.providerId,
      methodId: "bedrock.aws_access_key",
      input: {
        region: "us-east-2",
        modelAccessPolicy: "catalog-only",
        roleArn: "arn:aws:iam::111122223333:role/byom-bedrock-role",
        accessKeyId: "AKIAEXAMPLEKEY2",
        secretAccessKey: "secret-example-2",
      },
    });

    const credentialRef = complete["credentialRef"];
    expect(typeof credentialRef).toBe("string");
    if (typeof credentialRef !== "string") {
      throw new Error("Expected credentialRef to be a string.");
    }

    await adapter.revokeCredentialRef({
      providerId: AMAZON_BEDROCK_MANIFEST.providerId,
      methodId: "bedrock.aws_access_key",
      credentialRef,
      reason: "contract-test",
    });

    const revoked = await adapter.validateCredentialRef({
      providerId: AMAZON_BEDROCK_MANIFEST.providerId,
      methodId: "bedrock.aws_access_key",
      credentialRef,
    });
    expect(revoked.ok).toBe(false);
  });

  it("enforces deterministic assume-role single-hop guard", async () => {
    const adapter = makeCloudAdapter();
    await expect(
      adapter.completeConnect({
        providerId: AMAZON_BEDROCK_MANIFEST.providerId,
        methodId: "bedrock.assume_role",
        input: {
          region: "us-west-2",
          modelAccessPolicy: "cross-account",
          roleArn: "arn:aws:iam::111122223333:role/byom-bedrock-role",
          hopDepth: 2,
        },
      }),
    ).rejects.toThrow(/single-hop/i);
  });

  it("updates lastDiscoveryRegions with allowed statuses during discoverModels", async () => {
    const adapter = makeAdapter();
    const complete = await adapter.completeConnect({
      providerId: AMAZON_BEDROCK_MANIFEST.providerId,
      methodId: "bedrock.assume_role",
      input: {
        region: "us-west-2,us-east-1",
        modelAccessPolicy: "cross-account",
        roleArn: "arn:aws:iam::111122223333:role/byom-bedrock-role",
      },
    });

    const credentialRef = complete["credentialRef"];
    const endpointProfile = complete["endpointProfile"];
    expect(typeof credentialRef).toBe("string");
    if (typeof credentialRef !== "string") {
      throw new Error("Expected credentialRef to be a string.");
    }

    const models = await adapter.discoverModels({
      providerId: AMAZON_BEDROCK_MANIFEST.providerId,
      methodId: "bedrock.assume_role",
      credentialRef,
      endpointProfile: (endpointProfile ?? {}) as Readonly<Record<string, unknown>>,
      correlationId: "corr-bedrock-1",
    });
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);

    expect(adapter.lastDiscoveryRegions.length).toBeGreaterThan(0);
    expect(adapter.lastDiscoveryRegions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: expect.stringMatching(/healthy|partial|stale|unavailable/),
        }),
      ]),
    );
  });

  it("discovers deterministic capabilities", async () => {
    const adapter = makeCloudAdapter();
    const complete = await adapter.completeConnect({
      providerId: AMAZON_BEDROCK_MANIFEST.providerId,
      methodId: "bedrock.aws_access_key",
      input: {
        region: "us-west-2",
        modelAccessPolicy: "allow-listed",
        roleArn: "arn:aws:iam::111122223333:role/byom-bedrock-role",
        accessKeyId: "AKIAEXAMPLEKEY3",
        secretAccessKey: "secret-example-3",
      },
    });

    const credentialRef = complete["credentialRef"];
    const endpointProfile = complete["endpointProfile"];
    expect(typeof credentialRef).toBe("string");
    if (typeof credentialRef !== "string") {
      throw new Error("Expected credentialRef to be a string.");
    }

    const capsA = await adapter.discoverCapabilities({
      providerId: AMAZON_BEDROCK_MANIFEST.providerId,
      methodId: "bedrock.aws_access_key",
      credentialRef,
      endpointProfile: (endpointProfile ?? {}) as Readonly<Record<string, unknown>>,
      correlationId: "corr-bedrock-2",
    });
    const capsB = await adapter.discoverCapabilities({
      providerId: AMAZON_BEDROCK_MANIFEST.providerId,
      methodId: "bedrock.aws_access_key",
      credentialRef,
      endpointProfile: (endpointProfile ?? {}) as Readonly<Record<string, unknown>>,
      correlationId: "corr-bedrock-3",
    });
    expect(capsA).toEqual(capsB);
    expect(capsA.capabilities.length).toBeGreaterThan(0);
  });
});
