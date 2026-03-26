import { describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DiscoveryRefreshScheduler } from "../cloud/discovery-refresh-scheduler.js";
import {
  CloudConnectionService,
  type CloudConnectionPersistenceFailure,
  type CloudControlPlaneAdapter,
} from "../cloud/cloud-connection-service.js";
import { ConnectionRegistry } from "../cloud/connection-registry.js";

function createAdapter(): CloudControlPlaneAdapter {
  return {
    beginConnection: vi.fn(async () => ({
      challenge: { flow: "api-key" },
    })),
    completeConnection: vi.fn(async () => ({
      credentialRef: "cred.ref.001",
      endpointProfile: { region: "us-east-1" },
      endpointProfileHash: "sha256:endpoint-profile",
      models: [{ id: "claude-sonnet-4-5" }],
      capabilities: ["chat.completions"],
    })),
    validateConnection: vi.fn(async () => ({
      ok: true,
    })),
    revokeConnection: vi.fn(async () => {}),
    discover: vi.fn(async () => ({
      models: [{ id: "claude-sonnet-4-5" }],
      capabilities: ["chat.completions", "chat.stream"],
    })),
    executeChat: vi.fn(async () => ({
      content: "ok",
    })),
  };
}

function createConnectionRegistry(): ConnectionRegistry {
  return new ConnectionRegistry({
    signatureKey: Buffer.alloc(32, 9),
  });
}

function createBindingContext(): Readonly<{
  extensionId: string;
  origin: string;
  policyVersion: string;
  endpointProfileHash: string;
}> {
  return {
    extensionId: "ext.runtime.transport",
    origin: "https://app.example.com",
    policyVersion: "policy.unknown",
    endpointProfileHash: "sha256:endpoint-profile",
  };
}

describe("CloudConnectionService", () => {
  it("uses hot-cache TTL=5m and negative-cache TTL=60s for discovery", async () => {
    const adapter = createAdapter();
    const service = new CloudConnectionService({
      adaptersByProvider: {
        "provider.claude": adapter,
      },
      connectionRegistry: createConnectionRegistry(),
    });

    const first = await service.discover({ providerId: "provider.claude", refresh: true });
    const second = await service.discover({ providerId: "provider.claude" });

    expect(first.cacheStatus).toBe("refreshed");
    expect(second.cacheStatus).toBe("hot");
    expect(first.models.length).toBeGreaterThan(0);
    expect(adapter.discover).toHaveBeenCalledTimes(1);
  });

  it("invalidates discovery cache on revoke, policy change, and repeated provider.unavailable", async () => {
    const adapter = createAdapter();
    const service = new CloudConnectionService({
      adaptersByProvider: {
        "provider.claude": adapter,
      },
      connectionRegistry: createConnectionRegistry(),
    });

    await service.discover({ providerId: "provider.claude", refresh: true });
    await service.onCredentialRevoked({ providerId: "provider.claude" });
    await service.onPolicyVersionChanged("pol.v3");
    await service.onProviderUnavailableThreshold({
      providerId: "provider.claude",
      failures: 3,
    });

    expect(service.getDiscoveryCacheState("provider.claude")).toBe("stale");
  });

  it("clears hot discovery cache after completeConnection so saved providers use fresh live models", async () => {
    const adapter = createAdapter();
    const service = new CloudConnectionService({
      adaptersByProvider: {
        "provider.claude": adapter,
      },
      connectionRegistry: createConnectionRegistry(),
    });

    const initial = await service.discover({ providerId: "provider.claude", refresh: true });
    expect(initial.models).toEqual([{ id: "claude-sonnet-4-5" }]);
    expect(adapter.discover).toHaveBeenCalledTimes(1);

    vi.mocked(adapter.discover).mockResolvedValueOnce({
      models: [{ id: "claude-opus-4-5" }],
      capabilities: ["chat.completions", "chat.stream"],
    });
    const bindingContext = createBindingContext();
    await service.completeConnection({
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      extensionId: bindingContext.extensionId,
      origin: bindingContext.origin,
      policyVersion: bindingContext.policyVersion,
      endpointProfileHash: bindingContext.endpointProfileHash,
    });

    const discoveredAfterReconnect = await service.discover({ providerId: "provider.claude" });
    expect(discoveredAfterReconnect.models).toEqual([{ id: "claude-opus-4-5" }]);
    expect(adapter.discover).toHaveBeenCalledTimes(2);
  });

  it("schedules background discovery refresh and triggers on connect/reconnect", async () => {
    const adapter = createAdapter();
    const onRefresh = vi.fn(async (providerId: string) => {
      await service.discover({ providerId, refresh: true });
    });
    const scheduler = new DiscoveryRefreshScheduler({
      onRefresh,
      now: () => new Date("2026-03-24T00:00:00.000Z"),
    });
    const service = new CloudConnectionService({
      adaptersByProvider: {
        "provider.claude": adapter,
      },
      scheduler,
      connectionRegistry: createConnectionRegistry(),
    });

    scheduler.start({ intervalMs: 300_000 });
    await service.onConnectionCompleted({ providerId: "provider.claude" });
    await service.onReconnected({ providerId: "provider.claude" });

    expect(scheduler.nextRunAt("provider.claude")).toBeDefined();
    expect(onRefresh).toHaveBeenCalledWith("provider.claude", "connection.completed");
    expect(onRefresh).toHaveBeenCalledWith("provider.claude", "connection.reconnected");
    scheduler.stop();
  });

  it("exposes discovery diagnostics counters through service API", async () => {
    let nowMs = 0;
    const adapter = createAdapter();
    const service = new CloudConnectionService({
      adaptersByProvider: {
        "provider.claude": adapter,
      },
      connectionRegistry: createConnectionRegistry(),
      hotTtlMs: 5,
      now: () => new Date(nowMs),
    });

    await service.discover({ providerId: "provider.claude", refresh: true });
    await service.discover({ providerId: "provider.claude" });
    nowMs += 6;
    await service.discover({ providerId: "provider.claude" });
    nowMs += 6;
    vi.mocked(adapter.discover).mockRejectedValueOnce(
      Object.assign(new Error("down"), { reasonCode: "provider.unavailable" }),
    );
    await expect(
      service.discover({ providerId: "provider.claude", refresh: true }),
    ).rejects.toMatchObject({
      reasonCode: "provider.unavailable",
    });

    const diagnostics = service.getDiscoveryDiagnostics();
    expect(diagnostics.cache.reads).toMatchObject({
      total: 4,
      hit: 1,
      miss: 1,
      stale: 2,
    });
    expect(diagnostics.cache.refresh).toMatchObject({
      success: 2,
      negative: 1,
    });
    expect(diagnostics.scheduler.refresh.outcomes.failure).toBe(0);
  });

  it("forces fresh discovery when user triggers manual refresh models action", async () => {
    const adapter = createAdapter();
    const service = new CloudConnectionService({
      adaptersByProvider: {
        "provider.claude": adapter,
      },
      connectionRegistry: createConnectionRegistry(),
    });

    await service.discover({ providerId: "provider.claude" }); // prime
    const refreshed = await service.discover({
      providerId: "provider.claude",
      refresh: true,
    });

    expect(refreshed.cacheStatus).toBe("refreshed");
    expect(adapter.discover).toHaveBeenCalledTimes(2);
  });

  it("fails closed with policy.denied when discovery fan-out endpoint is not declared in egress rules", async () => {
    const adapter = createAdapter();
    const service = new CloudConnectionService({
      adaptersByProvider: {
        "provider.claude": adapter,
      },
      allowedDiscoveryEgress: {
        "provider.claude": {
          "anthropic.api_key": [{ host: "api.anthropic.com", protocol: "https" }],
        },
      },
      connectionRegistry: createConnectionRegistry(),
    });

    await expect(
      service.discover({
        providerId: "provider.claude",
        methodId: "anthropic.api_key",
        endpointOverride: "https://undeclared.example.com",
      }),
    ).rejects.toMatchObject({ reasonCode: "policy.denied" });
  });

  it("persists connection-handle epoch state across service instances", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "byom-cloud-conn-state-"));
    const stateFilePath = join(tempRoot, "cloud-connection-state.json");
    try {
      const adapterOne = createAdapter();
      const serviceOne = new CloudConnectionService({
        adaptersByProvider: {
          "provider.claude": adapterOne,
        },
        connectionRegistry: createConnectionRegistry(),
        stateFilePath,
      });
      const bindingContext = createBindingContext();
      const completed = await serviceOne.completeConnection({
        providerId: "provider.claude",
        methodId: "anthropic.api_key",
        extensionId: bindingContext.extensionId,
        origin: bindingContext.origin,
        policyVersion: bindingContext.policyVersion,
        endpointProfileHash: bindingContext.endpointProfileHash,
      });

      const adapterTwo = createAdapter();
      const serviceTwo = new CloudConnectionService({
        adaptersByProvider: {
          "provider.claude": adapterTwo,
        },
        connectionRegistry: createConnectionRegistry(),
        stateFilePath,
      });
      const epoch = await serviceTwo.getCredentialEpoch({
        providerId: "provider.claude",
        methodId: "anthropic.api_key",
        connectionHandle: completed.connectionHandle,
        region: "global",
        extensionId: bindingContext.extensionId,
        origin: bindingContext.origin,
        policyVersion: bindingContext.policyVersion,
        endpointProfileHash: bindingContext.endpointProfileHash,
      });
      expect(epoch).toBe(0);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("surfaces corrupted persisted state and continues live operation in-memory", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "byom-cloud-conn-state-"));
    const stateFilePath = join(tempRoot, "cloud-connection-state.json");
    writeFileSync(stateFilePath, "{invalid-json", { encoding: "utf8" });
    const persistenceFailures: CloudConnectionPersistenceFailure[] = [];
    try {
      const adapter = createAdapter();
      const connectionRegistry = createConnectionRegistry();
      const service = new CloudConnectionService({
        adaptersByProvider: {
          "provider.claude": adapter,
        },
        connectionRegistry,
        stateFilePath,
        onPersistenceFailure: (failure) => {
          persistenceFailures.push(failure);
        },
      });
      const diagnostics = service.getPersistenceDiagnostics();
      expect(diagnostics.enabled).toBe(true);
      expect(diagnostics.loadStatus).toBe("failed");
      expect(diagnostics.failureCount).toBeGreaterThan(0);
      expect(diagnostics.lastFailure?.phase).toBe("load");
      expect(persistenceFailures.some((failure) => failure.phase === "load")).toBe(true);

      const bindingContext = createBindingContext();
      const completed = await service.completeConnection({
        providerId: "provider.claude",
        methodId: "anthropic.api_key",
        extensionId: bindingContext.extensionId,
        origin: bindingContext.origin,
        policyVersion: bindingContext.policyVersion,
        endpointProfileHash: bindingContext.endpointProfileHash,
      });

      await expect(
        service.getCredentialEpoch({
          providerId: "provider.claude",
          methodId: "anthropic.api_key",
          connectionHandle: completed.connectionHandle,
          region: "global",
          extensionId: bindingContext.extensionId,
          origin: bindingContext.origin,
          policyVersion: bindingContext.policyVersion,
          endpointProfileHash: bindingContext.endpointProfileHash,
        }),
      ).resolves.toBe(0);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("recovers epoch state from temp file when primary state file is missing", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "byom-cloud-conn-state-"));
    const stateFilePath = join(tempRoot, "cloud-connection-state.json");
    const tempStateFilePath = `${stateFilePath}.tmp`;
    try {
      const bindingContext = createBindingContext();
      const connectionRegistry = createConnectionRegistry();

      const serviceOne = new CloudConnectionService({
        adaptersByProvider: {
          "provider.claude": createAdapter(),
        },
        connectionRegistry,
        stateFilePath,
      });
      const completed = await serviceOne.completeConnection({
        providerId: "provider.claude",
        methodId: "anthropic.api_key",
        extensionId: bindingContext.extensionId,
        origin: bindingContext.origin,
        policyVersion: bindingContext.policyVersion,
        endpointProfileHash: bindingContext.endpointProfileHash,
      });
      const persistedState = readFileSync(stateFilePath, "utf8");
      rmSync(stateFilePath, { force: true });
      writeFileSync(tempStateFilePath, persistedState, { encoding: "utf8" });

      const serviceTwo = new CloudConnectionService({
        adaptersByProvider: {
          "provider.claude": createAdapter(),
        },
        connectionRegistry,
        stateFilePath,
      });

      await expect(
        serviceTwo.getCredentialEpoch({
          providerId: "provider.claude",
          methodId: "anthropic.api_key",
          connectionHandle: completed.connectionHandle,
          region: "global",
          extensionId: bindingContext.extensionId,
          origin: bindingContext.origin,
          policyVersion: bindingContext.policyVersion,
          endpointProfileHash: bindingContext.endpointProfileHash,
        }),
      ).resolves.toBe(0);
      expect(existsSync(stateFilePath)).toBe(true);
      expect(existsSync(tempStateFilePath)).toBe(false);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("rehydrates connection input for stateless execute across service instances", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "byom-cloud-conn-state-"));
    const stateFilePath = join(tempRoot, "cloud-connection-state.json");
    try {
      const bindingContext = createBindingContext();
      const adapterOne = createAdapter();
      const serviceOne = new CloudConnectionService({
        adaptersByProvider: {
          "provider.claude": adapterOne,
        },
        connectionRegistry: createConnectionRegistry(),
        stateFilePath,
      });
      const completed = await serviceOne.completeConnection({
        providerId: "provider.claude",
        methodId: "anthropic.api_key",
        extensionId: bindingContext.extensionId,
        origin: bindingContext.origin,
        policyVersion: bindingContext.policyVersion,
        endpointProfileHash: bindingContext.endpointProfileHash,
        input: {
          apiKey: "sk-live",
          endpointProfile: { baseUrl: "https://api.anthropic.com" },
        },
      });

      const adapterTwo = createAdapter();
      const serviceTwo = new CloudConnectionService({
        adaptersByProvider: {
          "provider.claude": adapterTwo,
        },
        connectionRegistry: createConnectionRegistry(),
        stateFilePath,
      });

      await expect(
        serviceTwo.executeChat({
          providerId: "provider.claude",
          methodId: "anthropic.api_key",
          modelId: "claude-sonnet-4-5",
          connectionHandle: completed.connectionHandle,
          messages: [{ role: "user", content: "hello" }],
          extensionId: bindingContext.extensionId,
          origin: bindingContext.origin,
          policyVersion: bindingContext.policyVersion,
          endpointProfileHash: bindingContext.endpointProfileHash,
        }),
      ).resolves.toEqual({
        content: "ok",
      });

      expect(adapterTwo.executeChat).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionInput: expect.objectContaining({
            apiKey: "sk-live",
          }),
        }),
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("fails closed for legacy persisted connection records missing credentialRef", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "byom-cloud-conn-state-"));
    const stateFilePath = join(tempRoot, "cloud-connection-state.json");
    try {
      const bindingContext = createBindingContext();
      const connectionHandle =
        "connh.provider.claude.anthropic.api_key.00000000-0000-4000-8000-000000000111.0.sig";
      writeFileSync(
        stateFilePath,
        JSON.stringify({
          version: 1,
          connectionEpochRecords: [
            {
              connectionHandle,
              providerId: "provider.claude",
              methodId: "anthropic.api_key",
              epoch: 0,
              extensionId: bindingContext.extensionId,
              origin: bindingContext.origin,
              policyVersion: bindingContext.policyVersion,
              endpointProfileHash: bindingContext.endpointProfileHash,
            },
          ],
        }),
        { encoding: "utf8" },
      );

      const service = new CloudConnectionService({
        adaptersByProvider: {
          "provider.claude": createAdapter(),
        },
        connectionRegistry: createConnectionRegistry(),
        stateFilePath,
      });

      await expect(
        service.getCredentialEpoch({
          providerId: "provider.claude",
          methodId: "anthropic.api_key",
          connectionHandle,
          region: "global",
          extensionId: bindingContext.extensionId,
          origin: bindingContext.origin,
          policyVersion: bindingContext.policyVersion,
          endpointProfileHash: bindingContext.endpointProfileHash,
        }),
      ).rejects.toMatchObject({
        reasonCode: "auth.expired",
      });
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("tracks persistence lock contention failures without breaking live flow", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "byom-cloud-conn-state-"));
    const stateFilePath = join(tempRoot, "cloud-connection-state.json");
    const lockFilePath = `${stateFilePath}.lock`;
    writeFileSync(lockFilePath, "busy", { encoding: "utf8" });
    const persistenceFailures: CloudConnectionPersistenceFailure[] = [];
    try {
      const service = new CloudConnectionService({
        adaptersByProvider: {
          "provider.claude": createAdapter(),
        },
        connectionRegistry: createConnectionRegistry(),
        stateFilePath,
        onPersistenceFailure: (failure) => {
          persistenceFailures.push(failure);
        },
      });

      const bindingContext = createBindingContext();
      const completed = await service.completeConnection({
        providerId: "provider.claude",
        methodId: "anthropic.api_key",
        extensionId: bindingContext.extensionId,
        origin: bindingContext.origin,
        policyVersion: bindingContext.policyVersion,
        endpointProfileHash: bindingContext.endpointProfileHash,
      });

      await expect(
        service.getCredentialEpoch({
          providerId: "provider.claude",
          methodId: "anthropic.api_key",
          connectionHandle: completed.connectionHandle,
          region: "global",
          extensionId: bindingContext.extensionId,
          origin: bindingContext.origin,
          policyVersion: bindingContext.policyVersion,
          endpointProfileHash: bindingContext.endpointProfileHash,
        }),
      ).resolves.toBe(0);

      const diagnostics = service.getPersistenceDiagnostics();
      expect(diagnostics.persistStatus).toBe("failed");
      expect(diagnostics.failureCount).toBeGreaterThan(0);
      expect(diagnostics.lastFailure?.phase).toBe("persist");
      expect(persistenceFailures.some((failure) => failure.phase === "persist")).toBe(true);
      expect(existsSync(stateFilePath)).toBe(false);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("requires extension/origin and infers binding metadata when validating a connection handle", async () => {
    const adapter = createAdapter();
    const service = new CloudConnectionService({
      adaptersByProvider: {
        "provider.claude": adapter,
      },
      connectionRegistry: createConnectionRegistry(),
    });
    const bindingContext = createBindingContext();
    const completed = await service.completeConnection({
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      extensionId: bindingContext.extensionId,
      origin: bindingContext.origin,
      policyVersion: bindingContext.policyVersion,
      endpointProfileHash: bindingContext.endpointProfileHash,
    });

    await expect(
      service.validateConnection({
        providerId: "provider.claude",
        methodId: "anthropic.api_key",
        connectionHandle: completed.connectionHandle,
      }),
    ).rejects.toMatchObject({
      reasonCode: "request.invalid",
    });

    await expect(
      service.validateConnection({
        providerId: "provider.claude",
        methodId: "anthropic.api_key",
        connectionHandle: completed.connectionHandle,
        extensionId: bindingContext.extensionId,
        origin: bindingContext.origin,
      }),
    ).resolves.toMatchObject({
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      valid: true,
      policyVersion: bindingContext.policyVersion,
      endpointProfileHash: bindingContext.endpointProfileHash,
    });
  });

  it("hydrates adapter discovery input from connection handle epoch when adapter runtime state is cold", async () => {
    const adapter = createAdapter();
    const service = new CloudConnectionService({
      adaptersByProvider: {
        "provider.claude": adapter,
      },
      connectionRegistry: createConnectionRegistry(),
    });
    const bindingContext = createBindingContext();
    const completed = await service.completeConnection({
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      extensionId: bindingContext.extensionId,
      origin: bindingContext.origin,
      policyVersion: bindingContext.policyVersion,
      endpointProfileHash: bindingContext.endpointProfileHash,
    });

    await service.discoverModels({
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      connectionHandle: completed.connectionHandle,
      extensionId: bindingContext.extensionId,
      origin: bindingContext.origin,
      policyVersion: bindingContext.policyVersion,
      endpointProfileHash: bindingContext.endpointProfileHash,
      refresh: true,
    });

    expect(adapter.discover).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "provider.claude",
        methodId: "anthropic.api_key",
        connectionHandle: completed.connectionHandle,
        credentialRef: "cred.ref.001",
      }),
    );
  });

  it("fails closed when credential-epoch lookup omits policy binding metadata", async () => {
    const adapter = createAdapter();
    const service = new CloudConnectionService({
      adaptersByProvider: {
        "provider.claude": adapter,
      },
      connectionRegistry: createConnectionRegistry(),
    });
    const bindingContext = createBindingContext();
    const completed = await service.completeConnection({
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      extensionId: bindingContext.extensionId,
      origin: bindingContext.origin,
      policyVersion: bindingContext.policyVersion,
      endpointProfileHash: bindingContext.endpointProfileHash,
    });

    await expect(
      service.getCredentialEpoch({
        providerId: "provider.claude",
        methodId: "anthropic.api_key",
        connectionHandle: completed.connectionHandle,
        region: "global",
        extensionId: bindingContext.extensionId,
        origin: bindingContext.origin,
      } as unknown as Parameters<CloudConnectionService["getCredentialEpoch"]>[0]),
    ).rejects.toMatchObject({
      reasonCode: "request.invalid",
    });
  });

  it("fails closed when executeChat omits policy binding metadata", async () => {
    const adapter = createAdapter();
    const service = new CloudConnectionService({
      adaptersByProvider: {
        "provider.claude": adapter,
      },
      connectionRegistry: createConnectionRegistry(),
    });
    const bindingContext = createBindingContext();
    const completed = await service.completeConnection({
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      extensionId: bindingContext.extensionId,
      origin: bindingContext.origin,
      policyVersion: bindingContext.policyVersion,
      endpointProfileHash: bindingContext.endpointProfileHash,
    });

    await expect(
      service.executeChat({
        providerId: "provider.claude",
        methodId: "anthropic.api_key",
        modelId: "claude-sonnet-4-5",
        connectionHandle: completed.connectionHandle,
        extensionId: bindingContext.extensionId,
        origin: bindingContext.origin,
        messages: [{ role: "user", content: "hello" }],
      } as unknown as Parameters<CloudConnectionService["executeChat"]>[0]),
    ).rejects.toMatchObject({
      reasonCode: "request.invalid",
    });
  });

  it("forwards execute timeout and signal to cloud adapter execution", async () => {
    const adapter = createAdapter();
    const service = new CloudConnectionService({
      adaptersByProvider: {
        "provider.claude": adapter,
      },
      connectionRegistry: createConnectionRegistry(),
    });

    const bindingContext = createBindingContext();
    const completed = await service.completeConnection({
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      extensionId: bindingContext.extensionId,
      origin: bindingContext.origin,
      policyVersion: bindingContext.policyVersion,
      endpointProfileHash: bindingContext.endpointProfileHash,
    });
    const controller = new AbortController();

    await expect(
      service.executeChat({
        providerId: "provider.claude",
        methodId: "anthropic.api_key",
        modelId: "claude-sonnet-4-5",
        connectionHandle: completed.connectionHandle,
        extensionId: bindingContext.extensionId,
        origin: bindingContext.origin,
        policyVersion: bindingContext.policyVersion,
        endpointProfileHash: bindingContext.endpointProfileHash,
        messages: [{ role: "user", content: "hello" }],
        timeoutMs: 2_500,
        signal: controller.signal,
      }),
    ).resolves.toEqual({ content: "ok" });

    const executeChatMock = vi.mocked(adapter.executeChat);
    const executeCall = executeChatMock.mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(executeCall?.["timeoutMs"]).toBe(2_500);
    expect(executeCall?.["signal"]).toBe(controller.signal);
  });

  it("preserves adapter transport.cancelled classification", async () => {
    const adapter = createAdapter();
    const executeChatMock = vi.mocked(adapter.executeChat);
    executeChatMock.mockImplementationOnce(async () => {
      throw Object.assign(new Error("request was cancelled"), {
        reasonCode: "transport.cancelled",
      });
    });
    const service = new CloudConnectionService({
      adaptersByProvider: {
        "provider.claude": adapter,
      },
      connectionRegistry: createConnectionRegistry(),
    });
    const bindingContext = createBindingContext();
    const completed = await service.completeConnection({
      providerId: "provider.claude",
      methodId: "anthropic.api_key",
      extensionId: bindingContext.extensionId,
      origin: bindingContext.origin,
      policyVersion: bindingContext.policyVersion,
      endpointProfileHash: bindingContext.endpointProfileHash,
    });

    await expect(
      service.executeChat({
        providerId: "provider.claude",
        methodId: "anthropic.api_key",
        modelId: "claude-sonnet-4-5",
        connectionHandle: completed.connectionHandle,
        extensionId: bindingContext.extensionId,
        origin: bindingContext.origin,
        policyVersion: bindingContext.policyVersion,
        endpointProfileHash: bindingContext.endpointProfileHash,
        messages: [{ role: "user", content: "hello" }],
      }),
    ).rejects.toMatchObject({
      reasonCode: "transport.cancelled",
    });
  });
});
