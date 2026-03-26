# Structured Chat/Messaging/Streaming Design Spec

**Date:** 2026-03-24  
**Status:** Approved  
**Scope:** Web SDK, Protocol, Adapter Runtime, Adapters (Ollama, Claude, CLI Bridge), Bridge  

---

## 1. Problem Statement

The current chat API passes plain strings through `sendMessage(sessionId, message: string)`. SDK developers cannot set system prompts, objectives, expected response formats, or few-shot examples as structured fields. All context must be manually concatenated into the message string.

Additionally, there is no mechanism for user-configured permission rules (e.g., "low-token-usage mode") that control what structured fields are sent, and no way for SDK developers to guard features based on those permissions.

This spec defines:

1. A **structured `ChatInput`** type with system prompts, objectives, few-shots, and format expectations
2. A **permission rule engine** with dual enforcement (SDK guards + bridge authoritative)
3. **Adapter contract evolution** from `string` to `StructuredChatInput` with per-adapter native translation
4. **SDK-side response validation** with retry support and streaming integration
5. **Performance optimizations** to maintain minimal latency

---

## 2. Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Structured output tiers | 3-tier: hint always sent → native provider feature → SDK-side validation fallback | Maximum coverage across provider capabilities |
| Permission modes | Rich rule sets with dual enforcement | SDK guards for UX; bridge for security. Most-restrictive-wins resolution. |
| XML wrapping for CLI | Automatic per-provider, internal concern | SDK developer uses one unified `ChatInput`; system picks optimal format |
| Adapter contract | Adapters receive `StructuredChatInput` and own translation | Each adapter knows its provider's API shape best |
| Migration strategy | Clean break at v0.1.0 | No external consumers; monorepo controls all call sites |
| Approach | Layered Pipeline | Each layer independently testable; permission filters compose; validation is opt-in |

---

## 3. Structured ChatInput Types

### 3.1 Core Types

These types live in `@byom-ai/protocol` (new file: `structured-chat.ts`) because they flow across all layers.

```ts
type ChatRole = "system" | "user" | "assistant";

type ChatMessage = Readonly<{
  role: ChatRole;
  content: string;
}>;

type FewShotExample = Readonly<{
  input: ChatMessage;
  output: ChatMessage;
}>;

type ResponseFormatType = "text" | "json" | "xml" | "markdown";

type ResponseFormat = Readonly<{
  type: ResponseFormatType;
  schema?: string;          // JSON Schema string for "json", XSD for "xml"
  instruction?: string;     // Human-readable hint appended to system prompt
}>;

type FormatValidationBehavior = "error" | "retry";

type FormatValidationOptions = Readonly<{
  format: ResponseFormatType;
  schema?: string;
  onFailure: FormatValidationBehavior;
  maxRetries?: number;      // Default: 1. Only used when onFailure === "retry"
}>;

type StructuredChatInput = Readonly<{
  messages: readonly ChatMessage[];
  systemPrompt?: string;
  objective?: string;
  expectedFormat?: ResponseFormat;
  fewShots?: readonly FewShotExample[];
  enforceFormatValidation?: FormatValidationOptions;
  metadata?: Readonly<Record<string, string>>;
}>;
```

### 3.2 Backward Compatibility

The SDK's `chat.send()` and `chat.stream()` accept a union type:

```ts
type ChatInput = StructuredChatInput | SimpleChatInput;

type SimpleChatInput = Readonly<{
  messages: readonly ChatMessage[];
}>;

function isStructuredInput(input: ChatInput): input is StructuredChatInput {
  return "systemPrompt" in input || "objective" in input
    || "expectedFormat" in input || "fewShots" in input
    || "enforceFormatValidation" in input;
}
```

Simple calls remain unchanged:
```ts
await client.chat.send({ messages: [{ role: "user", content: "Hello!" }] });
```

Structured calls add optional fields:
```ts
await client.chat.send({
  systemPrompt: "You are a senior TypeScript engineer.",
  objective: "Refactor the given function for readability and performance.",
  expectedFormat: { type: "json", instruction: "Return JSON with keys: code, explanation" },
  fewShots: [
    {
      input:  { role: "user", content: "Refactor: const f = x => x+1" },
      output: { role: "assistant", content: '{"code":"const increment = (x: number) => x + 1;","explanation":"Named function, typed parameter"}' },
    },
  ],
  messages: [
    { role: "user", content: "Refactor: function calc(a,b,c){return a*b+c}" },
  ],
  enforceFormatValidation: { format: "json", onFailure: "retry", maxRetries: 2 },
});
```

### 3.3 Validation Constraints

Applied during `parseStructuredChatInput()`:

| Field | Constraint |
|-------|-----------|
| `messages` | 1–128 items, each content max 32,000 UTF-16 chars |
| `systemPrompt` | Max 32,000 chars |
| `objective` | Max 4,000 chars |
| `fewShots` | Max 20 examples |
| `fewShots[].input/output.content` | Max 8,000 chars each |
| `metadata` | Max 32 keys, key max 64 chars, value max 256 chars |
| `enforceFormatValidation.maxRetries` | 0–5 |

### 3.4 Design Rationale

- **`systemPrompt` is a separate field** — Claude uses a dedicated `system` API param; Ollama uses a system message in the array; CLI wraps in `<system-prompt>` XML. Keeping it separate lets each adapter format optimally.
- **`fewShots` are input/output pairs** — Makes intent explicit. CLI adapters wrap them in `<few-shot-example>` blocks rather than injecting fake conversation history.
- **`objective` is distinct from `systemPrompt`** — System prompt sets persona/context. Objective sets what the current request should achieve. Distinct concerns with different provider formatting.
- **`expectedFormat`** carries both machine-readable `type` and human-readable `instruction`. The instruction is always sent as a hint. The `type` activates native structured output where available.
- **`enforceFormatValidation`** is SDK-side only. Doesn't affect what the adapter sends — validates what comes back.
- **`metadata`** is pass-through. Never interpreted by SDK/bridge/adapter.

---

## 4. Permission Rule Engine

### 4.1 Rule Types

```ts
type ChatPermissionRuleId =
  | "max-tokens-per-request"
  | "max-messages-per-request"
  | "allowed-roles"
  | "block-system-prompts"
  | "block-few-shots"
  | "block-objectives"
  | "block-format-hints"
  | "block-provider"
  | "block-model"
  | "block-origin"
  | "low-token-usage";

type ChatPermissionRuleValue =
  | { type: "boolean"; value: boolean }
  | { type: "number"; value: number }
  | { type: "string-set"; value: readonly string[] };

type ChatPermissionRule = Readonly<{
  id: ChatPermissionRuleId;
  value: ChatPermissionRuleValue;
  scope: ChatPermissionRuleScope;
}>;

type ChatPermissionRuleScope = Readonly<{
  origins?: readonly string[];
  providerIds?: readonly string[];
  modelIds?: readonly string[];
}>;

type ChatPermissionRuleSet = Readonly<{
  version: string;
  rules: readonly ChatPermissionRule[];
  updatedAt: string;
}>;
```

### 4.2 Rule Resolution

Rules are **restrictive by default** — most-restrictive-wins:

| Rule ID | Value Type | Effect |
|---------|-----------|--------|
| `max-tokens-per-request` | `number` | Total estimated token count capped. Lowest wins. |
| `max-messages-per-request` | `number` | Message array length capped. Lowest wins. |
| `allowed-roles` | `string-set` | Only these roles permitted. Intersection if multiple. |
| `block-system-prompts` | `boolean` | `systemPrompt` field stripped before sending. |
| `block-few-shots` | `boolean` | `fewShots` field stripped. |
| `block-objectives` | `boolean` | `objective` field stripped. |
| `block-format-hints` | `boolean` | `expectedFormat` field stripped. |
| `block-provider` | `string-set` | Requests to these providerIds denied. |
| `block-model` | `string-set` | Requests to these modelIds denied. |
| `block-origin` | `string-set` | Requests from these origins denied. |
| `low-token-usage` | `boolean` | Composite: equivalent to `block-system-prompts` + `block-few-shots` + `block-objectives` + `block-format-hints` all `true`. |

### 4.3 Dual Enforcement Flow

```
Extension wallet (user config)
        │
        ├──sync──→ SDK permission cache (read-only snapshot)
        │                │
        │           SDK auto-strips disallowed fields
        │           SDK developer uses guards for UI decisions
        │                │
        │                ▼
        │           Envelope includes ruleSetHash
        │
        └──sync──→ Bridge permission enforcer (authoritative)
                         │
                    Verifies ruleSetHash matches
                    Strips/denies if rules violated
                         │
                         ▼
                    Adapter receives filtered StructuredChatInput
```

**Integrity guarantee:** The SDK includes a `ruleSetHash` (SHA-256 of serialized rule set) in each request. The bridge compares against its own copy. Mismatch → reject with `policy.denied`.

### 4.4 SDK Developer API

```ts
client.permissions: Readonly<{
  check(ruleId: ChatPermissionRuleId): boolean;
  getRule(ruleId: ChatPermissionRuleId): ChatPermissionRuleValue | undefined;
  getActiveRules(): readonly ChatPermissionRule[];
  onChange(callback: (rules: readonly ChatPermissionRule[]) => void): () => void;
}>;
```

**Guard pattern:**
```ts
const input: StructuredChatInput = {
  messages: [{ role: "user", content: userMessage }],
};

if (client.permissions.check("block-system-prompts") === false) {
  input = { ...input, systemPrompt: "You are a helpful coding assistant." };
}

if (client.permissions.check("block-few-shots") === false) {
  input = { ...input, fewShots: myFewShotExamples };
}
```

**Auto-strip behavior:** Even if the developer doesn't guard, the SDK silently strips disallowed fields before putting them in the envelope. Developer guards are for UI/UX decisions (hide few-shot controls when blocked).

### 4.5 Permission filter implementation

```ts
#applyPermissionFilter(input: StructuredChatInput): StructuredChatInput {
  const rules = this.#permissionCache;
  if (!rules || rules.rules.length === 0) return input; // Zero-copy fast path

  let result = { ...input };

  if (this.permissions.check("low-token-usage")) {
    const { messages, metadata, enforceFormatValidation } = result;
    return { messages, metadata, enforceFormatValidation };
  }

  if (this.permissions.check("block-system-prompts")) {
    const { systemPrompt: _, ...rest } = result;
    result = rest as StructuredChatInput;
  }
  if (this.permissions.check("block-few-shots")) {
    const { fewShots: _, ...rest } = result;
    result = rest as StructuredChatInput;
  }
  if (this.permissions.check("block-objectives")) {
    const { objective: _, ...rest } = result;
    result = rest as StructuredChatInput;
  }
  if (this.permissions.check("block-format-hints")) {
    const { expectedFormat: _, ...rest } = result;
    result = rest as StructuredChatInput;
  }

  const maxMessages = this.#getNumericRuleValue("max-messages-per-request");
  if (maxMessages !== undefined && result.messages.length > maxMessages) {
    result = { ...result, messages: result.messages.slice(-maxMessages) };
  }

  const allowedRoles = this.#getStringSetRuleValue("allowed-roles");
  if (allowedRoles) {
    result = { ...result, messages: result.messages.filter(m => allowedRoles.includes(m.role)) };
  }

  return result;
}
```

---

## 5. Adapter Contract Evolution

### 5.1 New Signatures

```ts
interface AdapterContract {
  readonly manifest: AdapterManifest;
  describeCapabilities(): readonly ProtocolCapability[];
  listModels(): Promise<readonly string[]>;
  createSession(options?: Readonly<Record<string, unknown>>): Promise<string>;

  // CHANGED: string → StructuredChatInput, string → ChatResponse
  sendMessage(sessionId: string, input: StructuredChatInput): Promise<ChatResponse>;
  streamMessage(
    sessionId: string,
    input: StructuredChatInput,
    onChunk: (chunk: string) => void,
  ): Promise<void>;

  healthCheck(): Promise<boolean>;
  shutdown(): Promise<void>;
}

type ChatResponse = Readonly<{
  content: string;
  role: "assistant";
  finishReason?: "stop" | "length" | "content_filter";
  providerMetadata?: Readonly<Record<string, unknown>>;
}>;
```

### 5.2 CloudAdapterContractV2

`CloudAdapterContractV2` extends `AdapterContract`, so the signature change propagates automatically. No additional changes needed for cloud-specific methods.

### 5.3 Manifest Extension

```ts
type StructuredInputCapabilities = Readonly<{
  nativeSystemPrompt: boolean;
  nativeStructuredOutput: boolean;
  supportedFormats: readonly ResponseFormatType[];
  maxContextTokens?: number;
}>;

// Added as optional field on AdapterManifest:
// structuredInputCapabilities?: StructuredInputCapabilities;
```

### 5.4 Ollama Translation

Ollama has no dedicated system field or structured output mode. System prompt becomes a system-role message; few-shots become interleaved messages.

```ts
function toOllamaPayload(input: StructuredChatInput, sessionMessages: OllamaMessage[]): OllamaChatRequest {
  const messages: OllamaMessage[] = [];

  if (input.systemPrompt) {
    let systemContent = input.systemPrompt;
    if (input.objective) systemContent += `\n\nObjective: ${input.objective}`;
    if (input.expectedFormat?.instruction) systemContent += `\n\nResponse format: ${input.expectedFormat.instruction}`;
    messages.push({ role: "system", content: systemContent });
  }

  if (input.fewShots) {
    for (const shot of input.fewShots) {
      messages.push({ role: shot.input.role, content: shot.input.content });
      messages.push({ role: shot.output.role, content: shot.output.content });
    }
  }

  messages.push(...sessionMessages);
  messages.push(...input.messages.map(m => ({ role: m.role, content: m.content })));

  return { model, messages, stream: false };
}
```

**Manifest capabilities:**
```ts
structuredInputCapabilities: {
  nativeSystemPrompt: false,    // Uses message array, not dedicated field
  nativeStructuredOutput: false,
  supportedFormats: ["text"],
  maxContextTokens: undefined,  // Model-dependent
}
```

### 5.5 Claude Translation

Claude has a dedicated `system` parameter and supports structured output via `tool_use`.

```ts
function toClaudePayload(input: StructuredChatInput, sessionMessages: ClaudeMessage[]): ClaudeApiRequest {
  let system: string | undefined;
  if (input.systemPrompt) {
    system = input.systemPrompt;
    if (input.objective) system += `\n\nObjective: ${input.objective}`;
    if (input.expectedFormat?.instruction) system += `\n\nResponse format: ${input.expectedFormat.instruction}`;
  }

  const messages: ClaudeMessage[] = [];

  if (input.fewShots) {
    for (const shot of input.fewShots) {
      messages.push({ role: shot.input.role, content: shot.input.content });
      messages.push({ role: shot.output.role, content: shot.output.content });
    }
  }

  messages.push(...sessionMessages);
  messages.push(...input.messages.map(m => ({ role: m.role, content: m.content })));

  const request: ClaudeApiRequest = { model, system, messages, max_tokens: 4096 };

  if (input.expectedFormat?.type === "json" && input.expectedFormat.schema) {
    request.tools = [{
      name: "structured_response",
      description: "Return the response in the specified JSON schema",
      input_schema: JSON.parse(input.expectedFormat.schema),
    }];
    request.tool_choice = { type: "tool", name: "structured_response" };
  }

  return request;
}
```

**Manifest capabilities:**
```ts
structuredInputCapabilities: {
  nativeSystemPrompt: true,
  nativeStructuredOutput: true,
  supportedFormats: ["text", "json"],
  maxContextTokens: 200_000,
}
```

### 5.6 CLI Bridge Translation (XML Wrapping)

CLIs have no structured API. XML tags delimit each field.

```ts
function toCliPrompt(input: StructuredChatInput): string {
  const parts: string[] = [];

  if (input.systemPrompt) {
    parts.push(`<system-prompt>${escapeXml(input.systemPrompt)}</system-prompt>`);
  }
  if (input.objective) {
    parts.push(`<objective>${escapeXml(input.objective)}</objective>`);
  }
  if (input.expectedFormat?.instruction) {
    parts.push(`<expected-format>${escapeXml(input.expectedFormat.instruction)}</expected-format>`);
  }
  if (input.fewShots && input.fewShots.length > 0) {
    for (const shot of input.fewShots) {
      parts.push(
        `<few-shot-example>\n` +
        `  <${shot.input.role}>${escapeXml(shot.input.content)}</${shot.input.role}>\n` +
        `  <${shot.output.role}>${escapeXml(shot.output.content)}</${shot.output.role}>\n` +
        `</few-shot-example>`
      );
    }
  }
  for (const msg of input.messages) {
    parts.push(`<${msg.role}>${escapeXml(msg.content)}</${msg.role}>`);
  }

  return parts.join("\n\n");
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
```

**Manifest capabilities:**
```ts
structuredInputCapabilities: {
  nativeSystemPrompt: false,
  nativeStructuredOutput: false,
  supportedFormats: ["text"],
  maxContextTokens: undefined,
}
```

---

## 6. Response Validation & Retry

### 6.1 Validator Registry

```ts
type ValidationResult =
  | { valid: true; parsed: unknown }
  | { valid: false; error: string };

type ResponseValidator = (content: string, schema?: string) => ValidationResult;

const BUILT_IN_VALIDATORS: Record<ResponseFormatType, ResponseValidator> = {
  json: (content, schema) => {
    try {
      const parsed = JSON.parse(content);
      if (schema) {
        const errors = validateJsonSchema(parsed, JSON.parse(schema));
        if (errors.length > 0) return { valid: false, error: `Schema violation: ${errors[0]}` };
      }
      return { valid: true, parsed };
    } catch (e) {
      return { valid: false, error: `Invalid JSON: ${(e as Error).message}` };
    }
  },
  xml: (content) => {
    const balanced = checkXmlWellFormed(content);
    if (!balanced) return { valid: false, error: "Malformed XML: unclosed or mismatched tags" };
    return { valid: true, parsed: content };
  },
  markdown: (content) => ({ valid: true, parsed: content }),
  text: (content) => ({ valid: true, parsed: content }),
};
```

### 6.2 Send Flow with Validation

```ts
async #sendChat(input: ChatInput, options?: ChatOperationOptions): Promise<ChatSendResult> {
  const structured = normalizeToStructured(input);
  const filtered = this.#applyPermissionFilter(structured);

  const maxAttempts = filtered.enforceFormatValidation?.onFailure === "retry"
    ? (filtered.enforceFormatValidation.maxRetries ?? 1) + 1
    : 1;

  let lastValidationError: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const envelope = this.#buildEnvelope("chat.completions", filtered);
    const response = await this.#transport.request(envelope);
    const result = this.#parseResponse(response);

    if (filtered.enforceFormatValidation) {
      const validator = BUILT_IN_VALIDATORS[filtered.enforceFormatValidation.format];
      const validation = validator(result.message.content, filtered.enforceFormatValidation.schema);
      if (!validation.valid) {
        lastValidationError = validation.error;
        if (attempt < maxAttempts) continue;
        throw new BYOMFormatValidationError(
          validation.error, filtered.enforceFormatValidation.format, attempt, result.message.content,
        );
      }
    }

    return result;
  }

  throw new BYOMFormatValidationError(lastValidationError!, filtered.enforceFormatValidation!.format, maxAttempts);
}
```

### 6.3 Stream Flow with Post-Validation

Streams are not retried (expensive, user has seen partial output). Validation runs after full content is assembled. A new `ChatStreamEvent` variant signals failure:

```ts
type ChatStreamEvent =
  | { type: "chunk"; delta: string; index: number; correlationId: CorrelationId }
  | { type: "done"; correlationId: CorrelationId }
  | { type: "validation-failed"; error: string; format: ResponseFormatType; rawContent: string; correlationId: CorrelationId };
```

```ts
async *#streamChat(input: ChatInput, options?: ChatOperationOptions): AsyncIterable<ChatStreamEvent> {
  const structured = normalizeToStructured(input);
  const filtered = this.#applyPermissionFilter(structured);
  const envelope = this.#buildEnvelope("chat.stream", filtered);
  const stream = await this.#transport.stream(envelope);

  let fullContent = "";
  for await (const response of stream) {
    const event = this.#parseStreamEvent(response);
    if (event.type === "chunk") fullContent += event.delta;
    yield event;
  }

  if (filtered.enforceFormatValidation) {
    const validator = BUILT_IN_VALIDATORS[filtered.enforceFormatValidation.format];
    const validation = validator(fullContent, filtered.enforceFormatValidation.schema);
    if (!validation.valid) {
      yield {
        type: "validation-failed",
        error: validation.error,
        format: filtered.enforceFormatValidation.format,
        rawContent: fullContent,
        correlationId: envelope.correlationId,
      };
    }
  }
}
```

### 6.4 New Error Class

```ts
class BYOMFormatValidationError extends BYOMSDKError {
  readonly format: ResponseFormatType;
  readonly attempts: number;
  readonly rawContent: string;

  constructor(message: string, format: ResponseFormatType, attempts: number, rawContent?: string) {
    super(message, {
      machineCode: "BYOM_SDK_FORMAT_VALIDATION_FAILED",
      reasonCode: "request.invalid",
      retryable: false,
    });
    this.format = format;
    this.attempts = attempts;
    this.rawContent = rawContent ?? "";
  }
}
```

---

## 7. Bridge Changes

### 7.1 Structured Payload in Envelope

The bridge receives the full `StructuredChatInput` in the envelope payload (replacing the current `{ messages: ChatMessage[] }` payload). The bridge:

1. **Validates** the `ruleSetHash` against its own permission rule snapshot
2. **Enforces** permission rules authoritatively (strips disallowed fields, denies blocked providers/models)
3. **Forwards** the filtered `StructuredChatInput` to the adapter via `sendMessage(sessionId, input)` or `streamMessage(sessionId, input, onChunk)`

### 7.2 CLI Bridge Handler

The existing `cli.chat.execute` handler updates to pass `StructuredChatInput` instead of a flat messages array:

- Current: `{ messages: CliChatMessage[], thinkingLevel, ... }`
- New: `{ input: StructuredChatInput, thinkingLevel, ... }`

The CLI chat executor calls the `LocalCliBridgeAdapter.sendMessage(sessionId, input)`, which handles XML wrapping internally.

### 7.3 Cloud Chat Handler

The `cloud.chat.execute` handler updates similarly:

- Current: `{ messages: CloudChatMessage[], ... }`
- New: `{ input: StructuredChatInput, ... }`

The cloud chat executor calls the adapter's `sendMessage(sessionId, input)`, which handles native API formatting internally.

---

## 8. Error Taxonomy Additions

| Machine Code | Reason Code | When |
|---|---|---|
| `BYOM_SDK_FORMAT_VALIDATION_FAILED` | `request.invalid` | Response failed format validation after all retries |
| `BYOM_SDK_PERMISSION_RULE_DENIED` | `permission.denied` | A permission rule blocked the request |
| `BYOM_SDK_RULE_SET_MISMATCH` | `policy.denied` | SDK's ruleSetHash doesn't match bridge's copy |

---

## 9. Performance Optimizations

1. **Zero-copy permission fast path** — When no rules are active (common case), the filter returns the original input object without copying.

2. **Lazy envelope construction** — `StructuredChatInput` flows in the payload as-is. No intermediate serialization step.

3. **Streaming hot path untouched** — Structured fields only affect the initial request. Chunk-to-event processing is identical to today. Validation runs once, after stream completes.

4. **Validation is opt-in** — If `enforceFormatValidation` is not set, zero overhead. No validator instantiated, no parsing.

5. **Event-driven permission cache** — Rules pushed to SDK via transport on change. `permissions.check()` is synchronous O(1) hash lookup. No polling.

6. **Lazy JSON Schema validator** — The schema validator is loaded on first use of `enforceFormatValidation` with a `schema`. Apps that never use it never pay the import cost.

---

## 10. File Impact Map

| Package | Files Created | Files Modified |
|---------|--------------|----------------|
| `@byom-ai/protocol` | `src/structured-chat.ts`, `src/chat-permission-rules.ts` | `src/index.ts` (re-exports) |
| `@byom-ai/web-sdk` | `src/response-validation.ts`, `src/permission-filter.ts`, `src/permissions-api.ts` | `src/client.ts`, `src/types.ts`, `src/errors.ts`, `src/index.ts` |
| `@byom-ai/adapter-runtime` | — | `src/cloud-contract.ts` (AdapterContract signatures), `src/manifest-schema.ts` (StructuredInputCapabilities), `src/index.ts` |
| `@byom-ai/adapter-ollama` | — | `src/index.ts` (sendMessage/streamMessage accept StructuredChatInput, toOllamaPayload translation) |
| `@byom-ai/adapter-claude-subscription` | — | `src/index.ts` (sendMessage/streamMessage, toClaudePayload with tool_use) |
| `@byom-ai/adapter-local-cli-bridge` | `src/xml-formatter.ts` | `src/index.ts` (sendMessage/streamMessage, toCliPrompt) |
| `@byom-ai/bridge` | `src/permissions/chat-rule-enforcer.ts` | `src/bridge-handler.ts`, `src/cli/copilot-chat-executor.ts`, `src/cloud/cloud-chat-executor.ts` |

---

## 11. Testing Strategy

| Layer | Test Type | What It Verifies |
|-------|-----------|-----------------|
| `StructuredChatInput` parsing | Unit | Validation constraints, edge cases (empty messages, oversized content, max fewShots) |
| Permission filter | Unit | Each rule type, composite rules (low-token-usage), no-rules fast path, filter immutability |
| Response validators | Unit | JSON valid/invalid, JSON Schema validation, XML well-formedness, edge cases |
| Retry loop | Unit | Correct attempt counting, error on final failure, rawContent preserved |
| Stream validation | Unit | `validation-failed` event yielded correctly, full content assembly |
| Ollama translation | Unit | System prompt as system message, few-shots interleaved, objective/format appended |
| Claude translation | Unit | System param, tool_use activation, few-shots interleaved |
| CLI translation | Unit | XML wrapping, XML escaping (< > & in content), all fields present |
| Permission rule evaluation | Unit | Most-restrictive-wins, scope matching, composite rule expansion |
| Bridge rule enforcement | Integration | Extension syncs rules → bridge enforces → adapter receives filtered input |
| ruleSetHash mismatch | Integration | SDK with stale rules → bridge rejects with `policy.denied` |
| E2E structured send | Integration | SDK sends structured input → bridge validates → adapter translates → provider receives correct format |
| E2E structured stream | Integration | Same flow with streaming, validation-failed event on bad format |

---

## 12. Security Considerations

1. **XML injection in CLI prompts** — All user content XML-escaped via `escapeXml()` before insertion into XML tags. `<`, `>`, `&` → entity references.

2. **Permission bypass** — The bridge is the authoritative enforcer. Even if a malicious app patches the SDK's permission cache, the bridge independently evaluates rules and rejects non-compliant requests.

3. **ruleSetHash tampering** — The hash is SHA-256 of the canonical serialized rule set. The bridge computes its own hash. A mismatch results in immediate rejection.

4. **JSON Schema execution** — The JSON Schema validator must not support `$ref` with external URIs to prevent SSRF. Only local schema definitions are evaluated.

5. **Response content in errors** — `BYOMFormatValidationError.rawContent` contains the unvalidated AI response. SDK developers must treat this as untrusted input and sanitize before display.

6. **Metadata pass-through** — `metadata` field is never interpreted by the system. It flows through for user-land correlation. Size constraints prevent abuse.
