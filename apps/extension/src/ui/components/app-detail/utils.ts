import type { WalletProvider } from "../../popup-state.js";

export function extractDomain(origin: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    return origin;
  }
}

export function deriveProviderKey(provider: WalletProvider): string {
  const n = provider.name.toLowerCase();
  const m = provider.metadata?.["methodId"] ?? "";
  const cliType = provider.metadata?.["cliType"] ?? "";
  if (cliType === "claude-code") return "claude";
  if (
    m.startsWith("anthropic.") ||
    n.includes("anthropic") ||
    n.includes("claude")
  )
    return "anthropic";
  if (m.startsWith("openai.") || n.includes("openai")) return "openai";
  if (m.startsWith("gemini.") || n.includes("gemini")) return "gemini";
  if (m.startsWith("foundry.") || n.includes("microsoft")) return "microsoft";
  if (m.startsWith("bedrock.")) return "bedrock";
  if (m.startsWith("perplexity.")) return "perplexity";
  if (provider.type === "local") return "ollama";
  if (provider.type === "cli") return "githubcopilot";
  return "openai";
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}
