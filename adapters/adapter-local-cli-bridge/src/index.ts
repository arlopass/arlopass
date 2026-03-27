import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";

import {
  type AdapterContract,
  type AdapterManifest,
  MANIFEST_SCHEMA_VERSION,
} from "@arlopass/adapter-runtime";
import {
  type ProtocolCapability,
  ProviderUnavailableError,
  TimeoutError,
  TransientNetworkError,
} from "@arlopass/protocol";

export const LOCAL_CLI_BRIDGE_MANIFEST: AdapterManifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  providerId: "local-cli-bridge",
  version: "0.1.0",
  displayName: "Local CLI Bridge",
  authType: "local",
  capabilities: [
    "chat.completions",
    "chat.stream",
    "provider.list",
    "session.create",
  ] as unknown as readonly ProtocolCapability[],
  requiredPermissions: ["process.spawn", "filesystem.read", "env.read"],
  egressRules: [],
  riskLevel: "medium",
  signingKeyId: "arlopass-first-party-v1",
};

export type LocalCliBridgeOptions = Readonly<{
  /** Path to the CLI executable. */
  command: string;
  /** Arguments to pass to the CLI. */
  args?: readonly string[];
  /** Timeout in ms for each request. */
  timeoutMs?: number;
  /** Optional override for the spawn function (used in tests). */
  spawnFn?: typeof spawn;
}>;

/** A single pending non-streaming request. */
type PendingRequest = {
  resolve: (msg: BridgeMessage) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** A single active streaming request. */
type ActiveStream = {
  onChunk: (chunk: string) => void;
  resolve: () => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type BridgeMessage = {
  id?: string;
  type: string;
  models?: string[];
  sessionId?: string;
  content?: string;
  error?: string;
  model?: string;
  message?: string;
};

export class LocalCliBridgeAdapter implements AdapterContract {
  readonly manifest: AdapterManifest = LOCAL_CLI_BRIDGE_MANIFEST;

  readonly #command: string;
  readonly #args: readonly string[];
  readonly #timeoutMs: number;
  readonly #spawnFn: typeof spawn;

  #proc: ChildProcess | null = null;
  #buffer = "";
  #counter = 0;
  #shuttingDown = false;
  readonly #pending = new Map<string, PendingRequest>();
  readonly #streams = new Map<string, ActiveStream>();

  constructor(options: LocalCliBridgeOptions) {
    this.#command = options.command;
    this.#args = options.args ?? [];
    this.#timeoutMs = options.timeoutMs ?? 30_000;
    this.#spawnFn = options.spawnFn ?? spawn;
  }

  describeCapabilities(): readonly ProtocolCapability[] {
    return LOCAL_CLI_BRIDGE_MANIFEST.capabilities;
  }

  async listModels(): Promise<readonly string[]> {
    const proc = await this.#ensureProcess();
    const id = this.#nextId();
    const response = await this.#request(proc, id, { type: "list_models" });
    return response.models ?? [];
  }

  async createSession(options?: Readonly<Record<string, unknown>>): Promise<string> {
    const proc = await this.#ensureProcess();
    const model = typeof options?.["model"] === "string" ? options["model"] : "";
    const id = this.#nextId();
    const response = await this.#request(proc, id, { type: "create_session", model });
    if (response.type === "error") {
      throw new TransientNetworkError(
        `CLI bridge failed to create session: ${response.error ?? "unknown error"}`,
      );
    }
    return response.sessionId ?? randomUUID();
  }

  async sendMessage(sessionId: string, message: string): Promise<string> {
    const proc = await this.#ensureProcess();
    const id = this.#nextId();
    const response = await this.#request(proc, id, {
      type: "send",
      sessionId,
      message,
    });
    if (response.type === "error") {
      throw new TransientNetworkError(
        `CLI bridge send failed: ${response.error ?? "unknown error"}`,
      );
    }
    return response.content ?? "";
  }

  async streamMessage(
    sessionId: string,
    message: string,
    onChunk: (chunk: string) => void,
  ): Promise<void> {
    const proc = await this.#ensureProcess();
    const id = this.#nextId();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#streams.delete(id);
        reject(new TimeoutError(`CLI bridge stream timed out after ${this.#timeoutMs}ms.`));
      }, this.#timeoutMs);
      this.#streams.set(id, { onChunk, resolve, reject, timer });
      const line = JSON.stringify({ id, type: "stream", sessionId, message }) + "\n";
      proc.stdin?.write(line, (err) => {
        if (err) {
          clearTimeout(timer);
          this.#streams.delete(id);
          reject(new TransientNetworkError(`CLI bridge write failed: ${err.message}`, { cause: err }));
        }
      });
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      const proc = await this.#ensureProcess();
      const id = this.#nextId();
      const response = await this.#request(proc, id, { type: "ping" });
      return response.type === "pong";
    } catch {
      return false;
    }
  }

  async shutdown(): Promise<void> {
    this.#shuttingDown = true;
    const proc = this.#proc;
    this.#proc = null;

    const shutdownError = new ProviderUnavailableError("CLI bridge is shutting down.");
    for (const [id, pending] of this.#pending) {
      clearTimeout(pending.timer);
      pending.reject(shutdownError);
      this.#pending.delete(id);
    }
    for (const [id, stream] of this.#streams) {
      clearTimeout(stream.timer);
      stream.reject(shutdownError);
      this.#streams.delete(id);
    }

    if (proc !== null) {
      try {
        proc.stdin?.write(JSON.stringify({ id: this.#nextId(), type: "shutdown" }) + "\n");
      } catch {
        // ignore write errors on shutdown
      }
      proc.stdin?.end();
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => { proc.kill(); resolve(); }, 3_000);
        proc.once("exit", () => { clearTimeout(t); resolve(); });
      });
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  async #ensureProcess(): Promise<ChildProcess> {
    if (this.#shuttingDown) {
      throw new ProviderUnavailableError("CLI bridge adapter has been shut down.");
    }
    if (this.#proc !== null) {
      return this.#proc;
    }
    return this.#spawnProcess();
  }

  #spawnProcess(): ChildProcess {
    let proc: ChildProcess;
    try {
      proc = this.#spawnFn(this.#command, this.#args as string[], {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
      });
    } catch (err) {
      const cause = err instanceof Error ? err : new Error(String(err));
      throw new ProviderUnavailableError(
        `Failed to spawn CLI bridge process "${this.#command}": ${cause.message}`,
        { cause },
      );
    }

    proc.on("error", (err) => {
      this.#rejectAllPending(
        new ProviderUnavailableError(`CLI bridge process error: ${err.message}`, { cause: err }),
      );
      this.#proc = null;
    });

    proc.on("exit", (code, signal) => {
      if (!this.#shuttingDown) {
        this.#rejectAllPending(
          new ProviderUnavailableError(
            `CLI bridge process exited unexpectedly (code=${String(code)}, signal=${String(signal)}).`,
          ),
        );
      }
      this.#proc = null;
    });

    proc.stdout?.on("data", (data: Buffer) => {
      this.#onData(data);
    });

    this.#proc = proc;
    return proc;
  }

  #request(
    proc: ChildProcess,
    id: string,
    payload: Omit<BridgeMessage, "id">,
  ): Promise<BridgeMessage> {
    return new Promise<BridgeMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new TimeoutError(`CLI bridge request timed out after ${this.#timeoutMs}ms.`));
      }, this.#timeoutMs);
      this.#pending.set(id, { resolve, reject, timer });
      const line = JSON.stringify({ id, ...payload }) + "\n";
      proc.stdin?.write(line, (err) => {
        if (err) {
          clearTimeout(timer);
          this.#pending.delete(id);
          reject(
            new TransientNetworkError(`CLI bridge write failed: ${err.message}`, { cause: err }),
          );
        }
      });
    });
  }

  #onData(data: Buffer): void {
    this.#buffer += data.toString("utf8");
    const lines = this.#buffer.split("\n");
    this.#buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let msg: BridgeMessage;
      try {
        msg = JSON.parse(trimmed) as BridgeMessage;
      } catch {
        continue;
      }
      const id = msg.id;
      if (id === undefined) continue;

      if (msg.type === "chunk") {
        const stream = this.#streams.get(id);
        if (stream && msg.content) stream.onChunk(msg.content);
      } else if (msg.type === "stream_end") {
        const stream = this.#streams.get(id);
        if (stream) {
          clearTimeout(stream.timer);
          this.#streams.delete(id);
          stream.resolve();
        }
      } else if (msg.type === "error" && this.#streams.has(id)) {
        const stream = this.#streams.get(id);
        if (stream) {
          clearTimeout(stream.timer);
          this.#streams.delete(id);
          stream.reject(new TransientNetworkError(`CLI bridge stream error: ${msg.error ?? "unknown"}`));
        }
      } else {
        const pending = this.#pending.get(id);
        if (pending) {
          clearTimeout(pending.timer);
          this.#pending.delete(id);
          pending.resolve(msg);
        }
      }
    }
  }

  #rejectAllPending(err: Error): void {
    for (const [id, pending] of this.#pending) {
      clearTimeout(pending.timer);
      pending.reject(err);
      this.#pending.delete(id);
    }
    for (const [id, stream] of this.#streams) {
      clearTimeout(stream.timer);
      stream.reject(err);
      this.#streams.delete(id);
    }
  }

  #nextId(): string {
    return String(++this.#counter);
  }
}
