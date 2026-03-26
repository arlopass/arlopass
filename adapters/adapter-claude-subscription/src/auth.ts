import { AuthError } from "@byom-ai/protocol";

export const CLAUDE_API_BASE = "https://api.anthropic.com";
export const CLAUDE_API_VERSION = "2023-06-01";
export const CLAUDE_CONNECTION_METHOD_IDS = Object.freeze({
  OAUTH_SUBSCRIPTION: "anthropic.oauth_subscription",
  API_KEY: "anthropic.api_key",
} as const);

export type ClaudeAuthType = "api_key" | "oauth2";
export type ClaudeConnectionMethodId =
  (typeof CLAUDE_CONNECTION_METHOD_IDS)[keyof typeof CLAUDE_CONNECTION_METHOD_IDS];

export type ClaudeAuthConfig = Readonly<{
  authType: ClaudeAuthType;
  /** API key for `api_key` auth. */
  apiKey?: string;
  /** Bearer access token for `oauth2` auth. */
  accessToken?: string;
}>;

export type ClaudeAuthHeaders = Readonly<{
  "anthropic-version": string;
  "content-type": string;
  "x-api-key"?: string;
  Authorization?: string;
}>;

export function buildAuthHeaders(config: ClaudeAuthConfig): ClaudeAuthHeaders {
  if (config.authType === "oauth2") {
    if (!config.accessToken) {
      throw new AuthError("OAuth2 access token is required for claude-subscription adapter.");
    }
    return {
      "anthropic-version": CLAUDE_API_VERSION,
      "content-type": "application/json",
      Authorization: `Bearer ${config.accessToken}`,
    };
  }

  if (!config.apiKey) {
    throw new AuthError("API key is required for claude-subscription adapter.");
  }
  return {
    "anthropic-version": CLAUDE_API_VERSION,
    "content-type": "application/json",
    "x-api-key": config.apiKey,
  };
}

export function isAuthConfig(value: unknown): value is ClaudeAuthConfig {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v["authType"] !== "api_key" && v["authType"] !== "oauth2") return false;
  if (v["authType"] === "api_key" && typeof v["apiKey"] !== "string") return false;
  if (v["authType"] === "oauth2" && typeof v["accessToken"] !== "string") return false;
  return true;
}

export function isClaudeConnectionMethodId(value: string): value is ClaudeConnectionMethodId {
  return Object.values(CLAUDE_CONNECTION_METHOD_IDS).includes(value as ClaudeConnectionMethodId);
}
