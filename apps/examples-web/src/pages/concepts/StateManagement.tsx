import { Stack, Title, Text } from "@mantine/core";
import { Callout, CodeBlock } from "../../components";
import { navigate } from "../../router";

const theProblem = `// BYOMClient has internal state — but it's just getters, not reactive.
import { BYOMClient } from "@byom-ai/web-sdk";

const client = new BYOMClient({ transport: window.byom });
await client.connect({ appId: "my-app" });

client.state;            // "connected" — a plain getter
client.sessionId;        // "uuid-1234" — a plain getter
client.selectedProvider; // null — a plain getter

// React components won't re-render when these change.
// There's no .onChange() callback, no EventEmitter, no observable.
// The SDK is deliberately framework-agnostic.`;

const clientStore = `// ClientStore wraps BYOMClient and maintains a reactive snapshot.

class ClientStore {
  #client: BYOMClient;
  #snapshot: ClientSnapshot;
  #subscriptions = new Subscriptions();

  constructor(client: BYOMClient) {
    this.#client = client;
    this.#snapshot = createInitialSnapshot();
    this.#startHeartbeat(); // 500ms safety-net polling
  }

  // React's useSyncExternalStore calls these two:
  getSnapshot(): ClientSnapshot { return this.#snapshot; }
  subscribe(listener: () => void): () => void {
    return this.#subscriptions.subscribe(listener);
  }

  // Called after every SDK operation
  refreshSnapshot(): void {
    const next = buildSnapshot({
      state: this.#client.state,
      sessionId: this.#client.sessionId ?? null,
      selectedProvider: this.#client.selectedProvider ?? null,
      providers: this.#providers,
      error: this.#error,
    });
    // Only notify if something actually changed
    if (!snapshotsEqual(this.#snapshot, next)) {
      this.#snapshot = next;
      this.#subscriptions.notify();
    }
  }
}`;

const useSyncExternalStoreCode = `// React 18's useSyncExternalStore — the bridge between external and React state.

import { useSyncExternalStore } from "react";

// Full snapshot — used internally
function useStoreSnapshot(): ClientSnapshot {
  const { store } = useBYOMContext();
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getSnapshot(),
    () => store.getSnapshot(), // server snapshot (same for SSR safety)
  );
}

// Selective subscription — each hook picks its slice
function useStoreSelector<T>(selector: (snap: ClientSnapshot) => T): T {
  const { store } = useBYOMContext();
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => selector(store.getSnapshot()),
    () => selector(store.getSnapshot()),
  );
}

// So useConnection() only re-renders on state/sessionId changes,
// useProviders() only re-renders on provider list changes, etc.`;

const snapshotIdentity = `// A new snapshot object is created ONLY when values actually differ.

function snapshotsEqual(a: ClientSnapshot, b: ClientSnapshot): boolean {
  return (
    a.state === b.state &&
    a.sessionId === b.sessionId &&
    a.selectedProvider === b.selectedProvider &&
    a.providers === b.providers &&  // referential equality — same array
    a.error === b.error
  );
}

// If nothing changed, the old snapshot object is kept.
// useSyncExternalStore compares by reference (Object.is).
// Same reference = no re-render. This is what prevents
// the 500ms heartbeat from causing unnecessary re-renders.`;

const syncStrategies = `// Two complementary sync strategies keep the UI accurate.

// 1. PRIMARY: Wrap-and-refresh
//    Every SDK operation goes through the store, which calls
//    refreshSnapshot() after the operation completes.
//
//    connect() → client.connect() → refreshSnapshot()
//    selectProvider() → client.selectProvider() → refreshSnapshot()
//    stream() → each token → refreshSnapshot()

// 2. SAFETY NET: 500ms heartbeat polling
//    Some state changes happen outside the store's control:
//    - Extension unloads or crashes
//    - Bridge connection drops
//    - Another tab disconnects the same session
//
//    The heartbeat catches these by periodically reading
//    client.state and comparing to the last snapshot.
//    The snapshot equality check prevents spurious re-renders.

const HEARTBEAT_INTERVAL_MS = 500;
this.#heartbeatId = setInterval(() => {
  this.refreshSnapshot(); // No-op if nothing changed
}, HEARTBEAT_INTERVAL_MS);`;

const streamingOptimization = `// Streaming tokens arrive very fast — potentially hundreds per second.
// Re-rendering on every token would tank performance.

// The store uses requestAnimationFrame + setTimeout microbatching:
// 1. Token arrives → schedule a RAF callback (if not already scheduled)
// 2. RAF fires → batch all accumulated tokens → refreshSnapshot() once
// 3. Result: ~60 refreshes/sec max, regardless of token rate

// This means the UI stays smooth during streaming, and each render
// has the latest accumulated content — not one render per token.`;

export default function StateManagement() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>State Management</Title>
        <Text c="dimmed" mt={4}>
          How the React SDK stays in sync with the BYOMClient
        </Text>
      </div>

      <Title order={3}>The challenge</Title>
      <Text>
        <code>BYOMClient</code> is a plain TypeScript class. It has getters
        like <code>.state</code>, <code>.sessionId</code>, and{" "}
        <code>.selectedProvider</code> — but they're not reactive. Nothing in
        the Web SDK knows about React, and that's intentional. The SDK is
        framework-agnostic. So how does the React SDK keep components in sync
        with an external, non-reactive object?
      </Text>
      <CodeBlock title="The problem" code={theProblem} />

      <Title order={3}>ClientStore</Title>
      <Text>
        The answer is <code>ClientStore</code>. It wraps a{" "}
        <code>BYOMClient</code> and maintains a snapshot — a plain object that
        represents the client's current state at a point in time. When the store
        detects a change, it creates a new snapshot object and notifies
        subscribers. When nothing changes, it keeps the same object reference.
      </Text>
      <CodeBlock title="ClientStore internals" code={clientStore} />

      <Title order={3}>useSyncExternalStore</Title>
      <Text>
        React 18 introduced <code>useSyncExternalStore</code> specifically for
        this pattern — reading from an external store that isn't managed by
        React. It guarantees tear-free reads (no partial state) and works
        correctly with concurrent features like Suspense and transitions. Every
        BYOM hook uses it under the hood.
      </Text>
      <CodeBlock
        title="React integration"
        code={useSyncExternalStoreCode}
      />

      <Callout type="info" title="Why not useState?">
        If you used <code>useState</code> + <code>useEffect</code> to sync
        external state, you'd have a render with stale data before the effect
        fires. With concurrent rendering, you could get tearing — different
        parts of the tree reading different snapshots. And state changes from
        outside React (extension crashes, transport drops) wouldn't trigger
        updates at all. <code>useSyncExternalStore</code> solves all of these.
      </Callout>

      <Title order={3}>Snapshot identity</Title>
      <Text>
        The key to avoiding unnecessary re-renders is snapshot identity. The
        store compares the current snapshot to the next one field-by-field.
        If nothing changed, it keeps the old object. Since{" "}
        <code>useSyncExternalStore</code> uses <code>Object.is</code> to
        compare, same reference means no re-render.
      </Text>
      <CodeBlock title="snapshotsEqual" code={snapshotIdentity} />

      <Title order={3}>Primary sync and safety-net polling</Title>
      <Text>
        The store uses two complementary strategies. The primary strategy is
        wrap-and-refresh: every SDK operation goes through the store, which
        calls <code>refreshSnapshot()</code> after completion. The safety net
        is a 500ms heartbeat that catches changes the store didn't initiate —
        like the extension unloading or the bridge dropping. The snapshot
        equality check means the heartbeat is effectively free when nothing
        has changed.
      </Text>
      <CodeBlock title="Two sync strategies" code={syncStrategies} />

      <Title order={3}>Selective subscriptions</Title>
      <Text>
        Each hook subscribes to only the slice of state it needs via{" "}
        <code>useStoreSelector</code>. <code>useConnection()</code> cares
        about <code>state</code> and <code>sessionId</code>.{" "}
        <code>useProviders()</code> cares about the provider list. A change
        to the provider list doesn't re-render components that only use{" "}
        <code>useConnection()</code>.
      </Text>

      <Title order={3}>Streaming optimization</Title>
      <Text>
        During streaming, tokens can arrive hundreds of times per second.
        Re-rendering on every token would destroy performance. The store
        uses <code>requestAnimationFrame</code> with{" "}
        <code>setTimeout</code> microbatching — tokens accumulate, and the
        store refreshes at most ~60 times per second. Each render sees the
        latest accumulated content, not individual tokens.
      </Text>
      <CodeBlock title="Streaming batching" code={streamingOptimization} />

      <Callout type="tip" title="Related">
        See{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("concepts/web-sdk-vs-react")}
        >
          Web SDK vs React SDK
        </Text>{" "}
        for when to use each SDK, or{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("reference/react-sdk/hooks")}
        >
          Hooks Reference
        </Text>{" "}
        for the full list of available hooks and their return types.
      </Callout>
    </Stack>
  );
}
