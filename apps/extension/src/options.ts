type ProviderModel = Readonly<{
  id: string;
  name: string;
}>;

type ProviderStatus = "connected" | "disconnected" | "attention";

type StoredProvider = Readonly<{
  id: string;
  name: string;
  type: "local" | "cloud" | "cli";
  status: ProviderStatus;
  models: readonly ProviderModel[];
  lastSyncedAt?: number;
  metadata?: Readonly<Record<string, string>>;
}>;

type ActiveProviderRef = Readonly<{
  providerId: string;
  modelId?: string;
}>;

type ConnectionTestResult = Readonly<{
  ok: boolean;
  status: ProviderStatus;
  message: string;
  models: readonly ProviderModel[];
}>;

type ConnectorField = Readonly<{
  key: string;
  label: string;
  type: "text" | "password" | "url";
  placeholder?: string;
  required?: boolean;
  helpText?: string;
  maxLength?: number;
  minLength?: number;
}>;

type ConnectorDefinition = Readonly<{
  id: string;
  label: string;
  type: StoredProvider["type"];
  defaultName: string;
  fields: readonly ConnectorField[];
  testConnection(config: Readonly<Record<string, string>>): Promise<ConnectionTestResult>;
  sanitizeMetadata(config: Readonly<Record<string, string>>): Readonly<Record<string, string>>;
}>;

type ProviderStorageSnapshot = Readonly<{
  providers: readonly StoredProvider[];
  activeProvider: ActiveProviderRef | null;
}>;

const STORAGE_KEY_PROVIDERS = "byom.wallet.providers.v1";
const STORAGE_KEY_ACTIVE = "byom.wallet.activeProvider.v1";
const STORAGE_KEY_LAST_ERROR = "byom.wallet.ui.lastError.v1";
const PROVIDER_ID_PREFIX = "provider";

const OLLAMA_KNOWN_MODELS: readonly ProviderModel[] = [
  { id: "llama3.2", name: "Llama 3.2" },
  { id: "mistral", name: "Mistral" },
  { id: "qwen2.5", name: "Qwen 2.5" },
];

const CLAUDE_KNOWN_MODELS: readonly ProviderModel[] = [
  { id: "claude-opus-4-5", name: "Claude Opus 4.5" },
  { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
];

const LOCAL_BRIDGE_KNOWN_MODELS: readonly ProviderModel[] = [
  { id: "copilot-cli", name: "GitHub Copilot CLI" },
  { id: "claude-code", name: "Claude Code" },
  { id: "custom-cli", name: "Custom CLI Adapter" },
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error("Value must be a non-empty URL.");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Value must be a valid URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http:// and https:// URLs are allowed.");
  }

  return parsed.toString().replace(/\/$/, "");
}

function normalizeText(value: string, fallback = ""): string {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function createProviderId(connectorId: string): string {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${PROVIDER_ID_PREFIX}.${connectorId}.${Date.now().toString(36)}.${randomPart}`;
}

function parseStoredProvider(value: unknown): StoredProvider | null {
  if (!isRecord(value)) return null;

  if (
    typeof value["id"] !== "string" ||
    typeof value["name"] !== "string" ||
    (value["type"] !== "local" && value["type"] !== "cloud" && value["type"] !== "cli") ||
    (value["status"] !== "connected" &&
      value["status"] !== "disconnected" &&
      value["status"] !== "attention")
  ) {
    return null;
  }

  const rawModels = Array.isArray(value["models"]) ? value["models"] : [];
  const models: ProviderModel[] = [];
  for (const model of rawModels) {
    if (
      isRecord(model) &&
      typeof model["id"] === "string" &&
      typeof model["name"] === "string"
    ) {
      models.push({ id: model["id"], name: model["name"] });
    }
  }

  const metadata =
    isRecord(value["metadata"])
      ? Object.fromEntries(
          Object.entries(value["metadata"]).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : undefined;

  return {
    id: value["id"],
    name: value["name"],
    type: value["type"],
    status: value["status"],
    models,
    ...(typeof value["lastSyncedAt"] === "number" ? { lastSyncedAt: value["lastSyncedAt"] } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };
}

function parseActiveProvider(value: unknown): ActiveProviderRef | null {
  if (!isRecord(value) || typeof value["providerId"] !== "string") {
    return null;
  }

  return {
    providerId: value["providerId"],
    ...(typeof value["modelId"] === "string" ? { modelId: value["modelId"] } : {}),
  };
}

async function getStorageSnapshot(): Promise<ProviderStorageSnapshot> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY_PROVIDERS, STORAGE_KEY_ACTIVE], (rawState) => {
      const rawProviders = rawState[STORAGE_KEY_PROVIDERS];
      const providers = Array.isArray(rawProviders)
        ? rawProviders.map(parseStoredProvider).filter((provider): provider is StoredProvider => provider !== null)
        : [];
      const activeProvider = parseActiveProvider(rawState[STORAGE_KEY_ACTIVE]);

      resolve({ providers, activeProvider });
    });
  });
}

async function writeStorageState(state: {
  providers: readonly StoredProvider[];
  activeProvider: ActiveProviderRef | null;
  clearError?: boolean;
}): Promise<void> {
  const update: Record<string, unknown> = {
    [STORAGE_KEY_PROVIDERS]: state.providers,
    [STORAGE_KEY_ACTIVE]: state.activeProvider,
  };
  if (state.clearError === true) {
    update[STORAGE_KEY_LAST_ERROR] = null;
  }

  return new Promise((resolve, reject) => {
    chrome.storage.local.set(update, () => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError !== undefined) {
        reject(new Error(runtimeError.message ?? "Failed to write wallet state."));
        return;
      }
      resolve();
    });
  });
}

async function runFetchCheck(url: string, options: {
  method?: "GET" | "HEAD";
  headers?: Readonly<Record<string, string>>;
  timeoutMs?: number;
} = {}): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);

  const requestInit: RequestInit = {
    method: options.method ?? "GET",
    signal: abortController.signal,
  };

  if (options.headers !== undefined) {
    requestInit.headers = options.headers;
  }

  try {
    return await fetch(url, requestInit);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms.`);
    }

    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function formatValidationTransportError(options: {
  serviceName: string;
  endpoint: string;
  error: unknown;
}): string {
  const errorMessage = options.error instanceof Error
    ? options.error.message
    : String(options.error);
  const normalizedMessage = errorMessage.toLowerCase();

  if (normalizedMessage.includes("failed to fetch")) {
    return `Unable to reach ${options.serviceName} at ${options.endpoint}. Confirm the service is running and reload the extension to apply connect-src policy updates.`;
  }

  if (normalizedMessage.includes("timed out")) {
    return `${options.serviceName} did not respond before timeout at ${options.endpoint}.`;
  }

  return `${options.serviceName} validation failed: ${errorMessage}`;
}

const CONNECTORS: readonly ConnectorDefinition[] = [
  {
    id: "ollama",
    label: "Ollama (Local)",
    type: "local",
    defaultName: "Ollama Local",
    fields: [
      {
        key: "baseUrl",
        label: "Base URL",
        type: "url",
        placeholder: "http://localhost:11434",
        required: true,
        maxLength: 200,
        helpText: "Endpoint for your local Ollama runtime.",
      },
      {
        key: "modelHint",
        label: "Preferred Model (optional)",
        type: "text",
        placeholder: "llama3.2",
        maxLength: 80,
      },
    ],
    async testConnection(config): Promise<ConnectionTestResult> {
      const baseUrl = normalizeUrl(config["baseUrl"] ?? "http://localhost:11434");
      let response: Response;
      try {
        response = await runFetchCheck(`${baseUrl}/api/version`);
      } catch (error) {
        return {
          ok: false,
          status: "attention",
          message: formatValidationTransportError({
            serviceName: "Ollama",
            endpoint: `${baseUrl}/api/version`,
            error,
          }),
          models: [],
        };
      }

      if (!response.ok) {
        return {
          ok: false,
          status: "attention",
          message: `Ollama responded with HTTP ${response.status}.`,
          models: [],
        };
      }

      let models: ProviderModel[] = [...OLLAMA_KNOWN_MODELS];
      try {
        const tagsResponse = await runFetchCheck(`${baseUrl}/api/tags`);
        if (tagsResponse.ok) {
          const payload = (await tagsResponse.json()) as { models?: Array<{ name?: string }> };
          const discovered = (payload.models ?? [])
            .map((item) => item.name)
            .filter((name): name is string => typeof name === "string" && name.length > 0)
            .slice(0, 20)
            .map((name) => ({ id: name, name }));
          if (discovered.length > 0) {
            models = discovered;
          }
        }
      } catch {
        // Best-effort discovery; keep defaults.
      }

      const modelHint = normalizeText(config["modelHint"] ?? "");
      if (modelHint.length > 0 && !models.some((model) => model.id === modelHint)) {
        models = [{ id: modelHint, name: modelHint }, ...models];
      }

      return {
        ok: true,
        status: "connected",
        message: "Ollama is reachable.",
        models,
      };
    },
    sanitizeMetadata(config): Readonly<Record<string, string>> {
      return {
        baseUrl: normalizeUrl(config["baseUrl"] ?? "http://localhost:11434"),
      };
    },
  },
  {
    id: "claude-subscription",
    label: "Claude Subscription (Cloud)",
    type: "cloud",
    defaultName: "Claude Subscription",
    fields: [
      {
        key: "baseUrl",
        label: "API Base URL",
        type: "url",
        placeholder: "https://api.anthropic.com",
        required: true,
        maxLength: 200,
      },
      {
        key: "apiKey",
        label: "API Key (test only)",
        type: "password",
        required: true,
        minLength: 20,
        maxLength: 200,
        helpText: "Used only for test validation and never stored.",
      },
      {
        key: "modelHint",
        label: "Preferred Model (optional)",
        type: "text",
        placeholder: "claude-sonnet-4-5",
        maxLength: 100,
      },
    ],
    async testConnection(config): Promise<ConnectionTestResult> {
      const baseUrl = normalizeUrl(config["baseUrl"] ?? "https://api.anthropic.com");
      const apiKey = normalizeText(config["apiKey"] ?? "");
      if (apiKey.length < 20) {
        return {
          ok: false,
          status: "attention",
          message: "Provide a valid API key to test Claude connectivity.",
          models: [],
        };
      }

      let response: Response;
      try {
        response = await runFetchCheck(`${baseUrl}/v1/models`, {
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
        });
      } catch (error) {
        return {
          ok: false,
          status: "attention",
          message: formatValidationTransportError({
            serviceName: "Claude endpoint",
            endpoint: `${baseUrl}/v1/models`,
            error,
          }),
          models: [],
        };
      }

      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          status: "attention",
          message: "Authentication failed. Check your API key.",
          models: [],
        };
      }

      if (!response.ok && response.status >= 500) {
        return {
          ok: false,
          status: "attention",
          message: `Claude endpoint unavailable (HTTP ${response.status}).`,
          models: [],
        };
      }

      let models: ProviderModel[] = [...CLAUDE_KNOWN_MODELS];
      try {
        if (response.ok) {
          const payload = (await response.json()) as { data?: Array<{ id?: string }> };
          const discovered = (payload.data ?? [])
            .map((item) => item.id)
            .filter((id): id is string => typeof id === "string" && id.length > 0)
            .slice(0, 20)
            .map((id) => ({ id, name: id }));
          if (discovered.length > 0) {
            models = discovered;
          }
        }
      } catch {
        // Non-fatal. Keep known model list.
      }

      const modelHint = normalizeText(config["modelHint"] ?? "");
      if (modelHint.length > 0 && !models.some((model) => model.id === modelHint)) {
        models = [{ id: modelHint, name: modelHint }, ...models];
      }

      return {
        ok: true,
        status: "connected",
        message: "Claude endpoint validated.",
        models,
      };
    },
    sanitizeMetadata(config): Readonly<Record<string, string>> {
      return {
        baseUrl: normalizeUrl(config["baseUrl"] ?? "https://api.anthropic.com"),
      };
    },
  },
  {
    id: "local-cli-bridge",
    label: "Native Bridge Host (CLI clients)",
    type: "cli",
    defaultName: "Local CLI Bridge",
    fields: [
      {
        key: "nativeHostName",
        label: "Native Host Name",
        type: "text",
        required: true,
        maxLength: 120,
        placeholder: "com.byom.bridge",
      },
      {
        key: "modelHint",
        label: "Client/Model Hint (optional)",
        type: "text",
        placeholder: "copilot-cli",
        maxLength: 100,
      },
    ],
    async testConnection(config): Promise<ConnectionTestResult> {
      const hostName = normalizeText(config["nativeHostName"] ?? "com.byom.bridge", "com.byom.bridge");
      if (!/^[a-z0-9]+(\.[a-z0-9-]+)+$/.test(hostName)) {
        return {
          ok: false,
          status: "attention",
          message: "Native host name format is invalid.",
          models: [],
        };
      }

      const response = await new Promise<ConnectionTestResult>((resolve) => {
        try {
          chrome.runtime.sendNativeMessage(
            hostName,
            { type: "handshake.challenge" },
            (message) => {
              const runtimeError = chrome.runtime.lastError;
              if (runtimeError !== undefined) {
                const rawMessage = runtimeError.message ?? "unknown error";
                const hint =
                  rawMessage.includes("Specified native messaging host not found")
                    ? " Run `npm run dev:register-native-host`, then reload the extension and retry."
                    : rawMessage.includes("Error when communicating with the native messaging host")
                      ? " The native host process started but exited unexpectedly. Re-run `npm run dev:full` and verify bridge startup logs."
                      : "";
                resolve({
                  ok: false,
                  status: "attention",
                  message: `Native host not reachable: ${rawMessage}.${hint}`,
                  models: [],
                });
                return;
              }

              if (!isRecord(message) || message["type"] !== "handshake.challenge") {
                resolve({
                  ok: false,
                  status: "attention",
                  message: "Native host responded with an unexpected payload.",
                  models: [],
                });
                return;
              }

              resolve({
                ok: true,
                status: "connected",
                message: "Native bridge host is reachable.",
                models: [...LOCAL_BRIDGE_KNOWN_MODELS],
              });
            },
          );
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          resolve({
            ok: false,
            status: "attention",
            message: `Native host test failed: ${err.message}`,
            models: [],
          });
        }
      });

      const modelHint = normalizeText(config["modelHint"] ?? "");
      if (response.ok && modelHint.length > 0 && !response.models.some((model) => model.id === modelHint)) {
        return {
          ...response,
          models: [{ id: modelHint, name: modelHint }, ...response.models],
        };
      }

      return response;
    },
    sanitizeMetadata(config): Readonly<Record<string, string>> {
      return {
        nativeHostName: normalizeText(
          config["nativeHostName"] ?? "com.byom.bridge",
          "com.byom.bridge",
        ),
      };
    },
  },
];

function connectorById(connectorId: string): ConnectorDefinition {
  const connector = CONNECTORS.find((candidate) => candidate.id === connectorId);
  if (connector === undefined) {
    throw new Error(`Unknown connector: ${connectorId}`);
  }
  return connector;
}

function renderConnectorFields(container: HTMLElement, connector: ConnectorDefinition): void {
  const html = connector.fields
    .map((field) => {
      const requiredAttr = field.required === true ? " required" : "";
      const minLengthAttr =
        typeof field.minLength === "number" ? ` minlength="${field.minLength}"` : "";
      const maxLengthAttr =
        typeof field.maxLength === "number" ? ` maxlength="${field.maxLength}"` : "";
      const placeholderAttr =
        field.placeholder !== undefined ? ` placeholder="${escapeHtml(field.placeholder)}"` : "";
      const autoCompleteAttr = field.type === "password" ? ` autocomplete="off"` : "";

      return `<div class="form-row">
        <label for="field-${escapeHtml(field.key)}">${escapeHtml(field.label)}</label>
        <input
          id="field-${escapeHtml(field.key)}"
          name="${escapeHtml(field.key)}"
          type="${escapeHtml(field.type)}"${requiredAttr}${minLengthAttr}${maxLengthAttr}${placeholderAttr}${autoCompleteAttr}
        />
        ${field.helpText !== undefined ? `<p class="field-help">${escapeHtml(field.helpText)}</p>` : ""}
      </div>`;
    })
    .join("");

  container.innerHTML = html;
}

function collectConnectorFieldValues(
  form: HTMLFormElement,
  connector: ConnectorDefinition,
): Readonly<Record<string, string>> {
  const values: Record<string, string> = {};
  for (const field of connector.fields) {
    const input = form.elements.namedItem(field.key);
    if (!(input instanceof HTMLInputElement)) {
      throw new Error(`Missing field "${field.label}".`);
    }
    const value = input.value.trim();
    if (field.required === true && value.length === 0) {
      throw new Error(`"${field.label}" is required.`);
    }
    values[field.key] = value;
  }
  return values;
}

function setFeedback(
  node: HTMLElement,
  feedback: {
    kind: "success" | "error" | "info";
    title: string;
    message: string;
  },
): void {
  node.className = `options-feedback options-feedback--${feedback.kind}`;
  node.innerHTML = `<p class="options-feedback__title">${escapeHtml(feedback.title)}</p><p class="options-feedback__message">${escapeHtml(feedback.message)}</p>`;
}

function clearFeedback(node: HTMLElement): void {
  node.className = "options-feedback";
  node.innerHTML = "";
}

function renderConnectedProviders(
  container: HTMLElement,
  snapshot: ProviderStorageSnapshot,
): void {
  if (snapshot.providers.length === 0) {
    container.innerHTML = `<p class="providers-empty">No providers saved yet. Add one from the form on the left.</p>`;
    return;
  }

  const rows = snapshot.providers.map((provider) => {
    const isActive = snapshot.activeProvider?.providerId === provider.id;
    const statusLabel =
      provider.status === "connected"
        ? "Connected"
        : provider.status === "attention"
          ? "Needs attention"
          : "Disconnected";
    const modelOptions = provider.models
      .map(
        (model) =>
          `<option value="${escapeHtml(model.id)}"${snapshot.activeProvider?.providerId === provider.id &&
          snapshot.activeProvider.modelId === model.id
            ? " selected"
            : ""}>${escapeHtml(model.name)}</option>`,
      )
      .join("");

    return `<article class="provider-row" data-provider-id="${escapeHtml(provider.id)}">
      <div class="provider-row__main">
        <div class="provider-row__heading">
          <h3>${escapeHtml(provider.name)}</h3>
          <span class="provider-status provider-status--${escapeHtml(provider.status)}">${escapeHtml(statusLabel)}</span>
          ${isActive ? `<span class="provider-active">Active</span>` : ""}
        </div>
        <p class="provider-row__meta">${escapeHtml(provider.type.toUpperCase())} · ${escapeHtml(provider.id)}</p>
      </div>
      <div class="provider-row__actions">
        <button class="btn btn--secondary btn--small" type="button" data-provider-action="activate" data-provider-id="${escapeHtml(provider.id)}">
          ${isActive ? "Active" : "Set Active"}
        </button>
        ${
          provider.models.length > 0
            ? `<select class="provider-model-select" data-provider-action="model" data-provider-id="${escapeHtml(provider.id)}">${modelOptions}</select>`
            : ""
        }
        <button class="btn btn--danger btn--small" type="button" data-provider-action="remove" data-provider-id="${escapeHtml(provider.id)}">
          Remove
        </button>
      </div>
    </article>`;
  });

  container.innerHTML = rows.join("");
}

async function refreshConnectedProviders(container: HTMLElement): Promise<ProviderStorageSnapshot> {
  const snapshot = await getStorageSnapshot();
  renderConnectedProviders(container, snapshot);
  return snapshot;
}

async function handleProviderAction(
  event: Event,
  providersContainer: HTMLElement,
  feedbackNode: HTMLElement,
): Promise<void> {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const actionButton = target.closest("[data-provider-action]");
  if (!(actionButton instanceof HTMLElement)) {
    return;
  }

  const action = actionButton.dataset["providerAction"];
  const providerId = actionButton.dataset["providerId"];
  if (action === undefined || providerId === undefined) {
    return;
  }

  const snapshot = await getStorageSnapshot();
  const provider = snapshot.providers.find((item) => item.id === providerId);
  if (provider === undefined) {
    setFeedback(feedbackNode, {
      kind: "error",
      title: "Provider missing",
      message: "The provider could not be found in storage.",
    });
    await refreshConnectedProviders(providersContainer);
    return;
  }

  if (action === "activate") {
    const defaultModelId = provider.models[0]?.id;
    await writeStorageState({
      providers: snapshot.providers,
      activeProvider: { providerId, ...(defaultModelId !== undefined ? { modelId: defaultModelId } : {}) },
      clearError: true,
    });
    setFeedback(feedbackNode, {
      kind: "success",
      title: "Provider activated",
      message: `${provider.name} is now active.`,
    });
    await refreshConnectedProviders(providersContainer);
    return;
  }

  if (action === "remove") {
    const nextProviders = snapshot.providers.filter((item) => item.id !== providerId);
    const nextActive =
      snapshot.activeProvider !== null && snapshot.activeProvider.providerId === providerId
        ? null
        : snapshot.activeProvider;

    await writeStorageState({
      providers: nextProviders,
      activeProvider: nextActive,
      clearError: true,
    });
    setFeedback(feedbackNode, {
      kind: "info",
      title: "Provider removed",
      message: `${provider.name} has been removed from wallet storage.`,
    });
    await refreshConnectedProviders(providersContainer);
    return;
  }
}

async function handleProviderModelChange(
  event: Event,
  providersContainer: HTMLElement,
  feedbackNode: HTMLElement,
): Promise<void> {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement) || target.dataset["providerAction"] !== "model") {
    return;
  }

  const providerId = target.dataset["providerId"];
  const modelId = target.value;
  if (providerId === undefined || modelId.length === 0) {
    return;
  }

  const snapshot = await getStorageSnapshot();
  const provider = snapshot.providers.find((item) => item.id === providerId);
  if (provider === undefined) {
    setFeedback(feedbackNode, {
      kind: "error",
      title: "Provider missing",
      message: "Unable to update model for an unknown provider.",
    });
    return;
  }

  const modelExists = provider.models.some((model) => model.id === modelId);
  if (!modelExists) {
    setFeedback(feedbackNode, {
      kind: "error",
      title: "Invalid model",
      message: "Selected model does not belong to this provider.",
    });
    await refreshConnectedProviders(providersContainer);
    return;
  }

  await writeStorageState({
    providers: snapshot.providers,
    activeProvider: { providerId, modelId },
    clearError: true,
  });
  setFeedback(feedbackNode, {
    kind: "success",
    title: "Model selected",
    message: `${provider.name} now uses model ${modelId}.`,
  });
  await refreshConnectedProviders(providersContainer);
}

function setupConnectorPicker(
  selectElement: HTMLSelectElement,
  fieldsContainer: HTMLElement,
  feedbackNode: HTMLElement,
): void {
  selectElement.innerHTML = CONNECTORS.map(
    (connector) =>
      `<option value="${escapeHtml(connector.id)}">${escapeHtml(connector.label)}</option>`,
  ).join("");
  const initialConnector = CONNECTORS.at(0);
  if (initialConnector === undefined) {
    throw new Error("No connectors are configured.");
  }
  renderConnectorFields(fieldsContainer, initialConnector);
  clearFeedback(feedbackNode);

  selectElement.addEventListener("change", () => {
    const connector = connectorById(selectElement.value);
    renderConnectorFields(fieldsContainer, connector);
    clearFeedback(feedbackNode);
  });
}

function setButtonsBusy(
  buttons: readonly HTMLButtonElement[],
  busy: boolean,
): void {
  for (const button of buttons) {
    button.disabled = busy;
    button.setAttribute("aria-disabled", busy ? "true" : "false");
  }
}

async function onSaveProvider(
  form: HTMLFormElement,
  feedbackNode: HTMLElement,
  providersContainer: HTMLElement,
): Promise<void> {
  const connectorSelect = form.elements.namedItem("connector");
  if (!(connectorSelect instanceof HTMLSelectElement)) {
    throw new Error("Connector selector is not available.");
  }

  const connector = connectorById(connectorSelect.value);
  const fieldValues = collectConnectorFieldValues(form, connector);
  const testResult = await connector.testConnection(fieldValues);

  if (!testResult.ok) {
    setFeedback(feedbackNode, {
      kind: "error",
      title: "Connection test failed",
      message: testResult.message,
    });
    return;
  }

  const displayNameInput = form.elements.namedItem("displayName");
  const displayName =
    displayNameInput instanceof HTMLInputElement
      ? normalizeText(displayNameInput.value, connector.defaultName)
      : connector.defaultName;

  const snapshot = await getStorageSnapshot();
  const existingByName = snapshot.providers.find(
    (provider) => provider.name.toLowerCase() === displayName.toLowerCase(),
  );
  if (existingByName !== undefined) {
    setFeedback(feedbackNode, {
      kind: "error",
      title: "Duplicate display name",
      message: "A provider with that display name already exists. Use a different name.",
    });
    return;
  }

  const provider: StoredProvider = {
    id: createProviderId(connector.id),
    name: displayName,
    type: connector.type,
    status: testResult.status,
    models: testResult.models,
    lastSyncedAt: Date.now(),
    metadata: connector.sanitizeMetadata(fieldValues),
  };

  const providers = [...snapshot.providers, provider];
  const activeProvider =
    snapshot.activeProvider ??
    (provider.models[0] !== undefined
      ? { providerId: provider.id, modelId: provider.models[0].id }
      : { providerId: provider.id });

  await writeStorageState({
    providers,
    activeProvider,
    clearError: true,
  });

  setFeedback(feedbackNode, {
    kind: "success",
    title: "Provider saved",
    message: `${provider.name} connected successfully.`,
  });

  const displayInput = form.elements.namedItem("displayName");
  if (displayInput instanceof HTMLInputElement) {
    displayInput.value = "";
  }

  for (const field of connector.fields) {
    const fieldElement = form.elements.namedItem(field.key);
    if (fieldElement instanceof HTMLInputElement && field.type === "password") {
      fieldElement.value = "";
    }
  }

  await refreshConnectedProviders(providersContainer);
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("provider-connect-form");
  const connectorSelect = document.getElementById("provider-connector");
  const fieldsContainer = document.getElementById("provider-connector-fields");
  const feedbackNode = document.getElementById("provider-connect-feedback");
  const btnTest = document.getElementById("btn-test-connection");
  const btnSave = document.getElementById("btn-save-provider");
  const providersContainer = document.getElementById("connected-providers-list");

  if (
    !(form instanceof HTMLFormElement) ||
    !(connectorSelect instanceof HTMLSelectElement) ||
    !(fieldsContainer instanceof HTMLElement) ||
    !(feedbackNode instanceof HTMLElement) ||
    !(btnTest instanceof HTMLButtonElement) ||
    !(btnSave instanceof HTMLButtonElement) ||
    !(providersContainer instanceof HTMLElement)
  ) {
    console.error("BYOM Wallet options page failed to initialize required elements.");
    return;
  }

  setupConnectorPicker(connectorSelect, fieldsContainer, feedbackNode);
  void refreshConnectedProviders(providersContainer);

  const actionButtons: readonly HTMLButtonElement[] = [btnTest, btnSave];

  btnTest.addEventListener("click", () => {
    const connector = connectorById(connectorSelect.value);

    setButtonsBusy(actionButtons, true);
    clearFeedback(feedbackNode);

    (async () => {
      const fieldValues = collectConnectorFieldValues(form, connector);
      const result = await connector.testConnection(fieldValues);
      if (result.ok) {
        setFeedback(feedbackNode, {
          kind: "success",
          title: "Connection successful",
          message: result.message,
        });
      } else {
        setFeedback(feedbackNode, {
          kind: "error",
          title: "Connection failed",
          message: result.message,
        });
      }
    })()
      .catch((error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error));
        setFeedback(feedbackNode, {
          kind: "error",
          title: "Validation error",
          message: err.message,
        });
      })
      .finally(() => {
        setButtonsBusy(actionButtons, false);
      });
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    setButtonsBusy(actionButtons, true);
    clearFeedback(feedbackNode);

    onSaveProvider(form, feedbackNode, providersContainer)
      .catch((error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error));
        setFeedback(feedbackNode, {
          kind: "error",
          title: "Save failed",
          message: err.message,
        });
      })
      .finally(() => {
        setButtonsBusy(actionButtons, false);
      });
  });

  providersContainer.addEventListener("click", (event) => {
    void handleProviderAction(event, providersContainer, feedbackNode).catch((error: unknown) => {
      const err = error instanceof Error ? error : new Error(String(error));
      setFeedback(feedbackNode, {
        kind: "error",
        title: "Provider action failed",
        message: err.message,
      });
    });
  });

  providersContainer.addEventListener("change", (event) => {
    void handleProviderModelChange(event, providersContainer, feedbackNode).catch((error: unknown) => {
      const err = error instanceof Error ? error : new Error(String(error));
      setFeedback(feedbackNode, {
        kind: "error",
        title: "Model update failed",
        message: err.message,
      });
    });
  });
});

