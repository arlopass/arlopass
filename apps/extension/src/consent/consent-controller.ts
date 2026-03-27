import type { ProtocolCapability } from "@arlopass/protocol";

import type {
  ExtensionEventEmitter,
  ExtensionEventMap,
} from "../events.js";
import {
  GRANT_SCOPE_WILDCARD,
  GRANT_TYPES,
  type GrantScope,
  type GrantType,
  canonicalizeGrantTarget,
  isGrantType,
} from "../permissions/grant-types.js";

export type ConsentPromptRequest = Readonly<{
  origin: string;
  providerId: GrantScope;
  modelId: GrantScope;
  capabilities: readonly ProtocolCapability[];
  capabilityLabels: readonly string[];
  grantTypeOptions: readonly GrantType[];
}>;

export type ConsentPromptResponse =
  | Readonly<{
    granted: true;
    grantType: GrantType;
  }>
  | Readonly<{
    granted: false;
    denialReason?:
    | "user-denied"
    | "dismissed"
    | "unsupported-request"
    | "transport-error";
  }>;

export type ConsentPromptAdapter = Readonly<{
  showConsentPrompt(request: ConsentPromptRequest): Promise<ConsentPromptResponse>;
  showRevocationNotice?(
    request: Readonly<{
      origin: string;
      providerId: GrantScope;
      modelId: GrantScope;
      capabilities: readonly ProtocolCapability[];
      revokedAt: number;
    }>,
  ): Promise<void> | void;
}>;

export type ConsentRequest = Readonly<{
  origin: string;
  providerId: string;
  modelId: string;
  capabilities: readonly ProtocolCapability[];
  grantTypeOptions?: readonly GrantType[];
}>;

export type ConsentDecision = Readonly<{
  granted: boolean;
  origin: string;
  providerId: GrantScope;
  modelId: GrantScope;
  capabilities: readonly ProtocolCapability[];
  grantType?: GrantType;
  denialReason?:
  | "user-denied"
  | "dismissed"
  | "unsupported-request"
  | "transport-error";
}>;

export type ConsentControllerOptions = Readonly<{
  promptAdapter: ConsentPromptAdapter;
  now?: () => number;
  events?: ExtensionEventEmitter<ExtensionEventMap>;
}>;

export class ConsentControllerError extends Error {
  readonly code:
    | "invalid-request"
    | "invalid-response"
    | "prompt-failed"
    | "invalid-options";

  constructor(
    message: string,
    code:
      | "invalid-request"
      | "invalid-response"
      | "prompt-failed"
      | "invalid-options",
    options: Readonly<{ cause?: Error }> = {},
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "ConsentControllerError";
    this.code = code;
  }
}

const CAPABILITY_LABELS: Readonly<Record<ProtocolCapability, string>> = {
  "provider.list": "List available providers and models",
  "session.create": "Create provider sessions",
  "chat.completions": "Send chat completion requests",
  "chat.stream": "Stream chat responses",
  "usage.query": "Query token usage statistics",
};

function normalizeGrantTypeOptions(
  grantTypeOptions: readonly GrantType[] | undefined,
): readonly GrantType[] {
  if (grantTypeOptions === undefined) {
    return GRANT_TYPES;
  }

  if (grantTypeOptions.length === 0) {
    throw new ConsentControllerError(
      "grantTypeOptions must include at least one available grant type.",
      "invalid-options",
    );
  }

  const deduped = new Set<GrantType>();
  for (const grantType of grantTypeOptions) {
    if (!isGrantType(grantType)) {
      throw new ConsentControllerError(
        `Unsupported grant type option "${String(grantType)}".`,
        "invalid-options",
      );
    }

    deduped.add(grantType);
  }

  return GRANT_TYPES.filter((grantType) => deduped.has(grantType));
}

function toCapabilityLabels(
  capabilities: readonly ProtocolCapability[],
): readonly string[] {
  return capabilities.map((capability) => CAPABILITY_LABELS[capability]);
}

function toProviderLabel(providerId: GrantScope): string {
  if (providerId === GRANT_SCOPE_WILDCARD) {
    return "Any provider";
  }

  return providerId;
}

function toModelLabel(modelId: GrantScope): string {
  if (modelId === GRANT_SCOPE_WILDCARD) {
    return "Any model";
  }

  return modelId;
}

export class ConsentController {
  readonly #promptAdapter: ConsentPromptAdapter;
  readonly #events: ExtensionEventEmitter<ExtensionEventMap> | undefined;
  readonly #now: () => number;

  constructor(options: ConsentControllerOptions) {
    this.#promptAdapter = options.promptAdapter;
    this.#events = options.events;
    this.#now = options.now ?? Date.now;
  }

  getCapabilityLabel(capability: ProtocolCapability): string {
    return CAPABILITY_LABELS[capability];
  }

  createPromptSummary(request: ConsentRequest): Readonly<{
    origin: string;
    providerLabel: string;
    modelLabel: string;
    capabilityLabels: readonly string[];
  }> {
    const normalized = this.#normalizeRequest(request);
    return {
      origin: normalized.origin,
      providerLabel: toProviderLabel(normalized.providerId),
      modelLabel: toModelLabel(normalized.modelId),
      capabilityLabels: toCapabilityLabels(normalized.capabilities),
    };
  }

  async requestConsent(request: ConsentRequest): Promise<ConsentDecision> {
    const normalized = this.#normalizeRequest(request);
    const grantTypeOptions = normalizeGrantTypeOptions(request.grantTypeOptions);
    const requestedAt = this.#now();
    this.#events?.emit("consent-requested", {
      origin: normalized.origin,
      providerId: normalized.providerId,
      modelId: normalized.modelId,
      capabilities: [...normalized.capabilities],
      requestedAt,
    });

    const promptRequest: ConsentPromptRequest = {
      origin: normalized.origin,
      providerId: normalized.providerId,
      modelId: normalized.modelId,
      capabilities: [...normalized.capabilities],
      capabilityLabels: toCapabilityLabels(normalized.capabilities),
      grantTypeOptions,
    };

    let response: ConsentPromptResponse;
    try {
      response = await this.#promptAdapter.showConsentPrompt(promptRequest);
    } catch (error) {
      const causeError = error instanceof Error ? error : undefined;
      throw new ConsentControllerError(
        "Consent prompt failed to resolve.",
        "prompt-failed",
        causeError !== undefined ? { cause: causeError } : undefined,
      );
    }

    const resolvedAt = this.#now();
    const decision = this.#validatePromptResponse(
      response,
      normalized,
      grantTypeOptions,
    );

    this.#events?.emit("consent-resolved", {
      origin: decision.origin,
      providerId: decision.providerId,
      modelId: decision.modelId,
      capabilities: [...decision.capabilities],
      ...(decision.grantType !== undefined ? { grantType: decision.grantType } : {}),
      granted: decision.granted,
      resolvedAt,
    });

    return decision;
  }

  async notifyRevocation(input: Readonly<{
    origin: string;
    providerId: string;
    modelId: string;
    capabilities: readonly ProtocolCapability[];
  }>): Promise<void> {
    if (this.#promptAdapter.showRevocationNotice === undefined) {
      return;
    }

    const normalized = this.#normalizeRequest({
      origin: input.origin,
      providerId: input.providerId,
      modelId: input.modelId,
      capabilities: input.capabilities,
    });

    try {
      await this.#promptAdapter.showRevocationNotice({
        origin: normalized.origin,
        providerId: normalized.providerId,
        modelId: normalized.modelId,
        capabilities: [...normalized.capabilities],
        revokedAt: this.#now(),
      });
    } catch (error) {
      const causeError = error instanceof Error ? error : undefined;
      throw new ConsentControllerError(
        "Failed to display revocation notice.",
        "prompt-failed",
        causeError !== undefined ? { cause: causeError } : undefined,
      );
    }
  }

  #normalizeRequest(request: ConsentRequest): Readonly<{
    origin: string;
    providerId: GrantScope;
    modelId: GrantScope;
    capabilities: readonly ProtocolCapability[];
  }> {
    try {
      return canonicalizeGrantTarget({
        origin: request.origin,
        providerId: request.providerId,
        modelId: request.modelId,
        capabilities: request.capabilities,
      });
    } catch (error) {
      const causeError = error instanceof Error ? error : undefined;
      throw new ConsentControllerError(
        "Consent request is invalid.",
        "invalid-request",
        causeError !== undefined ? { cause: causeError } : undefined,
      );
    }
  }

  #validatePromptResponse(
    response: ConsentPromptResponse,
    normalizedRequest: Readonly<{
      origin: string;
      providerId: GrantScope;
      modelId: GrantScope;
      capabilities: readonly ProtocolCapability[];
    }>,
    grantTypeOptions: readonly GrantType[],
  ): ConsentDecision {
    if (response.granted) {
      if (!isGrantType(response.grantType)) {
        throw new ConsentControllerError(
          "Consent prompt returned an invalid grant type.",
          "invalid-response",
        );
      }

      if (!grantTypeOptions.includes(response.grantType)) {
        throw new ConsentControllerError(
          `Consent prompt selected grant type "${response.grantType}" not offered by the request.`,
          "invalid-response",
        );
      }

      return {
        granted: true,
        origin: normalizedRequest.origin,
        providerId: normalizedRequest.providerId,
        modelId: normalizedRequest.modelId,
        capabilities: [...normalizedRequest.capabilities],
        grantType: response.grantType,
      };
    }

    return {
      granted: false,
      origin: normalizedRequest.origin,
      providerId: normalizedRequest.providerId,
      modelId: normalizedRequest.modelId,
      capabilities: [...normalizedRequest.capabilities],
      ...(response.denialReason !== undefined
        ? { denialReason: response.denialReason }
        : {}),
    };
  }
}
