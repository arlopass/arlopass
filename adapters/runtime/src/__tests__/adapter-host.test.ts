import { describe, expect, it } from "vitest";

import {
  ADAPTER_STATE,
  AdapterHost,
  AdapterHostError,
  RUNTIME_ERROR_CODES,
  type AdapterContract,
  type AdapterManifest,
  type LoadedAdapter,
} from "../index.js";

function validManifest(overrides: Partial<AdapterManifest> = {}): AdapterManifest {
  return Object.freeze({
    schemaVersion: "1.0.0",
    providerId: "test-provider",
    version: "1.0.0",
    displayName: "Test Provider",
    authType: "none" as const,
    capabilities: ["chat.completions"] as const,
    requiredPermissions: ["network.egress"],
    egressRules: [{ host: "api.example.com", protocol: "https" as const }],
    riskLevel: "low" as const,
    signingKeyId: "key.adapter.primary",
    ...overrides,
  });
}

function makeAdapterContract(
  manifest: AdapterManifest,
  overrides: Partial<{
    healthCheckResult: boolean;
    healthCheckDelay: number;
    shutdownFails: boolean;
  }> = {},
): AdapterContract {
  const healthResult = overrides.healthCheckResult ?? true;
  const delay = overrides.healthCheckDelay ?? 0;
  return {
    manifest,
    describeCapabilities: () => manifest.capabilities,
    listModels: async () => ["model-1"],
    createSession: async () => "session-1",
    sendMessage: async () => "response",
    streamMessage: async (_sid, _msg, onChunk) => {
      onChunk("chunk1");
      onChunk("chunk2");
    },
    healthCheck: async () => {
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      return healthResult;
    },
    shutdown: async () => {
      if (overrides.shutdownFails === true) throw new Error("Shutdown failed");
    },
  };
}

function makeLoadedAdapter(
  manifest: AdapterManifest,
  contractOverrides: Partial<{
    healthCheckResult: boolean;
    healthCheckDelay: number;
    shutdownFails: boolean;
  }> = {},
): LoadedAdapter {
  return Object.freeze({
    providerId: manifest.providerId,
    manifest,
    contract: makeAdapterContract(manifest, contractOverrides),
  });
}

describe("AdapterHost lifecycle", () => {
  it("starts and shuts down cleanly", async () => {
    const host = new AdapterHost({ healthCheckIntervalMs: 0 });
    expect(host.isStarted).toBe(false);
    await host.start();
    expect(host.isStarted).toBe(true);
    await host.shutdown();
    expect(host.isStarted).toBe(false);
  });

  it("throws if started twice", async () => {
    const host = new AdapterHost({ healthCheckIntervalMs: 0 });
    await host.start();
    try {
      await host.start();
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AdapterHostError);
      if (error instanceof AdapterHostError) {
        expect(error.code).toBe(RUNTIME_ERROR_CODES.HOST_ALREADY_STARTED);
      }
    }
    await host.shutdown();
  });

  it("throws if shut-down host is started again", async () => {
    const host = new AdapterHost({ healthCheckIntervalMs: 0 });
    await host.start();
    await host.shutdown();
    try {
      await host.start();
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AdapterHostError);
      if (error instanceof AdapterHostError) {
        expect(error.code).toBe(RUNTIME_ERROR_CODES.HOST_SHUTDOWN);
      }
    }
  });

  it("multiple shutdowns are idempotent", async () => {
    const host = new AdapterHost({ healthCheckIntervalMs: 0 });
    await host.start();
    await expect(host.shutdown()).resolves.toBeUndefined();
    await expect(host.shutdown()).resolves.toBeUndefined();
  });
});

describe("AdapterHost.registerAdapter", () => {
  it("registers and activates an adapter", async () => {
    const host = new AdapterHost({ healthCheckIntervalMs: 0 });
    await host.start();
    const manifest = validManifest();
    await host.registerAdapter(makeLoadedAdapter(manifest));
    const health = host.getAdapterHealth("test-provider");
    expect(health.state).toBe(ADAPTER_STATE.RUNNING);
    expect(health.providerId).toBe("test-provider");
    expect(health.restartCount).toBe(0);
    await host.shutdown();
  });

  it("reports degraded state when adapter health check fails on load", async () => {
    const host = new AdapterHost({ healthCheckIntervalMs: 0 });
    await host.start();
    const manifest = validManifest();
    await host.registerAdapter(makeLoadedAdapter(manifest, { healthCheckResult: false }));
    const health = host.getAdapterHealth("test-provider");
    expect(health.state).toBe(ADAPTER_STATE.DEGRADED);
    await host.shutdown();
  });

  it("reports failed state when health check throws on load", async () => {
    const manifest = validManifest();
    const loaded: LoadedAdapter = Object.freeze({
      providerId: manifest.providerId,
      manifest,
      contract: {
        ...makeAdapterContract(manifest),
        healthCheck: async () => {
          throw new Error("Health check failed");
        },
      },
    });
    const host = new AdapterHost({ healthCheckIntervalMs: 0 });
    await host.start();
    await host.registerAdapter(loaded);
    const health = host.getAdapterHealth("test-provider");
    expect(health.state).toBe(ADAPTER_STATE.FAILED);
    expect(health.error).toBe("Health check failed");
    await host.shutdown();
  });

  it("rejects registerAdapter before start", async () => {
    const host = new AdapterHost({ healthCheckIntervalMs: 0 });
    await expect(host.registerAdapter(makeLoadedAdapter(validManifest()))).rejects.toThrow(
      AdapterHostError,
    );
  });

  it("rejects registering duplicate active adapter", async () => {
    const host = new AdapterHost({ healthCheckIntervalMs: 0 });
    await host.start();
    const loaded = makeLoadedAdapter(validManifest());
    await host.registerAdapter(loaded);
    try {
      await host.registerAdapter(loaded);
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AdapterHostError);
      if (error instanceof AdapterHostError) {
        expect(error.code).toBe(RUNTIME_ERROR_CODES.HOST_ALREADY_STARTED);
      }
    }
    await host.shutdown();
  });
});

describe("AdapterHost health timeout", () => {
  it("marks adapter as failed when health check exceeds timeout", async () => {
    const host = new AdapterHost({
      healthCheckIntervalMs: 0,
      healthCheckTimeoutMs: 20,
    });
    await host.start();
    const manifest = validManifest();
    await host.registerAdapter(makeLoadedAdapter(manifest, { healthCheckDelay: 200 }));
    const health = host.getAdapterHealth("test-provider");
    expect(health.state).toBe(ADAPTER_STATE.FAILED);
    expect(health.error).toContain("timed out");
    await host.shutdown();
  });
});

describe("AdapterHost.callAdapter", () => {
  it("invokes adapter contract through the host", async () => {
    const host = new AdapterHost({ healthCheckIntervalMs: 0 });
    await host.start();
    await host.registerAdapter(makeLoadedAdapter(validManifest()));

    const result = await host.callAdapter("test-provider", async (loaded) =>
      loaded.contract.listModels(),
    );
    expect(result).toEqual(["model-1"]);
    await host.shutdown();
  });

  it("marks adapter as degraded when call throws", async () => {
    const host = new AdapterHost({ healthCheckIntervalMs: 0 });
    await host.start();
    await host.registerAdapter(makeLoadedAdapter(validManifest()));

    await expect(
      host.callAdapter("test-provider", async () => {
        throw new Error("Adapter error");
      }),
    ).rejects.toThrow("Adapter error");

    const health = host.getAdapterHealth("test-provider");
    expect(health.state).toBe(ADAPTER_STATE.DEGRADED);
    await host.shutdown();
  });

  it("throws for unknown provider", async () => {
    const host = new AdapterHost({ healthCheckIntervalMs: 0 });
    await host.start();
    await expect(
      host.callAdapter("unknown-provider", async (loaded) => loaded.manifest),
    ).rejects.toThrow(AdapterHostError);
    await host.shutdown();
  });

  it("rejects callAdapter after shutdown", async () => {
    const host = new AdapterHost({ healthCheckIntervalMs: 0 });
    await host.start();
    await host.registerAdapter(makeLoadedAdapter(validManifest()));
    await host.shutdown();
    await expect(
      host.callAdapter("test-provider", async (loaded) => loaded.manifest),
    ).rejects.toThrow(AdapterHostError);
  });
});

describe("AdapterHost.deregisterAdapter", () => {
  it("deregisters an active adapter", async () => {
    const host = new AdapterHost({ healthCheckIntervalMs: 0 });
    await host.start();
    await host.registerAdapter(makeLoadedAdapter(validManifest()));
    await host.deregisterAdapter("test-provider");
    expect(() => host.getAdapterHealth("test-provider")).toThrow(AdapterHostError);
    await host.shutdown();
  });

  it("tolerates shutdown failures during deregister", async () => {
    const host = new AdapterHost({ healthCheckIntervalMs: 0 });
    await host.start();
    await host.registerAdapter(makeLoadedAdapter(validManifest(), { shutdownFails: true }));
    // Should not throw
    await expect(host.deregisterAdapter("test-provider")).resolves.toBeUndefined();
    await host.shutdown();
  });
});

describe("AdapterHost.listAdapterHealth", () => {
  it("lists all registered adapters", async () => {
    const host = new AdapterHost({ healthCheckIntervalMs: 0 });
    await host.start();

    await host.registerAdapter(makeLoadedAdapter(validManifest({ providerId: "provider-a" })));
    await host.registerAdapter(makeLoadedAdapter(validManifest({ providerId: "provider-b" })));

    const list = host.listAdapterHealth();
    expect(list).toHaveLength(2);
    const ids = list.map((h) => h.providerId).sort();
    expect(ids).toEqual(["provider-a", "provider-b"]);
    await host.shutdown();
  });

  it("returns empty list when no adapters registered", async () => {
    const host = new AdapterHost({ healthCheckIntervalMs: 0 });
    await host.start();
    expect(host.listAdapterHealth()).toHaveLength(0);
    await host.shutdown();
  });
});

describe("AdapterHost crash isolation", () => {
  it("one adapter failure does not affect other adapters", async () => {
    const host = new AdapterHost({ healthCheckIntervalMs: 0 });
    await host.start();

    const goodManifest = validManifest({ providerId: "good-provider" });
    const badManifest = validManifest({ providerId: "bad-provider" });

    await host.registerAdapter(makeLoadedAdapter(goodManifest));
    await host.registerAdapter(makeLoadedAdapter(badManifest, { healthCheckResult: false }));

    expect(host.getAdapterHealth("good-provider").state).toBe(ADAPTER_STATE.RUNNING);
    expect(host.getAdapterHealth("bad-provider").state).toBe(ADAPTER_STATE.DEGRADED);

    const result = await host.callAdapter("good-provider", async (loaded) =>
      loaded.contract.listModels(),
    );
    expect(result).toEqual(["model-1"]);
    await host.shutdown();
  });
});

describe("AdapterHost restart limit", () => {
  it("tracks restart count and caps at maxRestarts", async () => {
    const host = new AdapterHost({ healthCheckIntervalMs: 0, maxRestarts: 2 });
    await host.start();

    const manifest = validManifest();
    const loaded: LoadedAdapter = Object.freeze({
      providerId: manifest.providerId,
      manifest,
      contract: {
        ...makeAdapterContract(manifest),
        healthCheck: async () => false,
        shutdown: async () => undefined,
      },
    });
    await host.registerAdapter(loaded);
    const health = host.getAdapterHealth("test-provider");
    expect(health.state).toBe(ADAPTER_STATE.DEGRADED);

    await host.shutdown();
  });
});
