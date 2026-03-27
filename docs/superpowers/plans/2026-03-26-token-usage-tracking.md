# Token Usage Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track token usage per web app × provider × model with hybrid counting (provider-reported + estimation fallback), persisted in chrome.storage.local, displayed in popup and options page, and queryable by web apps with permission.

**Architecture:** A `TokenUsageService` records usage to chrome.storage.local after each chat completion. Provider-specific completion functions return a `UsageReport` alongside content. The transport handler calls the service after each request/stream completes. UI reads usage from storage via React hooks.

**Tech Stack:** TypeScript, chrome.storage.local, React + Mantine (popup/options), Vitest

**Spec:** `docs/superpowers/specs/2026-03-26-token-usage-design.md` (approved in chat)

---

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/extension/src/usage/token-usage-types.ts` | Types: `UsageReport`, `TokenUsageEntry`, `TokenUsageRecord`, `TokenUsageStore` |
| `apps/extension/src/usage/token-usage-service.ts` | CRUD for usage records in chrome.storage.local |
| `apps/extension/src/usage/token-estimation.ts` | `estimateTokens(text)` fallback estimator |
| `apps/extension/src/__tests__/token-usage-service.test.ts` | Unit tests for the service |
| `apps/extension/src/__tests__/token-estimation.test.ts` | Unit tests for the estimator |
| `apps/extension/src/transport/runtime.ts` (modify) | Thread `UsageReport` through transport, record after completion |
| `apps/extension/src/transport/cloud-native.ts` (modify) | Return usage from bridge response |

---

### Task 1: Token Usage Types

**Files:**
- Create: `apps/extension/src/usage/token-usage-types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// apps/extension/src/usage/token-usage-types.ts

export type UsageReport = Readonly<{
  inputTokens: number;
  outputTokens: number;
  source: "reported" | "estimated";
}>;

export type TokenUsageEntry = Readonly<{
  timestamp: number;
  inputTokens: number;
  outputTokens: number;
  source: "reported" | "estimated";
}>;

export type TokenUsageRecord = {
  entries: TokenUsageEntry[];
  allTimeTotals: {
    inputTokens: number;
    outputTokens: number;
    requestCount: number;
  };
};

export type TokenUsageStore = {
  version: 1;
  /** Key format: `${origin}\0${providerId}\0${modelId}` */
  records: Record<string, TokenUsageRecord>;
};

export type OriginUsageSummary = {
  origin: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalRequestCount: number;
  byProvider: Array<{
    providerId: string;
    modelId: string;
    inputTokens: number;
    outputTokens: number;
    requestCount: number;
  }>;
};

export const TOKEN_USAGE_STORAGE_KEY = "arlopass.token-usage.v1";
export const MAX_USAGE_RECORD_KEYS = 500;

export function makeUsageRecordKey(
  origin: string,
  providerId: string,
  modelId: string,
): string {
  return `${origin}\0${providerId}\0${modelId}`;
}

export function parseUsageRecordKey(
  key: string,
): { origin: string; providerId: string; modelId: string } | undefined {
  const parts = key.split("\0");
  if (parts.length !== 3) return undefined;
  return { origin: parts[0]!, providerId: parts[1]!, modelId: parts[2]! };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/extension/src/usage/token-usage-types.ts
git commit -m "feat(usage): add token usage type definitions"
```

---

### Task 2: Token Estimation Utility

**Files:**
- Create: `apps/extension/src/usage/token-estimation.ts`
- Create: `apps/extension/src/__tests__/token-estimation.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/extension/src/__tests__/token-estimation.test.ts
import { describe, expect, it } from "vitest";
import {
  estimateTokenCount,
  estimateInputTokens,
} from "../usage/token-estimation.js";
import type { ChatMessage } from "@arlopass/web-sdk";

describe("estimateTokenCount", () => {
  it("returns 1 for very short text", () => {
    expect(estimateTokenCount("hi")).toBe(1);
  });

  it("estimates based on character length / 4", () => {
    const text = "a".repeat(100);
    expect(estimateTokenCount(text)).toBe(25);
  });

  it("rounds up for non-divisible lengths", () => {
    expect(estimateTokenCount("hello")).toBe(2); // 5/4 = 1.25 → ceil 2
  });

  it("returns 0 for empty string", () => {
    expect(estimateTokenCount("")).toBe(0);
  });
});

describe("estimateInputTokens", () => {
  it("sums token estimates across all messages", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "a".repeat(40) },  // 10 tokens
      { role: "user", content: "a".repeat(80) },    // 20 tokens
    ];
    expect(estimateInputTokens(messages)).toBe(30);
  });

  it("returns 0 for empty array", () => {
    expect(estimateInputTokens([])).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/extension && npx vitest run src/__tests__/token-estimation.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// apps/extension/src/usage/token-estimation.ts
import type { ChatMessage } from "@arlopass/web-sdk";
import type { UsageReport } from "./token-usage-types.js";

const CHARS_PER_TOKEN = 4;

export function estimateTokenCount(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateInputTokens(messages: readonly ChatMessage[]): number {
  let total = 0;
  for (const message of messages) {
    total += estimateTokenCount(message.content);
  }
  return total;
}

export function estimateUsageReport(
  messages: readonly ChatMessage[],
  outputText: string,
): UsageReport {
  return {
    inputTokens: estimateInputTokens(messages),
    outputTokens: estimateTokenCount(outputText),
    source: "estimated",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/extension && npx vitest run src/__tests__/token-estimation.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/usage/token-estimation.ts apps/extension/src/__tests__/token-estimation.test.ts
git commit -m "feat(usage): add token estimation utility"
```

---

### Task 3: Token Usage Service

**Files:**
- Create: `apps/extension/src/usage/token-usage-service.ts`
- Create: `apps/extension/src/__tests__/token-usage-service.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/extension/src/__tests__/token-usage-service.test.ts
import { afterEach, describe, expect, it } from "vitest";
import {
  TokenUsageService,
  type TokenUsageStorageAdapter,
} from "../usage/token-usage-service.js";

function makeTestStorage(): TokenUsageStorageAdapter & {
  snapshot: () => Record<string, unknown>;
} {
  const state: Record<string, unknown> = {};
  return {
    async get(keys) {
      return Object.fromEntries(keys.map((key) => [key, state[key]]));
    },
    async set(items) {
      Object.assign(state, items);
    },
    snapshot() {
      return { ...state };
    },
  };
}

describe("TokenUsageService", () => {
  it("records usage and retrieves it by origin", async () => {
    const storage = makeTestStorage();
    const service = new TokenUsageService(storage);

    await service.recordUsage({
      origin: "https://example.com",
      providerId: "provider.ollama",
      modelId: "llama3.2",
      report: { inputTokens: 100, outputTokens: 50, source: "reported" },
    });

    const summary = await service.getUsageByOrigin("https://example.com");
    expect(summary.totalInputTokens).toBe(100);
    expect(summary.totalOutputTokens).toBe(50);
    expect(summary.totalRequestCount).toBe(1);
    expect(summary.byProvider).toHaveLength(1);
    expect(summary.byProvider[0]?.providerId).toBe("provider.ollama");
    expect(summary.byProvider[0]?.modelId).toBe("llama3.2");
  });

  it("accumulates multiple requests", async () => {
    const storage = makeTestStorage();
    const service = new TokenUsageService(storage);

    await service.recordUsage({
      origin: "https://example.com",
      providerId: "provider.ollama",
      modelId: "llama3.2",
      report: { inputTokens: 100, outputTokens: 50, source: "reported" },
    });
    await service.recordUsage({
      origin: "https://example.com",
      providerId: "provider.ollama",
      modelId: "llama3.2",
      report: { inputTokens: 200, outputTokens: 100, source: "estimated" },
    });

    const summary = await service.getUsageByOrigin("https://example.com");
    expect(summary.totalInputTokens).toBe(300);
    expect(summary.totalOutputTokens).toBe(150);
    expect(summary.totalRequestCount).toBe(2);
  });

  it("tracks separate providers and models independently", async () => {
    const storage = makeTestStorage();
    const service = new TokenUsageService(storage);

    await service.recordUsage({
      origin: "https://example.com",
      providerId: "provider.ollama",
      modelId: "llama3.2",
      report: { inputTokens: 100, outputTokens: 50, source: "reported" },
    });
    await service.recordUsage({
      origin: "https://example.com",
      providerId: "provider.claude",
      modelId: "sonnet-4",
      report: { inputTokens: 200, outputTokens: 100, source: "reported" },
    });

    const summary = await service.getUsageByOrigin("https://example.com");
    expect(summary.totalInputTokens).toBe(300);
    expect(summary.totalOutputTokens).toBe(150);
    expect(summary.byProvider).toHaveLength(2);
  });

  it("getAllUsage returns summaries for all origins", async () => {
    const storage = makeTestStorage();
    const service = new TokenUsageService(storage);

    await service.recordUsage({
      origin: "https://app-a.com",
      providerId: "provider.ollama",
      modelId: "llama3.2",
      report: { inputTokens: 100, outputTokens: 50, source: "reported" },
    });
    await service.recordUsage({
      origin: "https://app-b.com",
      providerId: "provider.claude",
      modelId: "sonnet-4",
      report: { inputTokens: 200, outputTokens: 100, source: "reported" },
    });

    const all = await service.getAllUsage();
    expect(all).toHaveLength(2);
  });

  it("resetUsage clears all data", async () => {
    const storage = makeTestStorage();
    const service = new TokenUsageService(storage);

    await service.recordUsage({
      origin: "https://example.com",
      providerId: "provider.ollama",
      modelId: "llama3.2",
      report: { inputTokens: 100, outputTokens: 50, source: "reported" },
    });
    await service.resetUsage();

    const all = await service.getAllUsage();
    expect(all).toHaveLength(0);
  });

  it("resetUsage with origin filter clears only that origin", async () => {
    const storage = makeTestStorage();
    const service = new TokenUsageService(storage);

    await service.recordUsage({
      origin: "https://keep.com",
      providerId: "p",
      modelId: "m",
      report: { inputTokens: 10, outputTokens: 5, source: "estimated" },
    });
    await service.recordUsage({
      origin: "https://remove.com",
      providerId: "p",
      modelId: "m",
      report: { inputTokens: 20, outputTokens: 10, source: "estimated" },
    });

    await service.resetUsage({ origin: "https://remove.com" });

    const all = await service.getAllUsage();
    expect(all).toHaveLength(1);
    expect(all[0]?.origin).toBe("https://keep.com");
  });

  it("compacts entries older than the 1st of last month", async () => {
    const storage = makeTestStorage();
    const service = new TokenUsageService(storage);

    // Insert an entry dated 3 months ago
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    await service.recordUsage({
      origin: "https://example.com",
      providerId: "p",
      modelId: "m",
      report: { inputTokens: 100, outputTokens: 50, source: "reported" },
      timestamp: threeMonthsAgo.getTime(),
    });

    // Insert a current entry to trigger compaction
    await service.recordUsage({
      origin: "https://example.com",
      providerId: "p",
      modelId: "m",
      report: { inputTokens: 10, outputTokens: 5, source: "reported" },
    });

    const summary = await service.getUsageByOrigin("https://example.com");
    // Totals include both
    expect(summary.totalInputTokens).toBe(110);
    expect(summary.totalOutputTokens).toBe(55);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/extension && npx vitest run src/__tests__/token-usage-service.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// apps/extension/src/usage/token-usage-service.ts
import {
  TOKEN_USAGE_STORAGE_KEY,
  MAX_USAGE_RECORD_KEYS,
  makeUsageRecordKey,
  parseUsageRecordKey,
  type TokenUsageStore,
  type TokenUsageRecord,
  type TokenUsageEntry,
  type UsageReport,
  type OriginUsageSummary,
} from "./token-usage-types.js";

export type TokenUsageStorageAdapter = Readonly<{
  get(keys: readonly string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}>;

function createEmptyRecord(): TokenUsageRecord {
  return {
    entries: [],
    allTimeTotals: { inputTokens: 0, outputTokens: 0, requestCount: 0 },
  };
}

function createEmptyStore(): TokenUsageStore {
  return { version: 1, records: {} };
}

function isTokenUsageStore(value: unknown): value is TokenUsageStore {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return record["version"] === 1 && typeof record["records"] === "object";
}

function getCompactionCutoff(): number {
  const now = new Date();
  const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return firstOfLastMonth.getTime();
}

function compactRecord(record: TokenUsageRecord): void {
  const cutoff = getCompactionCutoff();
  const kept: TokenUsageEntry[] = [];
  for (const entry of record.entries) {
    if (entry.timestamp < cutoff) {
      record.allTimeTotals.inputTokens += entry.inputTokens;
      record.allTimeTotals.outputTokens += entry.outputTokens;
      record.allTimeTotals.requestCount += 1;
    } else {
      kept.push(entry);
    }
  }
  record.entries = kept;
}

function recordTotals(record: TokenUsageRecord): {
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
} {
  let inputTokens = record.allTimeTotals.inputTokens;
  let outputTokens = record.allTimeTotals.outputTokens;
  let requestCount = record.allTimeTotals.requestCount;
  for (const entry of record.entries) {
    inputTokens += entry.inputTokens;
    outputTokens += entry.outputTokens;
    requestCount += 1;
  }
  return { inputTokens, outputTokens, requestCount };
}

export class TokenUsageService {
  readonly #storage: TokenUsageStorageAdapter;

  constructor(storage: TokenUsageStorageAdapter) {
    this.#storage = storage;
  }

  async #loadStore(): Promise<TokenUsageStore> {
    const raw = await this.#storage.get([TOKEN_USAGE_STORAGE_KEY]);
    const value = raw[TOKEN_USAGE_STORAGE_KEY];
    if (isTokenUsageStore(value)) {
      return value;
    }
    return createEmptyStore();
  }

  async #saveStore(store: TokenUsageStore): Promise<void> {
    await this.#storage.set({ [TOKEN_USAGE_STORAGE_KEY]: store });
  }

  async recordUsage(options: {
    origin: string;
    providerId: string;
    modelId: string;
    report: UsageReport;
    timestamp?: number;
  }): Promise<void> {
    const store = await this.#loadStore();
    const key = makeUsageRecordKey(
      options.origin,
      options.providerId,
      options.modelId,
    );

    if (store.records[key] === undefined) {
      // Enforce cap — evict oldest record if at limit.
      const keys = Object.keys(store.records);
      if (keys.length >= MAX_USAGE_RECORD_KEYS) {
        let oldestKey: string | undefined;
        let oldestTimestamp = Infinity;
        for (const k of keys) {
          const rec = store.records[k]!;
          const lastEntry = rec.entries[rec.entries.length - 1];
          const ts = lastEntry?.timestamp ?? 0;
          if (ts < oldestTimestamp) {
            oldestTimestamp = ts;
            oldestKey = k;
          }
        }
        if (oldestKey !== undefined) {
          delete store.records[oldestKey];
        }
      }
      store.records[key] = createEmptyRecord();
    }

    const record = store.records[key]!;
    record.entries.push({
      timestamp: options.timestamp ?? Date.now(),
      inputTokens: options.report.inputTokens,
      outputTokens: options.report.outputTokens,
      source: options.report.source,
    });

    compactRecord(record);
    await this.#saveStore(store);
  }

  async getUsageByOrigin(origin: string): Promise<OriginUsageSummary> {
    const store = await this.#loadStore();
    const byProvider: OriginUsageSummary["byProvider"] = [];
    let totalInput = 0;
    let totalOutput = 0;
    let totalCount = 0;

    for (const [key, record] of Object.entries(store.records)) {
      const parsed = parseUsageRecordKey(key);
      if (parsed === undefined || parsed.origin !== origin) continue;
      const totals = recordTotals(record);
      totalInput += totals.inputTokens;
      totalOutput += totals.outputTokens;
      totalCount += totals.requestCount;
      byProvider.push({
        providerId: parsed.providerId,
        modelId: parsed.modelId,
        inputTokens: totals.inputTokens,
        outputTokens: totals.outputTokens,
        requestCount: totals.requestCount,
      });
    }

    return {
      origin,
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      totalRequestCount: totalCount,
      byProvider,
    };
  }

  async getAllUsage(): Promise<OriginUsageSummary[]> {
    const store = await this.#loadStore();
    const byOrigin = new Map<string, OriginUsageSummary>();

    for (const [key, record] of Object.entries(store.records)) {
      const parsed = parseUsageRecordKey(key);
      if (parsed === undefined) continue;
      const totals = recordTotals(record);
      let summary = byOrigin.get(parsed.origin);
      if (summary === undefined) {
        summary = {
          origin: parsed.origin,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalRequestCount: 0,
          byProvider: [],
        };
        byOrigin.set(parsed.origin, summary);
      }
      summary.totalInputTokens += totals.inputTokens;
      summary.totalOutputTokens += totals.outputTokens;
      summary.totalRequestCount += totals.requestCount;
      summary.byProvider.push({
        providerId: parsed.providerId,
        modelId: parsed.modelId,
        inputTokens: totals.inputTokens,
        outputTokens: totals.outputTokens,
        requestCount: totals.requestCount,
      });
    }

    return [...byOrigin.values()];
  }

  async resetUsage(filter?: { origin?: string }): Promise<void> {
    if (filter?.origin !== undefined) {
      const store = await this.#loadStore();
      const prefix = filter.origin + "\0";
      for (const key of Object.keys(store.records)) {
        if (key.startsWith(prefix)) {
          delete store.records[key];
        }
      }
      await this.#saveStore(store);
      return;
    }
    await this.#saveStore(createEmptyStore());
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/extension && npx vitest run src/__tests__/token-usage-service.test.ts`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/usage/token-usage-service.ts apps/extension/src/__tests__/token-usage-service.test.ts
git commit -m "feat(usage): add TokenUsageService with storage, compaction, and queries"
```

---

### Task 4: Instrument Ollama Stream for Usage Reporting

**Files:**
- Modify: `apps/extension/src/transport/runtime.ts`

The Ollama stream function (`runOllamaCompletionStream`, starting around line 810) currently returns `AsyncIterable<string>`. We need to change the stream functions to produce usage data alongside the stream. The cleanest approach: change `resolveCompletionStream` to return an object with both the stream and a promise for the usage report.

- [ ] **Step 1: Add CompletionStreamResult type and update resolveCompletionStream signature**

At the top of `runtime.ts` (around line 30), add the import for `UsageReport`:

```typescript
import type { UsageReport } from "../usage/token-usage-types.js";
import { estimateUsageReport, estimateInputTokens, estimateTokenCount } from "../usage/token-estimation.js";
```

After the `CompletionProvider` type (around line 190), add:

```typescript
type CompletionStreamResult = {
  stream: AsyncIterable<string>;
  usage: Promise<UsageReport>;
};

type CompletionResult = {
  content: string;
  usage: UsageReport;
};
```

- [ ] **Step 2: Update Ollama stream to capture usage from the done message**

In the `runOllamaCompletionStream` function, the `processLine` function (around line 922) currently returns `{ delta?: string; done: boolean }`. Change it to also return usage:

```typescript
const processLine = (
  line: string,
): Readonly<{ delta?: string; done: boolean; usage?: UsageReport }> => {
  // ... existing parsing logic ...

  const delta = readOllamaResponseContent(parsed);
  const isDone = parsed["done"] === true;

  // Extract provider-reported usage from the done message
  let usage: UsageReport | undefined;
  if (isDone) {
    const promptEval = typeof parsed["prompt_eval_count"] === "number" ? parsed["prompt_eval_count"] : undefined;
    const evalCount = typeof parsed["eval_count"] === "number" ? parsed["eval_count"] : undefined;
    if (promptEval !== undefined && evalCount !== undefined) {
      usage = { inputTokens: promptEval, outputTokens: evalCount, source: "reported" };
    }
  }

  return {
    ...(delta !== undefined ? { delta } : {}),
    done: isDone,
    ...(usage !== undefined ? { usage } : {}),
  };
};
```

- [ ] **Step 3: Thread usage out of the Ollama stream generator**

Wrap the stream generator to capture the usage report. The stream function should return `CompletionStreamResult`:

Modify `runOllamaCompletionStream` to return `CompletionStreamResult` instead of `AsyncIterable<string>`. Create a deferred promise for usage:

```typescript
let resolveUsage: (report: UsageReport) => void;
const usagePromise = new Promise<UsageReport>((resolve) => { resolveUsage = resolve; });
```

In the stream generator, when `parsed.done` is true and `parsed.usage` is available, call `resolveUsage(parsed.usage)`. After the stream ends without explicit usage (fallback), call `resolveUsage(estimateUsageReport(options.messages, fullContent))`.

Return `{ stream: stream(), usage: usagePromise }`.

- [ ] **Step 4: Update resolveCompletionStream to return CompletionStreamResult**

Change `resolveCompletionStream` to return `Promise<CompletionStreamResult>`. Each case wraps the provider stream with the usage promise.

- [ ] **Step 5: Update resolveCompletion to return CompletionResult**

Change `resolveCompletion` to return `Promise<CompletionResult>`. Each provider function returns `{ content, usage }`. For non-streaming Ollama, parse usage from Ollama's response JSON. For cloud/CLI, use estimation as fallback.

- [ ] **Step 6: Run existing tests**

Run: `cd apps/extension && npx vitest run src/__tests__/transport-runtime.test.ts`
Expected: Existing tests may need minor updates to accommodate the changed return types. Fix any breakage.

- [ ] **Step 7: Commit**

```bash
git add apps/extension/src/transport/runtime.ts
git commit -m "feat(usage): instrument Ollama stream for provider-reported token usage"
```

---

### Task 5: Instrument Cloud and CLI Providers for Usage Reporting

**Files:**
- Modify: `apps/extension/src/transport/cloud-native.ts`
- Modify: `apps/extension/src/transport/runtime.ts`

- [ ] **Step 1: Update runCloudBridgeCompletion to return CompletionResult**

In `cloud-native.ts`, change `runCloudBridgeCompletion` to return `{ content: string; usage: UsageReport }`. After parsing `response["content"]`, check for `response["usage"]` or `response["inputTokens"]`/`response["outputTokens"]`. If present, use reported. Otherwise, estimate.

```typescript
const inputTokens =
  typeof response["inputTokens"] === "number" ? response["inputTokens"] : undefined;
const outputTokens =
  typeof response["outputTokens"] === "number" ? response["outputTokens"] : undefined;

const usage: UsageReport =
  inputTokens !== undefined && outputTokens !== undefined
    ? { inputTokens, outputTokens, source: "reported" }
    : estimateUsageReport(input.messages, content);

return { content, usage };
```

- [ ] **Step 2: Update runCloudBridgeCompletionStream to return CompletionStreamResult**

Similar pattern: the terminal `cloud.chat.result` response may contain usage fields. Extract them when the stream promise resolves.

- [ ] **Step 3: Update CLI bridge functions similarly**

`runCliBridgeCompletion` and `runCliBridgeCompletionStream` — use estimation fallback since CLI doesn't report usage.

- [ ] **Step 4: Verify all tests pass**

Run: `cd apps/extension && npx vitest run`
Expected: All 178 tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/transport/cloud-native.ts apps/extension/src/transport/runtime.ts
git commit -m "feat(usage): instrument cloud and CLI providers for usage reporting"
```

---

### Task 6: Record Usage in Transport Handler

**Files:**
- Modify: `apps/extension/src/transport/runtime.ts`

- [ ] **Step 1: Create TokenUsageService in the transport handler factory**

In `createTransportMessageHandler`, create a `TokenUsageService` instance using the `storage` adapter:

```typescript
import { TokenUsageService } from "../usage/token-usage-service.js";

// Inside createTransportMessageHandler:
const usageService = new TokenUsageService(options.storage);
```

- [ ] **Step 2: Record usage after non-streaming completions**

In the `chat.completions` case inside `dispatchTransportRequest`, after `resolveCompletion` returns `{ content, usage }`, call:

```typescript
void usageService.recordUsage({
  origin: envelope.origin,
  providerId: envelope.providerId,
  modelId: envelope.modelId,
  report: result.usage,
});
```

(Fire-and-forget — don't block the response on usage recording.)

- [ ] **Step 3: Record usage after streaming completions**

In `resolveTransportStreamEnvelopeIterable`, after the stream's `for await` loop completes (right before the `done` envelope is yielded), await the usage promise and record:

```typescript
const usageReport = await completionResult.usage;
void usageService.recordUsage({
  origin: options.envelope.origin,
  providerId: options.envelope.providerId,
  modelId: options.envelope.modelId,
  report: usageReport,
});
```

- [ ] **Step 4: Write a test for usage recording integration**

Add to `transport-runtime.test.ts`:

```typescript
it("records token usage after chat.completions request", async () => {
  // Setup storage with a provider, send a chat.completions message
  // After response, check TOKEN_USAGE_STORAGE_KEY in storage
  const storage = makeStorageAdapter({ /* providers, active */ });
  const handler = createTransportMessageHandler({ storage, dependencies: { /* mock fetch returns Ollama response */ } });
  await handler(makeTransportMessage("request", "chat.completions", { messages: [{ role: "user", content: "hello" }] }));
  const snapshot = storage.snapshot();
  const usageStore = snapshot["arlopass.token-usage.v1"];
  expect(usageStore).toBeDefined();
  // Check that a record exists for the origin/provider/model
});
```

- [ ] **Step 5: Run tests**

Run: `cd apps/extension && npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/extension/src/transport/runtime.ts apps/extension/src/__tests__/transport-runtime.test.ts
git commit -m "feat(usage): record token usage in transport handler after completions"
```

---

### Task 7: Usage Query Protocol Capability

**Files:**
- Modify: `apps/extension/src/transport/runtime.ts`

- [ ] **Step 1: Handle usage.query capability in dispatchTransportRequest**

Add a case for `"usage.query"` capability:

```typescript
case "usage.query": {
  const summary = await usageService.getUsageByOrigin(envelope.origin);
  return summary;
}
```

- [ ] **Step 2: Add usage.query to DEFAULT_CAPABILITIES**

In the `DEFAULT_CAPABILITIES` array, add `"usage.query"`.

Note: The `ProtocolCapability` type in `@arlopass/protocol` may need `"usage.query"` added. Check `packages/protocol/src/capabilities.ts` and add it if needed.

- [ ] **Step 3: Verify tests**

Run: `cd apps/extension && npx vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/extension/src/transport/runtime.ts packages/protocol/src/capabilities.ts
git commit -m "feat(usage): add usage.query protocol capability for SDK access"
```

---

### Task 8: Popup Usage Summary UI

**Files:**
- Create: `apps/extension/src/ui/hooks/useTokenUsage.ts`
- Modify: `apps/extension/src/ui/components/WalletPopup.tsx` (or equivalent popup component)

- [ ] **Step 1: Create the useTokenUsage hook**

```typescript
// apps/extension/src/ui/hooks/useTokenUsage.ts
import { useCallback, useEffect, useState } from "react";
import { TokenUsageService } from "../../usage/token-usage-service.js";
import type { OriginUsageSummary } from "../../usage/token-usage-types.js";
import { TOKEN_USAGE_STORAGE_KEY } from "../../usage/token-usage-types.js";

function createStorageAdapter() {
  return {
    async get(keys: readonly string[]) {
      return new Promise<Record<string, unknown>>((resolve) => {
        chrome.storage.local.get([...keys], resolve);
      });
    },
    async set(items: Record<string, unknown>) {
      return new Promise<void>((resolve) => {
        chrome.storage.local.set(items, resolve);
      });
    },
  };
}

export function useTokenUsage() {
  const [summaries, setSummaries] = useState<OriginUsageSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const service = new TokenUsageService(createStorageAdapter());
    const all = await service.getAllUsage();
    setSummaries(all);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === "local" && TOKEN_USAGE_STORAGE_KEY in changes) {
        void load();
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [load]);

  return { summaries, loading, reload: load };
}
```

- [ ] **Step 2: Add a usage summary to the popup**

In the appropriate popup component, add a small section:

```tsx
function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

// In the component:
const { summaries } = useTokenUsage();
const totalTokens = summaries.reduce(
  (sum, s) => sum + s.totalInputTokens + s.totalOutputTokens,
  0,
);

// Render a small text/badge:
<Text size="xs" c="dimmed">
  {formatTokenCount(totalTokens)} tokens used
</Text>
```

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/ui/hooks/useTokenUsage.ts apps/extension/src/ui/components/WalletPopup.tsx
git commit -m "feat(usage): add token usage summary to wallet popup"
```

---

### Task 9: Options Page Usage Breakdown UI

**Files:**
- Create: `apps/extension/src/ui/components/usage/UsageTable.tsx` (or add to existing options page)

- [ ] **Step 1: Build the usage table component**

A Mantine `Table` component showing:
- Rows: origin × provider × model
- Columns: Input Tokens, Output Tokens, Total, Requests
- "Reset" button per row
- "Reset All" button
- Time range filter (using granular entries for last 2 months)

- [ ] **Step 2: Wire into options page**

Add a "Usage" section or tab in the existing options page.

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/ui/components/usage/ apps/extension/src/options.ts
git commit -m "feat(usage): add detailed usage breakdown to options page"
```

---

### Task 10: Final Integration Test & Cleanup

- [ ] **Step 1: Run full test suite**

Run: `cd apps/extension && npx vitest run`
Expected: All tests pass

- [ ] **Step 2: TypeScript check**

Run: `cd apps/extension && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Build extension**

Run: `cd apps/extension && npm run build`
Expected: Build succeeds

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(usage): complete token usage tracking system"
```
