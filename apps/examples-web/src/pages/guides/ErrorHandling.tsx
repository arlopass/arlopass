import { Stack, Title, Text } from "@mantine/core";
import { CodeBlock, Callout, ApiTable, CodeComparison } from "../../components";
import { navigate } from "../../router";

const retryableReact = `import { useConnection, useConversation } from "@byom-ai/react";

function Chat() {
  const connection = useConnection();
  const { messages, stream, error, retry, isStreaming, streamingContent } =
    useConversation({
      systemPrompt: "You are a helpful assistant.",
    });

  if (connection.error) {
    return (
      <div>
        <p>Connection error: {connection.error.message}</p>
        {connection.error.retryable && connection.retry && (
          <button onClick={connection.retry}>Retry connection</button>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <p>Chat error: {error.message}</p>
        <p>Code: {error.machineCode}</p>
        {error.retryable && retry && (
          <button onClick={retry}>Retry last message</button>
        )}
      </div>
    );
  }

  return (
    <div>
      {messages.map((msg) => (
        <div key={msg.id}>{msg.role}: {msg.content}</div>
      ))}
      {isStreaming && <div>AI: {streamingContent}</div>}
    </div>
  );
}`;

const retryableWeb = `import { BYOMClient, ConversationManager } from "@byom-ai/web-sdk";
import type { BYOMSDKError } from "@byom-ai/web-sdk";

const client = new BYOMClient({ transport: window.byom });

try {
  await client.connect({ appId: "my-app" });
} catch (err) {
  const sdkError = err as BYOMSDKError;
  console.error(sdkError.machineCode, sdkError.message);
  if (sdkError.retryable) {
    // Safe to retry — transient network issue or timeout
    await client.connect({ appId: "my-app" });
  } else {
    // Fatal — auth failure, policy violation, etc.
    throw err;
  }
}

const convo = new ConversationManager({ client });

try {
  for await (const event of convo.stream("Hello!")) {
    if (event.type === "delta") process.stdout.write(event.content);
  }
} catch (err) {
  const sdkError = err as BYOMSDKError;
  if (sdkError.retryable) {
    // Retry the stream
    for await (const event of convo.stream("Hello!")) {
      if (event.type === "delta") process.stdout.write(event.content);
    }
  }
}`;

const errorBoundaryExample = `import { BYOMProvider, BYOMErrorBoundary } from "@byom-ai/react";

function ErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  return (
    <div role="alert" style={{ padding: 16, border: "1px solid red" }}>
      <h3>Something went wrong</h3>
      <p>{error.message}</p>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  );
}

export default function App() {
  return (
    <BYOMProvider appId="my-app">
      <BYOMErrorBoundary
        fallback={(props) => <ErrorFallback {...props} />}
        onError={(error, errorInfo) => {
          // Log to your error tracking service
          console.error("BYOM Error:", error, errorInfo);
        }}
      >
        <Chat />
      </BYOMErrorBoundary>
    </BYOMProvider>
  );
}`;

const hasErrorGuard = `import { BYOMHasError } from "@byom-ai/react";

function AppHeader() {
  return (
    <header>
      <h1>My App</h1>
      <BYOMHasError>
        {({ error, retry }) => (
          <div style={{ color: "red", padding: 8 }}>
            Error: {error.message}
            {error.retryable && retry && (
              <button onClick={retry} style={{ marginLeft: 8 }}>
                Retry
              </button>
            )}
          </div>
        )}
      </BYOMHasError>
    </header>
  );
}`;

const onErrorCallback = `import { BYOMProvider } from "@byom-ai/react";

function App() {
  return (
    <BYOMProvider
      appId="my-app"
      onError={(error) => {
        // Global error handler — fires for all SDK errors
        console.error(\`[\${error.machineCode}] \${error.message}\`);

        // Send to error tracking
        if (!error.retryable) {
          trackFatalError(error);
        }
      }}
    >
      <Chat />
    </BYOMProvider>
  );
}`;

const errorCodesData = [
  {
    name: "BYOM_PROTOCOL_TIMEOUT",
    type: "retryable",
    description: "Request timed out — transient network issue",
  },
  {
    name: "BYOM_PROTOCOL_TRANSIENT_NETWORK",
    type: "retryable",
    description: "Temporary network failure",
  },
  {
    name: "BYOM_PROTOCOL_AUTH_FAILED",
    type: "fatal",
    description: "Authentication failed — invalid or expired credentials",
  },
  {
    name: "BYOM_PROTOCOL_PERMISSION_DENIED",
    type: "fatal",
    description: "Insufficient permissions for the requested operation",
  },
  {
    name: "BYOM_PROTOCOL_POLICY_VIOLATION",
    type: "fatal",
    description: "Request violates a configured policy",
  },
  {
    name: "BYOM_SDK_TRANSPORT_ERROR",
    type: "varies",
    description: "Transport-level error — check retryable flag",
  },
  {
    name: "BYOM_SDK_INVALID_STATE_OPERATION",
    type: "fatal",
    description: "Operation attempted in wrong state (e.g. chat before connect)",
  },
  {
    name: "BYOM_SDK_PROTOCOL_VIOLATION",
    type: "fatal",
    description: "Malformed envelope or protocol mismatch",
  },
];

const fullExample = `import { useState } from "react";
import {
  BYOMProvider,
  BYOMErrorBoundary,
  BYOMChatReadyGate,
  BYOMHasError,
  useConversation,
} from "@byom-ai/react";

function Chat() {
  const {
    messages,
    streamingContent,
    isStreaming,
    stream,
    stop,
    error,
    retry,
  } = useConversation({
    systemPrompt: "You are a helpful assistant.",
  });
  const [input, setInput] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    const text = input;
    setInput("");
    await stream(text);
  }

  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      <BYOMHasError>
        {({ error: connError, retry: connRetry }) => (
          <div style={{ padding: 8, background: "#fee", border: "1px solid red" }}>
            <strong>Error:</strong> {connError.message}
            {connError.retryable && connRetry && (
              <button onClick={connRetry} style={{ marginLeft: 8 }}>
                Retry
              </button>
            )}
          </div>
        )}
      </BYOMHasError>

      {error && (
        <div style={{ padding: 8, background: "#fff3cd", border: "1px solid orange" }}>
          <strong>Chat error:</strong> {error.message}
          {error.retryable && retry && (
            <button onClick={retry} style={{ marginLeft: 8 }}>
              Retry
            </button>
          )}
        </div>
      )}

      <div style={{ minHeight: 300, padding: 16 }}>
        {messages.map((msg) => (
          <div key={msg.id} style={{ padding: "8px 0" }}>
            <strong>{msg.role === "user" ? "You" : "AI"}:</strong>{" "}
            {msg.content}
          </div>
        ))}
        {isStreaming && streamingContent && (
          <div style={{ padding: "8px 0", opacity: 0.7 }}>
            <strong>AI:</strong> {streamingContent}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={isStreaming}
          style={{ flex: 1, padding: 8 }}
        />
        <button type="submit" disabled={isStreaming || !input.trim()}>
          Send
        </button>
        {isStreaming && (
          <button type="button" onClick={() => stop()}>Stop</button>
        )}
      </form>
    </div>
  );
}

export default function App() {
  return (
    <BYOMProvider
      appId="error-handling-app"
      onError={(error) => {
        console.error(\`[\${error.machineCode}] \${error.message}\`);
      }}
    >
      <BYOMErrorBoundary
        fallback={({ error, resetErrorBoundary }) => (
          <div style={{ padding: 32, textAlign: "center" }}>
            <h2>Something went wrong</h2>
            <p>{error.message}</p>
            <button onClick={resetErrorBoundary}>Try again</button>
          </div>
        )}
      >
        <BYOMChatReadyGate
          connectingFallback={<p>Connecting...</p>}
          providerFallback={<p>Select a provider in the BYOM extension.</p>}
          errorFallback={({ error, retry }) => (
            <div>
              <p>Failed to connect: {error.message}</p>
              {retry && <button onClick={retry}>Retry</button>}
            </div>
          )}
        >
          <Chat />
        </BYOMChatReadyGate>
      </BYOMErrorBoundary>
    </BYOMProvider>
  );
}`;

export default function ErrorHandling() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Error Handling</Title>
        <Text c="dimmed" mt={4}>
          You want to handle errors gracefully — retryable timeouts, fatal auth
          failures, and everything in between.
        </Text>
      </div>

      <Title order={3}>Retryable vs non-retryable errors</Title>
      <Text>
        Every <code>BYOMSDKError</code> has a <code>retryable</code> boolean.
        Timeouts and transient network errors are retryable. Auth failures,
        policy violations, and state errors are not. Both hooks and the web SDK
        expose a <code>retry()</code> function that replays the last failed
        operation when the error is retryable.
      </Text>
      <CodeComparison
        reactSdk={{ title: "RetryableErrors.tsx", code: retryableReact }}
        webSdk={{ title: "retryable-errors.ts", code: retryableWeb }}
      />

      <Title order={3}>BYOMErrorBoundary</Title>
      <Text>
        Wrap your app (or sections of it) in <code>BYOMErrorBoundary</code> to
        catch unhandled exceptions. It provides a <code>fallback</code> render
        function and an optional <code>onError</code> callback for logging.
      </Text>
      <CodeBlock title="ErrorBoundary.tsx" code={errorBoundaryExample} />

      <Title order={3}>BYOMHasError guard</Title>
      <Text>
        <code>BYOMHasError</code> is a negative guard — it only renders when
        there's an active error. Use it in headers, sidebars, or toast areas
        to show error state outside the main content area.
      </Text>
      <CodeBlock title="ErrorBanner.tsx" code={hasErrorGuard} />

      <Title order={3}>Global error callback</Title>
      <Text>
        Pass <code>onError</code> to <code>BYOMProvider</code> to receive every
        SDK error. Use it for error tracking, analytics, or global logging.
      </Text>
      <CodeBlock title="GlobalErrorHandler.tsx" code={onErrorCallback} />

      <Title order={3}>Error codes</Title>
      <Text>
        Key error codes and whether they're retryable:
      </Text>
      <ApiTable
        rows={errorCodesData.map((row) => ({
          name: row.name,
          type: row.type,
          description: row.description,
        }))}
      />

      <Title order={3}>Complete example</Title>
      <Text>
        A chat app with layered error handling — error boundary, connection
        gate fallbacks, inline chat errors, and global logging:
      </Text>
      <CodeBlock title="App.tsx" code={fullExample} />

      <Callout type="tip" title="Related">
        See the{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("reference/web-sdk/error-codes")}
        >
          Error Codes reference
        </Text>{" "}
        for the full list, or the{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("guides/guard-components")}
        >
          Guard Components guide
        </Text>{" "}
        for conditional rendering based on error state.
      </Callout>
    </Stack>
  );
}
