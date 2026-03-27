export type NavItem = {
    label: string;
    id: string;
};

export type NavCategory = {
    label: string;
    items: NavItem[];
};

export const NAVIGATION: NavCategory[] = [
    {
        label: "Getting Started",
        items: [
            { id: "getting-started/welcome", label: "Welcome" },
            { id: "getting-started/installation", label: "Installation" },
            { id: "getting-started/quickstart-web-sdk", label: "Quickstart: Web SDK" },
            { id: "getting-started/quickstart-react", label: "Quickstart: React SDK" },
        ],
    },
    {
        label: "Tutorials",
        items: [
            { id: "tutorials/first-chat-app", label: "Build your first chat app" },
            { id: "tutorials/streaming-responses", label: "Streaming responses" },
            { id: "tutorials/provider-selection", label: "Provider selection UI" },
            { id: "tutorials/adding-tool-calling", label: "Adding tool calling" },
        ],
    },
    {
        label: "How-to Guides",
        items: [
            { id: "guides/conversation-management", label: "Conversation management" },
            { id: "guides/tool-calling", label: "Tool calling" },
            { id: "guides/error-handling", label: "Error handling" },
            { id: "guides/testing", label: "Testing your app" },
            { id: "guides/guard-components", label: "Guard components" },
            { id: "guides/security", label: "Security model" },
        ],
    },
    {
        label: "Components Library",
        items: [
            { id: "components/overview", label: "Overview" },
            { id: "components/chat", label: "Chat" },
            { id: "components/message", label: "Message" },
            { id: "components/streaming-text", label: "StreamingText" },
            { id: "components/provider-picker", label: "ProviderPicker" },
            { id: "components/tool-activity", label: "ToolActivity" },
            { id: "components/connection-status", label: "ConnectionStatus" },
            { id: "components/registry", label: "Block registry" },
        ],
    },
    {
        label: "React SDK Reference",
        items: [
            { id: "reference/react/provider", label: "ArlopassProvider" },
            { id: "reference/react/hooks", label: "Hooks" },
            { id: "reference/react/guards", label: "Guard components" },
            { id: "reference/react/types", label: "Types" },
            { id: "reference/react/testing", label: "Testing utilities" },
        ],
    },
    {
        label: "Web SDK Reference",
        items: [
            { id: "reference/web-sdk/client", label: "ArlopassClient" },
            { id: "reference/web-sdk/conversation-manager", label: "ConversationManager" },
            { id: "reference/web-sdk/types", label: "Types" },
            { id: "reference/web-sdk/error-codes", label: "Error codes" },
        ],
    },
    {
        label: "Concepts",
        items: [
            { id: "concepts/how-arlopass-works", label: "How Arlopass works" },
            { id: "concepts/transport-model", label: "Transport model" },
            { id: "concepts/state-management", label: "State management" },
            { id: "concepts/web-sdk-vs-react", label: "Web SDK vs React SDK" },
        ],
    },
    {
        label: "Interactive",
        items: [
            { id: "interactive/playground", label: "Playground" },
            { id: "interactive/connection", label: "Connection" },
            { id: "interactive/providers", label: "Providers" },
            { id: "interactive/chat", label: "Chat" },
            { id: "interactive/streaming", label: "Streaming" },
            { id: "interactive/event-log", label: "Event log" },
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
