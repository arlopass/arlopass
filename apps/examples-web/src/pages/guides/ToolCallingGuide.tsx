import { Stack, Title, Text } from "@mantine/core";
import { CodeBlock, Callout, CodeComparison } from "../../components";
import { navigate } from "../../router";

const autoExecuteReact = `import { useConversation } from "@arlopass/react";

function Chat() {
  const { messages, stream, streamingContent, isStreaming } = useConversation({
    systemPrompt: "You are a helpful assistant with access to tools.",
    tools: [
      {
        name: "get_weather",
        description: "Get the current weather for a city.",
        parameters: {
          type: "object",
          properties: {
            city: { type: "string", description: "City name" },
            units: {
              type: "string",
              description: "Temperature units",
              enum: ["celsius", "fahrenheit"],
            },
          },
          required: ["city"],
        },
        // Handler provided → auto-execute mode
        handler: async (args) => {
          const res = await fetch(
            \`/api/weather?city=\${args.city}&units=\${args.units ?? "celsius"}\`
          );
          const data = await res.json();
          return JSON.stringify(data);
        },
      },
    ],
  });

  return (
    <div>
      {messages.map((msg) => (
        <div key={msg.id}>{msg.role}: {msg.content}</div>
      ))}
      {isStreaming && <div>AI: {streamingContent}</div>}
    </div>
  );
}`;

const autoExecuteWeb = `import { ArlopassClient, ConversationManager } from "@arlopass/web-sdk";

const client = new ArlopassClient({ transport: window.arlopass });
await client.connect({ appId: "my-app" });

const convo = new ConversationManager({
  client,
  systemPrompt: "You are a helpful assistant with access to tools.",
  tools: [
    {
      name: "get_weather",
      description: "Get the current weather for a city.",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "City name" },
          units: { type: "string", enum: ["celsius", "fahrenheit"] },
        },
        required: ["city"],
      },
      handler: async (args) => {
        const res = await fetch(
          \`/api/weather?city=\${args.city}&units=\${args.units ?? "celsius"}\`
        );
        return JSON.stringify(await res.json());
      },
    },
  ],
});

for await (const event of convo.stream("What's the weather in Tokyo?")) {
  if (event.type === "delta") process.stdout.write(event.content);
  if (event.type === "tool_call") console.log("Calling:", event.name);
  if (event.type === "tool_result") console.log("Result:", event.result);
}`;

const manualReact = `import { useConversation } from "@arlopass/react";

function Chat() {
  const {
    messages,
    stream,
    submitToolResult,
    streamingContent,
    isStreaming,
  } = useConversation({
    systemPrompt: "You are a helpful assistant.",
    tools: [
      {
        name: "create_order",
        description: "Create a new order. Requires user confirmation.",
        parameters: {
          type: "object",
          properties: {
            item: { type: "string", description: "Item to order" },
            quantity: { type: "number", description: "Number of items" },
          },
          required: ["item", "quantity"],
        },
        // No handler → manual mode
      },
    ],
  });

  // Listen for tool calls from the subscribe API
  // or check incoming messages for tool_call events.
  // When the user confirms, submit the result:
  function handleConfirmOrder(toolCallId: string, item: string, qty: number) {
    // Perform the action
    const orderId = \`ORD-\${Date.now()}\`;
    submitToolResult(toolCallId, JSON.stringify({ orderId, item, qty }));
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

const manualWeb = `import { ArlopassClient, ConversationManager } from "@arlopass/web-sdk";

const client = new ArlopassClient({ transport: window.arlopass });
await client.connect({ appId: "my-app" });

const convo = new ConversationManager({
  client,
  tools: [
    {
      name: "create_order",
      description: "Create a new order. Requires user confirmation.",
      parameters: {
        type: "object",
        properties: {
          item: { type: "string" },
          quantity: { type: "number" },
        },
        required: ["item", "quantity"],
      },
      // No handler → manual mode
    },
  ],
});

for await (const event of convo.stream("Order 3 widgets")) {
  if (event.type === "tool_call") {
    // Show confirmation UI, then submit result
    const orderId = \`ORD-\${Date.now()}\`;
    convo.submitToolResult(event.toolCallId, JSON.stringify({
      orderId,
      item: event.arguments.item,
      quantity: event.arguments.quantity,
    }));
  }
  if (event.type === "delta") {
    process.stdout.write(event.content);
  }
}`;

const mixedMode = `import { useConversation } from "@arlopass/react";

function Chat() {
  const { messages, stream, submitToolResult, isStreaming } = useConversation({
    systemPrompt: "You are a helpful assistant.",
    tools: [
      {
        // Auto-execute: safe, read-only lookup
        name: "search_products",
        description: "Search the product catalog.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
          },
          required: ["query"],
        },
        handler: async (args) => {
          const res = await fetch(\`/api/products?q=\${args.query}\`);
          return JSON.stringify(await res.json());
        },
      },
      {
        // Manual: requires user confirmation before executing
        name: "place_order",
        description: "Place an order for a product.",
        parameters: {
          type: "object",
          properties: {
            productId: { type: "string" },
            quantity: { type: "number" },
          },
          required: ["productId", "quantity"],
        },
        // No handler — manual confirmation needed
      },
    ],
    maxToolRounds: 3,
  });

  // Auto-execute tools run silently.
  // Manual tools emit tool_call events for you to handle.
  return (
    <div>
      {messages.map((msg) => (
        <div key={msg.id}>{msg.role}: {msg.content}</div>
      ))}
    </div>
  );
}`;

const maxToolRoundsReact = `const { messages, stream } = useConversation({
  tools: [/* ... */],
  maxToolRounds: 3, // Stop after 3 rounds of tool calls (default: 5)
});

// If the model keeps calling tools beyond maxToolRounds,
// the SDK stops executing and returns the last text response.`;

const maxToolRoundsWeb = `const convo = new ConversationManager({
  client,
  tools: [/* ... */],
  maxToolRounds: 3, // Stop after 3 rounds (default: 5)
});

// Prevents infinite tool-call loops.
// After 3 rounds, the stream yields text without further tool calls.`;

const streamEventsExample = `import { useConversation } from "@arlopass/react";

function Chat() {
  const { messages, stream, subscribe, isStreaming, streamingContent } =
    useConversation({
      tools: [
        {
          name: "lookup_user",
          description: "Look up a user by email.",
          parameters: {
            type: "object",
            properties: {
              email: { type: "string", description: "User email" },
            },
            required: ["email"],
          },
          handler: async (args) => {
            const res = await fetch(\`/api/users?email=\${args.email}\`);
            return JSON.stringify(await res.json());
          },
        },
      ],
    });

  // Subscribe to tool events for logging or UI updates
  subscribe("tool_call", (event) => {
    console.log("Tool called:", event.name, event.arguments);
  });

  subscribe("tool_result", (event) => {
    console.log("Tool result:", event.name, event.result);
  });

  return (
    <div>
      {messages.map((msg) => (
        <div key={msg.id}>{msg.role}: {msg.content}</div>
      ))}
      {isStreaming && <div>AI: {streamingContent}</div>}
    </div>
  );
}`;

const fullExample = `import { useState } from "react";
import { ArlopassProvider, ChatReadyGate, useConversation } from "@arlopass/react";

const tools = [
  {
    name: "get_weather",
    description: "Get the current weather for a city.",
    parameters: {
      type: "object" as const,
      properties: {
        city: { type: "string", description: "City name" },
      },
      required: ["city"] as const,
    },
    handler: async (args: Record<string, unknown>) => {
      // Simulate an API call
      return JSON.stringify({
        city: args.city,
        temp: 22,
        condition: "sunny",
      });
    },
  },
  {
    name: "create_reminder",
    description: "Create a reminder. Needs user confirmation.",
    parameters: {
      type: "object" as const,
      properties: {
        text: { type: "string", description: "Reminder text" },
        time: { type: "string", description: "When to remind" },
      },
      required: ["text", "time"] as const,
    },
    // No handler — manual mode
  },
];

function Chat() {
  const {
    messages,
    streamingContent,
    isStreaming,
    stream,
    stop,
    submitToolResult,
  } = useConversation({
    systemPrompt: "You are a helpful assistant with tools.",
    tools,
    maxToolRounds: 5,
  });
  const [input, setInput] = useState("");
  const [pendingTool, setPendingTool] = useState<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    const text = input;
    setInput("");
    await stream(text);
  }

  function handleConfirm() {
    if (!pendingTool) return;
    const reminderId = \`REM-\${Date.now()}\`;
    submitToolResult(
      pendingTool.id,
      JSON.stringify({ reminderId, ...pendingTool.args })
    );
    setPendingTool(null);
  }

  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
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

      {pendingTool && (
        <div style={{ padding: 16, border: "1px solid orange" }}>
          <p>
            Create reminder: "{pendingTool.args.text}" at {pendingTool.args.time}?
          </p>
          <button onClick={handleConfirm}>Confirm</button>
          <button onClick={() => setPendingTool(null)}>Cancel</button>
        </div>
      )}

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
    <ArlopassProvider appId="tool-calling-app">
      <ChatReadyGate
        connecting={<p>Connecting...</p>}
        noProvider={<p>Select a provider in the Arlopass extension.</p>}
        error={(err) => <p>Error: {err.message}</p>}
      >
        <Chat />
      </ChatReadyGate>
    </ArlopassProvider>
  );
}`;

export default function ToolCallingGuide() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Tool Calling</Title>
        <Text c="dimmed" mt={4}>
          You want the AI model to call functions in your application.
        </Text>
      </div>

      <Title order={3}>Define a tool</Title>
      <Text>
        A tool has a <code>name</code>, <code>description</code>, optional{" "}
        <code>parameters</code> (JSON Schema), and an optional{" "}
        <code>handler</code>. The handler determines the execution mode.
      </Text>

      <Title order={3}>Auto-execute mode</Title>
      <Text>
        When a <code>handler</code> is provided, the SDK calls it automatically
        whenever the model invokes the tool. Use this for safe, read-only
        operations like lookups and searches.
      </Text>
      <CodeComparison
        reactSdk={{ title: "AutoExecute.tsx", code: autoExecuteReact }}
        webSdk={{ title: "auto-execute.ts", code: autoExecuteWeb }}
      />

      <Title order={3}>Manual mode</Title>
      <Text>
        Omit the <code>handler</code> and the SDK emits a <code>tool_call</code>{" "}
        event instead of executing. Your app shows a confirmation UI, then calls{" "}
        <code>submitToolResult()</code> to return the result to the model. Use
        this for destructive or sensitive operations.
      </Text>
      <CodeComparison
        reactSdk={{ title: "ManualMode.tsx", code: manualReact }}
        webSdk={{ title: "manual-mode.ts", code: manualWeb }}
      />

      <Title order={3}>Mixed mode</Title>
      <Text>
        Combine auto-execute and manual tools in the same conversation. Safe
        read-only tools get handlers; destructive tools don't. The SDK handles
        both seamlessly.
      </Text>
      <CodeBlock title="MixedMode.tsx" code={mixedMode} />

      <Title order={3}>Limit tool rounds</Title>
      <Text>
        Set <code>maxToolRounds</code> to prevent infinite tool-call loops. The
        default is 5. After hitting the limit, the SDK stops executing tools and
        returns the model's text response.
      </Text>
      <CodeComparison
        reactSdk={{ title: "React SDK", code: maxToolRoundsReact }}
        webSdk={{ title: "Web SDK", code: maxToolRoundsWeb }}
      />

      <Title order={3}>Subscribe to tool events</Title>
      <Text>
        Use the <code>subscribe()</code> function from{" "}
        <code>useConversation</code> to listen for <code>tool_call</code> and{" "}
        <code>tool_result</code> events. This is useful for logging, analytics,
        or showing tool activity in the UI.
      </Text>
      <CodeBlock title="ToolEvents.tsx" code={streamEventsExample} />

      <Title order={3}>Complete example</Title>
      <Text>
        A chat app with auto-execute weather lookup and manual reminder
        creation:
      </Text>
      <CodeBlock title="App.tsx" code={fullExample} />

      <Callout type="tip" title="Related">
        See the{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("reference/react-sdk/hooks")}
        >
          Hooks reference
        </Text>{" "}
        for complete <code>useConversation</code> tool options, or the{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("tutorials/adding-tool-calling")}
        >
          Tool Calling tutorial
        </Text>{" "}
        for a step-by-step introduction.
      </Callout>
    </Stack>
  );
}
