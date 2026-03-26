import { Stack, Title, Text } from "@mantine/core";
import { CodeBlock, Callout, CodeComparison } from "../../components";
import { navigate } from "../../router";

const mockTransportReact = `import { createMockTransport, MockBYOMProvider } from "@byom-ai/react/testing";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Chat from "./Chat";

describe("Chat", () => {
  it("renders a greeting from the AI", async () => {
    const transport = createMockTransport({
      // Configure the mock response
      chatResponse: "Hello! How can I help you?",
      // Simulate 100ms latency
      latency: 100,
      // Available providers
      providers: [
        { providerId: "mock", providerName: "Mock", models: ["mock-model"] },
      ],
    });

    render(
      <MockBYOMProvider transport={transport}>
        <Chat />
      </MockBYOMProvider>
    );

    // Your component is now connected to a mock BYOM backend
    // that responds with "Hello! How can I help you?"
  });
});`;

const mockTransportWeb = `import { createMockTransport } from "@byom-ai/react/testing";
import { BYOMClient, ConversationManager } from "@byom-ai/web-sdk";
import { describe, it, expect } from "vitest";

describe("ConversationManager", () => {
  it("streams a response", async () => {
    const transport = createMockTransport({
      streamChunks: ["Hello", " world", "!"],
      latency: 50,
    });

    const client = new BYOMClient({ transport });
    await client.connect({ appId: "test" });

    const convo = new ConversationManager({ client });
    let result = "";

    for await (const event of convo.stream("Hi")) {
      if (event.type === "delta") result += event.content;
    }

    expect(result).toBe("Hello world!");
  });
});`;

const mockErrorExample = `import { createMockTransport, MockBYOMProvider } from "@byom-ai/react/testing";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Chat from "./Chat";

describe("Chat error handling", () => {
  it("shows error when chat fails", async () => {
    const transport = createMockTransport({
      chatError: new Error("Model overloaded"),
    });

    render(
      <MockBYOMProvider transport={transport}>
        <Chat />
      </MockBYOMProvider>
    );

    // Component should display the error
  });

  it("shows error when a specific capability fails", async () => {
    const transport = createMockTransport({
      failOn: "provider.list",
    });

    render(
      <MockBYOMProvider transport={transport}>
        <Chat />
      </MockBYOMProvider>
    );

    // Provider listing fails — component should show fallback
  });
});`;

const streamMockExample = `import { createMockTransport, MockBYOMProvider } from "@byom-ai/react/testing";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import Chat from "./Chat";

describe("Chat streaming", () => {
  it("shows streaming content chunk by chunk", async () => {
    const transport = createMockTransport({
      streamChunks: ["The ", "answer ", "is ", "42."],
      latency: 10,
    });

    render(
      <MockBYOMProvider transport={transport}>
        <Chat />
      </MockBYOMProvider>
    );

    const input = screen.getByPlaceholderText("Type a message...");
    const sendBtn = screen.getByText("Send");

    await userEvent.type(input, "What is the answer?");
    await userEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByText(/42/)).toBeInTheDocument();
    });
  });

  it("uses streamResponse for full response mock", async () => {
    const transport = createMockTransport({
      streamResponse: "The answer is 42.",
    });

    render(
      <MockBYOMProvider transport={transport}>
        <Chat />
      </MockBYOMProvider>
    );

    // streamResponse auto-splits into chunks for streaming
  });
});`;

const windowMockExample = `import { mockWindowByom, cleanupWindowByom } from "@byom-ai/react/testing";
import { createMockTransport } from "@byom-ai/react/testing";
import { describe, it, afterEach } from "vitest";

describe("Integration tests", () => {
  afterEach(() => {
    // Always clean up window.byom after each test
    cleanupWindowByom();
  });

  it("injects transport into window.byom", () => {
    const transport = createMockTransport({
      chatResponse: "Hello!",
    });

    // Simulate the extension injecting the transport
    mockWindowByom(transport);

    // Now window.byom is available — your app will
    // detect the extension as installed
    expect(window.byom).toBeDefined();
  });

  it("simulates extension not installed", () => {
    // Don't call mockWindowByom — window.byom is undefined
    // Your app's "not installed" UI should render
    expect(window.byom).toBeUndefined();
  });
});`;

const fullTestExample = `import { createMockTransport, MockBYOMProvider } from "@byom-ai/react/testing";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { useConversation } from "@byom-ai/react";
import { useState } from "react";

// Component under test
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
    <div>
      {error && (
        <div data-testid="error">
          {error.message}
          {retry && <button onClick={retry}>Retry</button>}
        </div>
      )}
      <div data-testid="messages">
        {messages.map((msg) => (
          <div key={msg.id} data-testid={msg.role}>
            {msg.content}
          </div>
        ))}
      </div>
      {isStreaming && (
        <div data-testid="streaming">{streamingContent}</div>
      )}
      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={isStreaming}
        />
        <button type="submit" disabled={isStreaming || !input.trim()}>
          Send
        </button>
        {isStreaming && <button onClick={stop}>Stop</button>}
      </form>
    </div>
  );
}

describe("Chat component", () => {
  it("sends a message and displays response", async () => {
    const transport = createMockTransport({
      streamChunks: ["Hello", " there", "!"],
      latency: 10,
    });

    render(
      <MockBYOMProvider transport={transport}>
        <Chat />
      </MockBYOMProvider>
    );

    const input = screen.getByPlaceholderText("Type a message...");
    const sendBtn = screen.getByText("Send");

    await userEvent.type(input, "Hi");
    await userEvent.click(sendBtn);

    // User message appears immediately
    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("Hi");
    });

    // AI response appears after streaming completes
    await waitFor(() => {
      expect(screen.getByTestId("assistant")).toHaveTextContent(
        "Hello there!"
      );
    });
  });

  it("shows error and allows retry", async () => {
    const transport = createMockTransport({
      chatError: new Error("Timeout"),
    });

    render(
      <MockBYOMProvider transport={transport}>
        <Chat />
      </MockBYOMProvider>
    );

    const input = screen.getByPlaceholderText("Type a message...");
    await userEvent.type(input, "Hi");
    await userEvent.click(screen.getByText("Send"));

    await waitFor(() => {
      expect(screen.getByTestId("error")).toBeInTheDocument();
    });
  });

  it("disables input while streaming", async () => {
    const transport = createMockTransport({
      streamChunks: ["Thinking", "...", " done"],
      latency: 100,
    });

    render(
      <MockBYOMProvider transport={transport}>
        <Chat />
      </MockBYOMProvider>
    );

    const input = screen.getByPlaceholderText("Type a message...");
    await userEvent.type(input, "Hello");
    await userEvent.click(screen.getByText("Send"));

    // Input should be disabled while streaming
    await waitFor(() => {
      expect(input).toBeDisabled();
    });

    // After streaming completes, input is re-enabled
    await waitFor(
      () => {
        expect(input).not.toBeDisabled();
      },
      { timeout: 2000 }
    );
  });
});`;

export default function TestingGuide() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Testing Your App</Title>
        <Text c="dimmed" mt={4}>
          You want to write tests for components that use BYOM hooks.
        </Text>
      </div>

      <Title order={3}>Create a mock transport</Title>
      <Text>
        <code>createMockTransport()</code> builds a fake transport that
        simulates the BYOM extension. Configure responses, errors, latency, and
        streaming behaviour without a real extension or AI provider.
      </Text>
      <CodeComparison
        reactSdk={{ title: "React component test", code: mockTransportReact }}
        webSdk={{ title: "Web SDK unit test", code: mockTransportWeb }}
      />

      <Title order={3}>MockBYOMProvider</Title>
      <Text>
        <code>MockBYOMProvider</code> is a drop-in test wrapper that injects
        the mock transport into <code>window.byom</code> and wraps children
        with <code>BYOMProvider</code>. Use it in every React component test
        that uses BYOM hooks.
      </Text>

      <Title order={3}>Test error scenarios</Title>
      <Text>
        Use <code>chatError</code> to simulate chat failures and{" "}
        <code>failOn</code> to make specific capabilities fail. This lets you
        test your error UI and retry logic.
      </Text>
      <CodeBlock title="error-tests.tsx" code={mockErrorExample} />

      <Title order={3}>Test streaming</Title>
      <Text>
        Use <code>streamChunks</code> for fine-grained control over chunk
        delivery, or <code>streamResponse</code> for a convenience string that
        auto-splits. Combine with <code>latency</code> to simulate realistic
        streaming timing.
      </Text>
      <CodeBlock title="streaming-tests.tsx" code={streamMockExample} />

      <Title order={3}>Integration tests with window.byom</Title>
      <Text>
        For integration tests that mount your full app (not just wrapped
        components), use <code>mockWindowByom()</code> and{" "}
        <code>cleanupWindowByom()</code> to control the global transport.
        Always clean up in <code>afterEach</code>.
      </Text>
      <CodeBlock title="integration-tests.ts" code={windowMockExample} />

      <Title order={3}>Complete test example</Title>
      <Text>
        A full test suite with vitest and @testing-library/react covering
        messaging, streaming, errors, and input state:
      </Text>
      <CodeBlock title="Chat.test.tsx" code={fullTestExample} />

      <Callout type="tip" title="Related">
        See the{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("reference/react-sdk/testing")}
        >
          Testing API reference
        </Text>{" "}
        for complete <code>createMockTransport</code> options, or the{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("reference/web-sdk/byom-client")}
        >
          BYOMClient reference
        </Text>{" "}
        for web SDK testing patterns.
      </Callout>
    </Stack>
  );
}
