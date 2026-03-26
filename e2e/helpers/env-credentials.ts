/**
 * Typed access to E2E environment credentials.
 *
 * Values are read from `process.env` which Playwright loads from the
 * `dotenv` path configured in playwright.config.ts (`e2e/.env.e2e`).
 *
 * Every getter returns either the trimmed value or `undefined` so
 * test code can guard with a simple `if (!creds.anthropicApiKey) test.skip()`.
 */

function env(key: string): string | undefined {
    const value = process.env[key]?.trim();
    return value && value.length > 0 ? value : undefined;
}

// ─── Anthropic ───
export const anthropicApiKey = (): string | undefined => env("ANTHROPIC_API_KEY");
export const anthropicBaseUrl = (): string => env("ANTHROPIC_BASE_URL") ?? "https://api.anthropic.com";

// ─── OpenAI ───
export const openaiApiKey = (): string | undefined => env("OPENAI_API_KEY");
export const openaiBaseUrl = (): string => env("OPENAI_BASE_URL") ?? "https://api.openai.com/v1";
export const openaiOrganization = (): string | undefined => env("OPENAI_ORGANIZATION");
export const openaiProject = (): string | undefined => env("OPENAI_PROJECT");
export const openaiDefaultModel = (): string | undefined => env("OPENAI_DEFAULT_MODEL");

// ─── A Gemini ───
export const geminiApiKey = (): string | undefined => env("GEMINI_API_KEY");
export const geminiBaseUrl = (): string => env("GEMINI_BASE_URL") ?? "https://generativelanguage.googleapis.com";
export const geminiProjectId = (): string | undefined => env("GEMINI_PROJECT_ID");

// ─── Perplexity ───
export const perplexityApiKey = (): string | undefined => env("PERPLEXITY_API_KEY");
export const perplexityBaseUrl = (): string => env("PERPLEXITY_BASE_URL") ?? "https://api.perplexity.ai";
export const perplexityDefaultModel = (): string | undefined => env("PERPLEXITY_DEFAULT_MODEL");

// ─── Amazon Bedrock ───
export const bedrockRegion = (): string | undefined => env("BEDROCK_REGION");
export const bedrockModelAccessPolicy = (): string | undefined => env("BEDROCK_MODEL_ACCESS_POLICY");
export const bedrockApiKey = (): string | undefined => env("BEDROCK_API_KEY");
export const bedrockAccessKeyId = (): string | undefined => env("BEDROCK_ACCESS_KEY_ID");
export const bedrockSecretAccessKey = (): string | undefined => env("BEDROCK_SECRET_ACCESS_KEY");
export const bedrockSessionToken = (): string | undefined => env("BEDROCK_SESSION_TOKEN");
export const bedrockRoleArn = (): string | undefined => env("BEDROCK_ROLE_ARN");
export const bedrockExternalId = (): string | undefined => env("BEDROCK_EXTERNAL_ID");
export const bedrockTenantId = (): string | undefined => env("BEDROCK_TENANT_ID");

// ─── Google Vertex AI ───
export const vertexApiKey = (): string | undefined => env("VERTEX_API_KEY");
export const vertexProjectId = (): string | undefined => env("VERTEX_PROJECT_ID");
export const vertexLocation = (): string => env("VERTEX_LOCATION") ?? "us-central1";
export const vertexServiceAccountJson = (): string | undefined => env("VERTEX_SERVICE_ACCOUNT_JSON");

// ─── Microsoft Foundry ───
export const foundryApiUrl = (): string | undefined => env("FOUNDRY_API_URL");
export const foundryApiVersion = (): string | undefined => env("FOUNDRY_API_VERSION");
export const foundryDeployment = (): string | undefined => env("FOUNDRY_DEPLOYMENT");
export const foundryApiKey = (): string | undefined => env("FOUNDRY_API_KEY");

// ─── Ollama ───
export const ollamaBaseUrl = (): string => env("OLLAMA_BASE_URL") ?? "http://localhost:11434";

// ─── Bridge ───
export const bridgeHostName = (): string => env("BRIDGE_HOST_NAME") ?? "com.byom.bridge";

// ─── Global Test Mode Flags ───

/**
 * When `true`, live integration tests run through the real extension
 * transport → bridge → provider pipeline with zero mocks.
 */
export function isLiveIntegrationEnabled(): boolean {
    return env("TEST_LIVE_INTEGRATION_ENABLED")?.toLowerCase() === "true";
}

// ─── Per-Provider Enable Flags ───

/** Map from connector ID to the env var that gates it. */
const PROVIDER_ENABLE_FLAGS: Readonly<Record<string, string>> = {
    "cloud-anthropic": "TEST_ANTHROPIC_ENABLED",
    "cloud-openai": "TEST_OPENAI_ENABLED",
    "cloud-gemini": "TEST_GEMINI_ENABLED",
    "cloud-perplexity": "TEST_PERPLEXITY_ENABLED",
    "cloud-bedrock": "TEST_BEDROCK_ENABLED",
    "cloud-vertex": "TEST_VERTEX_ENABLED",
    "cloud-foundry": "TEST_FOUNDRY_ENABLED",
    "local-ollama": "TEST_OLLAMA_ENABLED",
};

/**
 * Returns `true` only when the provider's `TEST_*_ENABLED` flag is
 * explicitly set to `"true"` (case-insensitive).
 *
 * Usage in specs:
 * ```ts
 * if (!isProviderEnabled("cloud-openai")) {
 *   test.skip(true, "OpenAI provider tests are disabled");
 * }
 * ```
 */
export function isProviderEnabled(connectorId: string): boolean {
    const flagKey = PROVIDER_ENABLE_FLAGS[connectorId];
    if (!flagKey) return false;
    return env(flagKey)?.toLowerCase() === "true";
}

/**
 * Credential sets keyed by connector ID — used to auto-fill the
 * options form when testing real provider connections.
 */
export type ConnectorCredentials = Readonly<Record<string, string>>;

export function credentialsForConnector(connectorId: string): ConnectorCredentials | undefined {
    switch (connectorId) {
        case "cloud-anthropic": {
            const key = anthropicApiKey();
            if (!key) return undefined;
            return {
                methodId: "anthropic.api_key",
                baseUrl: anthropicBaseUrl(),
                apiKey: key,
            };
        }
        case "cloud-openai": {
            const key = openaiApiKey();
            if (!key) return undefined;
            return {
                methodId: "openai.api_key",
                baseUrl: openaiBaseUrl(),
                apiKey: key,
                ...(openaiOrganization() ? { organization: openaiOrganization()! } : {}),
                ...(openaiProject() ? { project: openaiProject()! } : {}),
                ...(openaiDefaultModel() ? { defaultModel: openaiDefaultModel()! } : {}),
            };
        }
        case "cloud-gemini": {
            const key = geminiApiKey();
            if (!key) return undefined;
            return {
                methodId: "gemini.api_key",
                baseUrl: geminiBaseUrl(),
                apiKey: key,
                ...(geminiProjectId() ? { projectId: geminiProjectId()! } : {}),
            };
        }
        case "cloud-perplexity": {
            const key = perplexityApiKey();
            if (!key) return undefined;
            return {
                methodId: "perplexity.api_key",
                baseUrl: perplexityBaseUrl(),
                apiKey: key,
                ...(perplexityDefaultModel() ? { defaultModel: perplexityDefaultModel()! } : {}),
            };
        }
        case "cloud-bedrock": {
            const key = bedrockApiKey();
            const accessKey = bedrockAccessKeyId();
            if (!key && !accessKey) return undefined;
            return {
                methodId: key ? "bedrock.api_key" : "bedrock.aws_access_key",
                region: bedrockRegion() ?? "",
                modelAccessPolicy: bedrockModelAccessPolicy() ?? "",
                ...(key ? { apiKey: key } : {}),
                ...(accessKey ? { accessKeyId: accessKey } : {}),
                ...(bedrockSecretAccessKey() ? { secretAccessKey: bedrockSecretAccessKey()! } : {}),
                ...(bedrockSessionToken() ? { sessionToken: bedrockSessionToken()! } : {}),
                ...(bedrockRoleArn() ? { roleArn: bedrockRoleArn()! } : {}),
                ...(bedrockExternalId() ? { externalId: bedrockExternalId()! } : {}),
                ...(bedrockTenantId() ? { tenantId: bedrockTenantId()! } : {}),
            };
        }
        case "cloud-vertex": {
            const key = vertexApiKey();
            const serviceAccount = vertexServiceAccountJson();
            if (!key && !serviceAccount) return undefined;
            return {
                methodId: key ? "vertex.api_key" : "vertex.service_account",
                ...(key ? { apiKey: key } : {}),
                ...(vertexProjectId() ? { projectId: vertexProjectId()! } : {}),
                location: vertexLocation(),
                ...(serviceAccount ? { serviceAccountJson: serviceAccount } : {}),
            };
        }
        case "cloud-foundry": {
            const key = foundryApiKey();
            const url = foundryApiUrl();
            if (!key || !url) return undefined;
            return {
                methodId: "foundry.api_key_url",
                apiUrl: url,
                apiVersion: foundryApiVersion() ?? "",
                apiKey: key,
                ...(foundryDeployment() ? { deployment: foundryDeployment()! } : {}),
            };
        }
        default:
            return undefined;
    }
}
