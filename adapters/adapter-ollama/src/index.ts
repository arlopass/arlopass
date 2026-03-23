import { randomUUID } from "node:crypto";

import {
  type AdapterContract,
  type AdapterManifest,
  MANIFEST_SCHEMA_VERSION,
} from "@byom-ai/adapter-runtime";
import {
  type ProtocolCapability,
  AuthError,
  ProviderUnavailableError,
  TimeoutError,
  TransientNetworkError,
} from "@byom-ai/protocol";

export const OLLAMA_MANIFEST: AdapterManifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  providerId: "ollama",
  version: "0.1.0",
  displayName: "Ollama",
  authType: "none",
  capabilities: [
    "chat.completions",
    "chat.stream",
    "provider.list",
    "session.create",
  ] as unknown as readonly ProtocolCapability[],
  requiredPermissions: ["network.egress"],
  egressRules: [{ host: "localhost", port: 11434, protocol: "http" }],
  riskLevel: "low",
  signingKeyId: "byom-first-party-v1",
};

export type OllamaAdapterOptions = Readonly<{
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}>;

type OllamaSession = {
  model: string;
  messages: Array<{ role: string; content: string }>;
};

type OllamaTagsResponse = { models?: Array<{ name: string }> };
type OllamaChatResponse = { message?: { content?: string } };
type OllamaStreamChunk = { message?: { content?: string }; done?: boolean };

function mapNetworkError(error: unknown): never {
  const err = error instanceof Error ? error : new Error(String(error));
  const code = (err as NodeJS.ErrnoException).code;
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ECONNRESET") {
    throw new ProviderUnavailableError(`Ollama is not reachable: ${err.message}`, { cause: err });
  }
  if (code === "ETIMEDOUT") {
    throw new TimeoutError(`Ollama request timed out: ${err.message}`, { cause: err });
  }
  throw new TransientNetworkError(`Ollama network error: ${err.message}`, { cause: err });
}

function mapHttpError(status: number, body: string): never {
  if (status === 401 || status === 403) {
    throw new AuthError(`Ollama returned HTTP ${status}: ${body}`);
  }
  if (status >= 500) {
    throw new ProviderUnavailableError(`Ollama server error ${status}: ${body}`);
  }
  throw new TransientNetworkError(`Ollama request failed with HTTP ${status}: ${body}`);
}

export class OllamaAdapter implements AdapterContract {
  readonly manifest: AdapterManifest = OLLAMA_MANIFEST;

  readonly #baseUrl: string;
  readonly #defaultModel: string;
  readonly #timeoutMs: number;
  readonly #sessions = new Map<string, OllamaSession>();

  constructor(options: OllamaAdapterOptions = {}) {
    this.#baseUrl = options.baseUrl ?? "http://localhost:11434";
    this.#defaultModel = options.model ?? "llama3.2";
    this.#timeoutMs = options.timeoutMs ?? 30_000;
  }

  describeCapabilities(): readonly ProtocolCapability[] {
    return OLLAMA_MANIFEST.capabilities;
  }

  async listModels(): Promise<readonly string[]> {
    const url = `${this.#baseUrl}/api/tags`;
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(this.#timeoutMs) });
    } catch (error) {
      mapNetworkError(error);
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      mapHttpError(response.status, body);
    }
    const data = (await response.json()) as OllamaTagsResponse;
    return (data.models ?? []).map((m) => m.name);
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

    const url = `${this.#baseUrl}/api/chat`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: session.model, messages: session.messages, stream: false }),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (error) {
      mapNetworkError(error);
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      mapHttpError(response.status, body);
    }
    const data = (await response.json()) as OllamaChatResponse;
    const content = data.message?.content ?? "";
    session.messages.push({ role: "assistant", content });
    return content;
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

    const url = `${this.#baseUrl}/api/chat`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: session.model, messages: session.messages, stream: true }),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (error) {
      mapNetworkError(error);
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      mapHttpError(response.status, body);
    }
    if (response.body === null) {
      throw new ProviderUnavailableError("Ollama response body is null.");
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
        for (const line of text.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed) as OllamaStreamChunk;
            const chunk = parsed.message?.content ?? "";
            if (chunk) {
              onChunk(chunk);
              fullContent += chunk;
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    session.messages.push({ role: "assistant", content: fullContent });
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.#baseUrl}/api/version`, {
        signal: AbortSignal.timeout(5_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async shutdown(): Promise<void> {
    this.#sessions.clear();
  }
}
