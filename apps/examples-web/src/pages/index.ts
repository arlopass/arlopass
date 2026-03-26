import { lazy, type ComponentType } from "react";

type PageModule = { default: ComponentType };

const loaders: Record<string, () => Promise<PageModule>> = {
    // Getting Started
    "getting-started/welcome": () => import("./getting-started/Welcome.js"),
    "getting-started/installation": () => import("./getting-started/Installation.js"),
    "getting-started/quickstart-web-sdk": () => import("./getting-started/QuickstartWebSDK.js"),
    "getting-started/quickstart-react": () => import("./getting-started/QuickstartReact.js"),
    // Tutorials
    "tutorials/first-chat-app": () => import("./tutorials/FirstChatApp.js"),
    "tutorials/streaming-responses": () => import("./tutorials/StreamingResponses.js"),
    "tutorials/provider-selection": () => import("./tutorials/ProviderSelection.js"),
    "tutorials/adding-tool-calling": () => import("./tutorials/AddingToolCalling.js"),
    // How-to Guides
    "guides/conversation-management": () => import("./guides/ConversationManagement.js"),
    "guides/tool-calling": () => import("./guides/ToolCallingGuide.js"),
    "guides/error-handling": () => import("./guides/ErrorHandling.js"),
    "guides/testing": () => import("./guides/TestingGuide.js"),
    "guides/guard-components": () => import("./guides/GuardComponents.js"),
    "guides/security": () => import("./guides/SecurityModel.js"),
    // Reference: React SDK
    "reference/react/provider": () => import("./reference/react/ReactProvider.js"),
    "reference/react/hooks": () => import("./reference/react/HooksAPI.js"),
    "reference/react/guards": () => import("./reference/react/GuardsAPI.js"),
    "reference/react/types": () => import("./reference/react/ReactTypes.js"),
    "reference/react/testing": () => import("./reference/react/TestingAPI.js"),
    // Reference: Web SDK
    "reference/web-sdk/client": () => import("./reference/web-sdk/WebSDKClient.js"),
    "reference/web-sdk/conversation-manager": () => import("./reference/web-sdk/ConversationManagerAPI.js"),
    "reference/web-sdk/types": () => import("./reference/web-sdk/WebSDKTypes.js"),
    "reference/web-sdk/error-codes": () => import("./reference/web-sdk/ErrorCodes.js"),
    // Concepts
    "concepts/how-byom-works": () => import("./concepts/HowBYOMWorks.js"),
    "concepts/transport-model": () => import("./concepts/TransportModel.js"),
    "concepts/state-management": () => import("./concepts/StateManagement.js"),
    "concepts/web-sdk-vs-react": () => import("./concepts/WebSDKvsReact.js"),
    // Interactive
    "interactive/playground": () => import("./interactive/Playground.js"),
    "interactive/connection": () => import("./interactive/ConnectionPanel.js"),
    "interactive/providers": () => import("./interactive/ProviderExplorer.js"),
    "interactive/chat": () => import("./interactive/ChatTranscript.js"),
    "interactive/streaming": () => import("./interactive/StreamingDemo.js"),
    "interactive/event-log": () => import("./interactive/EventLog.js"),
};

// Cache lazy components so React.lazy is only called once per page.
// Calling lazy() in render creates a new component type each time,
// which causes Suspense to unmount/remount on every state change.
const cache = new Map<string, React.LazyExoticComponent<ComponentType>>();

export function getPageComponent(pageId: string): React.LazyExoticComponent<ComponentType> | null {
    const cached = cache.get(pageId);
    if (cached) return cached;

    const loader = loaders[pageId];
    if (!loader) return null;

    const component = lazy(loader);
    cache.set(pageId, component);
    return component;
}
