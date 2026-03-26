/**
 * Lightweight provider registry for the popup onboarding wizard.
 * These are UI-only definitions — actual testConnection/sanitize
 * are imported from the connectors module when needed.
 */

export type ProviderEntry = {
    connectorId: string;
    label: string;
    shortLabel: string;
    providerKey: string; // for ProviderAvatar icon
    type: "local" | "cloud" | "cli";
    defaultName: string;
    /** The primary secret field key (e.g. "apiKey", "accessToken") */
    secretFieldKey: string;
    secretFieldLabel: string;
    /** Default methodId for cloud providers */
    defaultMethodId: string;
    /** Fields the user must fill in the onboarding form */
    requiredFields: readonly {
        key: string;
        label: string;
        type: "text" | "password" | "url";
        placeholder?: string | undefined;
        defaultValue?: string | undefined;
    }[];
};

/**
 * Cloud providers available in the onboarding wizard.
 * Ordered to match the Figma design.
 */
export const ONBOARDING_PROVIDERS: readonly ProviderEntry[] = [
    {
        connectorId: "cloud-anthropic",
        label: "Anthropic (Cloud)",
        shortLabel: "Anthropic API",
        providerKey: "anthropic",
        type: "cloud",
        defaultName: "Anthropic Cloud",
        secretFieldKey: "apiKey",
        secretFieldLabel: "API Key",
        defaultMethodId: "anthropic.api_key",
        requiredFields: [
            { key: "apiKey", label: "API Key", type: "password", placeholder: "sk-ant-..." },
        ],
    },
    {
        connectorId: "cloud-openai",
        label: "OpenAI (Cloud)",
        shortLabel: "OpenAI",
        providerKey: "openai",
        type: "cloud",
        defaultName: "OpenAI",
        secretFieldKey: "apiKey",
        secretFieldLabel: "API Key",
        defaultMethodId: "openai.api_key",
        requiredFields: [
            { key: "apiKey", label: "API Key", type: "password", placeholder: "sk-..." },
        ],
    },
    {
        connectorId: "cloud-gemini",
        label: "Gemini API (Cloud)",
        shortLabel: "Gemini",
        providerKey: "gemini",
        type: "cloud",
        defaultName: "Gemini API",
        secretFieldKey: "apiKey",
        secretFieldLabel: "API Key",
        defaultMethodId: "gemini.api_key",
        requiredFields: [
            { key: "apiKey", label: "API Key", type: "password", placeholder: "AIza..." },
        ],
    },
    {
        connectorId: "cloud-foundry",
        label: "Microsoft Foundry (Cloud)",
        shortLabel: "Microsoft Foundry",
        providerKey: "microsoft",
        type: "cloud",
        defaultName: "Microsoft Foundry",
        secretFieldKey: "apiKey",
        secretFieldLabel: "API Key",
        defaultMethodId: "foundry.api_key",
        requiredFields: [
            { key: "apiUrl", label: "API URL", type: "url", placeholder: "https://..." },
            { key: "apiKey", label: "API Key", type: "password", placeholder: "" },
        ],
    },
    {
        connectorId: "cloud-bedrock",
        label: "Amazon Bedrock (Cloud)",
        shortLabel: "Amazon Bedrock",
        providerKey: "bedrock",
        type: "cloud",
        defaultName: "Amazon Bedrock",
        secretFieldKey: "apiKey",
        secretFieldLabel: "API Key",
        defaultMethodId: "bedrock.api_key",
        requiredFields: [
            { key: "region", label: "Region", type: "text", placeholder: "us-east-1" },
            { key: "apiKey", label: "API Key", type: "password", placeholder: "" },
        ],
    },
    {
        connectorId: "cloud-perplexity",
        label: "Perplexity (Cloud)",
        shortLabel: "Perplexity",
        providerKey: "perplexity",
        type: "cloud",
        defaultName: "Perplexity",
        secretFieldKey: "apiKey",
        secretFieldLabel: "API Key",
        defaultMethodId: "perplexity.api_key",
        requiredFields: [
            { key: "apiKey", label: "API Key", type: "password", placeholder: "pplx-..." },
        ],
    },
    {
        connectorId: "cloud-vertex",
        label: "Google Vertex AI (Cloud)",
        shortLabel: "Google Vertex AI",
        providerKey: "google",
        type: "cloud",
        defaultName: "Google Vertex AI",
        secretFieldKey: "apiKey",
        secretFieldLabel: "API Key",
        defaultMethodId: "vertex.api_key",
        requiredFields: [
            { key: "apiKey", label: "API Key", type: "password", placeholder: "" },
        ],
    },
    {
        connectorId: "ollama",
        label: "Ollama (Local)",
        shortLabel: "Ollama",
        providerKey: "ollama",
        type: "local",
        defaultName: "Ollama Local",
        secretFieldKey: "baseUrl",
        secretFieldLabel: "Base URL",
        defaultMethodId: "",
        requiredFields: [
            { key: "baseUrl", label: "Base URL", type: "url", placeholder: "http://localhost:11434", defaultValue: "http://localhost:11434" },
        ],
    },
    {
        connectorId: "local-cli-bridge",
        label: "Native Bridge Host (CLI)",
        shortLabel: "GitHub Copilot CLI",
        providerKey: "githubcopilot",
        type: "cli",
        defaultName: "GitHub Copilot CLI",
        secretFieldKey: "nativeHostName",
        secretFieldLabel: "Native Host Name",
        defaultMethodId: "",
        requiredFields: [],
    },
    {
        connectorId: "cli-claude-code",
        label: "Claude Code (CLI)",
        shortLabel: "Claude Code",
        providerKey: "claude",
        type: "cli",
        defaultName: "Claude Code",
        secretFieldKey: "nativeHostName",
        secretFieldLabel: "Native Host Name",
        defaultMethodId: "",
        requiredFields: [],
    },
];

/** Build initial field values from a provider's defaultValue entries. */
export function getDefaultFieldValues(entry: ProviderEntry): Record<string, string> {
    const values: Record<string, string> = {};
    for (const field of entry.requiredFields) {
        if (field.defaultValue !== undefined) {
            values[field.key] = field.defaultValue;
        }
    }
    return values;
}

/** Generate a sensible default credential name. */
export function getDefaultCredentialName(entry: ProviderEntry): string {
    return `${entry.shortLabel} ${entry.secretFieldLabel}`;
}

export type ProviderCategory = "all" | "cloud" | "local" | "cli";

export const PROVIDER_CATEGORIES: readonly { id: ProviderCategory; label: string }[] = [
    { id: "all", label: "All Providers" },
    { id: "cloud", label: "Cloud Providers" },
    { id: "local", label: "Local Providers" },
    { id: "cli", label: "CLI Providers" },
];

export function filterProviders(category: ProviderCategory): readonly ProviderEntry[] {
    if (category === "all") return ONBOARDING_PROVIDERS;
    return ONBOARDING_PROVIDERS.filter((p) => p.type === category);
}
