import { afterEach, describe, expect, it, vi } from "vitest";

type NativeMessageCallback = (response: unknown) => void;

function createChromeStub(
  sendNativeMessage: (hostName: string, message: Record<string, unknown>, callback: NativeMessageCallback) => void,
): {
  runtime: {
    id: string;
    lastError?: { message?: string };
    sendNativeMessage: typeof sendNativeMessage;
    sendMessage: (message: Record<string, unknown>, callback: NativeMessageCallback) => void;
  };
  storage: {
    local: {
      get: (keys: string[], callback: (result: Record<string, unknown>) => void) => void;
    };
  };
} {
  // sendMessage routes through the vault proxy — unwrap the envelope and
  // delegate to the sendNativeMessage mock so test assertions work.
  const sendMessage = (envelope: Record<string, unknown>, callback: NativeMessageCallback) => {
    const inner = (envelope["message"] ?? envelope) as Record<string, unknown>;
    sendNativeMessage("com.arlopass.bridge", inner, callback);
  };
  return {
    runtime: {
      id: "ext.test.arlopass",
      sendNativeMessage,
      sendMessage,
    },
    storage: {
      local: {
        get: (_keys: string[], callback: (result: Record<string, unknown>) => void) => {
          callback({});
        },
      },
    },
  };
}

describe("options existing cloud handle validation", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("fails revalidation when refreshed model discovery returns no models", async () => {
    const documentStub = {
      addEventListener: vi.fn(),
    };
    vi.stubGlobal("document", documentStub);
    vi.stubGlobal("window", {
      location: {
        origin: "chrome-extension://ext.test.arlopass",
      },
    });

    const sendNativeMessage = vi.fn(
      (hostName: string, message: Record<string, unknown>, callback: NativeMessageCallback) => {
        void hostName;
        if (message["type"] === "cloud.connection.validate") {
          callback({
            type: "cloud.connection.validate",
            valid: true,
          });
          return;
        }
        if (message["type"] === "cloud.models.discover") {
          callback({
            type: "cloud.models.discover",
            models: [],
          });
          return;
        }
        callback({
          type: "error",
          message: `Unexpected message type: ${String(message["type"])}`,
        });
      },
    );
    vi.stubGlobal("chrome", createChromeStub(sendNativeMessage));
    const { __optionsTestHooks } = await import("../options.js");

    const result = await __optionsTestHooks.validateCloudConnectionViaExistingHandle({
      provider: {
        id: "provider.cloud.foundry.1",
        name: "Microsoft Foundry",
        type: "cloud",
        status: "connected",
        models: [
          { id: "gpt-4o-mini", name: "GPT-4o mini" },
          { id: "gpt-4.1-mini", name: "GPT-4.1 mini" },
        ],
        metadata: {
          providerId: "microsoft-foundry",
          methodId: "foundry.api_key",
          nativeHostName: "com.arlopass.bridge",
          connectionHandle:
            "connh.provider.microsoft-foundry.foundry.api_key.00000000-0000-4000-8000-000000000001.0.sig",
          endpointProfileHash: "sha256:endpoint-profile-foundry",
        },
      },
      connectorId: "cloud-foundry",
      fieldValues: {
        methodId: "foundry.api_key",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("No models were discovered");
    const discoverCall = sendNativeMessage.mock.calls.find(
      (call) => call[1]?.["type"] === "cloud.models.discover",
    );
    expect(discoverCall?.[1]?.["refresh"]).toBe(true);
  });

  it("formats discovered cloud model count messages", async () => {
    vi.stubGlobal("document", {
      addEventListener: vi.fn(),
    });
    vi.stubGlobal("window", {
      location: {
        origin: "chrome-extension://ext.test.arlopass",
      },
    });
    vi.stubGlobal(
      "chrome",
      createChromeStub((_hostName, _message, callback) => {
        callback({
          type: "error",
          message: "not used in this test",
        });
      }),
    );
    const { __optionsTestHooks } = await import("../options.js");

    expect(__optionsTestHooks.formatDiscoveredCloudModelsMessage(1)).toBe(
      "1 model discovered for this cloud connection.",
    );
    expect(__optionsTestHooks.formatDiscoveredCloudModelsMessage(3)).toBe(
      "3 models discovered for this cloud connection.",
    );
  });

  it("returns discovered-model notice for successful cloud test results", async () => {
    vi.stubGlobal("document", {
      addEventListener: vi.fn(),
    });
    vi.stubGlobal("window", {
      location: {
        origin: "chrome-extension://ext.test.arlopass",
      },
    });
    vi.stubGlobal(
      "chrome",
      createChromeStub((_hostName, _message, callback) => {
        callback({
          type: "error",
          message: "not used in this test",
        });
      }),
    );
    const { __optionsTestHooks } = await import("../options.js");

    expect(
      __optionsTestHooks.getCloudModelDiscoveryNotice({
        connectorType: "cloud",
        result: { ok: true, status: "connected", message: "ok", models: [] },
      }),
    ).toBe("0 models discovered for this cloud connection.");
    expect(
      __optionsTestHooks.getCloudModelDiscoveryNotice({
        connectorType: "cloud",
        result: {
          ok: true,
          status: "connected",
          message: "ok",
          models: [{ id: "m1", name: "Model 1" }],
        },
      }),
    ).toBe("1 model discovered for this cloud connection.");
    expect(
      __optionsTestHooks.getCloudModelDiscoveryNotice({
        connectorType: "local",
        result: {
          ok: true,
          status: "connected",
          message: "ok",
          models: [{ id: "m1", name: "Model 1" }],
        },
      }),
    ).toBeUndefined();
    expect(
      __optionsTestHooks.getCloudModelDiscoveryNotice({
        connectorType: "cloud",
        result: { ok: false, status: "attention", message: "bad", models: [] },
      }),
    ).toBeUndefined();
  });
});
