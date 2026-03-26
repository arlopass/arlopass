export type NavItem = {
  label: string;
  id: string;
  description?: string;
};

export type NavCategory = {
  label: string;
  icon?: string;
  items: NavItem[];
};

export const NAVIGATION: NavCategory[] = [
  {
    label: "Getting Started",
    icon: "🏠",
    items: [
      { id: "getting-started/welcome", label: "Welcome", description: "Overview of BYOM AI" },
      { id: "getting-started/installation", label: "Installation", description: "Install and configure the SDKs" },
      { id: "getting-started/quickstart-web-sdk", label: "Quickstart: Web SDK", description: "Get started with the Web SDK" },
      { id: "getting-started/quickstart-react", label: "Quickstart: React SDK", description: "Get started with the React SDK" },
    ],
  },
  {
    label: "Tutorials",
    icon: "📚",
    items: [
      { id: "tutorials/first-chat-app", label: "Build Your First Chat App", description: "Step-by-step React chat app" },
      { id: "tutorials/streaming-responses", label: "Streaming Responses", description: "Add real-time streaming" },
      { id: "tutorials/provider-selection", label: "Provider Selection UI", description: "Build a provider picker" },
      { id: "tutorials/adding-tool-calling", label: "Adding Tool Calling", description: "Add function calling to your app" },
    ],
  },
  {
    label: "How-to Guides",
    icon: "📖",
    items: [
      { id: "guides/conversation-management", label: "Conversation Management", description: "Context windows, pinning, summarization" },
      { id: "guides/tool-calling", label: "Tool Calling", description: "Auto, manual, and mixed tool execution" },
      { id: "guides/error-handling", label: "Error Handling", description: "Retry logic and error boundaries" },
      { id: "guides/testing", label: "Testing Your App", description: "Mock transports and test helpers" },
      { id: "guides/guard-components", label: "Guard Components", description: "Conditional rendering with gates" },
      { id: "guides/security", label: "Security Model", description: "Transport trust and credential isolation" },
    ],
  },
  {
    label: "API Reference: React SDK",
    icon: "⚛️",
    items: [
      { id: "reference/react/provider", label: "BYOMProvider", description: "Root provider component" },
      { id: "reference/react/hooks", label: "Hooks", description: "useConnection, useChat, useConversation, ..." },
      { id: "reference/react/guards", label: "Guard Components", description: "Gates and conditional renderers" },
      { id: "reference/react/types", label: "Types", description: "TypeScript type exports" },
      { id: "reference/react/testing", label: "Testing Utilities", description: "Mock transport and providers" },
    ],
  },
  {
    label: "API Reference: Web SDK",
    icon: "🔧",
    items: [
      { id: "reference/web-sdk/client", label: "BYOMClient", description: "Core client class" },
      { id: "reference/web-sdk/conversation-manager", label: "ConversationManager", description: "Conversation history manager" },
      { id: "reference/web-sdk/types", label: "Types", description: "TypeScript type exports" },
      { id: "reference/web-sdk/error-codes", label: "Error Codes", description: "Machine codes and reason codes" },
    ],
  },
  {
    label: "Concepts",
    icon: "💡",
    items: [
      { id: "concepts/how-byom-works", label: "How BYOM Works", description: "Architecture and data flow" },
      { id: "concepts/transport-model", label: "Transport Model", description: "Injected transport and extension" },
      { id: "concepts/state-management", label: "State Management", description: "ClientStore and React sync" },
      { id: "concepts/web-sdk-vs-react", label: "Web SDK vs React SDK", description: "When to use which" },
    ],
  },
  {
    label: "Interactive",
    icon: "⚡",
    items: [
      { id: "interactive/playground", label: "Playground", description: "Live SDK sandbox" },
      { id: "interactive/connection", label: "Connection", description: "Connect and disconnect" },
      { id: "interactive/providers", label: "Providers", description: "Browse and select providers" },
      { id: "interactive/chat", label: "Chat", description: "Message transcript" },
      { id: "interactive/streaming", label: "Streaming", description: "Real-time response streaming" },
      { id: "interactive/event-log", label: "Event Log", description: "SDK operation log" },
    ],
  },
];

// Flatten for search/lookup
export const ALL_PAGES: NavItem[] = NAVIGATION.flatMap((cat) => cat.items);

// Get page by ID
export function getPage(id: string): NavItem | undefined {
  return ALL_PAGES.find((p) => p.id === id);
}

// Get category for a page
export function getCategory(pageId: string): NavCategory | undefined {
  return NAVIGATION.find((cat) => cat.items.some((item) => item.id === pageId));
}

// Get prev/next pages in linear order
export function getPrevNext(pageId: string): { prev: NavItem | null; next: NavItem | null } {
  const idx = ALL_PAGES.findIndex((p) => p.id === pageId);
  return {
    prev: idx > 0 ? ALL_PAGES[idx - 1]! : null,
    next: idx < ALL_PAGES.length - 1 ? ALL_PAGES[idx + 1]! : null,
  };
}
