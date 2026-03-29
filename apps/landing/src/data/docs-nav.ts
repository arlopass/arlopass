export type NavItem = {
  label: string;
  slug: string;
};

export type NavCategory = {
  label: string;
  items: NavItem[];
};

export const DOCS_NAV: NavCategory[] = [
  {
    label: 'Getting Started',
    items: [
      { slug: 'getting-started/welcome', label: 'Welcome' },
      { slug: 'getting-started/installation', label: 'Installation' },
      { slug: 'getting-started/quickstart-web-sdk', label: 'Quickstart: Web SDK' },
      { slug: 'getting-started/quickstart-react', label: 'Quickstart: React SDK' },
    ],
  },
  {
    label: 'Tutorials',
    items: [
      { slug: 'tutorials/first-chat-app', label: 'Build your first chat app' },
      { slug: 'tutorials/streaming-responses', label: 'Streaming responses' },
      { slug: 'tutorials/provider-selection', label: 'Provider selection UI' },
      { slug: 'tutorials/adding-tool-calling', label: 'Adding tool calling' },
    ],
  },
  {
    label: 'How-to Guides',
    items: [
      { slug: 'guides/conversation-management', label: 'Conversation management' },
      { slug: 'guides/tool-calling', label: 'Tool calling' },
      { slug: 'guides/error-handling', label: 'Error handling' },
      { slug: 'guides/testing', label: 'Testing your app' },
      { slug: 'guides/guard-components', label: 'Guard components' },
      { slug: 'guides/security', label: 'Security model' },
    ],
  },
  {
    label: 'Components Library',
    items: [
      { slug: 'components/overview', label: 'Overview' },
      { slug: 'components/chat', label: 'Chat' },
      { slug: 'components/message', label: 'Message' },
      { slug: 'components/streaming-text', label: 'StreamingText' },
      { slug: 'components/provider-picker', label: 'ProviderPicker' },
      { slug: 'components/tool-activity', label: 'ToolActivity' },
      { slug: 'components/connection-status', label: 'ConnectionStatus' },
      { slug: 'components/registry', label: 'Block registry' },
    ],
  },
  {
    label: 'React SDK Reference',
    items: [
      { slug: 'reference/react/provider', label: 'ArlopassProvider' },
      { slug: 'reference/react/hooks', label: 'Hooks' },
      { slug: 'reference/react/guards', label: 'Guard components' },
      { slug: 'reference/react/types', label: 'Types' },
      { slug: 'reference/react/testing', label: 'Testing utilities' },
    ],
  },
  {
    label: 'Web SDK Reference',
    items: [
      { slug: 'reference/web-sdk/client', label: 'ArlopassClient' },
      { slug: 'reference/web-sdk/conversation-manager', label: 'ConversationManager' },
      { slug: 'reference/web-sdk/types', label: 'Types' },
      { slug: 'reference/web-sdk/error-codes', label: 'Error codes' },
    ],
  },
  {
    label: 'Concepts',
    items: [
      { slug: 'concepts/how-arlopass-works', label: 'How Arlopass works' },
      { slug: 'concepts/transport-model', label: 'Transport model' },
      { slug: 'concepts/state-management', label: 'State management' },
      { slug: 'concepts/web-sdk-vs-react', label: 'Web SDK vs React SDK' },
    ],
  },
  {
    label: 'Interactive',
    items: [
      { slug: 'interactive/playground', label: 'Playground' },
      { slug: 'interactive/connection', label: 'Connection' },
      { slug: 'interactive/providers', label: 'Providers' },
      { slug: 'interactive/chat', label: 'Chat' },
      { slug: 'interactive/streaming', label: 'Streaming' },
      { slug: 'interactive/event-log', label: 'Event log' },
    ],
  },
];

/** Flat list of all pages for lookup */
export const ALL_DOCS: NavItem[] = DOCS_NAV.flatMap((cat) => cat.items);

/** Get category for a slug */
export function getCategory(slug: string): NavCategory | undefined {
  return DOCS_NAV.find((cat) => cat.items.some((item) => item.slug === slug));
}

/** Get prev/next pages */
export function getPrevNext(slug: string): { prev: NavItem | null; next: NavItem | null } {
  const idx = ALL_DOCS.findIndex((p) => p.slug === slug);
  return {
    prev: idx > 0 ? ALL_DOCS[idx - 1]! : null,
    next: idx < ALL_DOCS.length - 1 ? ALL_DOCS[idx + 1]! : null,
  };
}
