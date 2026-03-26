# BYOM AI — Bookstore Test

Adapted from the [Stitch SDK Bookstore Test](https://github.com/google-labs-code/stitch-sdk).
A README earns a reader's attention the same way a book does: **Cover** → **Inner Flap** → **Reading the Book**.

---

## How to Source the Current API

Do not hard-code the API surface. Read it from the codebase at invocation time:

| What you need | Where to find it |
|---|---|
| Web SDK public exports | `packages/web-sdk/src/index.ts` |
| BYOMClient methods & options | `packages/web-sdk/src/client.ts` |
| SDK error classes & machine codes | `packages/web-sdk/src/errors.ts` |
| Transport interface | `packages/web-sdk/src/transport.ts` |
| Client state machine | `packages/web-sdk/src/state-machine.ts` |
| SDK types (ChatInput, ConnectResult, etc.) | `packages/web-sdk/src/types.ts` |
| Protocol envelope, parsing, validation | `packages/protocol/src/envelope.ts` |
| Protocol capabilities | `packages/protocol/src/capabilities.ts` |
| Protocol errors & machine codes | `packages/protocol/src/errors.ts` |
| Protocol reason codes | `packages/protocol/src/reason-codes.ts` |
| Version negotiation | `packages/protocol/src/versioning.ts` |
| Cloud connection contracts | `packages/protocol/src/cloud-connection.ts` |
| Policy schema, rules, bundles | `packages/policy/src/schema.ts` |
| Policy evaluator | `packages/policy/src/evaluator.ts` |
| Policy signature & verification | `packages/policy/src/signature.ts` |
| Policy key management | `packages/policy/src/key-management.ts` |
| Audit event schema & validation | `packages/audit/src/event-schema.ts` |
| JSONL exporter | `packages/audit/src/exporters/jsonl-exporter.ts` |
| OTLP exporter | `packages/audit/src/exporters/otlp-exporter.ts` |
| Telemetry metrics | `packages/telemetry/src/metrics.ts` |
| Telemetry tracing | `packages/telemetry/src/tracing.ts` |
| Telemetry redaction | `packages/telemetry/src/redaction.ts` |
| Adapter runtime: manifest, host, loader | `adapters/runtime/src/index.ts` |
| Adapter contract interface | `adapters/runtime/src/cloud-contract.ts` |
| Ollama adapter | `adapters/adapter-ollama/src/index.ts` |
| Claude adapter + auth | `adapters/adapter-claude-subscription/src/index.ts`, `src/auth.ts` |
| CLI bridge adapter | `adapters/adapter-local-cli-bridge/src/index.ts` |

---

## The Cover (Root README)

A single sentence stating what problem this library solves — not what the library *is*. The reader should recognize their own situation.

**For BYOM AI**, the cover is about using AI providers from web apps without handing over credentials.

**Good:** "Let web applications use your AI providers — local models, paid subscriptions, CLI tools — without exposing your credentials."
**Bad:** "An enterprise-grade SDK and browser extension for AI provider mediation."

### Cover Rules
- [ ] Problem statement, not product description
- [ ] No promotional adjectives ("enterprise-grade", "powerful", "seamless", "robust")
- [ ] Reader recognizes their own situation within 10 seconds

---

## The Inner Flap (Root README + Web SDK README)

Immediately show the library in use. Code first, not setup.

**Primary workflow** — the punchline:
```
connect → listProviders → selectProvider → chat.send / chat.stream → disconnect
```

Show this as the first code block. One line mentioning `window.byom` or the extension is enough context. Do not show installation, npm commands, or monorepo setup before this.

**Secondary workflows** — reveal depth progressively:
1. Streaming with `chat.stream` (AsyncIterable)
2. Using adapters directly (Ollama, CLI bridge)
3. Custom transport (no extension, direct HTTP)
4. Policy evaluation for enterprise contexts
5. Audit event recording
6. Telemetry metrics and tracing

### Inner Flap Rules
- [ ] First code block is a complete, runnable example of the primary workflow
- [ ] Setup/install appears *after* the first code example
- [ ] Every code block is valid, copy-pasteable TypeScript — no `// ...` elisions
- [ ] Every import in examples matches an actual export from the package's `index.ts`
- [ ] Every method name matches its class source file signature exactly
- [ ] Progressive complexity: simplest first, then deeper capabilities
- [ ] No promotional language ("powerful", "simple", "just works", "seamless")

---

## Reading the Book (Package-Level READMEs)

Each package README is the full API reference. The reader is committed — document everything.

### Per-Package Structure

1. **One-line description** — What problem it solves (not what it is)
2. **Usage example** — Minimal, complete, runnable
3. **API Reference** — Every public class, interface, function, constant, type

Each API entry should have:
- What it does (one line)
- Signature (exact TypeScript)
- Parameters (table with name, type, default, description)
- Return type
- Error behavior (what throws)

### Package-Specific Checks

#### @byom-ai/web-sdk
- [ ] Documents `BYOMClient` constructor options with all fields and defaults
- [ ] Documents `chat.send()` and `chat.stream()` with exact signatures
- [ ] Documents all 5 error classes with machine codes
- [ ] Documents `BYOMTransport` interface with all 3 methods (request, stream, disconnect)
- [ ] Documents `BYOMStateMachine` with all states and `canTransition`/`transition`
- [ ] Documents `ClientState` type (all 6 states)
- [ ] Documents helper functions: `withTimeout`, `withStreamTimeout`, `normalizeSDKError`
- [ ] Documents `ChatInput`, `ConnectOptions`, `ConnectResult`, `ChatSendResult`, `ChatStreamEvent`
- [ ] Documents constants: `SDK_PROTOCOL_VERSION`, `DEFAULT_REQUEST_TIMEOUT_MS`, `DEFAULT_ENVELOPE_TTL_MS`, `SDK_MACHINE_CODES`

#### @byom-ai/protocol
- [ ] Documents `parseEnvelope` and `safeParseEnvelope` with options
- [ ] Documents all 8 error classes (ProtocolError, AuthError, PermissionError, etc.)
- [ ] Documents `CanonicalEnvelope<TPayload>` with all fields
- [ ] Documents version negotiation functions: `parseProtocolVersion`, `compareProtocolVersions`, `negotiateProtocolVersion`
- [ ] Documents capability functions: `isProtocolCapability`, `isCapabilityAllowed`, `assertCapabilityAllowed`
- [ ] Documents reason code functions and `REASON_CODE_CATALOG`
- [ ] Documents cloud connection types: `CloudConnectionHandle`, `CloudRequestProof`
- [ ] Documents all `PROTOCOL_MACHINE_CODES`
- [ ] Documents `ProtocolReasonCode` type (all 14 values)

#### @byom-ai/policy
- [ ] Documents `evaluatePolicy()` with `PolicyEvaluationContext` and `PolicyDecision`
- [ ] Documents `PolicyRuleSet` with all 8 allow/deny fields
- [ ] Documents signature verification: `verifyPolicyBundleSignature()`
- [ ] Documents `InMemoryPolicyKeyManager` with all methods
- [ ] Documents `PolicyDecisionMachineCode` (16 variants)
- [ ] Documents parse/safeParse functions for bundles
- [ ] Documents canonical/digest/signing functions
- [ ] Documents error classes: `PolicySchemaError`, `PolicySignatureError`, `PolicyKeyManagementError`

#### @byom-ai/audit
- [ ] Documents `createAuditEvent()` and `validateAuditEvent()` with exact signatures
- [ ] Documents `JsonlExporter` class with constructor options and `export()` method
- [ ] Documents `OtlpExporter` class with `toLogRecord()` and `export()` methods
- [ ] Documents `AuditSchemaError` with `missingFields` property
- [ ] Documents `REQUIRED_AUDIT_FIELDS` constant (all 9 fields)

#### @byom-ai/telemetry
- [ ] Documents `TelemetryMetrics` class with `emit()`, `createCounter()`, `createHistogram()`
- [ ] Documents `TelemetryTracing` class with `startSpan()`, `withSpan()`
- [ ] Documents `TelemetrySpan` with `addEvent()`, `setStatus()`, `end()`
- [ ] Documents redaction functions: `redactTelemetryValue()`, `redactTelemetryRecord()`
- [ ] Documents `MetricPoint` and `SpanRecord` types with all fields
- [ ] Documents all metric names and span names constants

#### @byom-ai/adapter-runtime
- [ ] Documents `AdapterContract` interface with all 8 methods
- [ ] Documents `CloudAdapterContractV2` interface with all additional methods
- [ ] Documents `AdapterHost` class with all methods
- [ ] Documents `loadAdapter()` function
- [ ] Documents manifest parsing: `parseAdapterManifest`, `safeParseAdapterManifest`
- [ ] Documents artifact signing: `signArtifact`, `verifyArtifactSignature`
- [ ] Documents `SandboxContext` and sandbox enforcement
- [ ] Documents all error classes (6 types)
- [ ] Documents `AdapterManifest` type with all fields

#### @byom-ai/adapter-ollama
- [ ] Documents `OllamaAdapter` constructor with `OllamaAdapterOptions`
- [ ] Documents all `AdapterContract` methods (8 methods, exact signatures)
- [ ] Documents `OLLAMA_MANIFEST` constant

#### @byom-ai/adapter-claude-subscription
- [ ] Documents `ClaudeSubscriptionAdapter` with full `CloudAdapterContractV2` methods
- [ ] Documents `ClaudeAdapterOptions` and `ClaudeAuthConfig`
- [ ] Documents `buildAuthHeaders()` function
- [ ] Documents `CLAUDE_CONNECTION_METHODS` and `ANTHROPIC_KNOWN_MODELS`
- [ ] Documents connection flow: `beginConnect` → `completeConnect`

#### @byom-ai/adapter-local-cli-bridge
- [ ] Documents `LocalCliBridgeAdapter` with all contract methods
- [ ] Documents `LocalCliBridgeOptions` with all fields
- [ ] Documents the JSON-line stdin/stdout protocol

---

## Tone

Write like a colleague explaining their work. Be direct. Be specific. Don't sell — inform.

---

## Anti-patterns

| Anti-pattern | Why it fails |
|---|---|
| Leading with badges, logos, or status shields | Visual noise before the reader knows what it does |
| "Getting Started" as the first section | Forces setup before demonstrating value |
| Feature bullet lists without code | Tells instead of shows |
| "Enterprise-grade", "powerful", "seamless" | Self-congratulatory claims that invite skepticism |
| Long install/config blocks before usage | Asks for investment before demonstrating return |
| `// ...` elisions in code blocks | Not runnable, not trustworthy |
| Generic type descriptions without field details | Unusable as API reference |
| Hard-coding the API without sourcing | Goes stale when exports change |
