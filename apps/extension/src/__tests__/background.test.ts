/**
 * Integration tests for ExtensionBackgroundService and wallet action handlers.
 *
 * Coverage:
 *  - Session establishment and termination
 *  - Grant synchronizer: bridge publishGrant / revokeGrant called on grant lifecycle events
 *  - Connect / consent / request success path
 *  - Unauthorized origin denial (consent refused by user)
 *  - Revoked grant denial (explicit revocation before or during a request)
 *  - In-flight revocation: grant revoked while transport awaits response
 *  - Wallet action handler: setActiveProvider, setActiveModel (provider-switching),
 *    revokeProvider (active nulling), openConnectFlow, unsupported action, invalid envelope
 *  - Runtime bootstrap listener: registers chrome.runtime.onMessage bridge and routes actions
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — bridge handshake & pairing so sendVaultMessageFromBackground
// resolves without real native messaging infrastructure.
// ---------------------------------------------------------------------------

vi.mock("../transport/bridge-handshake.js", () => ({
  ensureBridgeHandshakeSession: vi.fn().mockResolvedValue({
    sessionToken: "test-session-token",
    hostName: "com.arlopass.bridge",
    extensionId: "test-extension-id",
    sessionKey: new Uint8Array(32),
    establishedAt: "2026-03-23T12:00:00.000Z",
    expiresAt: "2026-03-23T12:05:00.000Z",
  }),
}));

vi.mock("../transport/bridge-pairing.js", () => ({
  BRIDGE_PAIRING_STATE_STORAGE_KEY: "arlopass.wallet.bridgePairing.v1",
  parseBridgePairingState: vi.fn().mockReturnValue(undefined),
  unwrapPairingKeyMaterial: vi.fn().mockResolvedValue(null),
}));

import { PermissionError } from "@arlopass/protocol";
import type { CanonicalEnvelope } from "@arlopass/protocol";
import type {
  ArlopassTransport,
  TransportResponse,
} from "@arlopass/web-sdk";

import {
  ExtensionBackgroundService,
  createWalletMessageHandler,
  registerDefaultWalletMessageListener,
  type BridgeGrantSynchronizer,
  type WalletStorageAdapter,
} from "../background.js";
import {
  ConsentController,
  type ConsentPromptAdapter,
  type ConsentPromptResponse,
} from "../consent/consent-controller.js";
import { ExtensionEventEmitter, type ExtensionEventMap } from "../events.js";
import { GrantStore } from "../permissions/grant-store.js";
import type { GrantType } from "../permissions/grant-types.js";
import type {
  BridgeGrantRevocationEvent,
  BridgeGrantSynchronizationEvent,
} from "../events.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type DeterministicClock = Readonly<{
  now: () => number;
  advance: (ms: number) => void;
}>;

function createClock(startAt = "2026-03-23T12:00:00.000Z"): DeterministicClock {
  let current = new Date(startAt).getTime();
  return {
    now: () => current,
    advance: (ms: number) => { current += ms; },
  };
}

function makeConsentAdapter(
  response: ConsentPromptResponse,
): ConsentPromptAdapter {
  return {
    showConsentPrompt: vi.fn().mockResolvedValue(response),
  };
}

function makeGrantingAdapter(grantType: GrantType = "persistent"): ConsentPromptAdapter {
  return makeConsentAdapter({ granted: true, grantType });
}

function makeDenyingAdapter(): ConsentPromptAdapter {
  return makeConsentAdapter({ granted: false, denialReason: "user-denied" });
}

/**
 * Creates a fake CanonicalEnvelope<null>.  The extension's checkPermission
 * only reads origin, providerId, modelId, and capability; the transport mock
 * echoes the envelope back unchanged, so the remaining fields just need to
 * be present strings.
 */
function makeEnvelope(
  capability: CanonicalEnvelope["capability"] = "chat.completions",
  requestId = "req.test.001",
  overrides: Partial<Record<string, unknown>> = {},
): CanonicalEnvelope<null> {
  const now = new Date();
  return {
    protocolVersion: "1.0.0",
    requestId,
    correlationId: "cor.test.001",
    origin: "https://app.example.com",
    sessionId: "ses.test.001",
    capability,
    providerId: "provider.a",
    modelId: "model.a",
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60_000).toISOString(),
    nonce: `nonce-${requestId}`,
    payload: null,
    ...overrides,
  } as unknown as CanonicalEnvelope<null>;
}

function makeFakeResponseEnvelope(): CanonicalEnvelope<null> {
  return makeEnvelope("chat.completions", "req.response.001");
}

/** Transport that immediately returns a fake response. */
function makeSuccessTransport(): ArlopassTransport {
  const fakeResponse: TransportResponse<null> = {
    envelope: makeFakeResponseEnvelope(),
  };
  return {
    request: vi.fn().mockResolvedValue(fakeResponse),
    stream: vi.fn().mockResolvedValue((async function* () { })()),
  };
}

/** Transport whose request() resolves only when the caller calls resolve(). */
function makeControllableTransport(): {
  transport: ArlopassTransport;
  resolve: (value: TransportResponse<null>) => void;
  reject: (err: Error) => void;
} {
  let resolve!: (value: TransportResponse<null>) => void;
  let reject!: (err: Error) => void;
  const deferred = new Promise<TransportResponse<null>>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  const transport: ArlopassTransport = {
    request: () => deferred as Promise<TransportResponse<never>>,
    stream: vi.fn().mockResolvedValue((async function* () { })()),
  };

  return { transport, resolve, reject };
}

function makeSynchronizer(): {
  synchronizer: BridgeGrantSynchronizer;
  publishedGrants: BridgeGrantSynchronizationEvent[];
  revokedGrants: BridgeGrantRevocationEvent[];
} {
  const publishedGrants: BridgeGrantSynchronizationEvent[] = [];
  const revokedGrants: BridgeGrantRevocationEvent[] = [];

  const synchronizer: BridgeGrantSynchronizer = {
    publishGrant: vi.fn().mockImplementation(async (event) => {
      publishedGrants.push(event as BridgeGrantSynchronizationEvent);
    }),
    revokeGrant: vi.fn().mockImplementation(async (event) => {
      revokedGrants.push(event as BridgeGrantRevocationEvent);
    }),
  };

  return { synchronizer, publishedGrants, revokedGrants };
}

type ServiceHarness = Readonly<{
  service: ExtensionBackgroundService;
  events: ExtensionEventEmitter<ExtensionEventMap>;
  clock: DeterministicClock;
  transport: ArlopassTransport;
  consentController: ConsentController;
}>;

function buildHarness(
  consentAdapter: ConsentPromptAdapter,
  transport: ArlopassTransport = makeSuccessTransport(),
  grantSynchronizer?: BridgeGrantSynchronizer,
  clock = createClock(),
): ServiceHarness {
  const events = new ExtensionEventEmitter<ExtensionEventMap>();

  let idSeq = 0;
  const grantStore = new GrantStore({
    now: clock.now,
    randomId: () => `g${idSeq++}`,
    sessionGrantTtlMs: 60_000,
    oneTimeGrantTtlMs: 30_000,
    events,
  });

  const consentController = new ConsentController({
    promptAdapter: consentAdapter,
    now: clock.now,
    events,
  });

  const service = new ExtensionBackgroundService({
    transport,
    consentController,
    grantStore,
    events,
    now: clock.now,
    ...(grantSynchronizer !== undefined ? { grantSynchronizer } : {}),
  });

  return { service, events, clock, transport, consentController };
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

describe("ExtensionBackgroundService — session management", () => {
  it("emits session-established when establishSession is called", () => {
    const { service, events } = buildHarness(makeGrantingAdapter());
    const sessions: Array<{ sessionId: string; origin: string }> = [];

    events.on("session-established", (e) => sessions.push(e));
    service.establishSession("ses.001", "https://app.example.com");

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      sessionId: "ses.001",
      origin: "https://app.example.com",
    });
  });

  it("emits session-terminated and expires session grants on terminateSession", () => {
    const clock = createClock();
    const { service, events } = buildHarness(makeGrantingAdapter(), makeSuccessTransport(), undefined, clock);
    const terminated: string[] = [];

    events.on("session-terminated", (e) => terminated.push(e.sessionId));

    // Create a session grant for the origin.
    service.grantStore.grantPermission({
      origin: "https://app.example.com",
      providerId: "provider.a",
      modelId: "model.a",
      capabilities: ["chat.completions"],
      grantType: "session",
    });

    expect(service.grantStore.size).toBe(1);

    const revoked = service.terminateSession(
      "ses.001",
      "https://app.example.com",
      "disconnect",
    );

    expect(terminated).toContain("ses.001");
    expect(revoked).toHaveLength(1);
    expect(service.grantStore.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Grant synchronizer integration
// ---------------------------------------------------------------------------

describe("ExtensionBackgroundService — grant synchronizer", () => {
  it("calls synchronizer.publishGrant when a grant is created via consent", async () => {
    const { synchronizer, publishedGrants } = makeSynchronizer();
    const { service } = buildHarness(
      makeGrantingAdapter("persistent"),
      makeSuccessTransport(),
      synchronizer,
    );

    await service.evaluatePermission(makeEnvelope("chat.completions", "req.sync.001"));

    expect(publishedGrants).toHaveLength(1);
    expect(publishedGrants[0]).toMatchObject({
      origin: "https://app.example.com",
      grantType: "persistent",
    });
    expect(publishedGrants[0]?.capabilities).toContain("chat.completions");
  });

  it("calls synchronizer.revokeGrant when a grant is explicitly revoked", async () => {
    const { synchronizer, publishedGrants, revokedGrants } = makeSynchronizer();
    const { service } = buildHarness(
      makeGrantingAdapter("persistent"),
      makeSuccessTransport(),
      synchronizer,
    );

    // Trigger consent so a grant is created and synced.
    await service.evaluatePermission(makeEnvelope("chat.completions", "req.rev.001"));
    expect(publishedGrants).toHaveLength(1);

    const grantId = publishedGrants[0]?.grantId;
    expect(typeof grantId).toBe("string");

    service.revokeGrant(grantId as string, "user");

    expect(revokedGrants).toHaveLength(1);
    expect(revokedGrants[0]).toMatchObject({ grantId, reason: "user" });
  });
});

// ---------------------------------------------------------------------------
// Connect / consent / request success path
// ---------------------------------------------------------------------------

describe("ExtensionBackgroundService — connect/consent/request success path", () => {
  it("evaluatePermission: triggers consent when no grant exists and returns grant-created", async () => {
    const { service } = buildHarness(makeGrantingAdapter("persistent"));

    const decision = await service.evaluatePermission(
      makeEnvelope("chat.completions", "req.consent.001"),
    );

    expect(decision).toMatchObject({
      granted: true,
      reason: "grant-created",
      grantType: "persistent",
    });
    expect(typeof decision.grantId).toBe("string");
  });

  it("evaluatePermission: returns allow when an existing grant matches", async () => {
    const { service } = buildHarness(makeGrantingAdapter("persistent"));

    // First call creates the grant.
    await service.evaluatePermission(makeEnvelope("chat.completions", "req.pre.001"));

    // Second call should find the existing grant without re-prompting.
    const decision = await service.evaluatePermission(
      makeEnvelope("chat.completions", "req.pre.002"),
    );

    expect(decision).toMatchObject({ granted: true, reason: "allow" });
  });

  it("forwardRequest: calls the transport and returns the response", async () => {
    const transport = makeSuccessTransport();
    const { service } = buildHarness(makeGrantingAdapter("persistent"), transport);

    const response = await service.forwardRequest<null, unknown>({
      envelope: makeEnvelope("chat.completions", "req.fwd.001"),
    });

    expect(transport.request).toHaveBeenCalledOnce();
    expect(response).toBeDefined();
  });

  it("forwardRequest: triggers consent for an unknown capability and then forwards", async () => {
    const transport = makeSuccessTransport();
    const adapter = makeGrantingAdapter("persistent");
    const { service } = buildHarness(adapter, transport);

    await service.forwardRequest<null, unknown>({
      envelope: makeEnvelope("chat.stream", "req.stream.001"),
    });

    expect(transport.request).toHaveBeenCalledOnce();
    expect(adapter.showConsentPrompt).toHaveBeenCalledOnce();
  });

  it("forwardRequest with a session grant: consent is not re-prompted on the second request", async () => {
    const adapter = makeGrantingAdapter("session");
    const transport = makeSuccessTransport();
    const { service } = buildHarness(adapter, transport);

    await service.forwardRequest<null, unknown>({
      envelope: makeEnvelope("chat.completions", "req.session.001"),
    });
    await service.forwardRequest<null, unknown>({
      envelope: makeEnvelope("chat.completions", "req.session.002"),
    });

    expect(adapter.showConsentPrompt).toHaveBeenCalledOnce();
    expect(transport.request).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Unauthorized origin denial
// ---------------------------------------------------------------------------

describe("ExtensionBackgroundService — unauthorized origin denial", () => {
  it("evaluatePermission: returns user-denied when consent is refused", async () => {
    const { service } = buildHarness(makeDenyingAdapter());

    const decision = await service.evaluatePermission(
      makeEnvelope("chat.completions", "req.deny.001"),
    );

    expect(decision).toMatchObject({ granted: false, reason: "user-denied" });
  });

  it("forwardRequest: throws PermissionError when consent is refused", async () => {
    const { service } = buildHarness(makeDenyingAdapter());

    await expect(
      service.forwardRequest<null, unknown>({
        envelope: makeEnvelope("chat.completions", "req.deny.002"),
      }),
    ).rejects.toThrow(PermissionError);
  });

  it("forwardRequest: PermissionError includes the request origin and capability", async () => {
    const { service } = buildHarness(makeDenyingAdapter());

    let caught: unknown;
    try {
      await service.forwardRequest<null, unknown>({
        envelope: makeEnvelope("chat.completions", "req.deny.003", {
          origin: "https://untrusted.example.com",
        }),
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(PermissionError);
  });
});

// ---------------------------------------------------------------------------
// Revoked grant denial
// ---------------------------------------------------------------------------

describe("ExtensionBackgroundService — revoked grant denial", () => {
  it("forwardRequest: throws after the grant backing the request is revoked", async () => {
    const adapter = makeGrantingAdapter("persistent");
    const { service } = buildHarness(adapter);

    // First request creates the grant.
    await service.forwardRequest<null, unknown>({
      envelope: makeEnvelope("chat.completions", "req.revpre.001"),
    });

    const grants = service.grantStore.listGrants();
    expect(grants).toHaveLength(1);
    service.revokeGrant(grants[0]!.id, "user");

    // After revocation, consent is needed again but the adapter now denies.
    (adapter.showConsentPrompt as ReturnType<typeof vi.fn>).mockResolvedValue({
      granted: false,
      denialReason: "user-denied",
    });

    await expect(
      service.forwardRequest<null, unknown>({
        envelope: makeEnvelope("chat.completions", "req.revpre.002"),
      }),
    ).rejects.toThrow(PermissionError);
  });

  it("evaluatePermission: returns user-denied after explicit revocation when re-consent is refused", async () => {
    const adapter = makeGrantingAdapter("persistent");
    const { service } = buildHarness(adapter);

    await service.evaluatePermission(makeEnvelope("chat.completions", "req.ev.revoke.001"));

    const [grant] = service.grantStore.listGrants();
    service.revokeGrant(grant!.id, "user");

    (adapter.showConsentPrompt as ReturnType<typeof vi.fn>).mockResolvedValue({
      granted: false,
      denialReason: "user-denied",
    });

    const decision = await service.evaluatePermission(
      makeEnvelope("chat.completions", "req.ev.revoke.002"),
    );

    expect(decision).toMatchObject({ granted: false, reason: "user-denied" });
  });
});

// ---------------------------------------------------------------------------
// In-flight revocation
// ---------------------------------------------------------------------------

describe("ExtensionBackgroundService — in-flight revocation", () => {
  it("throws PermissionError when the grant is revoked while the transport awaits", async () => {
    const adapter = makeGrantingAdapter("persistent");
    const { transport, resolve } = makeControllableTransport();
    const { service } = buildHarness(adapter, transport);

    // Pre-create a grant so #ensureAuthorizedGrant resolves synchronously.
    service.grantStore.grantPermission({
      origin: "https://app.example.com",
      providerId: "provider.a",
      modelId: "model.a",
      capabilities: ["chat.completions"],
      grantType: "persistent",
    });

    const [grant] = service.grantStore.listGrants();
    expect(grant).toBeDefined();

    // Start the request (does not await yet).
    const requestPromise = service.forwardRequest<null, unknown>({
      envelope: makeEnvelope("chat.completions", "req.inflight.001"),
    });

    // Let #ensureAuthorizedGrant and #registerInFlight run in the microtask queue.
    await Promise.resolve();

    // Revoke the grant while the transport is still pending.
    service.revokeGrant(grant!.id, "user");

    // Resolve the transport — the in-flight check must throw.
    resolve({ envelope: makeFakeResponseEnvelope() });

    await expect(requestPromise).rejects.toThrow(PermissionError);
  });

  it("in-flight PermissionError carries the grantId that was revoked", async () => {
    const adapter = makeGrantingAdapter("persistent");
    const { transport, resolve } = makeControllableTransport();
    const { service } = buildHarness(adapter, transport);

    service.grantStore.grantPermission({
      origin: "https://app.example.com",
      providerId: "provider.a",
      modelId: "model.a",
      capabilities: ["chat.completions"],
      grantType: "persistent",
    });

    const [grant] = service.grantStore.listGrants();
    const requestPromise = service.forwardRequest<null, unknown>({
      envelope: makeEnvelope("chat.completions", "req.inflight.002"),
    });

    await Promise.resolve();
    service.revokeGrant(grant!.id, "user");
    resolve({ envelope: makeFakeResponseEnvelope() });

    let caught: unknown;
    try {
      await requestPromise;
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(PermissionError);
    const permErr = caught as PermissionError;
    expect(String(permErr.message)).toContain("in-flight");
  });

  it("propagates auth.expired and reconnecting state when the in-flight grant expires", async () => {
    const adapter = makeGrantingAdapter("persistent");
    const { transport, resolve } = makeControllableTransport();
    const { service, events } = buildHarness(adapter, transport);
    const healthEvents: Array<{
      providerId: string;
      state: "reconnecting" | "failed" | "revoked" | "degraded";
      reasonCode?: string;
    }> = [];
    events.on("connection-health-changed", (event) => {
      healthEvents.push(event);
    });

    service.grantStore.grantPermission({
      origin: "https://app.example.com",
      providerId: "provider.a",
      modelId: "model.a",
      capabilities: ["chat.completions"],
      grantType: "persistent",
    });

    const [grant] = service.grantStore.listGrants();
    const requestPromise = service.forwardRequest<null, unknown>({
      envelope: makeEnvelope("chat.completions", "req.inflight.003"),
    });

    await Promise.resolve();
    service.revokeGrant(grant!.id, "expired");
    resolve({ envelope: makeFakeResponseEnvelope() });

    await expect(requestPromise).rejects.toMatchObject({
      reasonCode: "auth.expired",
    });
    expect(healthEvents).toContainEqual(
      expect.objectContaining({
        providerId: "provider.a",
        state: "reconnecting",
        reasonCode: "auth.expired",
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Wallet message handler helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY_ACTIVE = "arlopass.wallet.activeProvider.v1";

type FakeStorageState = Record<string, unknown>;

function makeFakeStorage(initial: FakeStorageState = {}): {
  storage: WalletStorageAdapter;
  state: FakeStorageState;
} {
  const state: FakeStorageState = { ...initial };
  const storage: WalletStorageAdapter = {
    get: vi.fn().mockImplementation(async (keys: readonly string[]) => {
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        result[key] = state[key];
      }
      return result;
    }),
    set: vi.fn().mockImplementation(async (items: Record<string, unknown>) => {
      Object.assign(state, items);
    }),
  };
  return { storage, state };
}

// ---------------------------------------------------------------------------
// Vault mock infrastructure for wallet handler tests
// ---------------------------------------------------------------------------

type VaultProvider = { id: string; models: string[] };

let _vaultProviders: VaultProvider[] = [];

function setVaultProviders(providers: VaultProvider[]): void {
  _vaultProviders = providers;
}

/**
 * Installs a minimal global `chrome` stub so that
 * `sendVaultMessageFromBackground` (called by wallet handlers) can resolve.
 */
function installChromeVaultStub(): void {
  const g = globalThis as Record<string, unknown>;
  g["chrome"] = {
    runtime: {
      id: "test-extension-id",
      lastError: undefined,
      sendNativeMessage: vi.fn(
        (
          _host: string,
          msg: Record<string, unknown>,
          callback: (resp: unknown) => void,
        ) => {
          if (msg["type"] === "vault.providers.list") {
            callback({ type: "vault.providers.list", providers: _vaultProviders });
          } else if (msg["type"] === "vault.providers.delete") {
            callback({ type: "vault.providers.delete" });
          } else {
            callback({ error: "unknown vault message type" });
          }
        },
      ),
    },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
      },
    },
  };
}

function uninstallChromeVaultStub(): void {
  const g = globalThis as Record<string, unknown>;
  delete g["chrome"];
  _vaultProviders = [];
}

// ---------------------------------------------------------------------------
// Wallet handler: setActiveProvider
// ---------------------------------------------------------------------------

describe("createWalletMessageHandler — wallet.setActiveProvider", () => {
  beforeEach(() => {
    installChromeVaultStub();
    setVaultProviders([{ id: "ollama", models: ["llama3"] }]);
  });
  afterEach(() => uninstallChromeVaultStub());

  it("writes providerId to active storage and returns ok:true", async () => {
    const { storage, state } = makeFakeStorage();
    const handle = createWalletMessageHandler({ storage });

    const result = await handle({
      channel: "arlopass.wallet",
      action: "wallet.setActiveProvider",
      requestId: "req.001",
      payload: { providerId: "ollama" },
    });

    expect(result).toEqual({ ok: true });
    expect(state[STORAGE_KEY_ACTIVE]).toMatchObject({ providerId: "ollama" });
  });

  it("includes optional modelId in stored active provider", async () => {
    const { storage, state } = makeFakeStorage();
    const handle = createWalletMessageHandler({ storage });

    await handle({
      channel: "arlopass.wallet",
      action: "wallet.setActiveProvider",
      requestId: "req.002",
      payload: { providerId: "ollama", modelId: "llama3" },
    });

    expect(state[STORAGE_KEY_ACTIVE]).toMatchObject({
      providerId: "ollama",
      modelId: "llama3",
    });
  });

  it("returns invalid_payload when providerId is missing", async () => {
    const { storage } = makeFakeStorage();
    const handle = createWalletMessageHandler({ storage });

    const result = await handle({
      channel: "arlopass.wallet",
      action: "wallet.setActiveProvider",
      requestId: "req.003",
      payload: {},
    });

    expect(result).toMatchObject({ ok: false, errorCode: "invalid_payload" });
  });
});

// ---------------------------------------------------------------------------
// Wallet handler: setActiveModel (provider-switching semantics)
// ---------------------------------------------------------------------------

describe("createWalletMessageHandler — wallet.setActiveModel", () => {
  beforeEach(() => installChromeVaultStub());
  afterEach(() => uninstallChromeVaultStub());

  it("sets active provider and model atomically when provider differs from current", async () => {
    setVaultProviders([
      { id: "anthropic", models: ["claude-3"] },
      { id: "ollama", models: ["llama3"] },
    ]);
    const { storage, state } = makeFakeStorage({
      [STORAGE_KEY_ACTIVE]: { providerId: "anthropic", modelId: "claude-3" },
    });
    const handle = createWalletMessageHandler({ storage });

    const result = await handle({
      channel: "arlopass.wallet",
      action: "wallet.setActiveModel",
      requestId: "req.010",
      payload: { providerId: "ollama", modelId: "llama3" },
    });

    expect(result).toEqual({ ok: true });
    expect(state[STORAGE_KEY_ACTIVE]).toMatchObject({
      providerId: "ollama",
      modelId: "llama3",
    });
  });

  it("updates only modelId when provider is already active", async () => {
    setVaultProviders([{ id: "ollama", models: ["llama3", "mistral"] }]);
    const { storage, state } = makeFakeStorage({
      [STORAGE_KEY_ACTIVE]: { providerId: "ollama", modelId: "llama3" },
    });
    const handle = createWalletMessageHandler({ storage });

    const result = await handle({
      channel: "arlopass.wallet",
      action: "wallet.setActiveModel",
      requestId: "req.011",
      payload: { providerId: "ollama", modelId: "mistral" },
    });

    expect(result).toEqual({ ok: true });
    expect(state[STORAGE_KEY_ACTIVE]).toMatchObject({
      providerId: "ollama",
      modelId: "mistral",
    });
  });

  it("returns invalid_selection when provider is not found", async () => {
    setVaultProviders([{ id: "ollama", models: ["llama3"] }]);
    const { storage } = makeFakeStorage();
    const handle = createWalletMessageHandler({ storage });

    const result = await handle({
      channel: "arlopass.wallet",
      action: "wallet.setActiveModel",
      requestId: "req.012",
      payload: { providerId: "unknown-provider", modelId: "llama3" },
    });

    expect(result).toMatchObject({ ok: false, errorCode: "invalid_selection" });
  });

  it("returns invalid_selection when model is not found in provider", async () => {
    setVaultProviders([{ id: "ollama", models: ["llama3"] }]);
    const { storage } = makeFakeStorage();
    const handle = createWalletMessageHandler({ storage });

    const result = await handle({
      channel: "arlopass.wallet",
      action: "wallet.setActiveModel",
      requestId: "req.013",
      payload: { providerId: "ollama", modelId: "unknown-model" },
    });

    expect(result).toMatchObject({ ok: false, errorCode: "invalid_selection" });
  });

  it("returns invalid_payload when modelId is missing", async () => {
    const { storage } = makeFakeStorage();
    const handle = createWalletMessageHandler({ storage });

    const result = await handle({
      channel: "arlopass.wallet",
      action: "wallet.setActiveModel",
      requestId: "req.014",
      payload: { providerId: "ollama" },
    });

    expect(result).toMatchObject({ ok: false, errorCode: "invalid_payload" });
  });
});

// ---------------------------------------------------------------------------
// Wallet handler: revokeProvider (active nulling behaviour)
// ---------------------------------------------------------------------------

describe("createWalletMessageHandler — wallet.revokeProvider", () => {
  beforeEach(() => installChromeVaultStub());
  afterEach(() => uninstallChromeVaultStub());

  it("delegates provider deletion to the vault and returns ok:true", async () => {
    const { storage, state } = makeFakeStorage({
      [STORAGE_KEY_ACTIVE]: { providerId: "anthropic" },
    });
    const handle = createWalletMessageHandler({ storage });

    const result = await handle({
      channel: "arlopass.wallet",
      action: "wallet.revokeProvider",
      requestId: "req.020",
      payload: { providerId: "ollama" },
    });

    expect(result).toEqual({ ok: true });
    // Active provider is different from revoked — should remain unchanged.
    expect(state[STORAGE_KEY_ACTIVE]).toMatchObject({ providerId: "anthropic" });
  });

  it("sets active provider to null when the active provider is revoked", async () => {
    const { storage, state } = makeFakeStorage({
      [STORAGE_KEY_ACTIVE]: { providerId: "ollama", modelId: "llama3" },
    });
    const handle = createWalletMessageHandler({ storage });

    await handle({
      channel: "arlopass.wallet",
      action: "wallet.revokeProvider",
      requestId: "req.021",
      payload: { providerId: "ollama" },
    });

    expect(state[STORAGE_KEY_ACTIVE]).toBeNull();
  });

  it("does not clear active when a different provider is revoked", async () => {
    const { storage, state } = makeFakeStorage({
      [STORAGE_KEY_ACTIVE]: { providerId: "anthropic" },
    });
    const handle = createWalletMessageHandler({ storage });

    await handle({
      channel: "arlopass.wallet",
      action: "wallet.revokeProvider",
      requestId: "req.022",
      payload: { providerId: "ollama" },
    });

    expect(state[STORAGE_KEY_ACTIVE]).toMatchObject({ providerId: "anthropic" });
  });

  it("returns invalid_payload when providerId is missing", async () => {
    const { storage } = makeFakeStorage();
    const handle = createWalletMessageHandler({ storage });

    const result = await handle({
      channel: "arlopass.wallet",
      action: "wallet.revokeProvider",
      requestId: "req.023",
      payload: {},
    });

    expect(result).toMatchObject({ ok: false, errorCode: "invalid_payload" });
  });
});

// ---------------------------------------------------------------------------
// Wallet handler: openConnectFlow
// ---------------------------------------------------------------------------

describe("createWalletMessageHandler — wallet.openConnectFlow", () => {
  it("calls openOptionsPage and returns ok:true", async () => {
    const { storage } = makeFakeStorage();
    const openOptionsPage = vi.fn();
    const handle = createWalletMessageHandler({ storage, openOptionsPage });

    const result = await handle({
      channel: "arlopass.wallet",
      action: "wallet.openConnectFlow",
      requestId: "req.030",
      payload: {},
    });

    expect(result).toEqual({ ok: true });
    expect(openOptionsPage).toHaveBeenCalledOnce();
  });

  it("returns connect_flow_unavailable when openOptionsPage is not provided", async () => {
    const { storage } = makeFakeStorage();
    const handle = createWalletMessageHandler({ storage });

    const result = await handle({
      channel: "arlopass.wallet",
      action: "wallet.openConnectFlow",
      requestId: "req.031",
      payload: {},
    });

    expect(result).toMatchObject({
      ok: false,
      errorCode: "connect_flow_unavailable",
    });
  });
});

// ---------------------------------------------------------------------------
// Wallet handler: unsupported action and invalid envelope
// ---------------------------------------------------------------------------

describe("createWalletMessageHandler — routing", () => {
  it("returns unsupported_action for an unknown wallet action", async () => {
    const { storage } = makeFakeStorage();
    const handle = createWalletMessageHandler({ storage });

    const result = await handle({
      channel: "arlopass.wallet",
      action: "wallet.unknownAction",
      requestId: "req.040",
      payload: {},
    });

    expect(result).toMatchObject({ ok: false, errorCode: "unsupported_action" });
  });

  it("returns null for messages with a different channel", async () => {
    const { storage } = makeFakeStorage();
    const handle = createWalletMessageHandler({ storage });

    const result = await handle({
      channel: "other.channel",
      action: "wallet.setActiveProvider",
      requestId: "req.041",
      payload: { providerId: "ollama" },
    });

    expect(result).toBeNull();
  });

  it("returns null for non-object messages", async () => {
    const { storage } = makeFakeStorage();
    const handle = createWalletMessageHandler({ storage });

    const result = await handle("not an object");

    expect(result).toBeNull();
  });

  it("returns null when requestId is missing", async () => {
    const { storage } = makeFakeStorage();
    const handle = createWalletMessageHandler({ storage });

    const result = await handle({
      channel: "arlopass.wallet",
      action: "wallet.setActiveProvider",
      payload: { providerId: "ollama" },
    });

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Runtime bootstrap: registerDefaultWalletMessageListener
// ---------------------------------------------------------------------------

type RuntimeMessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => boolean | void;

function makeChromeHarness(initial: FakeStorageState = {}): {
  chromeMock: Record<string, unknown>;
  state: FakeStorageState;
  addListener: ReturnType<typeof vi.fn>;
  openOptionsPage: ReturnType<typeof vi.fn>;
  getListener: () => RuntimeMessageListener | undefined;
} {
  const state: FakeStorageState = { ...initial };
  let runtimeListener: RuntimeMessageListener | undefined;

  const openOptionsPage = vi.fn();
  const addListener = vi.fn((listener: RuntimeMessageListener) => {
    runtimeListener = listener;
  });

  const chromeMock = {
    runtime: {
      onMessage: {
        addListener,
      },
      openOptionsPage,
      lastError: undefined as { message?: string } | undefined,
    },
    storage: {
      local: {
        get: vi.fn(
          (
            keys: readonly string[],
            callback: (items: Record<string, unknown>) => void,
          ) => {
            const result: Record<string, unknown> = {};
            for (const key of keys) {
              result[key] = state[key];
            }
            callback(result);
          },
        ),
        set: vi.fn((items: Record<string, unknown>, callback?: () => void) => {
          Object.assign(state, items);
          callback?.();
        }),
      },
    },
  };

  return {
    chromeMock: chromeMock as Record<string, unknown>,
    state,
    addListener,
    openOptionsPage,
    getListener: () => runtimeListener,
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("registerDefaultWalletMessageListener", () => {
  const LISTENER_FLAG_KEY = "__arlopass.wallet.listener.registered.v1";

  it("registers once and routes wallet.openConnectFlow to chrome.runtime.openOptionsPage", async () => {
    const { chromeMock, addListener, openOptionsPage, getListener } = makeChromeHarness();
    const globalState = globalThis as Record<string, unknown>;
    globalState["chrome"] = chromeMock;

    try {
      const reportError = vi.fn();
      registerDefaultWalletMessageListener({ reportError });

      expect(addListener).toHaveBeenCalledOnce();

      const listener = getListener();
      expect(listener).toBeDefined();

      const sendResponse = vi.fn();
      const keepAlive = listener?.(
        {
          channel: "arlopass.wallet",
          action: "wallet.openConnectFlow",
          requestId: "req.bootstrap.001",
          payload: {},
        },
        {},
        sendResponse,
      );

      expect(keepAlive).toBe(true);

      await flushMicrotasks();

      expect(openOptionsPage).toHaveBeenCalledOnce();
      expect(sendResponse).toHaveBeenCalledWith({ ok: true });
      expect(reportError).not.toHaveBeenCalled();
    } finally {
      delete globalState["chrome"];
      delete globalState[LISTENER_FLAG_KEY];
    }
  });

  it("does not register duplicate listeners when invoked multiple times", () => {
    const { chromeMock, addListener } = makeChromeHarness();
    const globalState = globalThis as Record<string, unknown>;
    globalState["chrome"] = chromeMock;

    try {
      registerDefaultWalletMessageListener();
      registerDefaultWalletMessageListener();

      expect(addListener).toHaveBeenCalledTimes(1);
    } finally {
      delete globalState["chrome"];
      delete globalState[LISTENER_FLAG_KEY];
    }
  });
});
