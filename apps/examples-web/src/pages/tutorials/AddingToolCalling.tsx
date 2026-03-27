import { Stack, Title, Text } from "@mantine/core";
import { CodeBlock, Callout, StepList, CodeComparison } from "../../components";
import { navigate } from "../../router";

const stepDefineTools = `import type { ToolDefinition } from "@arlopass/react";

const tools: ToolDefinition[] = [
  {
    name: "search_docs",
    description: "Search the documentation for a given query",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query",
        },
      },
      required: ["query"],
    },
    handler: async (args) => {
      // Auto-executed when the model calls this tool
      const results = await searchDocs(args.query as string);
      return JSON.stringify(results);
    },
  },
  {
    name: "calculate",
    description: "Evaluate a math expression",
    parameters: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "The math expression to evaluate, e.g. '2 + 2'",
        },
      },
      required: ["expression"],
    },
    handler: async (args) => {
      const expr = args.expression as string;
      // Simple evaluation — use a math library in production
      const result = Function(\`"use strict"; return (\${expr})\`)();
      return String(result);
    },
  },
];`;

const stepPassTools = `import { useConversation } from "@arlopass/react";

function Chat() {
  const {
    messages,
    streamingContent,
    isStreaming,
    stream,
  } = useConversation({
    systemPrompt: "You can search docs and do math. Use your tools.",
    tools, // pass the tools array
  });

  // The hook handles tool execution automatically
  // when tools have a handler function
}`;

const stepAutoExecute = `// When a tool has a handler, it runs automatically:
const tools: ToolDefinition[] = [
  {
    name: "get_weather",
    description: "Get current weather for a city",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string", description: "City name" },
      },
      required: ["city"],
    },
    // This runs automatically when the model calls get_weather
    handler: async (args) => {
      const weather = await fetchWeather(args.city as string);
      return JSON.stringify(weather);
    },
  },
];

// The conversation flow:
// 1. User: "What's the weather in Paris?"
// 2. Model calls get_weather({ city: "Paris" })
// 3. Handler runs automatically, returns result
// 4. Model generates final response using the result`;

const stepManualMode = `import { useConversation } from "@arlopass/react";

function Chat() {
  const { messages, stream, subscribe, submitToolResult } =
    useConversation({
      tools: [
        {
          name: "approve_purchase",
          description: "Submit a purchase for approval",
          parameters: {
            type: "object",
            properties: {
              item: { type: "string", description: "Item name" },
              amount: { type: "number", description: "Amount in USD" },
            },
            required: ["item", "amount"],
          },
          // No handler — manual mode
        },
      ],
    });

  // Listen for tool calls and handle them yourself
  subscribe("tool_call", (event) => {
    console.log("Tool called:", event.name, event.arguments);

    // Show a confirmation dialog, then submit the result
    if (confirm(\`Approve purchase of \${event.arguments.item}?\`)) {
      submitToolResult(event.toolCallId, "Purchase approved");
    } else {
      submitToolResult(event.toolCallId, "Purchase denied by user");
    }
  });
}`;

const stepToolActivity = `import { useConversation } from "@arlopass/react";

function Chat() {
  const { messages, stream, subscribe } = useConversation({ tools });

  // Subscribe to tool events for UI updates
  subscribe("tool_call", (event) => {
    console.log(\`🔧 Calling \${event.name}(\${JSON.stringify(event.arguments)})\`);
  });

  subscribe("tool_result", (event) => {
    console.log(\`✅ \${event.name} returned: \${event.result}\`);
  });

  // Show tool calls within messages
  return (
    <div>
      {messages.map((msg) => (
        <div key={msg.id}>
          <strong>{msg.role}:</strong> {msg.content}
          {msg.toolCalls?.map((tc) => (
            <div key={tc.toolCallId} style={{ fontSize: "0.85em", color: "#666" }}>
              🔧 {tc.name}({JSON.stringify(tc.arguments)})
              {tc.status === "complete" && \` → \${tc.result}\`}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}`;

const stepMaxToolRounds = `const { messages, stream } = useConversation({
  tools,
  maxToolRounds: 3, // Stop after 3 tool call rounds (default: 5)
});

// This prevents infinite loops where the model keeps calling tools.
// After maxToolRounds, the model must produce a text response.`;

const fullExample = `import { useState } from "react";
import {
  ArlopassProvider,
  ChatReadyGate,
  useConversation,
} from "@arlopass/react";
import type { ToolDefinition } from "@arlopass/react";

const tools: ToolDefinition[] = [
  {
    name: "search_docs",
    description: "Search the documentation for a given query",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query",
        },
      },
      required: ["query"],
    },
    handler: async (args) => {
      // Simulate a search
      return JSON.stringify([
        { title: "Getting Started", snippet: "Install with npm..." },
        { title: "API Reference", snippet: "useConversation hook..." },
      ]);
    },
  },
  {
    name: "calculate",
    description: "Evaluate a math expression",
    parameters: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "The math expression to evaluate",
        },
      },
      required: ["expression"],
    },
    handler: async (args) => {
      const expr = args.expression as string;
      const result = Function(\`"use strict"; return (\${expr})\`)();
      return String(result);
    },
  },
];

function Chat() {
  const {
    messages,
    streamingContent,
    isStreaming,
    stream,
    stop,
  } = useConversation({
    systemPrompt: "You can search docs and do calculations. Use your tools when appropriate.",
    tools,
    maxToolRounds: 3,
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
      <div style={{ minHeight: 300, padding: 16 }}>
        {messages.map((msg) => (
          <div key={msg.id} style={{ padding: "8px 0" }}>
            <strong>{msg.role === "user" ? "You" : "AI"}:</strong>{" "}
            {msg.content}
            {msg.toolCalls?.map((tc) => (
              <div
                key={tc.toolCallId}
                style={{ fontSize: "0.85em", color: "#888", marginLeft: 16 }}
              >
                🔧 {tc.name}({JSON.stringify(tc.arguments)})
                {tc.status === "complete" && (
                  <span style={{ color: "#4a9" }}> → {tc.result}</span>
                )}
              </div>
            ))}
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
          placeholder="Try: search for hooks, or what is 42 * 17?"
          disabled={isStreaming}
          style={{ flex: 1, padding: 8 }}
        />
        {isStreaming ? (
          <button type="button" onClick={() => stop()}>
            Stop
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()}>
            Send
          </button>
        )}
      </form>
    </div>
  );
}

export default function App() {
  return (
    <ArlopassProvider appId="tool-calling-demo">
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

const comparisonReact = `import { useConversation } from "@arlopass/react";
import type { ToolDefinition } from "@arlopass/react";

const tools: ToolDefinition[] = [
  {
    name: "calculate",
    description: "Evaluate a math expression",
    parameters: {
      type: "object",
      properties: {
        expression: { type: "string", description: "Math expression" },
      },
      required: ["expression"],
    },
    handler: async (args) => String(eval(args.expression as string)),
  },
];

const { messages, stream } = useConversation({ tools });
await stream("What is 42 * 17?");`;

const comparisonWeb = `import { ArlopassClient, ConversationManager } from "@arlopass/web-sdk";

const client = new ArlopassClient({ transport: window.arlopass });
await client.connect({ appId: "my-app" });

const convo = new ConversationManager({
  client,
  tools: [
    {
      name: "calculate",
      description: "Evaluate a math expression",
      parameters: {
        type: "object",
        properties: {
          expression: { type: "string", description: "Math expression" },
        },
        required: ["expression"],
      },
      handler: async (args) => String(eval(args.expression)),
    },
  ],
  maxToolRounds: 3,
});

for await (const event of convo.stream("What is 42 * 17?")) {
  if (event.type === "delta") process.stdout.write(event.content);
  if (event.type === "tool_call") console.log("Tool:", event.name);
  if (event.type === "tool_result") console.log("Result:", event.result);
}`;

export default function AddingToolCalling() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Adding Tool Calling</Title>
        <Text c="dimmed" mt={4}>
          Give the AI access to your app's functions
        </Text>
      </div>

      <Title order={3}>What you'll build</Title>
      <Text>
        A chat app where the AI can call a documentation search function and a
        calculator. You'll learn both auto-execute mode (tools run
        automatically) and manual mode (you confirm before executing).
      </Text>

      <Callout type="info" title="Prerequisites">
        This tutorial builds on the{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("tutorials/first-chat-app")}
        >
          First Chat App
        </Text>{" "}
        and{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("tutorials/streaming-responses")}
        >
          Streaming Responses
        </Text>{" "}
        tutorials.
      </Callout>

      <StepList
        steps={[
          {
            title: "Define tools",
            content: (
              <Stack gap="xs">
                <Text fz="sm">
                  A ToolDefinition has a name, description, JSON Schema
                  parameters, and an optional handler function. The description
                  tells the model when to use the tool.
                </Text>
                <CodeBlock title="tools.ts" code={stepDefineTools} />
              </Stack>
            ),
          },
          {
            title: "Pass tools to useConversation",
            content: (
              <Stack gap="xs">
                <Text fz="sm">
                  Pass the tools array to useConversation. The hook
                  automatically injects tool descriptions into the system prompt
                  so the model knows what's available.
                </Text>
                <CodeBlock title="Chat.tsx" code={stepPassTools} />
              </Stack>
            ),
          },
          {
            title: "Auto-execute mode",
            content: (
              <Stack gap="xs">
                <Text fz="sm">
                  When a tool has a handler, it runs automatically. The SDK
                  parses the model's tool call, runs your handler, feeds the
                  result back, and lets the model continue.
                </Text>
                <CodeBlock title="tools.ts" code={stepAutoExecute} />
              </Stack>
            ),
          },
          {
            title: "Manual mode",
            content: (
              <Stack gap="xs">
                <Text fz="sm">
                  Omit the handler for tools that need user confirmation.
                  Subscribe to "tool_call" events and call submitToolResult when
                  ready.
                </Text>
                <CodeBlock title="Chat.tsx" code={stepManualMode} />
                <Callout type="warning" title="User-facing actions">
                  Use manual mode for tools that have side effects — purchases,
                  deletions, emails. Always confirm with the user first.
                </Callout>
              </Stack>
            ),
          },
          {
            title: "Show tool activity",
            content: (
              <Stack gap="xs">
                <Text fz="sm">
                  Subscribe to tool_call and tool_result events to show the user
                  what's happening. Messages also include a toolCalls array with
                  call details and results.
                </Text>
                <CodeBlock title="Chat.tsx" code={stepToolActivity} />
              </Stack>
            ),
          },
          {
            title: "Set maxToolRounds",
            content: (
              <Stack gap="xs">
                <Text fz="sm">
                  Prevent infinite tool call loops by setting maxToolRounds. The
                  default is 5. After this many rounds, the model must produce a
                  text response.
                </Text>
                <CodeBlock title="Chat.tsx" code={stepMaxToolRounds} />
              </Stack>
            ),
          },
        ]}
      />

      <Title order={3}>Complete example</Title>
      <Text>A full app with search_docs and calculate tools:</Text>
      <CodeBlock title="App.tsx" code={fullExample} />

      <Title order={3}>React SDK vs Web SDK</Title>
      <Text>
        The React SDK wraps ConversationManager's tool handling in hooks. Here's
        the same tool calling in both:
      </Text>
      <CodeComparison
        reactSdk={{ title: "Chat.tsx", code: comparisonReact }}
        webSdk={{ title: "main.ts", code: comparisonWeb }}
      />

      <Callout type="tip" title="What's next">
        Explore the{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("guides/tool-calling")}
        >
          tool calling guide
        </Text>{" "}
        for advanced patterns like tool priming, or learn about{" "}
        <Text
          span
          c="blue"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("guides/guard-components")}
        >
          guard components
        </Text>{" "}
        for production error handling.
      </Callout>
    </Stack>
  );
}
