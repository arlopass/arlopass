# Structured Chat/Messaging/Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement structured chat input, permission rule engine, adapter contract evolution, and SDK-side response validation as defined in `docs/superpowers/specs/2026-03-24-structured-chat-messaging-streaming-design.md`.

**Architecture:** Layered pipeline — StructuredChatInput types in protocol, permission filter + response validation in web-sdk, evolved AdapterContract in adapter-runtime, per-adapter translation in each adapter, and bridge enforcement. Clean break at v0.1.0.

**Tech Stack:** TypeScript 5.8, Vitest, Node.js 20+

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `packages/protocol/src/structured-chat.ts` | `StructuredChatInput`, `ChatMessage`, `FewShotExample`, `ResponseFormat`, `FormatValidationOptions` types + parsing/validation |
| `packages/protocol/src/chat-permission-rules.ts` | `ChatPermissionRule`, `ChatPermissionRuleSet`, `ChatPermissionRuleId` types + evaluation helpers |
| `packages/protocol/src/__tests__/structured-chat.test.ts` | Unit tests for structured chat parsing |
| `packages/protocol/src/__tests__/chat-permission-rules.test.ts` | Unit tests for permission rule types |
| `packages/web-sdk/src/response-validation.ts` | Built-in validators (JSON, XML, markdown, text) + `ValidationResult` type |
| `packages/web-sdk/src/permission-filter.ts` | `applyPermissionFilter()` function that strips disallowed fields |
| `packages/web-sdk/src/permissions-api.ts` | `PermissionsAPI` class with `check()`, `getRule()`, `getActiveRules()`, `onChange()` |
| `packages/web-sdk/src/__tests__/response-validation.test.ts` | Unit tests for validators |
| `packages/web-sdk/src/__tests__/permission-filter.test.ts` | Unit tests for permission filter |
| `packages/web-sdk/src/__tests__/permissions-api.test.ts` | Unit tests for permissions API |
| `adapters/adapter-local-cli-bridge/src/xml-formatter.ts` | `toCliPrompt()` and `escapeXml()` functions |
| `adapters/adapter-local-cli-bridge/src/__tests__/xml-formatter.test.ts` | Unit tests for XML formatting |

### Modified Files

| File | Change |
|------|--------|
| `packages/protocol/src/index.ts` | Add re-exports for new modules |
| `packages/web-sdk/src/types.ts` | Update `ChatInput`, `ChatSendPayload`, `ChatStreamPayload`, `ChatStreamEvent` types |
| `packages/web-sdk/src/errors.ts` | Add `BYOMFormatValidationError`, `BYOMPermissionRuleDeniedError`, new machine codes |
| `packages/web-sdk/src/client.ts` | Integrate permission filter, response validation, retry loop, permissions API |
| `packages/web-sdk/src/index.ts` | Add re-exports for new modules |
| `adapters/runtime/src/adapter-loader.ts` | Update `AdapterContract` interface signatures |
| `adapters/runtime/src/cloud-contract.ts` | Update type guard to match new signatures |
| `adapters/runtime/src/manifest-schema.ts` | Add `StructuredInputCapabilities` type and optional manifest field |
| `adapters/runtime/src/index.ts` | Ensure new types exported |
| `adapters/adapter-ollama/src/index.ts` | Update `sendMessage`/`streamMessage` to accept `StructuredChatInput` |
| `adapters/adapter-claude-subscription/src/index.ts` | Update to accept `StructuredChatInput` |
| `adapters/adapter-local-cli-bridge/src/index.ts` | Update to accept `StructuredChatInput`, use xml-formatter |

---

## Task 1: Protocol — StructuredChatInput Types & Parsing

**Files:**
- Create: `packages/protocol/src/structured-chat.ts`
- Create: `packages/protocol/src/__tests__/structured-chat.test.ts`
- Modify: `packages/protocol/src/index.ts`

- [ ] **Step 1: Write the failing tests for structured chat parsing**

```ts
// packages/protocol/src/__tests__/structured-chat.test.ts
import { describe, it, expect } from "vitest";
import {
  parseStructuredChatInput,
  safeParseStructuredChatInput,
  isStructuredChatInput,
  type StructuredChatInput,
  type ChatMessage,
  type FewShotExample,
  type ResponseFormat,
  type FormatValidationOptions,
  type ResponseFormatType,
  type FormatValidationBehavior,
  STRUCTURED_CHAT_LIMITS,
} from "../structured-chat.js";

describe("parseStructuredChatInput", () => {
  it("parses minimal valid input with only messages", () => {
    const input = {
      messages: [{ role: "user", content: "Hello" }],
    };
    const result = parseStructuredChatInput(input);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]!.role).toBe("user");
    expect(result.messages[0]!.content).toBe("Hello");
    expect(result.systemPrompt).toBeUndefined();
    expect(result.objective).toBeUndefined();
    expect(result.expectedFormat).toBeUndefined();
    expect(result.fewShots).toBeUndefined();
    expect(result.enforceFormatValidation).toBeUndefined();
    expect(result.metadata).toBeUndefined();
  });

  it("parses fully structured input with all fields", () => {
    const input = {
      messages: [{ role: "user", content: "Refactor this" }],
      systemPrompt: "You are a TypeScript expert.",
      objective: "Improve readability.",
      expectedFormat: { type: "json", instruction: "Return JSON", schema: '{"type":"object"}' },
      fewShots: [
        {
          input: { role: "user", content: "Simplify: const f = x => x" },
          output: { role: "assistant", content: '{"code":"const identity = (x: unknown) => x"}' },
        },
      ],
      enforceFormatValidation: { format: "json", onFailure: "retry", maxRetries: 2 },
      metadata: { tag: "refactor" },
    };
    const result = parseStructuredChatInput(input);
    expect(result.systemPrompt).toBe("You are a TypeScript expert.");
    expect(result.objective).toBe("Improve readability.");
    expect(result.expectedFormat!.type).toBe("json");
    expect(result.fewShots).toHaveLength(1);
    expect(result.enforceFormatValidation!.format).toBe("json");
    expect(result.enforceFormatValidation!.maxRetries).toBe(2);
    expect(result.metadata!["tag"]).toBe("refactor");
  });

  it("throws on empty messages array", () => {
    expect(() => parseStructuredChatInput({ messages: [] })).toThrow();
  });

  it("throws on messages exceeding limit", () => {
    const messages = Array.from({ length: 129 }, (_, i) => ({
      role: "user",
      content: `msg ${i}`,
    }));
    expect(() => parseStructuredChatInput({ messages })).toThrow();
  });

  it("throws on invalid role", () => {
    expect(() =>
      parseStructuredChatInput({ messages: [{ role: "admin", content: "hi" }] }),
    ).toThrow();
  });

  it("throws on systemPrompt exceeding limit", () => {
    const input = {
      messages: [{ role: "user", content: "hi" }],
      systemPrompt: "x".repeat(32_001),
    };
    expect(() => parseStructuredChatInput(input)).toThrow();
  });

  it("throws on too many few-shot examples", () => {
    const fewShots = Array.from({ length: 21 }, () => ({
      input: { role: "user", content: "in" },
      output: { role: "assistant", content: "out" },
    }));
    expect(() =>
      parseStructuredChatInput({ messages: [{ role: "user", content: "hi" }], fewShots }),
    ).toThrow();
  });

  it("throws on maxRetries exceeding 5", () => {
    expect(() =>
      parseStructuredChatInput({
        messages: [{ role: "user", content: "hi" }],
        enforceFormatValidation: { format: "json", onFailure: "retry", maxRetries: 6 },
      }),
    ).toThrow();
  });

  it("throws on invalid format type", () => {
    expect(() =>
      parseStructuredChatInput({
        messages: [{ role: "user", content: "hi" }],
        expectedFormat: { type: "yaml" },
      }),
    ).toThrow();
  });

  it("throws on too many metadata keys", () => {
    const metadata: Record<string, string> = {};
    for (let i = 0; i < 33; i++) metadata[`key${i}`] = "val";
    expect(() =>
      parseStructuredChatInput({ messages: [{ role: "user", content: "hi" }], metadata }),
    ).toThrow();
  });
});

describe("safeParseStructuredChatInput", () => {
  it("returns success for valid input", () => {
    const result = safeParseStructuredChatInput({
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.messages).toHaveLength(1);
    }
  });

  it("returns failure for invalid input", () => {
    const result = safeParseStructuredChatInput({ messages: [] });
    expect(result.success).toBe(false);
  });
});

describe("isStructuredChatInput", () => {
  it("returns true when structured fields present", () => {
    expect(isStructuredChatInput({ messages: [{ role: "user", content: "hi" }], systemPrompt: "x" })).toBe(true);
  });

  it("returns false for simple input", () => {
    expect(isStructuredChatInput({ messages: [{ role: "user", content: "hi" }] })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/protocol/src/__tests__/structured-chat.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement structured-chat.ts**

```ts
// packages/protocol/src/structured-chat.ts

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = Readonly<{
  role: ChatRole;
  content: string;
}>;

export type FewShotExample = Readonly<{
  input: ChatMessage;
  output: ChatMessage;
}>;

export type ResponseFormatType = "text" | "json" | "xml" | "markdown";

export type ResponseFormat = Readonly<{
  type: ResponseFormatType;
  schema?: string;
  instruction?: string;
}>;

export type FormatValidationBehavior = "error" | "retry";

export type FormatValidationOptions = Readonly<{
  format: ResponseFormatType;
  schema?: string;
  onFailure: FormatValidationBehavior;
  maxRetries?: number;
}>;

export type StructuredChatInput = Readonly<{
  messages: readonly ChatMessage[];
  systemPrompt?: string;
  objective?: string;
  expectedFormat?: ResponseFormat;
  fewShots?: readonly FewShotExample[];
  enforceFormatValidation?: FormatValidationOptions;
  metadata?: Readonly<Record<string, string>>;
}>;

export type SafeParseResult<T> =
  | Readonly<{ success: true; value: T }>
  | Readonly<{ success: false; error: Error }>;

export const STRUCTURED_CHAT_LIMITS = {
  MAX_MESSAGES: 128,
  MAX_MESSAGE_CONTENT_LENGTH: 32_000,
  MAX_SYSTEM_PROMPT_LENGTH: 32_000,
  MAX_OBJECTIVE_LENGTH: 4_000,
  MAX_FEW_SHOTS: 20,
  MAX_FEW_SHOT_CONTENT_LENGTH: 8_000,
  MAX_METADATA_KEYS: 32,
  MAX_METADATA_KEY_LENGTH: 64,
  MAX_METADATA_VALUE_LENGTH: 256,
  MAX_RETRIES: 5,
} as const;

const VALID_ROLES = new Set<string>(["system", "user", "assistant"]);
const VALID_FORMAT_TYPES = new Set<string>(["text", "json", "xml", "markdown"]);
const VALID_FAILURE_BEHAVIORS = new Set<string>(["error", "retry"]);

function fail(message: string): never {
  throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseChatMessage(input: unknown, context: string): ChatMessage {
  if (!isRecord(input)) fail(`${context} must be an object.`);
  const role = input["role"];
  if (typeof role !== "string" || !VALID_ROLES.has(role)) {
    fail(`${context}.role must be "system", "user", or "assistant".`);
  }
  const content = input["content"];
  if (typeof content !== "string") fail(`${context}.content must be a string.`);
  if (content.length > STRUCTURED_CHAT_LIMITS.MAX_MESSAGE_CONTENT_LENGTH) {
    fail(`${context}.content exceeds ${STRUCTURED_CHAT_LIMITS.MAX_MESSAGE_CONTENT_LENGTH} chars.`);
  }
  return Object.freeze({ role: role as ChatRole, content });
}

function parseFewShotExample(input: unknown, context: string): FewShotExample {
  if (!isRecord(input)) fail(`${context} must be an object.`);
  const inp = parseChatMessage(input["input"], `${context}.input`);
  if (inp.content.length > STRUCTURED_CHAT_LIMITS.MAX_FEW_SHOT_CONTENT_LENGTH) {
    fail(`${context}.input.content exceeds ${STRUCTURED_CHAT_LIMITS.MAX_FEW_SHOT_CONTENT_LENGTH} chars.`);
  }
  const out = parseChatMessage(input["output"], `${context}.output`);
  if (out.content.length > STRUCTURED_CHAT_LIMITS.MAX_FEW_SHOT_CONTENT_LENGTH) {
    fail(`${context}.output.content exceeds ${STRUCTURED_CHAT_LIMITS.MAX_FEW_SHOT_CONTENT_LENGTH} chars.`);
  }
  return Object.freeze({ input: inp, output: out });
}

function parseResponseFormat(input: unknown): ResponseFormat {
  if (!isRecord(input)) fail(`expectedFormat must be an object.`);
  const type = input["type"];
  if (typeof type !== "string" || !VALID_FORMAT_TYPES.has(type)) {
    fail(`expectedFormat.type must be one of: text, json, xml, markdown.`);
  }
  const schema = input["schema"];
  if (schema !== undefined && typeof schema !== "string") fail(`expectedFormat.schema must be a string.`);
  const instruction = input["instruction"];
  if (instruction !== undefined && typeof instruction !== "string") fail(`expectedFormat.instruction must be a string.`);
  return Object.freeze({
    type: type as ResponseFormatType,
    ...(schema !== undefined ? { schema } : {}),
    ...(instruction !== undefined ? { instruction } : {}),
  });
}

function parseFormatValidation(input: unknown): FormatValidationOptions {
  if (!isRecord(input)) fail(`enforceFormatValidation must be an object.`);
  const format = input["format"];
  if (typeof format !== "string" || !VALID_FORMAT_TYPES.has(format)) {
    fail(`enforceFormatValidation.format must be one of: text, json, xml, markdown.`);
  }
  const onFailure = input["onFailure"];
  if (typeof onFailure !== "string" || !VALID_FAILURE_BEHAVIORS.has(onFailure)) {
    fail(`enforceFormatValidation.onFailure must be "error" or "retry".`);
  }
  const schema = input["schema"];
  if (schema !== undefined && typeof schema !== "string") {
    fail(`enforceFormatValidation.schema must be a string.`);
  }
  const maxRetries = input["maxRetries"];
  if (maxRetries !== undefined) {
    if (typeof maxRetries !== "number" || !Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > STRUCTURED_CHAT_LIMITS.MAX_RETRIES) {
      fail(`enforceFormatValidation.maxRetries must be 0–${STRUCTURED_CHAT_LIMITS.MAX_RETRIES}.`);
    }
  }
  return Object.freeze({
    format: format as ResponseFormatType,
    onFailure: onFailure as FormatValidationBehavior,
    ...(schema !== undefined ? { schema } : {}),
    ...(maxRetries !== undefined ? { maxRetries } : {}),
  });
}

function parseMetadata(input: unknown): Readonly<Record<string, string>> {
  if (!isRecord(input)) fail(`metadata must be an object.`);
  const keys = Object.keys(input);
  if (keys.length > STRUCTURED_CHAT_LIMITS.MAX_METADATA_KEYS) {
    fail(`metadata exceeds ${STRUCTURED_CHAT_LIMITS.MAX_METADATA_KEYS} keys.`);
  }
  const result: Record<string, string> = {};
  for (const key of keys) {
    if (key.length > STRUCTURED_CHAT_LIMITS.MAX_METADATA_KEY_LENGTH) {
      fail(`metadata key "${key}" exceeds ${STRUCTURED_CHAT_LIMITS.MAX_METADATA_KEY_LENGTH} chars.`);
    }
    const value = input[key];
    if (typeof value !== "string") fail(`metadata["${key}"] must be a string.`);
    if (value.length > STRUCTURED_CHAT_LIMITS.MAX_METADATA_VALUE_LENGTH) {
      fail(`metadata["${key}"] exceeds ${STRUCTURED_CHAT_LIMITS.MAX_METADATA_VALUE_LENGTH} chars.`);
    }
    result[key] = value;
  }
  return Object.freeze(result);
}

export function parseStructuredChatInput(input: unknown): StructuredChatInput {
  if (!isRecord(input)) fail("StructuredChatInput must be an object.");

  const rawMessages = input["messages"];
  if (!Array.isArray(rawMessages)) fail("messages must be an array.");
  if (rawMessages.length === 0) fail("messages must contain at least one message.");
  if (rawMessages.length > STRUCTURED_CHAT_LIMITS.MAX_MESSAGES) {
    fail(`messages exceeds ${STRUCTURED_CHAT_LIMITS.MAX_MESSAGES} items.`);
  }
  const messages = Object.freeze(rawMessages.map((m, i) => parseChatMessage(m, `messages[${i}]`)));

  const rawSystemPrompt = input["systemPrompt"];
  let systemPrompt: string | undefined;
  if (rawSystemPrompt !== undefined) {
    if (typeof rawSystemPrompt !== "string") fail("systemPrompt must be a string.");
    if (rawSystemPrompt.length > STRUCTURED_CHAT_LIMITS.MAX_SYSTEM_PROMPT_LENGTH) {
      fail(`systemPrompt exceeds ${STRUCTURED_CHAT_LIMITS.MAX_SYSTEM_PROMPT_LENGTH} chars.`);
    }
    systemPrompt = rawSystemPrompt;
  }

  const rawObjective = input["objective"];
  let objective: string | undefined;
  if (rawObjective !== undefined) {
    if (typeof rawObjective !== "string") fail("objective must be a string.");
    if (rawObjective.length > STRUCTURED_CHAT_LIMITS.MAX_OBJECTIVE_LENGTH) {
      fail(`objective exceeds ${STRUCTURED_CHAT_LIMITS.MAX_OBJECTIVE_LENGTH} chars.`);
    }
    objective = rawObjective;
  }

  let expectedFormat: ResponseFormat | undefined;
  if (input["expectedFormat"] !== undefined) {
    expectedFormat = parseResponseFormat(input["expectedFormat"]);
  }

  let fewShots: readonly FewShotExample[] | undefined;
  if (input["fewShots"] !== undefined) {
    const rawFewShots = input["fewShots"];
    if (!Array.isArray(rawFewShots)) fail("fewShots must be an array.");
    if (rawFewShots.length > STRUCTURED_CHAT_LIMITS.MAX_FEW_SHOTS) {
      fail(`fewShots exceeds ${STRUCTURED_CHAT_LIMITS.MAX_FEW_SHOTS} items.`);
    }
    fewShots = Object.freeze(rawFewShots.map((s, i) => parseFewShotExample(s, `fewShots[${i}]`)));
  }

  let enforceFormatValidation: FormatValidationOptions | undefined;
  if (input["enforceFormatValidation"] !== undefined) {
    enforceFormatValidation = parseFormatValidation(input["enforceFormatValidation"]);
  }

  let metadata: Readonly<Record<string, string>> | undefined;
  if (input["metadata"] !== undefined) {
    metadata = parseMetadata(input["metadata"]);
  }

  return Object.freeze({
    messages,
    ...(systemPrompt !== undefined ? { systemPrompt } : {}),
    ...(objective !== undefined ? { objective } : {}),
    ...(expectedFormat !== undefined ? { expectedFormat } : {}),
    ...(fewShots !== undefined ? { fewShots } : {}),
    ...(enforceFormatValidation !== undefined ? { enforceFormatValidation } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  });
}

export function safeParseStructuredChatInput(input: unknown): SafeParseResult<StructuredChatInput> {
  try {
    return { success: true, value: parseStructuredChatInput(input) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

export function isStructuredChatInput(input: unknown): input is StructuredChatInput {
  if (!isRecord(input)) return false;
  return (
    "systemPrompt" in input ||
    "objective" in input ||
    "expectedFormat" in input ||
    "fewShots" in input ||
    "enforceFormatValidation" in input
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/protocol/src/__tests__/structured-chat.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Add re-export to protocol index**

Add to `packages/protocol/src/index.ts`:
```ts
export * from "./structured-chat.js";
```

- [ ] **Step 6: Run full protocol typecheck**

Run: `npm run typecheck -w @byom-ai/protocol`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add packages/protocol/src/structured-chat.ts packages/protocol/src/__tests__/structured-chat.test.ts packages/protocol/src/index.ts
git commit -m "feat(protocol): add StructuredChatInput types and parsing"
```

---

## Task 2: Protocol — Chat Permission Rule Types

**Files:**
- Create: `packages/protocol/src/chat-permission-rules.ts`
- Create: `packages/protocol/src/__tests__/chat-permission-rules.test.ts`
- Modify: `packages/protocol/src/index.ts`

- [ ] **Step 1: Write failing tests for permission rule types**

```ts
// packages/protocol/src/__tests__/chat-permission-rules.test.ts
import { describe, it, expect } from "vitest";
import {
  parseChatPermissionRuleSet,
  evaluateChatPermissionRules,
  computeRuleSetHash,
  type ChatPermissionRule,
  type ChatPermissionRuleSet,
  type ChatPermissionRuleId,
  type ChatPermissionRuleScope,
  type ChatPermissionRuleValue,
  CHAT_PERMISSION_RULE_IDS,
} from "../chat-permission-rules.js";

describe("parseChatPermissionRuleSet", () => {
  it("parses a valid rule set", () => {
    const raw = {
      version: "1.0.0",
      rules: [
        { id: "block-system-prompts", value: { type: "boolean", value: true }, scope: {} },
      ],
      updatedAt: new Date().toISOString(),
    };
    const result = parseChatPermissionRuleSet(raw);
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0]!.id).toBe("block-system-prompts");
  });

  it("parses empty rules array", () => {
    const result = parseChatPermissionRuleSet({
      version: "1.0.0",
      rules: [],
      updatedAt: new Date().toISOString(),
    });
    expect(result.rules).toHaveLength(0);
  });

  it("throws on unknown rule id", () => {
    expect(() =>
      parseChatPermissionRuleSet({
        version: "1.0.0",
        rules: [{ id: "unknown-rule", value: { type: "boolean", value: true }, scope: {} }],
        updatedAt: new Date().toISOString(),
      }),
    ).toThrow();
  });
});

describe("evaluateChatPermissionRules", () => {
  it("returns true for boolean rule that is active", () => {
    const rules: ChatPermissionRuleSet = {
      version: "1.0.0",
      rules: [{ id: "block-system-prompts", value: { type: "boolean", value: true }, scope: {} }],
      updatedAt: new Date().toISOString(),
    };
    expect(evaluateChatPermissionRules(rules, "block-system-prompts", {})).toBe(true);
  });

  it("returns false when rule is not present", () => {
    const rules: ChatPermissionRuleSet = {
      version: "1.0.0",
      rules: [],
      updatedAt: new Date().toISOString(),
    };
    expect(evaluateChatPermissionRules(rules, "block-system-prompts", {})).toBe(false);
  });

  it("respects origin scope", () => {
    const rules: ChatPermissionRuleSet = {
      version: "1.0.0",
      rules: [{
        id: "block-few-shots",
        value: { type: "boolean", value: true },
        scope: { origins: ["https://app.acme.com"] },
      }],
      updatedAt: new Date().toISOString(),
    };
    expect(evaluateChatPermissionRules(rules, "block-few-shots", { origin: "https://app.acme.com" })).toBe(true);
    expect(evaluateChatPermissionRules(rules, "block-few-shots", { origin: "https://other.com" })).toBe(false);
  });

  it("returns numeric value for number rules", () => {
    const rules: ChatPermissionRuleSet = {
      version: "1.0.0",
      rules: [{ id: "max-messages-per-request", value: { type: "number", value: 10 }, scope: {} }],
      updatedAt: new Date().toISOString(),
    };
    expect(evaluateChatPermissionRules(rules, "max-messages-per-request", {})).toBe(true);
  });

  it("expands low-token-usage composite", () => {
    const rules: ChatPermissionRuleSet = {
      version: "1.0.0",
      rules: [{ id: "low-token-usage", value: { type: "boolean", value: true }, scope: {} }],
      updatedAt: new Date().toISOString(),
    };
    expect(evaluateChatPermissionRules(rules, "block-system-prompts", {})).toBe(true);
    expect(evaluateChatPermissionRules(rules, "block-few-shots", {})).toBe(true);
    expect(evaluateChatPermissionRules(rules, "block-objectives", {})).toBe(true);
    expect(evaluateChatPermissionRules(rules, "block-format-hints", {})).toBe(true);
  });
});

describe("computeRuleSetHash", () => {
  it("returns consistent hash for same input", () => {
    const rules: ChatPermissionRuleSet = {
      version: "1.0.0",
      rules: [{ id: "block-system-prompts", value: { type: "boolean", value: true }, scope: {} }],
      updatedAt: "2026-03-24T00:00:00.000Z",
    };
    const hash1 = computeRuleSetHash(rules);
    const hash2 = computeRuleSetHash(rules);
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBeGreaterThan(0);
  });

  it("returns different hash for different rules", () => {
    const rules1: ChatPermissionRuleSet = {
      version: "1.0.0",
      rules: [{ id: "block-system-prompts", value: { type: "boolean", value: true }, scope: {} }],
      updatedAt: "2026-03-24T00:00:00.000Z",
    };
    const rules2: ChatPermissionRuleSet = {
      version: "1.0.0",
      rules: [{ id: "block-few-shots", value: { type: "boolean", value: true }, scope: {} }],
      updatedAt: "2026-03-24T00:00:00.000Z",
    };
    expect(computeRuleSetHash(rules1)).not.toBe(computeRuleSetHash(rules2));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/protocol/src/__tests__/chat-permission-rules.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement chat-permission-rules.ts**

```ts
// packages/protocol/src/chat-permission-rules.ts
import { createHash } from "node:crypto";

export const CHAT_PERMISSION_RULE_IDS = [
  "max-tokens-per-request",
  "max-messages-per-request",
  "allowed-roles",
  "block-system-prompts",
  "block-few-shots",
  "block-objectives",
  "block-format-hints",
  "block-provider",
  "block-model",
  "block-origin",
  "low-token-usage",
] as const;

export type ChatPermissionRuleId = (typeof CHAT_PERMISSION_RULE_IDS)[number];

export type ChatPermissionRuleValue =
  | Readonly<{ type: "boolean"; value: boolean }>
  | Readonly<{ type: "number"; value: number }>
  | Readonly<{ type: "string-set"; value: readonly string[] }>;

export type ChatPermissionRuleScope = Readonly<{
  origins?: readonly string[];
  providerIds?: readonly string[];
  modelIds?: readonly string[];
}>;

export type ChatPermissionRule = Readonly<{
  id: ChatPermissionRuleId;
  value: ChatPermissionRuleValue;
  scope: ChatPermissionRuleScope;
}>;

export type ChatPermissionRuleSet = Readonly<{
  version: string;
  rules: readonly ChatPermissionRule[];
  updatedAt: string;
}>;

export type ChatPermissionEvaluationContext = Readonly<{
  origin?: string;
  providerId?: string;
  modelId?: string;
}>;

const VALID_RULE_IDS = new Set<string>(CHAT_PERMISSION_RULE_IDS);

const LOW_TOKEN_USAGE_EXPANSION: readonly ChatPermissionRuleId[] = [
  "block-system-prompts",
  "block-few-shots",
  "block-objectives",
  "block-format-hints",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRuleValue(input: unknown, ruleId: string): ChatPermissionRuleValue {
  if (!isRecord(input)) throw new Error(`Rule "${ruleId}": value must be an object.`);
  const type = input["type"];
  if (type === "boolean") {
    if (typeof input["value"] !== "boolean") throw new Error(`Rule "${ruleId}": boolean value required.`);
    return { type: "boolean", value: input["value"] };
  }
  if (type === "number") {
    if (typeof input["value"] !== "number") throw new Error(`Rule "${ruleId}": number value required.`);
    return { type: "number", value: input["value"] };
  }
  if (type === "string-set") {
    if (!Array.isArray(input["value"])) throw new Error(`Rule "${ruleId}": string-set value must be an array.`);
    for (const item of input["value"]) {
      if (typeof item !== "string") throw new Error(`Rule "${ruleId}": string-set items must be strings.`);
    }
    return { type: "string-set", value: Object.freeze([...(input["value"] as string[])]) };
  }
  throw new Error(`Rule "${ruleId}": unknown value type "${String(type)}".`);
}

function parseScope(input: unknown): ChatPermissionRuleScope {
  if (!isRecord(input)) return {};
  const scope: Record<string, readonly string[]> = {};
  for (const key of ["origins", "providerIds", "modelIds"] as const) {
    const raw = input[key];
    if (raw !== undefined) {
      if (!Array.isArray(raw)) throw new Error(`scope.${key} must be an array.`);
      scope[key] = Object.freeze(raw.filter((v): v is string => typeof v === "string"));
    }
  }
  return Object.freeze(scope);
}

export function parseChatPermissionRuleSet(input: unknown): ChatPermissionRuleSet {
  if (!isRecord(input)) throw new Error("ChatPermissionRuleSet must be an object.");
  if (typeof input["version"] !== "string") throw new Error("version must be a string.");
  if (typeof input["updatedAt"] !== "string") throw new Error("updatedAt must be a string.");
  if (!Array.isArray(input["rules"])) throw new Error("rules must be an array.");

  const rules: ChatPermissionRule[] = [];
  for (const raw of input["rules"]) {
    if (!isRecord(raw)) throw new Error("Each rule must be an object.");
    const id = raw["id"];
    if (typeof id !== "string" || !VALID_RULE_IDS.has(id)) {
      throw new Error(`Unknown rule id: "${String(id)}".`);
    }
    rules.push(Object.freeze({
      id: id as ChatPermissionRuleId,
      value: parseRuleValue(raw["value"], id),
      scope: parseScope(raw["scope"]),
    }));
  }

  return Object.freeze({
    version: input["version"] as string,
    rules: Object.freeze(rules),
    updatedAt: input["updatedAt"] as string,
  });
}

function scopeMatches(scope: ChatPermissionRuleScope, ctx: ChatPermissionEvaluationContext): boolean {
  if (scope.origins && scope.origins.length > 0 && ctx.origin !== undefined) {
    if (!scope.origins.includes(ctx.origin)) return false;
  }
  if (scope.providerIds && scope.providerIds.length > 0 && ctx.providerId !== undefined) {
    if (!scope.providerIds.includes(ctx.providerId)) return false;
  }
  if (scope.modelIds && scope.modelIds.length > 0 && ctx.modelId !== undefined) {
    if (!scope.modelIds.includes(ctx.modelId)) return false;
  }
  return true;
}

export function evaluateChatPermissionRules(
  ruleSet: ChatPermissionRuleSet,
  ruleId: ChatPermissionRuleId,
  ctx: ChatPermissionEvaluationContext,
): boolean {
  // Direct match
  for (const rule of ruleSet.rules) {
    if (rule.id === ruleId && scopeMatches(rule.scope, ctx)) {
      if (rule.value.type === "boolean") return rule.value.value;
      return true; // number and string-set rules are "active" when present
    }
  }

  // Composite expansion: low-token-usage implies block-system-prompts, etc.
  if (LOW_TOKEN_USAGE_EXPANSION.includes(ruleId)) {
    for (const rule of ruleSet.rules) {
      if (rule.id === "low-token-usage" && scopeMatches(rule.scope, ctx)) {
        if (rule.value.type === "boolean" && rule.value.value) return true;
      }
    }
  }

  return false;
}

export function getRuleValue(
  ruleSet: ChatPermissionRuleSet,
  ruleId: ChatPermissionRuleId,
  ctx: ChatPermissionEvaluationContext,
): ChatPermissionRuleValue | undefined {
  for (const rule of ruleSet.rules) {
    if (rule.id === ruleId && scopeMatches(rule.scope, ctx)) {
      return rule.value;
    }
  }
  return undefined;
}

export function computeRuleSetHash(ruleSet: ChatPermissionRuleSet): string {
  const canonical = JSON.stringify({
    version: ruleSet.version,
    rules: ruleSet.rules.map(r => ({
      id: r.id,
      value: r.value,
      scope: r.scope,
    })),
    updatedAt: ruleSet.updatedAt,
  });
  return createHash("sha256").update(canonical).digest("hex");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/protocol/src/__tests__/chat-permission-rules.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Add re-export**

Add to `packages/protocol/src/index.ts`:
```ts
export * from "./chat-permission-rules.js";
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck -w @byom-ai/protocol`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add packages/protocol/src/chat-permission-rules.ts packages/protocol/src/__tests__/chat-permission-rules.test.ts packages/protocol/src/index.ts
git commit -m "feat(protocol): add ChatPermissionRule types, evaluation, and hashing"
```

---

## Task 3: Adapter Runtime — Contract Signature Evolution

**Files:**
- Modify: `adapters/runtime/src/adapter-loader.ts`
- Modify: `adapters/runtime/src/cloud-contract.ts`
- Modify: `adapters/runtime/src/manifest-schema.ts`

- [ ] **Step 1: Update AdapterContract interface in adapter-loader.ts**

In `adapters/runtime/src/adapter-loader.ts`, change the `AdapterContract` interface. Replace:
```ts
  sendMessage(sessionId: string, message: string): Promise<string>;
  streamMessage(
    sessionId: string,
    message: string,
    onChunk: (chunk: string) => void,
  ): Promise<void>;
```
With:
```ts
  sendMessage(sessionId: string, input: StructuredChatInput): Promise<ChatResponse>;
  streamMessage(
    sessionId: string,
    input: StructuredChatInput,
    onChunk: (chunk: string) => void,
  ): Promise<void>;
```

Add import at top:
```ts
import { type StructuredChatInput } from "@byom-ai/protocol";
```

Add `ChatResponse` type after `AdapterContract`:
```ts
export type ChatResponse = Readonly<{
  content: string;
  role: "assistant";
  finishReason?: "stop" | "length" | "content_filter";
  providerMetadata?: Readonly<Record<string, unknown>>;
}>;
```

- [ ] **Step 2: Add StructuredInputCapabilities to manifest-schema.ts**

Add to `adapters/runtime/src/manifest-schema.ts` after existing types:
```ts
export type StructuredInputCapabilities = Readonly<{
  nativeSystemPrompt: boolean;
  nativeStructuredOutput: boolean;
  supportedFormats: readonly import("@byom-ai/protocol").ResponseFormatType[];
  maxContextTokens?: number;
}>;
```

Add optional field to `AdapterManifest` type:
```ts
  structuredInputCapabilities?: StructuredInputCapabilities;
```

- [ ] **Step 3: Typecheck the adapter-runtime package**

Run: `npm run typecheck -w @byom-ai/adapter-runtime`
Expected: Errors in adapter packages that still use old signatures (expected — we'll fix them in Tasks 4–6)

- [ ] **Step 4: Commit**

```bash
git add adapters/runtime/src/adapter-loader.ts adapters/runtime/src/manifest-schema.ts
git commit -m "feat(adapter-runtime): evolve AdapterContract to accept StructuredChatInput"
```

---

## Task 4: Ollama Adapter — StructuredChatInput Translation

**Files:**
- Modify: `adapters/adapter-ollama/src/index.ts`
- Modify: `adapters/adapter-ollama/src/__tests__/` (update existing tests)

- [ ] **Step 1: Update OllamaAdapter to accept StructuredChatInput**

In `adapters/adapter-ollama/src/index.ts`:

1. Add import: `import { type StructuredChatInput } from "@byom-ai/protocol";`
2. Add import: `import { type ChatResponse } from "@byom-ai/adapter-runtime";`
3. Change `sendMessage` signature from `(sessionId: string, message: string): Promise<string>` to `(sessionId: string, input: StructuredChatInput): Promise<ChatResponse>`
4. Change `streamMessage` signature from `(sessionId: string, message: string, onChunk: (chunk: string) => void): Promise<void>` to `(sessionId: string, input: StructuredChatInput, onChunk: (chunk: string) => void): Promise<void>`
5. Add internal `#toOllamaMessages(input: StructuredChatInput, sessionMessages: OllamaMessage[]): OllamaMessage[]` method that:
   - Creates system message from `input.systemPrompt` + `input.objective` + `input.expectedFormat?.instruction`
   - Adds few-shot examples as interleaved messages
   - Adds session history
   - Adds `input.messages`
6. Update `sendMessage` to call `#toOllamaMessages()` and return `ChatResponse` object
7. Update `streamMessage` to call `#toOllamaMessages()`
8. Add `structuredInputCapabilities` to `OLLAMA_MANIFEST`

- [ ] **Step 2: Update existing tests**

Update any existing tests that call `sendMessage(sessionId, "string")` to use `sendMessage(sessionId, { messages: [{ role: "user", content: "string" }] })`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck -w @byom-ai/adapter-ollama`
Expected: No errors

- [ ] **Step 4: Run tests**

Run: `npm run test -w @byom-ai/adapter-ollama`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add adapters/adapter-ollama/
git commit -m "feat(adapter-ollama): accept StructuredChatInput with native translation"
```

---

## Task 5: Claude Adapter — StructuredChatInput Translation

**Files:**
- Modify: `adapters/adapter-claude-subscription/src/index.ts`

- [ ] **Step 1: Update ClaudeSubscriptionAdapter**

Same pattern as Ollama adapter:
1. Add imports for `StructuredChatInput` and `ChatResponse`
2. Update signatures
3. Add `#toClaudePayload()` method that uses dedicated `system` param, `tool_use` for JSON structured output
4. Add `structuredInputCapabilities` to manifest
5. Return `ChatResponse` from `sendMessage`

- [ ] **Step 2: Update existing tests**

Same pattern — update string calls to `StructuredChatInput`.

- [ ] **Step 3: Typecheck and test**

Run: `npm run typecheck -w @byom-ai/adapter-claude-subscription && npm run test -w @byom-ai/adapter-claude-subscription`
Expected: No errors, all PASS

- [ ] **Step 4: Commit**

```bash
git add adapters/adapter-claude-subscription/
git commit -m "feat(adapter-claude): accept StructuredChatInput with system param and tool_use"
```

---

## Task 6: CLI Bridge Adapter — XML Formatting

**Files:**
- Create: `adapters/adapter-local-cli-bridge/src/xml-formatter.ts`
- Create: `adapters/adapter-local-cli-bridge/src/__tests__/xml-formatter.test.ts`
- Modify: `adapters/adapter-local-cli-bridge/src/index.ts`

- [ ] **Step 1: Write failing tests for XML formatter**

```ts
// adapters/adapter-local-cli-bridge/src/__tests__/xml-formatter.test.ts
import { describe, it, expect } from "vitest";
import { toCliPrompt, escapeXml } from "../xml-formatter.js";
import type { StructuredChatInput } from "@byom-ai/protocol";

describe("escapeXml", () => {
  it("escapes < > &", () => {
    expect(escapeXml("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
  });
  it("returns empty string unchanged", () => {
    expect(escapeXml("")).toBe("");
  });
  it("returns safe string unchanged", () => {
    expect(escapeXml("hello world")).toBe("hello world");
  });
});

describe("toCliPrompt", () => {
  it("formats messages only", () => {
    const input: StructuredChatInput = {
      messages: [{ role: "user", content: "Hello" }],
    };
    const result = toCliPrompt(input);
    expect(result).toBe("<user>Hello</user>");
  });

  it("formats all structured fields", () => {
    const input: StructuredChatInput = {
      systemPrompt: "You are an expert.",
      objective: "Refactor code.",
      expectedFormat: { type: "json", instruction: "Return JSON" },
      fewShots: [
        { input: { role: "user", content: "Q" }, output: { role: "assistant", content: "A" } },
      ],
      messages: [{ role: "user", content: "Do it" }],
    };
    const result = toCliPrompt(input);
    expect(result).toContain("<system-prompt>You are an expert.</system-prompt>");
    expect(result).toContain("<objective>Refactor code.</objective>");
    expect(result).toContain("<expected-format>Return JSON</expected-format>");
    expect(result).toContain("<few-shot-example>");
    expect(result).toContain("<user>Q</user>");
    expect(result).toContain("<assistant>A</assistant>");
    expect(result).toContain("</few-shot-example>");
    expect(result).toContain("<user>Do it</user>");
  });

  it("escapes XML special chars in content", () => {
    const input: StructuredChatInput = {
      messages: [{ role: "user", content: "a < b & c > d" }],
    };
    expect(toCliPrompt(input)).toBe("<user>a &lt; b &amp; c &gt; d</user>");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run adapters/adapter-local-cli-bridge/src/__tests__/xml-formatter.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement xml-formatter.ts**

```ts
// adapters/adapter-local-cli-bridge/src/xml-formatter.ts
import type { StructuredChatInput } from "@byom-ai/protocol";

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function toCliPrompt(input: StructuredChatInput): string {
  const parts: string[] = [];

  if (input.systemPrompt !== undefined) {
    parts.push(`<system-prompt>${escapeXml(input.systemPrompt)}</system-prompt>`);
  }
  if (input.objective !== undefined) {
    parts.push(`<objective>${escapeXml(input.objective)}</objective>`);
  }
  if (input.expectedFormat?.instruction !== undefined) {
    parts.push(`<expected-format>${escapeXml(input.expectedFormat.instruction)}</expected-format>`);
  }
  if (input.fewShots !== undefined && input.fewShots.length > 0) {
    for (const shot of input.fewShots) {
      parts.push(
        `<few-shot-example>\n` +
        `  <${shot.input.role}>${escapeXml(shot.input.content)}</${shot.input.role}>\n` +
        `  <${shot.output.role}>${escapeXml(shot.output.content)}</${shot.output.role}>\n` +
        `</few-shot-example>`,
      );
    }
  }
  for (const msg of input.messages) {
    parts.push(`<${msg.role}>${escapeXml(msg.content)}</${msg.role}>`);
  }

  return parts.join("\n\n");
}
```

- [ ] **Step 4: Run XML formatter tests**

Run: `npx vitest run adapters/adapter-local-cli-bridge/src/__tests__/xml-formatter.test.ts`
Expected: All PASS

- [ ] **Step 5: Update LocalCliBridgeAdapter to use xml-formatter and accept StructuredChatInput**

Update `adapters/adapter-local-cli-bridge/src/index.ts`:
1. Import `toCliPrompt` from `./xml-formatter.js`
2. Import `type StructuredChatInput` from `@byom-ai/protocol`
3. Import `type ChatResponse` from `@byom-ai/adapter-runtime`
4. Change `sendMessage(sessionId: string, message: string)` to `sendMessage(sessionId: string, input: StructuredChatInput): Promise<ChatResponse>`
5. Change `streamMessage` similarly
6. In `sendMessage` body, replace `message` usage with `toCliPrompt(input)`
7. Return `ChatResponse` object instead of plain string
8. Add `structuredInputCapabilities` to manifest

- [ ] **Step 6: Update existing tests**

- [ ] **Step 7: Typecheck and test**

Run: `npm run typecheck -w @byom-ai/adapter-local-cli-bridge && npm run test -w @byom-ai/adapter-local-cli-bridge`
Expected: No errors, all PASS

- [ ] **Step 8: Commit**

```bash
git add adapters/adapter-local-cli-bridge/
git commit -m "feat(adapter-cli-bridge): XML-formatted StructuredChatInput translation"
```

---

## Task 7: Web SDK — Response Validation

**Files:**
- Create: `packages/web-sdk/src/response-validation.ts`
- Create: `packages/web-sdk/src/__tests__/response-validation.test.ts`

- [ ] **Step 1: Write failing tests for response validators**

```ts
// packages/web-sdk/src/__tests__/response-validation.test.ts
import { describe, it, expect } from "vitest";
import { validateResponse, type ValidationResult } from "../response-validation.js";

describe("validateResponse", () => {
  describe("json", () => {
    it("validates valid JSON", () => {
      const result = validateResponse('{"key":"value"}', "json");
      expect(result.valid).toBe(true);
    });
    it("rejects invalid JSON", () => {
      const result = validateResponse("{invalid", "json");
      expect(result.valid).toBe(false);
    });
    it("validates against JSON Schema when provided", () => {
      const schema = '{"type":"object","properties":{"name":{"type":"string"}},"required":["name"]}';
      const valid = validateResponse('{"name":"test"}', "json", schema);
      expect(valid.valid).toBe(true);
      const invalid = validateResponse('{"age":5}', "json", schema);
      expect(invalid.valid).toBe(false);
    });
  });

  describe("xml", () => {
    it("validates well-formed XML", () => {
      expect(validateResponse("<root><child>text</child></root>", "xml").valid).toBe(true);
    });
    it("rejects unclosed tags", () => {
      expect(validateResponse("<root><child>text</root>", "xml").valid).toBe(false);
    });
  });

  describe("text and markdown", () => {
    it("always valid", () => {
      expect(validateResponse("anything", "text").valid).toBe(true);
      expect(validateResponse("# heading", "markdown").valid).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement response-validation.ts**

```ts
// packages/web-sdk/src/response-validation.ts
import type { ResponseFormatType } from "@byom-ai/protocol";

export type ValidationResult =
  | Readonly<{ valid: true; parsed: unknown }>
  | Readonly<{ valid: false; error: string }>;

export function validateResponse(
  content: string,
  format: ResponseFormatType,
  schema?: string,
): ValidationResult {
  switch (format) {
    case "json":
      return validateJson(content, schema);
    case "xml":
      return validateXml(content);
    case "markdown":
    case "text":
      return { valid: true, parsed: content };
  }
}

function validateJson(content: string, schema?: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    return { valid: false, error: `Invalid JSON: ${(e as Error).message}` };
  }

  if (schema !== undefined) {
    try {
      const schemaObj = JSON.parse(schema);
      const errors = validateJsonSchema(parsed, schemaObj);
      if (errors.length > 0) {
        return { valid: false, error: `Schema violation: ${errors[0]}` };
      }
    } catch (e) {
      return { valid: false, error: `Invalid schema: ${(e as Error).message}` };
    }
  }

  return { valid: true, parsed };
}

function validateJsonSchema(data: unknown, schema: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const type = schema["type"];

  if (type === "object" && typeof data === "object" && data !== null && !Array.isArray(data)) {
    const required = schema["required"];
    if (Array.isArray(required)) {
      for (const key of required) {
        if (typeof key === "string" && !(key in data)) {
          errors.push(`Missing required field: "${key}"`);
        }
      }
    }
  } else if (type === "array" && !Array.isArray(data)) {
    errors.push(`Expected array, got ${typeof data}`);
  } else if (type === "string" && typeof data !== "string") {
    errors.push(`Expected string, got ${typeof data}`);
  } else if (type === "number" && typeof data !== "number") {
    errors.push(`Expected number, got ${typeof data}`);
  } else if (type === "boolean" && typeof data !== "boolean") {
    errors.push(`Expected boolean, got ${typeof data}`);
  }

  return errors;
}

function validateXml(content: string): ValidationResult {
  const tagStack: string[] = [];
  const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9_-]*)[^>]*\/?>/g;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(content)) !== null) {
    const fullMatch = match[0]!;
    const tagName = match[1]!;

    if (fullMatch.endsWith("/>")) {
      continue; // Self-closing
    } else if (fullMatch.startsWith("</")) {
      if (tagStack.length === 0 || tagStack[tagStack.length - 1] !== tagName) {
        return { valid: false, error: `Malformed XML: unexpected closing tag </${tagName}>` };
      }
      tagStack.pop();
    } else {
      tagStack.push(tagName);
    }
  }

  if (tagStack.length > 0) {
    return { valid: false, error: `Malformed XML: unclosed tag <${tagStack[tagStack.length - 1]}>` };
  }

  return { valid: true, parsed: content };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/web-sdk/src/__tests__/response-validation.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web-sdk/src/response-validation.ts packages/web-sdk/src/__tests__/response-validation.test.ts
git commit -m "feat(web-sdk): add response format validators (JSON, XML, text, markdown)"
```

---

## Task 8: Web SDK — Permission Filter & Permissions API

**Files:**
- Create: `packages/web-sdk/src/permission-filter.ts`
- Create: `packages/web-sdk/src/permissions-api.ts`
- Create: `packages/web-sdk/src/__tests__/permission-filter.test.ts`
- Create: `packages/web-sdk/src/__tests__/permissions-api.test.ts`

- [ ] **Step 1: Write failing tests for permission filter**

Test: each boolean rule type strips correct field, `low-token-usage` composite, `max-messages-per-request` truncation, `allowed-roles` filtering, no-rules fast path returns same reference.

- [ ] **Step 2: Implement permission-filter.ts**

Function `applyPermissionFilter(input: StructuredChatInput, ruleSet: ChatPermissionRuleSet, ctx: ChatPermissionEvaluationContext): StructuredChatInput` that applies all rules.

- [ ] **Step 3: Write failing tests for permissions API**

Test: `check()` returns correct boolean, `getRule()` returns value, `getActiveRules()` returns filtered list, `onChange()` fires callback.

- [ ] **Step 4: Implement permissions-api.ts**

Class `PermissionsAPI` with `check()`, `getRule()`, `getActiveRules()`, `onChange()`, and `_updateRules()` internal method.

- [ ] **Step 5: Run all tests**

Run: `npx vitest run packages/web-sdk/src/__tests__/permission-filter.test.ts packages/web-sdk/src/__tests__/permissions-api.test.ts`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add packages/web-sdk/src/permission-filter.ts packages/web-sdk/src/permissions-api.ts packages/web-sdk/src/__tests__/permission-filter.test.ts packages/web-sdk/src/__tests__/permissions-api.test.ts
git commit -m "feat(web-sdk): add permission filter and permissions API"
```

---

## Task 9: Web SDK — Error Classes & Type Updates

**Files:**
- Modify: `packages/web-sdk/src/errors.ts`
- Modify: `packages/web-sdk/src/types.ts`
- Modify: `packages/web-sdk/src/index.ts`

- [ ] **Step 1: Add new error classes to errors.ts**

Add to `SDK_MACHINE_CODES`:
```ts
  FORMAT_VALIDATION_FAILED: "BYOM_SDK_FORMAT_VALIDATION_FAILED",
  PERMISSION_RULE_DENIED: "BYOM_SDK_PERMISSION_RULE_DENIED",
  RULE_SET_MISMATCH: "BYOM_SDK_RULE_SET_MISMATCH",
```

Add new error classes:
```ts
export class BYOMFormatValidationError extends BYOMSDKError {
  readonly format: ResponseFormatType;
  readonly attempts: number;
  readonly rawContent: string;

  constructor(message: string, format: ResponseFormatType, attempts: number, rawContent?: string) {
    super(message, {
      machineCode: SDK_MACHINE_CODES.FORMAT_VALIDATION_FAILED,
      reasonCode: "request.invalid",
      retryable: false,
    });
    this.format = format;
    this.attempts = attempts;
    this.rawContent = rawContent ?? "";
  }
}

export class BYOMPermissionRuleDeniedError extends BYOMSDKError {
  constructor(message: string, options: SharedSDKErrorOptions = {}) {
    super(message, {
      machineCode: SDK_MACHINE_CODES.PERMISSION_RULE_DENIED,
      reasonCode: options.reasonCode ?? "permission.denied",
      retryable: false,
      correlationId: options.correlationId,
      details: options.details,
    });
  }
}
```

- [ ] **Step 2: Update types.ts**

Update `ChatInput` to be a union:
```ts
export type ChatInput = StructuredChatInput | SimpleChatInput;
export type SimpleChatInput = Readonly<{
  messages: readonly ChatMessage[];
}>;
```

Import `StructuredChatInput` from `@byom-ai/protocol` and re-export `ChatRole`, `ChatMessage` from there.

Update `ChatSendPayload` and `ChatStreamPayload` to use `StructuredChatInput`.

Add `validation-failed` variant to `ChatStreamEvent`:
```ts
  | Readonly<{
      type: "validation-failed";
      error: string;
      format: ResponseFormatType;
      rawContent: string;
      correlationId: CorrelationId;
    }>;
```

- [ ] **Step 3: Update index.ts**

Add re-exports:
```ts
export * from "./response-validation.js";
export * from "./permission-filter.js";
export * from "./permissions-api.js";
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck -w @byom-ai/web-sdk`
Expected: Errors in client.ts (not yet updated — expected)

- [ ] **Step 5: Commit**

```bash
git add packages/web-sdk/src/errors.ts packages/web-sdk/src/types.ts packages/web-sdk/src/index.ts
git commit -m "feat(web-sdk): add format validation error, permission error, update ChatInput types"
```

---

## Task 10: Web SDK — Client Integration

**Files:**
- Modify: `packages/web-sdk/src/client.ts`

- [ ] **Step 1: Add permissions property to BYOMClient**

Import `PermissionsAPI` and initialize in constructor. Expose as `client.permissions`.

- [ ] **Step 2: Add permission filter to send/stream methods**

In `#sendChat()`: normalize input → apply permission filter → build envelope → send.

- [ ] **Step 3: Add response validation retry loop to #sendChat**

After receiving response, if `enforceFormatValidation` is set, validate with built-in validator. Retry if configured.

- [ ] **Step 4: Add post-stream validation to #streamChat**

After stream completes, validate assembled content. Yield `validation-failed` event if invalid.

- [ ] **Step 5: Typecheck and run all tests**

Run: `npm run typecheck -w @byom-ai/web-sdk && npm run test -w @byom-ai/web-sdk`
Expected: No errors, all PASS

- [ ] **Step 6: Commit**

```bash
git add packages/web-sdk/src/client.ts
git commit -m "feat(web-sdk): integrate permission filter, response validation, structured chat"
```

---

## Task 11: Full Integration Verification

**Files:** None new — verification only.

- [ ] **Step 1: Run full typecheck across all workspaces**

Run: `npm run typecheck`
Expected: No errors in any workspace

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 4: Build all**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: structured chat/messaging/streaming with permission rules and response validation

- StructuredChatInput types with systemPrompt, objective, fewShots, expectedFormat
- Chat permission rule engine with dual enforcement (SDK + bridge)
- AdapterContract evolved to accept StructuredChatInput
- Per-adapter native translation (Ollama messages, Claude system+tool_use, CLI XML)
- SDK-side response validation with retry support
- Permission filter with auto-strip and developer guards API

Spec: docs/superpowers/specs/2026-03-24-structured-chat-messaging-streaming-design.md"
```
