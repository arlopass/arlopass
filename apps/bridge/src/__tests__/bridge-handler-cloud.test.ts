import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { BridgeHandler } from "../bridge-handler.js";
import { CloudConnectionServiceError } from "../cloud/cloud-connection-service.js";
import { InMemoryRequestIdempotencyStore } from "../cloud/idempotency-store.js";
import {
  computeRequestPayloadHash,
  createRequestProof,
} from "../cloud/request-proof.js";
import { createAuthenticatedOriginPolicyFromEnv } from "../config/authenticated-origin-policy.js";
import type { CloudFeatureFlags } from "../config/cloud-feature-flags.js";
import { RequestVerifier } from "../session/request-verifier.js";
import { SessionKeyRegistry } from "../session/session-key-registry.js";
import { obtainSessionToken } from "./test-session-helper.js";

describe("BridgeHandler cloud control-plane dispatch", () => {
  const signingKey = Buffer.alloc(32, 7);
  const sessionToken = "11".repeat(32);
  const connectionHandle =
    "connh.provider.claude.anthropic.api_key.00000000-0000-4000-8000-000000000001.0.sig";
  const enabledCloudFlags: CloudFeatureFlags = {
    cloudBrokerV2Enabled: true,
    cloudMethodAllowlist: {
      "anthropic.api_key": true,
    },
  };

  function createCloudService() {
    return {
      beginConnection: vi.fn(async () => ({
        state: "begin-state",
      })),
      completeConnection: vi.fn(async () => ({
        connectionHandle,
        providerId: "provider.claude",
        methodId: "anthropic.api_key",
        credentialRef: "cred.ref.001",
        endpointProfileHash: "sha256:endpoint-profile",
      })),
      validateConnection: vi.fn(async () => ({
        providerId: "provider.claude",
        methodId: "anthropic.api_key",
        valid: true,
      })),
      resolveConnectionBinding: vi.fn(
        async (
          input: Readonly<Record<string, unknown>>,
        ) => ({
          providerId:
            typeof input["providerId"] === "string"
              ? input["providerId"]
              : "provider.claude",
          methodId:
            typeof input["methodId"] === "string"
              ? input["methodId"]
              : "anthropic.api_key",
          connectionHandle:
            typeof input["connectionHandle"] === "string"
              ? input["connectionHandle"]
              : connectionHandle,
          extensionId:
            typeof input["extensionId"] === "string"
              ? input["extensionId"]
              : "ext.runtime.transport",
          origin:
            typeof input["origin"] === "string"
              ? input["origin"]
              : "https://app.example.com",
          policyVersion:
            typeof input["policyVersion"] === "string" &&
              input["policyVersion"].trim().length > 0
              ? input["policyVersion"]
              : "pol.v2",
          endpointProfileHash:
            typeof input["endpointProfileHash"] === "string" &&
              input["endpointProfileHash"].trim().length > 0
              ? input["endpointProfileHash"]
              : "sha256:endpoint-profile",
          epoch: 0,
        }),
      ),
      revokeConnection: vi.fn(async () => ({
        providerId: "provider.claude",
        methodId: "anthropic.api_key",
        revoked: true,
      })),
      discoverModels: vi.fn(async () => ({
        providerId: "provider.claude",
        models: [{ id: "claude-sonnet-4-5" }],
        cacheStatus: "refreshed" as const,
      })),
      discoverCapabilities: vi.fn(async () => ({
        providerId: "provider.claude",
        capabilities: ["chat.completions"],
        cacheStatus: "hot" as const,
      })),
      refreshDiscovery: vi.fn(async () => ({
        providerId: "provider.claude",
        models: [{ id: "claude-sonnet-4-5" }],
        capabilities: ["chat.completions"],
        cacheStatus: "refreshed" as const,
      })),
    };
  }

  function createCloudChatExecutor() {
    return {
      execute: vi.fn(async (request: Readonly<Record<string, unknown>>) => {
        void request;
        return {
          correlationId: "corr.cloud.001",
          providerId: "provider.claude",
          methodId: "anthropic.api_key",
          modelId: "claude-sonnet-4-5",
          region: "global",
          content: "Cloud response",
        };
      }),
    };
  }

  function issueSessionToken(registry: SessionKeyRegistry): void {
    registry.issue({
      extensionId: "ext.runtime.transport",
      sessionToken,
      establishedAt: "2026-03-25T00:00:00.000Z",
      expiresAt: "2026-03-25T00:10:00.000Z",
    });
  }

  function createExecuteMessage(
    overrides: Partial<Record<string, unknown>> = {},
  ): Record<string, unknown> {
    return {
      type: "cloud.chat.execute",
      correlationId: "corr.cloud.exec.001",
      tenantId: "tenant-1",
      origin: "https://app.example.com",
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      modelId: "claude-sonnet-4-5",
      connectionHandle,
      extensionId: "ext.runtime.transport",
      policyVersion: "pol.v2",
      endpointProfileHash: "sha256:endpoint-profile",
      messages: [{ role: "user", content: "hello" }],
      ...overrides,
    };
  }

  function createExecuteProof(
    message: Record<string, unknown>,
    overrides: Partial<Record<string, unknown>> = {},
  ): Record<string, unknown> {
    const requestId = "req.cloud.exec.001";
    const nonce = "nonce-cloud-000001";
    const origin = String(message["origin"]);
    const handle = String(message["connectionHandle"]);
    const payloadHash = computeRequestPayloadHash({
      messages: message["messages"],
      modelId: message["modelId"],
    });
    const proof = createRequestProof({
      requestId,
      nonce,
      origin,
      connectionHandle: handle,
      payloadHash,
      sessionKey: Buffer.from(sessionToken, "hex"),
    });

    return {
      requestId,
      nonce,
      origin,
      connectionHandle: handle,
      payloadHash,
      proof,
      ...overrides,
    };
  }

  it("denies cloud.connection.begin and cloud.chat.execute when cloudBrokerV2Enabled is false", async () => {
    const cloudConnectionService = createCloudService();
    const cloudChatExecutor = createCloudChatExecutor();
    const handler = new BridgeHandler({
      signingKey,
      cloudConnectionService,
      cloudChatExecutor,
      cloudFeatureFlags: {
        cloudBrokerV2Enabled: false,
        cloudMethodAllowlist: {
          "anthropic.api_key": true,
        },
      },
    });
    const token = await obtainSessionToken(handler);

    const beginResponse = await handler.handle({
      type: "cloud.connection.begin",
      sessionToken: token,
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
    });
    const chatResponse = await handler.handle({
      type: "cloud.chat.execute",
      sessionToken: token,
      correlationId: "corr.cloud.001",
      tenantId: "tenant-1",
      origin: "https://app.example.com",
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      modelId: "claude-sonnet-4-5",
      connectionHandle,
      policyVersion: "pol.v2",
      endpointProfileHash: "sha256:endpoint-profile",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(beginResponse).toMatchObject({
      type: "error",
      reasonCode: "policy.denied",
    });
    expect(chatResponse).toMatchObject({
      type: "error",
      reasonCode: "policy.denied",
    });
    expect(cloudConnectionService.beginConnection).not.toHaveBeenCalled();
    expect(cloudChatExecutor.execute).not.toHaveBeenCalled();
  });

  it("denies cloud execution when provider-level method flag is disabled", async () => {
    const cloudConnectionService = createCloudService();
    const cloudChatExecutor = createCloudChatExecutor();
    const handler = new BridgeHandler({
      signingKey,
      cloudConnectionService,
      cloudChatExecutor,
      cloudFeatureFlags: {
        cloudBrokerV2Enabled: true,
        cloudMethodAllowlist: {
          "openai.api_key": true,
        },
      },
    });
    const token = await obtainSessionToken(handler);

    const beginResponse = await handler.handle({
      type: "cloud.connection.begin",
      sessionToken: token,
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
    });
    const chatResponse = await handler.handle({
      type: "cloud.chat.execute",
      sessionToken: token,
      correlationId: "corr.cloud.002",
      tenantId: "tenant-1",
      origin: "https://app.example.com",
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      modelId: "claude-sonnet-4-5",
      connectionHandle,
      policyVersion: "pol.v2",
      endpointProfileHash: "sha256:endpoint-profile",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(beginResponse).toMatchObject({
      type: "error",
      reasonCode: "policy.denied",
    });
    expect(chatResponse).toMatchObject({
      type: "error",
      reasonCode: "policy.denied",
    });
    expect(cloudConnectionService.beginConnection).not.toHaveBeenCalled();
    expect(cloudChatExecutor.execute).not.toHaveBeenCalled();
  });

  it("returns cloud.connection.complete with connectionHandle on success", async () => {
    const cloudConnectionService = createCloudService();
    const handler = new BridgeHandler({
      signingKey,
      cloudConnectionService,
      cloudFeatureFlags: enabledCloudFlags,
    });
    const token = await obtainSessionToken(handler);

    const response = await handler.handle({
      type: "cloud.connection.complete",
      sessionToken: token,
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      extensionId: "ext-1",
      origin: "https://app.example.com",
      policyVersion: "pol.v2",
      endpointProfileHash: "sha256:endpoint-profile",
    });

    expect(response).toMatchObject({
      type: "cloud.connection.complete",
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      connectionHandle: expect.stringContaining("connh.provider.claude.anthropic.api_key."),
    });
  });

  it("routes all required cloud message types", async () => {
    const cloudConnectionService = createCloudService();
    const handler = new BridgeHandler({
      signingKey,
      cloudConnectionService,
      cloudFeatureFlags: enabledCloudFlags,
    });
    const token = await obtainSessionToken(handler);

    await handler.handle({
      type: "cloud.connection.begin",
      sessionToken: token,
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
    });
    await handler.handle({
      type: "cloud.connection.validate",
      sessionToken: token,
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      connectionHandle,
    });
    await handler.handle({
      type: "cloud.connection.revoke",
      sessionToken: token,
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      connectionHandle,
    });
    await handler.handle({
      type: "cloud.models.discover",
      sessionToken: token,
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
    });
    await handler.handle({
      type: "cloud.capabilities.discover",
      sessionToken: token,
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
    });
    await handler.handle({
      type: "cloud.discovery.refresh",
      sessionToken: token,
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
    });

    expect(cloudConnectionService.beginConnection).toHaveBeenCalledTimes(1);
    expect(cloudConnectionService.validateConnection).toHaveBeenCalledTimes(1);
    expect(cloudConnectionService.revokeConnection).toHaveBeenCalledTimes(1);
    expect(cloudConnectionService.discoverModels).toHaveBeenCalledTimes(1);
    expect(cloudConnectionService.discoverCapabilities).toHaveBeenCalledTimes(1);
    expect(cloudConnectionService.refreshDiscovery).toHaveBeenCalledTimes(1);
  });

  it("returns policy.denied when cloud control-plane throws fail-closed policy error", async () => {
    const cloudConnectionService = createCloudService();
    cloudConnectionService.discoverModels.mockRejectedValueOnce(
      new CloudConnectionServiceError(
        "Endpoint override denied by egress policy.",
        "policy.denied",
      ),
    );
    const handler = new BridgeHandler({
      signingKey,
      cloudConnectionService,
      cloudFeatureFlags: enabledCloudFlags,
    });
    const token = await obtainSessionToken(handler);

    const response = await handler.handle({
      type: "cloud.models.discover",
      sessionToken: token,
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      endpointOverride: "https://undeclared.example.com",
    });

    expect(response).toMatchObject({
      type: "error",
      reasonCode: "policy.denied",
    });
  });

  it("rejects cloud.chat.execute when request proof fields are missing", async () => {
    const cloudConnectionService = createCloudService();
    const cloudChatExecutor = createCloudChatExecutor();
    const sessionKeyRegistry = new SessionKeyRegistry({
      now: () => new Date("2026-03-25T00:05:00.000Z"),
    });
    issueSessionToken(sessionKeyRegistry);

    const handler = new BridgeHandler({
      signingKey,
      cloudConnectionService,
      cloudChatExecutor,
      cloudFeatureFlags: enabledCloudFlags,
      sessionKeyRegistry,
    });

    const response = await handler.handle(
      createExecuteMessage({
        handshakeSessionToken: sessionToken,
      }),
    );

    expect(response).toMatchObject({
      type: "error",
      reasonCode: "request.invalid",
    });
    expect(cloudChatExecutor.execute).not.toHaveBeenCalled();
  });

  it("hydrates cloud.chat.execute when policyVersion is missing", async () => {
    const cloudConnectionService = createCloudService();
    const cloudChatExecutor = createCloudChatExecutor();
    const sessionKeyRegistry = new SessionKeyRegistry({
      now: () => new Date("2026-03-25T00:05:00.000Z"),
    });
    issueSessionToken(sessionKeyRegistry);

    const handler = new BridgeHandler({
      signingKey,
      cloudConnectionService,
      cloudChatExecutor,
      cloudFeatureFlags: enabledCloudFlags,
      sessionKeyRegistry,
    });

    const baseMessage = createExecuteMessage();
    const response = await handler.handle(
      createExecuteMessage({
        policyVersion: undefined,
        handshakeSessionToken: sessionToken,
        requestProof: createExecuteProof(baseMessage),
      }),
    );

    expect(response).toMatchObject({
      type: "cloud.chat.result",
      correlationId: "corr.cloud.001",
    });
    expect(cloudConnectionService.resolveConnectionBinding).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "provider.claude",
        methodId: "anthropic.api_key",
        connectionHandle,
        extensionId: "ext.runtime.transport",
        origin: "https://app.example.com",
      }),
    );
    expect(cloudChatExecutor.execute).toHaveBeenCalledTimes(1);
    const executePayload = cloudChatExecutor.execute.mock.calls[0]?.[0] as
      | Readonly<Record<string, unknown>>
      | undefined;
    expect(executePayload?.["policyVersion"]).toBe("pol.v2");
  });

  it("hydrates cloud.chat.execute when endpointProfileHash is missing", async () => {
    const cloudConnectionService = createCloudService();
    const cloudChatExecutor = createCloudChatExecutor();
    const sessionKeyRegistry = new SessionKeyRegistry({
      now: () => new Date("2026-03-25T00:05:00.000Z"),
    });
    issueSessionToken(sessionKeyRegistry);

    const handler = new BridgeHandler({
      signingKey,
      cloudConnectionService,
      cloudChatExecutor,
      cloudFeatureFlags: enabledCloudFlags,
      sessionKeyRegistry,
    });

    const baseMessage = createExecuteMessage();
    const response = await handler.handle(
      createExecuteMessage({
        endpointProfileHash: undefined,
        handshakeSessionToken: sessionToken,
        requestProof: createExecuteProof(baseMessage),
      }),
    );

    expect(response).toMatchObject({
      type: "cloud.chat.result",
      correlationId: "corr.cloud.001",
    });
    expect(cloudConnectionService.resolveConnectionBinding).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "provider.claude",
        methodId: "anthropic.api_key",
        connectionHandle,
        extensionId: "ext.runtime.transport",
        origin: "https://app.example.com",
      }),
    );
    expect(cloudChatExecutor.execute).toHaveBeenCalledTimes(1);
    const executePayload = cloudChatExecutor.execute.mock.calls[0]?.[0] as
      | Readonly<Record<string, unknown>>
      | undefined;
    expect(executePayload?.["endpointProfileHash"]).toBe("sha256:endpoint-profile");
  });

  it("rejects cloud.chat.execute when request proof payload hash mismatches chat payload", async () => {
    const cloudConnectionService = createCloudService();
    const cloudChatExecutor = createCloudChatExecutor();
    const sessionKeyRegistry = new SessionKeyRegistry({
      now: () => new Date("2026-03-25T00:05:00.000Z"),
    });
    issueSessionToken(sessionKeyRegistry);

    const handler = new BridgeHandler({
      signingKey,
      cloudConnectionService,
      cloudChatExecutor,
      cloudFeatureFlags: enabledCloudFlags,
      sessionKeyRegistry,
    });

    const message = createExecuteMessage();
    const tamperedPayloadHash = "sha256:deadbeef";
    const requestId = "req.cloud.exec.001";
    const nonce = "nonce-cloud-000001";
    const proof = createRequestProof({
      requestId,
      nonce,
      origin: String(message["origin"]),
      connectionHandle,
      payloadHash: tamperedPayloadHash,
      sessionKey: Buffer.from(sessionToken, "hex"),
    });

    const response = await handler.handle(
      createExecuteMessage({
        handshakeSessionToken: sessionToken,
        requestProof: createExecuteProof(message, {
          requestId,
          nonce,
          payloadHash: tamperedPayloadHash,
          proof,
        }),
      }),
    );

    expect(response).toMatchObject({
      type: "error",
      reasonCode: "request.replay_prone",
    });
    expect(cloudChatExecutor.execute).not.toHaveBeenCalled();
  });

  it("routes cloud.chat.execute when request proof is valid", async () => {
    const cloudConnectionService = createCloudService();
    const cloudChatExecutor = createCloudChatExecutor();
    const sessionKeyRegistry = new SessionKeyRegistry({
      now: () => new Date("2026-03-25T00:05:00.000Z"),
    });
    issueSessionToken(sessionKeyRegistry);

    const handler = new BridgeHandler({
      signingKey,
      cloudConnectionService,
      cloudChatExecutor,
      cloudFeatureFlags: enabledCloudFlags,
      sessionKeyRegistry,
    });

    const message = createExecuteMessage({ timeoutMs: 3_210 });
    const response = await handler.handle(
      createExecuteMessage({
        timeoutMs: 3_210,
        handshakeSessionToken: sessionToken,
        requestProof: createExecuteProof(message),
      }),
    );

    expect(response).toMatchObject({
      type: "cloud.chat.result",
      correlationId: "corr.cloud.001",
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      modelId: "claude-sonnet-4-5",
      content: "Cloud response",
    });
    expect(cloudChatExecutor.execute).toHaveBeenCalledTimes(1);
    expect(cloudChatExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        timeoutMs: 3_210,
        streamRequested: false,
      }),
    );
  });

  it("forwards stream hint to cloud executor as streamRequested", async () => {
    const cloudConnectionService = createCloudService();
    const cloudChatExecutor = createCloudChatExecutor();
    const sessionKeyRegistry = new SessionKeyRegistry({
      now: () => new Date("2026-03-25T00:05:00.000Z"),
    });
    issueSessionToken(sessionKeyRegistry);

    const handler = new BridgeHandler({
      signingKey,
      cloudConnectionService,
      cloudChatExecutor,
      cloudFeatureFlags: enabledCloudFlags,
      sessionKeyRegistry,
    });

    const message = createExecuteMessage({
      timeoutMs: 3_210,
      stream: true,
    });
    const response = await handler.handle(
      createExecuteMessage({
        timeoutMs: 3_210,
        stream: true,
        handshakeSessionToken: sessionToken,
        requestProof: createExecuteProof(message),
      }),
    );

    expect(response).toMatchObject({
      type: "cloud.chat.result",
      correlationId: "corr.cloud.001",
    });
    expect(cloudChatExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        streamRequested: true,
      }),
    );
  });

  it("replays duplicate cloud.chat.execute without re-executing provider side effects", async () => {
    const cloudConnectionService = createCloudService();
    const cloudChatExecutor = createCloudChatExecutor();
    const sessionKeyRegistry = new SessionKeyRegistry({
      now: () => new Date("2026-03-25T00:05:00.000Z"),
    });
    issueSessionToken(sessionKeyRegistry);

    const handler = new BridgeHandler({
      signingKey,
      cloudConnectionService,
      cloudChatExecutor,
      cloudFeatureFlags: enabledCloudFlags,
      sessionKeyRegistry,
    });

    const sourceMessage = createExecuteMessage({ timeoutMs: 1_111 });
    const request = createExecuteMessage({
      timeoutMs: 1_111,
      handshakeSessionToken: sessionToken,
      requestProof: createExecuteProof(sourceMessage),
    });

    const first = await handler.handle(request);
    const second = await handler.handle(request);

    expect(first).toMatchObject({
      type: "cloud.chat.result",
      correlationId: "corr.cloud.001",
      content: "Cloud response",
    });
    expect(second).toEqual(first);
    expect(cloudChatExecutor.execute).toHaveBeenCalledTimes(1);
  });

  it("replays duplicate cloud.chat.execute when only correlationId differs", async () => {
    const cloudConnectionService = createCloudService();
    const cloudChatExecutor = createCloudChatExecutor();
    const sessionKeyRegistry = new SessionKeyRegistry({
      now: () => new Date("2026-03-25T00:05:00.000Z"),
    });
    issueSessionToken(sessionKeyRegistry);

    const handler = new BridgeHandler({
      signingKey,
      cloudConnectionService,
      cloudChatExecutor,
      cloudFeatureFlags: enabledCloudFlags,
      sessionKeyRegistry,
    });

    const firstSource = createExecuteMessage({ correlationId: "corr.cloud.exec.alpha" });
    const firstRequest = createExecuteMessage({
      correlationId: "corr.cloud.exec.alpha",
      handshakeSessionToken: sessionToken,
      requestProof: createExecuteProof(firstSource),
    });
    const secondSource = createExecuteMessage({ correlationId: "corr.cloud.exec.beta" });
    const secondRequest = createExecuteMessage({
      correlationId: "corr.cloud.exec.beta",
      handshakeSessionToken: sessionToken,
      requestProof: createExecuteProof(secondSource),
    });

    const first = await handler.handle(firstRequest);
    const second = await handler.handle(secondRequest);

    expect(first).toMatchObject({
      type: "cloud.chat.result",
      correlationId: "corr.cloud.001",
    });
    expect(second).toEqual(first);
    expect(cloudChatExecutor.execute).toHaveBeenCalledTimes(1);
  });

  it("fails closed when duplicate cloud.chat.execute reuses identity with mismatched payload", async () => {
    const cloudConnectionService = createCloudService();
    const cloudChatExecutor = createCloudChatExecutor();
    const sessionKeyRegistry = new SessionKeyRegistry({
      now: () => new Date("2026-03-25T00:05:00.000Z"),
    });
    issueSessionToken(sessionKeyRegistry);

    const handler = new BridgeHandler({
      signingKey,
      cloudConnectionService,
      cloudChatExecutor,
      cloudFeatureFlags: enabledCloudFlags,
      sessionKeyRegistry,
    });

    const firstSource = createExecuteMessage({
      messages: [{ role: "user", content: "hello" }],
    });
    const firstRequest = createExecuteMessage({
      messages: [{ role: "user", content: "hello" }],
      handshakeSessionToken: sessionToken,
      requestProof: createExecuteProof(firstSource),
    });
    await handler.handle(firstRequest);

    const secondSource = createExecuteMessage({
      messages: [{ role: "user", content: "different-payload" }],
    });
    const secondRequest = createExecuteMessage({
      messages: [{ role: "user", content: "different-payload" }],
      handshakeSessionToken: sessionToken,
      requestProof: createExecuteProof(secondSource),
    });
    const second = await handler.handle(secondRequest);

    expect(second).toMatchObject({
      type: "error",
      reasonCode: "request.replay_prone",
    });
    expect(cloudChatExecutor.execute).toHaveBeenCalledTimes(1);
  });

  it("replays duplicate cloud.connection.complete without re-running completion", async () => {
    const cloudConnectionService = createCloudService();
    const handler = new BridgeHandler({
      signingKey,
      cloudConnectionService,
      cloudFeatureFlags: enabledCloudFlags,
    });
    const token = await obtainSessionToken(handler);

    const request = {
      type: "cloud.connection.complete",
      sessionToken: token,
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      extensionId: "ext-1",
      origin: "https://app.example.com",
      policyVersion: "pol.v2",
      endpointProfileHash: "sha256:endpoint-profile",
      input: { apiKey: "test-a" },
    } as const;

    const first = await handler.handle(request);
    const second = await handler.handle(request);

    expect(first).toMatchObject({
      type: "cloud.connection.complete",
      connectionHandle: expect.stringContaining("connh.provider.claude"),
    });
    expect(second).toEqual(first);
    expect(cloudConnectionService.completeConnection).toHaveBeenCalledTimes(1);
  });

  it("replays duplicate cloud.connection.complete when only correlationId differs", async () => {
    const cloudConnectionService = createCloudService();
    const handler = new BridgeHandler({
      signingKey,
      cloudConnectionService,
      cloudFeatureFlags: enabledCloudFlags,
    });
    const token = await obtainSessionToken(handler);

    const firstRequest = {
      type: "cloud.connection.complete",
      sessionToken: token,
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      extensionId: "ext-1",
      origin: "https://app.example.com",
      policyVersion: "pol.v2",
      endpointProfileHash: "sha256:endpoint-profile",
      correlationId: "corr.complete.alpha",
      input: { apiKey: "test-a" },
    } as const;
    const secondRequest = {
      ...firstRequest,
      correlationId: "corr.complete.beta",
    } as const;

    const first = await handler.handle(firstRequest);
    const second = await handler.handle(secondRequest);

    expect(first).toMatchObject({
      type: "cloud.connection.complete",
      connectionHandle: expect.stringContaining("connh.provider.claude"),
    });
    expect(second).toEqual(first);
    expect(cloudConnectionService.completeConnection).toHaveBeenCalledTimes(1);
  });

  it("does not replay persisted cloud.connection.complete across shared-secret rotation", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "byom-bridge-idempotency-"));
    const stateFilePath = join(tempRoot, "request-idempotency-state.json");
    const firstSecret = Buffer.alloc(32, 7);
    const secondSecret = Buffer.alloc(32, 9);
    try {
      const cloudConnectionService = createCloudService();
      cloudConnectionService.completeConnection = vi
        .fn()
        .mockResolvedValueOnce({
          connectionHandle:
            "connh.provider.claude.anthropic.api_key.00000000-0000-4000-8000-0000000000a1.0.sig",
          providerId: "provider.claude",
          methodId: "anthropic.api_key",
          credentialRef: "cred.ref.001",
          endpointProfileHash: "sha256:endpoint-profile",
        })
        .mockResolvedValueOnce({
          connectionHandle:
            "connh.provider.claude.anthropic.api_key.00000000-0000-4000-8000-0000000000b2.0.sig",
          providerId: "provider.claude",
          methodId: "anthropic.api_key",
          credentialRef: "cred.ref.001",
          endpointProfileHash: "sha256:endpoint-profile",
        });

      const request = {
        type: "cloud.connection.complete",
        providerId: "provider.claude",
        methodId: "anthropic.api_key",
        extensionId: "ext-1",
        origin: "https://app.example.com",
        policyVersion: "pol.v2",
        endpointProfileHash: "sha256:endpoint-profile",
        input: { apiKey: "test-a" },
      } as const;

      const firstHandler = new BridgeHandler({
        signingKey: firstSecret,
        cloudConnectionService,
        cloudFeatureFlags: enabledCloudFlags,
        requestIdempotencyStore: new InMemoryRequestIdempotencyStore({
          stateFilePath,
        }),
      });
      const firstToken = await obtainSessionToken(firstHandler);
      const first = await firstHandler.handle({ ...request, sessionToken: firstToken });
      expect(first).toMatchObject({
        type: "cloud.connection.complete",
        connectionHandle:
          "connh.provider.claude.anthropic.api_key.00000000-0000-4000-8000-0000000000a1.0.sig",
      });

      const secondHandler = new BridgeHandler({
        signingKey: secondSecret,
        cloudConnectionService,
        cloudFeatureFlags: enabledCloudFlags,
        requestIdempotencyStore: new InMemoryRequestIdempotencyStore({
          stateFilePath,
        }),
      });
      const secondToken = await obtainSessionToken(secondHandler);
      const second = await secondHandler.handle({ ...request, sessionToken: secondToken });
      expect(second).toMatchObject({
        type: "cloud.connection.complete",
        connectionHandle:
          "connh.provider.claude.anthropic.api_key.00000000-0000-4000-8000-0000000000b2.0.sig",
      });
      expect(cloudConnectionService.completeConnection).toHaveBeenCalledTimes(2);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("fails closed when cloud.connection.complete identity is reused with mismatched payload", async () => {
    const cloudConnectionService = createCloudService();
    const handler = new BridgeHandler({
      signingKey,
      cloudConnectionService,
      cloudFeatureFlags: enabledCloudFlags,
    });
    const token = await obtainSessionToken(handler);

    const first = await handler.handle({
      type: "cloud.connection.complete",
      sessionToken: token,
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      extensionId: "ext-1",
      origin: "https://app.example.com",
      policyVersion: "pol.v2",
      endpointProfileHash: "sha256:endpoint-profile",
      input: { apiKey: "test-a" },
    });
    expect(first).toMatchObject({
      type: "cloud.connection.complete",
    });

    const second = await handler.handle({
      type: "cloud.connection.complete",
      sessionToken: token,
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      extensionId: "ext-1",
      origin: "https://app.example.com",
      policyVersion: "pol.v2",
      endpointProfileHash: "sha256:endpoint-profile",
      input: { apiKey: "test-b" },
    });

    expect(second).toMatchObject({
      type: "error",
      reasonCode: "request.replay_prone",
    });
    expect(cloudConnectionService.completeConnection).toHaveBeenCalledTimes(1);
  });

  it("rejects cloud.chat.execute for non-loopback origins when authenticated-origin allowlist is unset", async () => {
    const cloudConnectionService = createCloudService();
    const cloudChatExecutor = createCloudChatExecutor();
    const sessionKeyRegistry = new SessionKeyRegistry({
      now: () => new Date("2026-03-25T00:05:00.000Z"),
    });
    issueSessionToken(sessionKeyRegistry);

    const originPolicy = createAuthenticatedOriginPolicyFromEnv({});
    const handler = new BridgeHandler({
      signingKey,
      cloudConnectionService,
      cloudChatExecutor,
      cloudFeatureFlags: enabledCloudFlags,
      sessionKeyRegistry,
      requestVerifier: new RequestVerifier({
        sessionKeyResolver: (token) => sessionKeyRegistry.resolveRecord(token),
        authenticatedOrigins: originPolicy.authenticatedOrigins,
        authenticatedOriginMatcher: originPolicy.authenticatedOriginMatcher,
      }),
    });

    const message = createExecuteMessage();
    const response = await handler.handle(
      createExecuteMessage({
        handshakeSessionToken: sessionToken,
        requestProof: createExecuteProof(message),
      }),
    );

    expect(response).toMatchObject({
      type: "error",
      reasonCode: "auth.invalid",
    });
    expect(cloudChatExecutor.execute).not.toHaveBeenCalled();
  });

  it("allows cloud.chat.execute for explicitly configured non-loopback authenticated origins", async () => {
    const cloudConnectionService = createCloudService();
    const cloudChatExecutor = createCloudChatExecutor();
    const sessionKeyRegistry = new SessionKeyRegistry({
      now: () => new Date("2026-03-25T00:05:00.000Z"),
    });
    issueSessionToken(sessionKeyRegistry);

    const originPolicy = createAuthenticatedOriginPolicyFromEnv({
      BYOM_BRIDGE_AUTHENTICATED_ORIGINS: "https://app.example.com",
    });
    const handler = new BridgeHandler({
      signingKey,
      cloudConnectionService,
      cloudChatExecutor,
      cloudFeatureFlags: enabledCloudFlags,
      sessionKeyRegistry,
      requestVerifier: new RequestVerifier({
        sessionKeyResolver: (token) => sessionKeyRegistry.resolveRecord(token),
        authenticatedOrigins: originPolicy.authenticatedOrigins,
        authenticatedOriginMatcher: originPolicy.authenticatedOriginMatcher,
      }),
    });

    const message = createExecuteMessage();
    const response = await handler.handle(
      createExecuteMessage({
        handshakeSessionToken: sessionToken,
        requestProof: createExecuteProof(message),
      }),
    );

    expect(response).toMatchObject({
      type: "cloud.chat.result",
      correlationId: "corr.cloud.001",
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      modelId: "claude-sonnet-4-5",
      content: "Cloud response",
    });
    expect(cloudChatExecutor.execute).toHaveBeenCalledTimes(1);
  });

  it("maps cloud executor cancellation to transport.cancelled", async () => {
    const cloudConnectionService = createCloudService();
    const cloudChatExecutor = createCloudChatExecutor();
    cloudChatExecutor.execute.mockRejectedValueOnce(
      Object.assign(new Error("client disconnected"), {
        reasonCode: "transport.cancelled",
      }),
    );
    const sessionKeyRegistry = new SessionKeyRegistry({
      now: () => new Date("2026-03-25T00:05:00.000Z"),
    });
    issueSessionToken(sessionKeyRegistry);

    const handler = new BridgeHandler({
      signingKey,
      cloudConnectionService,
      cloudChatExecutor,
      cloudFeatureFlags: enabledCloudFlags,
      sessionKeyRegistry,
    });

    const message = createExecuteMessage();
    const response = await handler.handle(
      createExecuteMessage({
        handshakeSessionToken: sessionToken,
        requestProof: createExecuteProof(message),
      }),
    );

    expect(response).toMatchObject({
      type: "error",
      reasonCode: "transport.cancelled",
    });
  });

  it("maps cloud executor timeout to transport.timeout", async () => {
    const cloudConnectionService = createCloudService();
    const cloudChatExecutor = createCloudChatExecutor();
    cloudChatExecutor.execute.mockRejectedValueOnce(
      Object.assign(new Error("execution exceeded timeout"), {
        reasonCode: "transport.timeout",
      }),
    );
    const sessionKeyRegistry = new SessionKeyRegistry({
      now: () => new Date("2026-03-25T00:05:00.000Z"),
    });
    issueSessionToken(sessionKeyRegistry);

    const handler = new BridgeHandler({
      signingKey,
      cloudConnectionService,
      cloudChatExecutor,
      cloudFeatureFlags: enabledCloudFlags,
      sessionKeyRegistry,
    });

    const message = createExecuteMessage();
    const response = await handler.handle(
      createExecuteMessage({
        handshakeSessionToken: sessionToken,
        requestProof: createExecuteProof(message),
      }),
    );

    expect(response).toMatchObject({
      type: "error",
      reasonCode: "transport.timeout",
    });
  });

  it("maps unclassified cloud executor failures to transport.transient_failure", async () => {
    const cloudConnectionService = createCloudService();
    const cloudChatExecutor = createCloudChatExecutor();
    cloudChatExecutor.execute.mockRejectedValueOnce(
      new Error("adapter pipe broke"),
    );
    const sessionKeyRegistry = new SessionKeyRegistry({
      now: () => new Date("2026-03-25T00:05:00.000Z"),
    });
    issueSessionToken(sessionKeyRegistry);

    const handler = new BridgeHandler({
      signingKey,
      cloudConnectionService,
      cloudChatExecutor,
      cloudFeatureFlags: enabledCloudFlags,
      sessionKeyRegistry,
    });

    const message = createExecuteMessage();
    const response = await handler.handle(
      createExecuteMessage({
        handshakeSessionToken: sessionToken,
        requestProof: createExecuteProof(message),
      }),
    );

    expect(response).toMatchObject({
      type: "error",
      reasonCode: "transport.transient_failure",
    });
  });

  it("forwards cloud execute timeout and signal to executor", async () => {
    const cloudConnectionService = createCloudService();
    const cloudChatExecutor = createCloudChatExecutor();
    const sessionKeyRegistry = new SessionKeyRegistry({
      now: () => new Date("2026-03-25T00:05:00.000Z"),
    });
    issueSessionToken(sessionKeyRegistry);

    const handler = new BridgeHandler({
      signingKey,
      cloudConnectionService,
      cloudChatExecutor,
      cloudFeatureFlags: enabledCloudFlags,
      sessionKeyRegistry,
    });
    const upstreamAbort = new AbortController();
    const message = createExecuteMessage({
      timeoutMs: 4_321,
      signal: upstreamAbort.signal,
    });
    const response = await handler.handle(
      createExecuteMessage({
        timeoutMs: 4_321,
        signal: upstreamAbort.signal,
        handshakeSessionToken: sessionToken,
        requestProof: createExecuteProof(message),
      }),
    );

    expect(response).toMatchObject({
      type: "cloud.chat.result",
      correlationId: "corr.cloud.001",
    });
    expect(cloudChatExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        timeoutMs: 4_321,
        signal: upstreamAbort.signal,
      }),
    );
  });
});
