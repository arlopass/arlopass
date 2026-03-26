export type NavItem = {
    label: string;
    id: string;
    icon?: string;
};

export type NavCategory = {
    label: string;
    items: NavItem[];
};

export const NAVIGATION: NavCategory[] = [
    {
        label: "Get Started",
        items: [
            { id: "welcome", label: "Welcome" },
            { id: "quickstart", label: "Quickstart" },
            { id: "connection", label: "Connection" },
        ],
    },
    {
        label: "Interactive",
        items: [
            { id: "playground", label: "Playground" },
            { id: "chat", label: "Chat" },
            { id: "streaming", label: "Streaming" },
            { id: "providers", label: "Providers" },
        ],
    },
    {
        label: "Scenarios",
        items: [
            { id: "sdk-happy-path", label: "SDK Happy Path" },
            { id: "streaming-chat", label: "Streaming Chat" },
            { id: "extension-first", label: "Extension-first" },
            { id: "error-timeout", label: "Error Handling" },
            { id: "provider-switching", label: "Provider Switching" },
        ],
    },
    {
        label: "Reference",
        items: [
            { id: "snippet", label: "Integration Snippet" },
            { id: "event-log", label: "Event Log" },
        ],
    },
];
