import { useCallback } from "react";
import { Box } from "@mantine/core";
import { PopupShell } from "../PopupShell.js";
import { WalletHeader } from "../WalletHeader.js";
import { SelectProviderStep } from "./SelectProviderStep.js";
import { ChooseCredentialStep } from "./ChooseCredentialStep.js";
import { EnterCredentialsStep } from "./EnterCredentialsStep.js";
import { TestConnectionStep } from "./TestConnectionStep.js";
import { ConnectionResultStep } from "./ConnectionResultStep.js";
import {
  ONBOARDING_PROVIDERS,
  getDefaultFieldValues,
  getDefaultCredentialName,
} from "./provider-registry.js";
import { saveCredential, touchCredential } from "./credential-storage.js";
import { onboardingReducer, INITIAL_STATE } from "./onboarding-state.js";
import { usePersistedReducer } from "../../hooks/usePersistedReducer.js";
import { tokens } from "../theme.js";
import { createCloudConnectors } from "../../../options/connectors/index.js";
import {
  ensureBridgeHandshakeSession,
  clearBridgeHandshakeSessionCache,
} from "../../../transport/bridge-handshake.js";
import {
  parseBridgePairingState,
  unwrapPairingKeyMaterial,
} from "../../../transport/bridge-pairing.js";
import { autoPair } from "./setup-state.js";
import type {
  CloudConnectorDependencies,
  ConnectorDefinition,
} from "../../../options/connectors/types.js";

const PROVIDER_ID_PREFIX = "byom.wallet.provider";

function createProviderId(connectorId: string): string {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${PROVIDER_ID_PREFIX}.${connectorId}.${Date.now().toString(36)}.${randomPart}`;
}

function formatNativeHostRuntimeError(rawMessage: string): string {
  return `Native host not reachable: ${rawMessage}`;
}

const DEFAULT_CLOUD_POLICY_VERSION = "policy.unknown";

/**
 * Inject extensionId, origin, and policyVersion into cloud.connection.complete
 * messages — mirrors the withCloudConnectionBinding middleware from options.ts.
 */
function withCloudConnectionBinding(
  message: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  if (message["type"] !== "cloud.connection.complete") return message;
  const extensionId =
    typeof chrome.runtime.id === "string" ? chrome.runtime.id.trim() : "";
  const origin =
    typeof globalThis.location?.origin === "string"
      ? globalThis.location.origin.trim()
      : "";
  return {
    ...message,
    extensionId:
      typeof message["extensionId"] === "string" &&
      (message["extensionId"] as string).length > 0
        ? message["extensionId"]
        : extensionId,
    origin:
      typeof message["origin"] === "string" &&
      (message["origin"] as string).length > 0
        ? message["origin"]
        : origin,
    policyVersion:
      typeof message["policyVersion"] === "string" &&
      (message["policyVersion"] as string).length > 0
        ? message["policyVersion"]
        : DEFAULT_CLOUD_POLICY_VERSION,
  };
}

const PAIRING_STATE_KEY = "byom.wallet.bridgePairing.v1";

/** Resolve pairing secret from wrapped pairing state for HMAC handshake. */
async function resolvePairingSecret(): Promise<string | undefined> {
  const state = await new Promise<Record<string, unknown>>((resolve) => {
    chrome.storage.local.get([PAIRING_STATE_KEY], (result) => resolve(result));
  });
  const pairingState = parseBridgePairingState(state[PAIRING_STATE_KEY]);
  if (pairingState === undefined) return undefined;
  const extensionId = chrome.runtime.id ?? "";
  const unwrapped = await unwrapPairingKeyMaterial({
    pairingState,
    runtimeId: extensionId,
  });
  return unwrapped?.pairingKeyHex;
}

/** Resolve pairing handle from stored pairing state. */
async function resolvePairingHandle(): Promise<string | undefined> {
  const state = await new Promise<Record<string, unknown>>((resolve) => {
    chrome.storage.local.get([PAIRING_STATE_KEY], (result) => resolve(result));
  });
  const pairingState = parseBridgePairingState(state[PAIRING_STATE_KEY]);
  return pairingState?.pairingHandle;
}

/**
 * Persistent native messaging port for the wizard.
 * Using connectNative (not sendNativeMessage) ensures all messages go to the
 * SAME bridge process — critical for cloud.connection.complete → cloud.models.discover
 * flow where the connection handle must persist across calls.
 */
let persistentPort: chrome.runtime.Port | null = null;
let portRequestId = 0;
const pendingRequests = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function getPersistentPort(hostName: string): chrome.runtime.Port {
  if (persistentPort !== null) return persistentPort;

  const port = chrome.runtime.connectNative(hostName);
  port.onMessage.addListener((response: unknown) => {
    if (typeof response === "object" && response !== null) {
      const id = (response as Record<string, unknown>)["_bridgeRequestId"];
      if (typeof id === "string") {
        const pending = pendingRequests.get(id);
        if (pending !== undefined) {
          pendingRequests.delete(id);
          pending.resolve(response);
        }
      }
    }
  });
  port.onDisconnect.addListener(() => {
    persistentPort = null;
    for (const [, pending] of pendingRequests) {
      pending.reject(new Error("Bridge port disconnected."));
    }
    pendingRequests.clear();
  });
  persistentPort = port;
  return port;
}

/** Send a native message via the persistent port. Tags with _bridgeRequestId for routing. */
function rawSendNativeMessage(
  hostName: string,
  message: Record<string, unknown>,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    try {
      const id = `wizard.${String(++portRequestId)}.${Date.now().toString(36)}`;
      const port = getPersistentPort(hostName);
      pendingRequests.set(id, { resolve, reject });
      port.postMessage({ ...message, _bridgeRequestId: id });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/** Cached session token from the most recent handshake. */
let cachedSessionToken: string | undefined;

/**
 * Send a native message to the bridge, automatically performing
 * the HMAC handshake if no active session exists.
 *
 * Every message is enriched with the sessionToken so the bridge
 * accepts it as authenticated.
 */
async function sendNativeMessage(
  hostName: string,
  message: Readonly<Record<string, unknown>>,
  _options?: Readonly<{ timeoutMs?: number }>,
): Promise<
  | Readonly<{ ok: true; response: unknown }>
  | Readonly<{ ok: false; errorMessage: string }>
> {
  try {
    // Ensure pairing exists — auto-pair if needed
    const secret = await resolvePairingSecret();
    if (secret === undefined) {
      // No pairing state — attempt auto-pair with bridge
      const pairResult = await autoPair();
      if (!pairResult.success) {
        return {
          ok: false,
          errorMessage: `Bridge pairing failed: ${pairResult.error ?? "unknown error"}. Try restarting the bridge.`,
        };
      }
      // Clear any cached handshake sessions so the new pairing key is picked up
      clearBridgeHandshakeSessionCache();
    }

    // Ensure handshake session (cached across calls, re-handshakes on expiry)
    const session = await ensureBridgeHandshakeSession({
      hostName,
      extensionId: chrome.runtime.id ?? "",
      sendNativeMessage: rawSendNativeMessage,
      resolveBridgeSharedSecret: async () => resolvePairingSecret(),
      resolveBridgePairingHandle: async () => resolvePairingHandle(),
    });
    cachedSessionToken = session.sessionToken;

    const enrichedMessage = withCloudConnectionBinding({
      ...message,
      sessionToken: cachedSessionToken,
    });

    return await rawSendNativeMessage(hostName, enrichedMessage).then(
      (response) => ({ ok: true as const, response }),
      (error) => ({
        ok: false as const,
        errorMessage: error instanceof Error ? error.message : String(error),
      }),
    );
  } catch (error) {
    return {
      ok: false,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

const deps: CloudConnectorDependencies = {
  sendNativeMessage,
  formatNativeHostRuntimeError,
  defaultNativeHostName: "com.byom.bridge",
};

const cloudConnectors = createCloudConnectors(deps);

/** Simple Ollama connector for the popup wizard */
const ollamaConnector: ConnectorDefinition = {
  id: "ollama",
  label: "Ollama (Local)",
  type: "local",
  defaultName: "Ollama Local",
  fields: [],
  async testConnection(config) {
    const baseUrl = (config["baseUrl"] ?? "http://localhost:11434").replace(
      /\/+$/,
      "",
    );
    try {
      const versionResp = await fetch(`${baseUrl}/api/version`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!versionResp.ok)
        return {
          ok: false,
          status: "disconnected",
          message: `Ollama returned HTTP ${String(versionResp.status)}`,
          models: [],
        };
      const tagsResp = await fetch(`${baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!tagsResp.ok)
        return {
          ok: true,
          status: "connected",
          message: "Connected but could not list models.",
          models: [],
        };
      const tagsData = (await tagsResp.json()) as {
        models?: { name: string }[];
      };
      const models = (tagsData.models ?? []).map((m) => ({
        id: m.name,
        name: m.name,
      }));
      return {
        ok: true,
        status: "connected",
        message: "Ollama is reachable.",
        models,
      };
    } catch (err) {
      return {
        ok: false,
        status: "disconnected",
        message: err instanceof Error ? err.message : String(err),
        models: [],
      };
    }
  },
  sanitizeMetadata(config) {
    return { baseUrl: config["baseUrl"] ?? "http://localhost:11434" };
  },
};

/** Creates a CLI bridge connector for a specific CLI type. */
function createCliConnector(options: {
  id: string;
  label: string;
  defaultName: string;
  defaultCliType: string;
}): ConnectorDefinition {
  return {
    id: options.id,
    label: options.label,
    type: "cli",
    defaultName: options.defaultName,
    fields: [],
    async testConnection(config) {
      const hostName = config["nativeHostName"] ?? "com.byom.bridge";
      const cliType = config["cliType"] ?? options.defaultCliType;

      // Verify the bridge is reachable via handshake challenge.
      const challengeResult = await sendNativeMessage(
        hostName,
        {
          type: "handshake.challenge",
        },
        { timeoutMs: 5_000 },
      );
      if (!challengeResult.ok) {
        return {
          ok: false,
          status: "disconnected",
          message: formatNativeHostRuntimeError(challengeResult.errorMessage),
          models: [],
        };
      }

      // Fetch models from the bridge.
      const modelListResult = await sendNativeMessage(
        hostName,
        {
          type: "cli.models.list",
          cliType,
        },
        { timeoutMs: 10_000 },
      );
      if (!modelListResult.ok) {
        return {
          ok: false,
          status: "attention",
          message: `Bridge reachable but model listing failed: ${modelListResult.errorMessage}`,
          models: [],
        };
      }

      const resp = modelListResult.response;
      if (
        typeof resp === "object" &&
        resp !== null &&
        !Array.isArray(resp) &&
        (resp as Record<string, unknown>)["type"] === "cli.models.list" &&
        Array.isArray((resp as Record<string, unknown>)["models"])
      ) {
        const rawModels = (resp as Record<string, unknown>)[
          "models"
        ] as unknown[];
        const models: { id: string; name: string }[] = [];
        for (const entry of rawModels) {
          if (
            typeof entry === "object" &&
            entry !== null &&
            !Array.isArray(entry) &&
            typeof (entry as Record<string, unknown>)["id"] === "string" &&
            typeof (entry as Record<string, unknown>)["name"] === "string"
          ) {
            models.push({
              id: (entry as Record<string, unknown>)["id"] as string,
              name: (entry as Record<string, unknown>)["name"] as string,
            });
          }
        }
        return {
          ok: true,
          status: "connected",
          message: "Native bridge is reachable.",
          models,
        };
      }

      // Bridge responded but with unexpected payload — still treat as connected with 0 models.
      return {
        ok: true,
        status: "connected",
        message: "Native bridge is reachable.",
        models: [],
      };
    },
    sanitizeMetadata(config) {
      return {
        nativeHostName: config["nativeHostName"] ?? "com.byom.bridge",
        cliType: config["cliType"] ?? options.defaultCliType,
      };
    },
  };
}

const copilotCliConnector = createCliConnector({
  id: "local-cli-bridge",
  label: "Native Bridge Host (CLI)",
  defaultName: "GitHub Copilot CLI",
  defaultCliType: "copilot-cli",
});

const claudeCodeConnector = createCliConnector({
  id: "cli-claude-code",
  label: "Claude Code (CLI)",
  defaultName: "Claude Code",
  defaultCliType: "claude-code",
});

const allConnectors: readonly ConnectorDefinition[] = [
  ...cloudConnectors,
  ollamaConnector,
  copilotCliConnector,
  claudeCodeConnector,
];

function findConnector(connectorId: string): ConnectorDefinition | undefined {
  return allConnectors.find((c) => c.id === connectorId);
}

export type AddProviderWizardProps = {
  onClose: () => void;
  onSaved?: (() => void) | undefined;
  /** When true, skip PopupShell/WalletHeader — for embedding in options page or other full-width layouts. */
  embedded?: boolean | undefined;
};

export function AddProviderWizard({
  onClose,
  onSaved,
  embedded,
}: AddProviderWizardProps) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [state, dispatch, _stateRestored] = usePersistedReducer(
    "byom.popup.addProvider.v1",
    onboardingReducer,
    INITIAL_STATE,
  );

  const selectedProvider =
    state.selectedConnectorId !== null
      ? (ONBOARDING_PROVIDERS.find(
          (p) => p.connectorId === state.selectedConnectorId,
        ) ?? null)
      : null;

  const clearPersistedState = useCallback(() => {
    try {
      chrome.storage.session.remove(["byom.popup.addProvider.v1"]);
    } catch {
      /* ignore */
    }
  }, []);

  const handleBack = useCallback(() => {
    if (state.step === "select-provider") {
      clearPersistedState();
      onClose();
    } else {
      dispatch({ type: "GO_BACK" });
    }
  }, [state.step, onClose]);

  const handleTest = useCallback(async () => {
    if (selectedProvider === null) return;

    dispatch({ type: "START_TEST" });

    const connector = findConnector(selectedProvider.connectorId);
    if (connector === undefined) {
      dispatch({ type: "TEST_FAILURE", message: "Connector not found." });
      return;
    }

    const config: Record<string, string> = {
      ...state.fieldValues,
      methodId: selectedProvider.defaultMethodId,
      nativeHostName: state.fieldValues["nativeHostName"] ?? "com.byom.bridge",
      baseUrl:
        state.fieldValues["baseUrl"] ??
        getDefaultBaseUrl(selectedProvider.connectorId),
    };

    try {
      const result = await connector.testConnection(config);
      if (result.ok) {
        dispatch({
          type: "TEST_SUCCESS",
          message: `${selectedProvider.shortLabel} connection was established successfully and is ready to be saved.`,
          modelCount: result.models.length,
        });
      } else {
        dispatch({ type: "TEST_FAILURE", message: result.message });
      }
    } catch (err) {
      dispatch({
        type: "TEST_FAILURE",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [selectedProvider, state.fieldValues]);

  const handleSave = useCallback(async () => {
    if (
      selectedProvider === null ||
      state.testResult === null ||
      !state.testResult.ok
    )
      return;

    dispatch({ type: "START_SAVE" });

    const connector = findConnector(selectedProvider.connectorId);
    if (connector === undefined) return;

    const config: Record<string, string> = {
      ...state.fieldValues,
      methodId: selectedProvider.defaultMethodId,
      nativeHostName: state.fieldValues["nativeHostName"] ?? "com.byom.bridge",
      baseUrl:
        state.fieldValues["baseUrl"] ??
        getDefaultBaseUrl(selectedProvider.connectorId),
    };

    const sanitized = connector.sanitizeMetadata(config);

    // Persist credential with full config including secrets.
    // chrome.storage.local is extension-private and encrypted at rest.
    if (
      state.selectedCredentialId != null &&
      state.selectedCredentialId.length > 0
    ) {
      await touchCredential(state.selectedCredentialId);
    } else {
      await saveCredential(
        selectedProvider.connectorId,
        state.credentialName || `${selectedProvider.shortLabel} Key`,
        config,
      );
    }

    const providerName =
      state.providerName.trim() || selectedProvider.defaultName;
    const newProvider: {
      id: string;
      name: string;
      type: "local" | "cloud" | "cli";
      status: string;
      models: { id: string; name: string }[];
      lastSyncedAt: number;
      metadata: Readonly<Record<string, string>>;
    } = {
      id: createProviderId(selectedProvider.connectorId),
      name: providerName,
      type: selectedProvider.type,
      status: "connected",
      models: [],
      lastSyncedAt: Date.now(),
      metadata: sanitized,
    };

    // Re-run test to get models for storage
    try {
      const testResult = await connector.testConnection(config);
      if (testResult.ok) {
        newProvider.models = testResult.models.map((m) => ({
          id: m.id,
          name: m.name,
        }));
        newProvider.status = testResult.status;
        if (testResult.metadata !== undefined) {
          newProvider.metadata = { ...sanitized, ...testResult.metadata };
        }
      }
    } catch {
      // Use existing test result if re-test fails
    }

    // Read existing providers, merge, and save
    const storageData = await new Promise<Record<string, unknown>>(
      (resolve) => {
        chrome.storage.local.get(
          ["byom.wallet.providers.v1", "byom.wallet.activeProvider.v1"],
          (result) => resolve(result as Record<string, unknown>),
        );
      },
    );

    const existingProviders = Array.isArray(
      storageData["byom.wallet.providers.v1"],
    )
      ? (storageData["byom.wallet.providers.v1"] as unknown[])
      : [];

    const providers = [...existingProviders, newProvider];

    // Auto-activate if no active provider
    const existingActive = storageData["byom.wallet.activeProvider.v1"];
    const activeProvider =
      existingActive != null
        ? existingActive
        : { providerId: newProvider.id, modelId: newProvider.models[0]?.id };

    await new Promise<void>((resolve) => {
      chrome.storage.local.set(
        {
          "byom.wallet.providers.v1": providers,
          "byom.wallet.activeProvider.v1": activeProvider,
          "byom.wallet.ui.lastError.v1": null,
        },
        () => resolve(),
      );
    });

    dispatch({ type: "SAVE_COMPLETE" });
    clearPersistedState();
    onSaved?.();
    if (!embedded) {
      onClose();
    }
  }, [
    selectedProvider,
    state,
    onClose,
    onSaved,
    clearPersistedState,
    embedded,
  ]);

  const content = (
    <Box
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        padding: embedded ? 0 : tokens.spacing.contentHPadding,
        paddingTop: embedded ? 0 : tokens.spacing.contentTopPadding,
        paddingBottom: embedded ? 0 : tokens.spacing.contentBottomPadding,
        gap: tokens.spacing.sectionGap,
      }}
    >
      {state.step === "select-provider" && (
        <SelectProviderStep
          selectedConnectorId={state.selectedConnectorId}
          onSelect={(id) => {
            const entry = ONBOARDING_PROVIDERS.find(
              (p) => p.connectorId === id,
            );
            dispatch({
              type: "SELECT_PROVIDER",
              connectorId: id,
              credentialName:
                entry != null ? getDefaultCredentialName(entry) : "",
              fieldValues: entry != null ? getDefaultFieldValues(entry) : {},
              providerName: entry?.defaultName ?? "",
            });
          }}
          onNext={() => {
            // If provider has no user-facing fields (e.g. CLI), skip straight to test
            if (
              selectedProvider !== null &&
              selectedProvider.requiredFields.length === 0
            ) {
              dispatch({ type: "GO_TO_TEST" });
            } else {
              dispatch({ type: "GO_TO_CHOOSE_CREDENTIAL" });
            }
          }}
        />
      )}

      {state.step === "choose-credential" && selectedProvider !== null && (
        <ChooseCredentialStep
          provider={selectedProvider}
          selectedCredentialId={state.selectedCredentialId}
          onSelectCredential={(cred) => {
            dispatch({
              type: "SELECT_CREDENTIAL",
              credentialId: cred.id,
              credentialName: cred.name,
              fieldValues: { ...cred.fields },
            });
          }}
          onCreateNew={() => {
            const entry = selectedProvider;
            dispatch({
              type: "SELECT_CREDENTIAL",
              credentialId: "",
              credentialName: getDefaultCredentialName(entry),
              fieldValues: getDefaultFieldValues(entry),
            });
            dispatch({ type: "GO_TO_CREATE_CREDENTIAL" });
          }}
          onUseSelected={() => {
            dispatch({ type: "GO_TO_TEST" });
          }}
        />
      )}

      {state.step === "enter-credentials" && selectedProvider !== null && (
        <EnterCredentialsStep
          provider={selectedProvider}
          credentialName={state.credentialName}
          fieldValues={state.fieldValues}
          onFieldChange={(key, value) =>
            dispatch({ type: "SET_FIELD", key, value })
          }
          onCredentialNameChange={(name) =>
            dispatch({ type: "SET_CREDENTIAL_NAME", name })
          }
          onNext={() => {
            if (state.providerName.trim().length === 0) {
              dispatch({
                type: "SET_PROVIDER_NAME",
                name: selectedProvider.defaultName,
              });
            }
            dispatch({ type: "GO_TO_TEST" });
          }}
        />
      )}

      {state.step === "test-connection" && selectedProvider !== null && (
        <TestConnectionStep
          provider={selectedProvider}
          credentialName={
            state.credentialName || `${selectedProvider.shortLabel} Key`
          }
          providerName={state.providerName}
          onProviderNameChange={(name) =>
            dispatch({ type: "SET_PROVIDER_NAME", name })
          }
          onTest={() => void handleTest()}
          testing={state.testing}
          testError={
            state.testResult !== null && !state.testResult.ok
              ? state.testResult.message
              : null
          }
        />
      )}

      {state.step === "connection-result" &&
        selectedProvider !== null &&
        state.testResult !== null &&
        state.testResult.ok && (
          <ConnectionResultStep
            provider={selectedProvider}
            credentialName={
              state.credentialName || `${selectedProvider.shortLabel} Key`
            }
            providerName={state.providerName || selectedProvider.defaultName}
            modelCount={state.testResult.modelCount}
            message={state.testResult.message}
            onSave={() => void handleSave()}
            saving={state.saving}
          />
        )}
    </Box>
  );

  if (embedded) {
    return content;
  }

  return (
    <PopupShell>
      <WalletHeader
        title="Add provider"
        onToggleCollapse={handleBack}
        onSettingsClick={onClose}
      />
      {content}
    </PopupShell>
  );
}

function getDefaultBaseUrl(connectorId: string): string {
  switch (connectorId) {
    case "cloud-anthropic":
      return "https://api.anthropic.com";
    case "cloud-openai":
      return "https://api.openai.com/v1";
    case "cloud-gemini":
      return "https://generativelanguage.googleapis.com";
    case "cloud-perplexity":
      return "https://api.perplexity.ai";
    default:
      return "";
  }
}
