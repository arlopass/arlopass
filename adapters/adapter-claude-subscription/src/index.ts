import { randomUUID } from "node:crypto";

import {
  type AdapterContract,
  type AdapterManifest,
  MANIFEST_SCHEMA_VERSION,
} from "@byom-ai/adapter-runtime";
import {
  type ProtocolCapability,
  AuthError,
  PermissionError,
  ProviderUnavailableError,
  TimeoutError,
  TransientNetworkError,
} from "@byom-ai/protocol";
import { buildAuthHeaders, CLAUDE_API_BASE, type ClaudeAuthConfig } from "./auth.js";

export { buildAuthHeaders, type ClaudeAuthConfig } from "./auth.js";

export const CLAUDE_SUBSCRIPTION_MANIFEST: AdapterManifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  providerId: "claude-subscription",
  version: "0.1.0",
  displayName: "Claude (Subscription)",
  authType: "oauth2",
  capabilities: [
    "chat.completions",
    "chat.stream",
    "provider.list",
    "session.create",
  ] as unknown as readonly ProtocolCapability[],
  requiredPermissions: ["network.egress"],
  egressRules: [{ host: "api.anthropic.com", protocol: "https" }],
  riskLevel: "medium",
  signingKeyId: "byom-first-party-v1",
};

export type ClaudeAdapterOptions = Readonly<{
  auth: ClaudeAuthConfig;
  defaultModel?: string;
  timeoutMs?: number;
  baseUrl?: string;
}>;

type ClaudeSession = {
  model: string;
  messages: Array<{ role: string; content: string }>;
};

type ClaudeErrorBody = {
  type?: string;
  error?: { type?: string; message?: string };
};

type ClaudeContentBlock = { type: string; text?: string };
type ClaudeMessageResponse = {
  id?: string;
  type?: string;
  role?: string;
  content?: ClaudeContentBlock[];
  stop_reason?: string;
};

type ClaudeStreamEvent = {
  type: string;
  index?: number;
  delta?: { type: string; text?: string };
};

const ANTHROPIC_KNOWN_MODELS = [
  "claude-opus-4-5",
  "claude-sonnet-4-5",
  "claude-haiku-4-5",
  "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-20241022",
  "claude-3-opus-20240229",
] as const;

function mapNetworkError(error: unknown): never {
  const err = error instanceof Error ? error : new Error(String(error));
  const code = (err as NodeJS.ErrnoException).code;
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ECONNRESET") {
    throw new ProviderUnavailableError(
      `Claude API is not reachable: ${err.message}`,
      { cause: err },
    );
  }
  if (code === "ETIMEDOUT") {
    throw new TimeoutError(`Claude API request timed out: ${err.message}`, { cause: err });
  }
  throw new TransientNetworkError(`Claude API network error: ${err.message}`, { cause: err });
}

async function mapHttpError(response: Response): Promise<never> {
  let errorBody: ClaudeErrorBody = {};
  try {
    errorBody = (await response.json()) as ClaudeErrorBody;
  } catch {
    // ignore parse errors
  }
  const message = errorBody.error?.message ?? response.statusText;

  if (response.status === 401) {
    throw new AuthError(`Claude API authentication failed: ${message}`);
  }
  if (response.status === 403) {
    throw new PermissionError(`Claude API permission denied: ${message}`);
  }
  if (response.status === 429) {
    throw new TransientNetworkError(`Claude API rate limit exceeded: ${message}`);
  }
  if (response.status >= 500 || response.status === 529) {
    throw new ProviderUnavailableError(`Claude API server error ${response.status}: ${message}`);
  }
  throw new TransientNetworkError(
    `Claude API request failed with HTTP ${response.status}: ${message}`,
  );
}

export class ClaudeSubscriptionAdapter implements AdapterContract {
  readonly manifest: AdapterManifest = CLAUDE_SUBSCRIPTION_MANIFEST;

  readonly #auth: ClaudeAuthConfig;
  readonly #defaultModel: string;
  readonly #timeoutMs: number;
  readonly #baseUrl: string;
  readonly #sessions = new Map<string, ClaudeSession>();

  constructor(options: ClaudeAdapterOptions) {
    this.#auth = options.auth;
    this.#defaultModel = options.defaultModel ?? "claude-sonnet-4-5";
    this.#timeoutMs = options.timeoutMs ?? 60_000;
    this.#baseUrl = options.baseUrl ?? CLAUDE_API_BASE;
  }

  describeCapabilities(): readonly ProtocolCapability[] {
    return CLAUDE_SUBSCRIPTION_MANIFEST.capabilities;
  }

  async listModels(): Promise<readonly string[]> {
    // Anthropic does not provide a public list-models endpoint; return known models.
    return ANTHROPIC_KNOWN_MODELS;
  }

  async createSession(options?: Readonly<Record<string, unknown>>): Promise<string> {
    const sessionId = randomUUID();
    const model =
      typeof options?.["model"] === "string" ? options["model"] : this.#defaultModel;
    this.#sessions.set(sessionId, { model, messages: [] });
    return sessionId;
  }

  async sendMessage(sessionId: string, message: string): Promise<string> {
    const session = this.#sessions.get(sessionId);
    if (session === undefined) {
      throw new TransientNetworkError(`Session "${sessionId}" not found.`);
    }
    session.messages.push({ role: "user", content: message });

    const headers = buildAuthHeaders(this.#auth);
    let response: Response;
    try {
      response = await fetch(`${this.#baseUrl}/v1/messages`, {
        method: "POST",
        headers: headers as Record<string, string>,
        body: JSON.stringify({
          model: session.model,
          max_tokens: 4096,
          messages: session.messages,
        }),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (error) {
      if (error instanceof AuthError) throw error;
      mapNetworkError(error);
    }
    if (!response.ok) {
      await mapHttpError(response);
    }
    const data = (await response.json()) as ClaudeMessageResponse;
    const text =
      data.content
        ?.filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("") ?? "";
    session.messages.push({ role: "assistant", content: text });
    return text;
  }

  async streamMessage(
    sessionId: string,
    message: string,
    onChunk: (chunk: string) => void,
  ): Promise<void> {
    const session = this.#sessions.get(sessionId);
    if (session === undefined) {
      throw new TransientNetworkError(`Session "${sessionId}" not found.`);
    }
    session.messages.push({ role: "user", content: message });

    const headers = buildAuthHeaders(this.#auth);
    let response: Response;
    try {
      response = await fetch(`${this.#baseUrl}/v1/messages`, {
        method: "POST",
        headers: { ...(headers as Record<string, string>), "anthropic-streaming": "1" },
        body: JSON.stringify({
          model: session.model,
          max_tokens: 4096,
          messages: session.messages,
          stream: true,
        }),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (error) {
      if (error instanceof AuthError) throw error;
      mapNetworkError(error);
    }
    if (!response.ok) {
      await mapHttpError(response);
    }
    if (response.body === null) {
      throw new ProviderUnavailableError("Claude API response body is null.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";

    try {
      let streaming = true;
      while (streaming) {
        const { done, value } = await reader.read();
        if (done) { streaming = false; break; }
        const text = decoder.decode(value, { stream: true });
        // Anthropic uses SSE format: "data: {...}\n\n"
        for (const line of text.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const event = JSON.parse(jsonStr) as ClaudeStreamEvent;
            if (
              event.type === "content_block_delta" &&
              event.delta?.type === "text_delta" &&
              event.delta.text
            ) {
              onChunk(event.delta.text);
              fullContent += event.delta.text;
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    session.messages.push({ role: "assistant", content: fullContent });
  }

  async healthCheck(): Promise<boolean> {
    // Anthropic has no dedicated health endpoint; validate auth by attempting a minimal request.
    try {
      const headers = buildAuthHeaders(this.#auth);
      // HEAD or GET on the API root returns 200 or 404 if the service is up.
      const response = await fetch(`${this.#baseUrl}/v1/models`, {
        method: "GET",
        headers: headers as Record<string, string>,
        signal: AbortSignal.timeout(5_000),
      });
      // 200, 404 (endpoint not found) all indicate the service is reachable.
      return response.status < 500;
    } catch {
      return false;
    }
  }

  async shutdown(): Promise<void> {
    this.#sessions.clear();
  }
}
