# Design Spec: Bridge CLI Chat Execution (Sub-Project)

## Metadata
- **Date:** 2026-03-23
- **Status:** Draft for implementation
- **Scope:** `apps/bridge` + `apps/extension` CLI execution path
- **Primary Goal:** Replace CLI placeholder behavior with real, secure, production-ready native host execution

---

## 1) Problem

The extension currently treats CLI providers as connected but cannot execute chat requests. This creates a broken production path (`provider.unavailable`) and makes BYOM unreliable for local CLI-backed providers.

We need an enterprise-grade CLI execution system that:
- Executes user chat prompts through a local CLI runtime (first-class target: GitHub Copilot CLI).
- Preserves strict security boundaries.
- Provides deterministic behavior with explicit error codes.
- Is extensible to additional CLI runtimes later.

---

## 2) Scope and Assumptions

### In Scope (v1)
- Native host message type for chat execution.
- Bridge-side CLI executor with strict validation, timeouts, output guards, and concurrency limits.
- Extension transport integration for real CLI chat completion.
- Tests for bridge + extension runtime behavior.

### Out of Scope (v1)
- Full streaming transport over native messaging.
- Multi-provider CLI runtime marketplace.
- Secret broker/token exchange for cloud APIs.

### Assumptions
- User is unavailable for interactive clarifications, so implementation proceeds with conservative defaults.
- First production target is **GitHub Copilot CLI** via non-interactive prompt mode.

---

## 3) Approaches Considered

### Approach A (Recommended): Native host command runner profile (Copilot-first)
- Add `cli.chat.execute` command in bridge handler.
- Implement a hardened Copilot CLI runner in bridge:
  - Non-interactive prompt execution
  - Tool visibility minimized (`--available-tools`)
  - Strict timeout, output cap, prompt cap, and bounded concurrency
- Parse structured JSON output to extract final assistant content.

**Pros**
- Fastest path to real end-to-end behavior.
- Strong operational control in bridge process.
- Clear upgrade path to more CLI profiles.

**Cons**
- Initial profile is runtime-specific (Copilot-focused).

### Approach B: Adapter-host integration for CLI runtime
- Route native host requests through adapter host and `adapter-local-cli-bridge`.

**Pros**
- Reuses adapter abstractions.

**Cons**
- Requires an additional CLI bridge binary/protocol and more moving parts.
- Slower route to a working production path for current users.

### Approach C: Generic arbitrary command templating from extension metadata
- Let extension/provider metadata define command and args.

**Pros**
- Highly flexible.

**Cons**
- Unsafe by default; significantly larger attack surface.
- Hard to enforce enterprise security guarantees.

**Decision:** Use **Approach A** for v1.

---

## 4) Architecture

### 4.1 New Bridge Runtime Unit
- `apps/bridge/src/cli/copilot-chat-executor.ts`
  - Validates incoming chat request shape and bounds.
  - Builds deterministic prompt from canonical role/content messages.
  - Executes Copilot CLI via `spawn(..., { shell: false })`.
  - Enforces:
    - max prompt characters
    - max stdout/stderr bytes
    - per-request timeout
    - max concurrent executions
  - Parses JSONL output and returns final assistant response.

#### Bridge execution limits (mandatory)
- `maxMessages`: `128` messages per request.
- `maxPromptChars`: `32_000` UTF-16 chars across all message content.
- `maxTimeoutMs`: `120_000`; `minTimeoutMs`: `5_000`; default `30_000`.
- `maxStdoutBytes`: `524_288` (512 KiB).
- `maxStderrBytes`: `65_536` (64 KiB, for diagnostics).
- `maxConcurrentExecutions`: default `3`, configurable via `BYOM_CLI_MAX_CONCURRENT`, clamped to `[1, 16]`.

#### Binary discovery and pinning
- Resolved once at bridge startup:
  1. `BYOM_COPILOT_CLI_PATH` (absolute or PATH-resolvable command).
  2. fallback command: `copilot`.
- Startup probe: `<resolvedCommand> --version`.
- If probe fails, bridge stays running but CLI execution requests return explicit `provider.unavailable` with details.
- Command path is never accepted from extension payload.

#### Copilot command profile (v1)
- Base args:
  - `-p <prompt>`
  - `--silent`
  - `--stream off`
  - `--output-format json`
  - `--available-tools`
- Model arg:
  - If `modelId` is concrete (not alias `copilot-cli`), append `--model <modelId>`.
  - If alias `copilot-cli`, omit `--model`.
- Security behavior:
  - If CLI reports unknown/invalid `--available-tools`, fail closed with `provider.unavailable` (no insecure fallback).

#### Process lifecycle controls
- On timeout or output-cap breach:
  1. send `SIGTERM`
  2. wait `1_500ms`
  3. if still alive, force kill (`SIGKILL` or platform equivalent).
- Child process is spawned with `shell: false`, `stdio: ["ignore", "pipe", "pipe"]`.
- Non-zero exit is treated as execution failure with captured stderr excerpt.

### 4.2 Native message contract
- Request:
  ```ts
  {
    type: "cli.chat.execute";
    correlationId: string;
    providerId: string;
    modelId: string;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    timeoutMs?: number;
  }
  ```
- Success:
  ```ts
  {
    type: "cli.chat.result";
    correlationId: string;
    providerId: string;
    modelId: string;
    content: string;
  }
  ```
- Failure:
  ```ts
  {
    type: "error";
    correlationId: string;
    reasonCode: string;
    message: string;
    details?: Record<string, string | number | boolean | null>;
  }
  ```
- `correlationId` is required and must be echoed on all responses.

### 4.3 Copilot JSONL parsing contract
- CLI output is treated as JSONL.
- Parse each line as JSON object.
- Accept assistant result from the last event matching:
  - `type === "assistant.message"`
  - `typeof data.content === "string"`
  - non-empty trimmed content.
- Ignore non-content telemetry/session events.
- If parsing fails for all lines or no assistant content exists, return `provider.unavailable` with bounded stdout/stderr excerpts in `details`.

### 4.4 Bridge Handler Integration
- Extend `BridgeHandler` with `cli.chat.execute`.
- Validate request payload (`modelId`, `messages`, optional `timeoutMs`, `correlationId`).
- Call injected `CliChatExecutor`.
- Return:
  - Success: `{ type: "cli.chat.result", correlationId, providerId, modelId, content }`
  - Failure: `{ type: "error", correlationId, reasonCode, message, details? }`

### 4.5 Extension Runtime Integration
- Replace CLI placeholder in `apps/extension/src/transport/runtime.ts`.
- `runCliBridgeCompletion` sends native message:
  - `{ type: "cli.chat.execute", providerId, modelId, messages, timeoutMs, correlationId }`
- Extension validates request bounds before native call:
  - non-empty `messages`
  - valid `role` enum and non-empty `content`
  - timeout clamped to bridge range
- Parse success payload and return assistant content.
- Map native error payloads to protocol errors with preserved reason codes.
- Keep handshake challenge preflight for host reachability before execute call (until sessionized native protocol is introduced).

---

## 5) Security Model

1. **No shell interpolation:** `spawn` with argument array and `shell: false`.
2. **Command pinning:** command path comes from bridge config/env, not from extension payload.
3. **Input validation:** strict role/content checks, non-empty and bounded messages.
4. **Execution limits:** timeout + output byte caps + bounded concurrency prevent abuse.
5. **No silent fallbacks:** all failures return explicit reason-coded errors.
6. **Tool minimization:** Copilot execution requires restricted tool-visibility mode (`--available-tools`) or fails closed.
7. **Bounded diagnostics:** stderr/stdout excerpts in errors are truncated and sanitized.
8. **Correlation continuity:** every bridge response (success or error) includes original `correlationId`.

---

## 6) Reliability and Robustness

1. Deterministic request/response schema for native messaging.
2. Explicit timeout semantics (`transport.timeout`).
3. Deterministic error shaping (`request.invalid`, `provider.unavailable`, `transport.transient_failure`).
4. Backpressure via concurrency cap to prevent host saturation.
5. Process crash/exit handling with actionable diagnostics.
6. Concurrency overflow handling:
   - if active executions >= cap, reject immediately with retryable `transport.transient_failure`.
7. Deterministic prompt rendering from message list (`<role>: <content>` joined by newline).

---

## 7) Data Flow

1. Web app sends `chat.completions` through injected extension transport.
2. Extension runtime resolves CLI provider, verifies native host reachability (`handshake.challenge`), then forwards `cli.chat.execute`.
3. Bridge validates request and executes Copilot CLI non-interactively.
4. Bridge parses final assistant answer and returns `cli.chat.result`.
5. Extension maps result to `ChatSendResponsePayload.message`.
6. SDK returns standard `chat.send` result to app.

---

## 8) Error Mapping

- Invalid payload / malformed messages / out-of-bounds request → `request.invalid`
- CLI binary missing, unsupported flags, non-zero exit, parse-empty output → `provider.unavailable`
- Timeout during execution → `transport.timeout`
- Capacity overflow / transient spawn or IPC failure → `transport.transient_failure`

All bridge responses (success and error) must preserve `correlationId`.

---

## 9) Testing Strategy

### Bridge tests
- `BridgeHandler` CLI dispatch success/failure validation.
- Request validation and reason-code assertions.
- Executor unit tests for:
  - timeout path
  - output cap path
  - non-zero exit mapping
  - JSONL parsing behavior
  - malformed JSONL lines
  - empty stdout on zero exit
  - no `assistant.message` content found
  - concurrency cap enforcement
  - unknown flag failure path for tool-restriction arg
  - binary discovery failure path (`BYOM_COPILOT_CLI_PATH`)

### Extension runtime tests
- CLI completion success path via mocked native response.
- Native error payload propagation to protocol error surfaces.
- Invalid native payload handling.
- Handshake-preflight + execute sequence correctness.

### Regression
- Existing handshake/grant/request-check tests remain green.
- Existing Ollama and cloud-provider tests remain green.

---

## 10) Exit Criteria

1. CLI provider in examples can complete real `chat.send` requests through native host.
2. Placeholder “not implemented” behavior is removed.
3. Failures surface canonical, actionable error codes.
4. New bridge and extension tests pass alongside existing suite.
