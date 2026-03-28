// ─── Model context windows (tokens) ──────────────────────────────────
//
// Sources (verified March 2026):
//   OpenAI:    https://developers.openai.com/api/docs/models
//   Anthropic: https://platform.claude.com/docs/en/docs/about-claude/models
//   Google:    https://ai.google.dev/gemini-api/docs/models
//   Meta:      https://ollama.com/library (Ollama default context)
//   Mistral:   https://docs.mistral.ai/getting-started/models/
//   Others:    Provider documentation pages
//
// Prefix matching: "claude-sonnet-4" matches "claude-sonnet-4-6",
// "claude-sonnet-4-5-20251001", etc. Longer prefixes win.

const MODEL_CONTEXT_WINDOWS: Readonly<Record<string, number>> = {
    // ── OpenAI ──────────────────────────────────────────────────────
    // GPT-5.x series (1M context)
    "gpt-5.4": 1_000_000,
    "gpt-5.4-mini": 400_000,
    "gpt-5.4-nano": 400_000,
    "gpt-5.3": 1_000_000,
    "gpt-5.3-codex": 1_000_000,
    "gpt-5.2": 1_000_000,
    "gpt-5.1": 1_000_000,
    "gpt-5.1-codex": 1_000_000,
    "gpt-5": 1_000_000,
    "gpt-5-mini": 1_000_000,
    "gpt-5-nano": 1_000_000,
    "gpt-5-codex": 1_000_000,
    // GPT-4.1 series (1M context)
    "gpt-4.1": 1_000_000,
    "gpt-4.1-mini": 1_000_000,
    "gpt-4.1-nano": 1_000_000,
    // GPT-4o series (128K context)
    "gpt-4o": 128_000,
    "gpt-4o-mini": 128_000,
    // GPT-4 legacy
    "gpt-4-turbo": 128_000,
    "gpt-4": 8_192,
    "gpt-3.5-turbo": 16_385,
    // o-series reasoning models
    "o4-mini": 200_000,
    "o3": 200_000,
    "o3-mini": 200_000,
    "o1": 200_000,
    "o1-mini": 128_000,

    // ── Anthropic ───────────────────────────────────────────────────
    // Only the explicit -1m variants have 1M context
    "claude-opus-4-6-1m": 1_000_000,
    "claude-sonnet-4-6-1m": 1_000_000,
    "claude-opus-4.6-1m": 1_000_000,
    "claude-sonnet-4.6-1m": 1_000_000,
    "claude-opus-4-5-1m": 1_000_000,
    "claude-sonnet-4-5-1m": 1_000_000,
    "claude-opus-4.5-1m": 1_000_000,
    "claude-sonnet-4.5-1m": 1_000_000,
    // Standard Claude 4.6 (200K)
    "claude-opus-4-6": 200_000,
    "claude-sonnet-4-6": 200_000,
    "claude-opus-4.6": 200_000,
    "claude-sonnet-4.6": 200_000,
    // Claude 4.5 (200K)
    "claude-opus-4-5": 200_000,
    "claude-sonnet-4-5": 200_000,
    "claude-haiku-4-5": 200_000,
    "claude-opus-4.5": 200_000,
    "claude-sonnet-4.5": 200_000,
    "claude-haiku-4.5": 200_000,
    // Claude 4.x base (200K)
    "claude-sonnet-4": 200_000,
    "claude-opus-4": 200_000,
    "claude-haiku-4": 200_000,
    // Claude 3.x legacy (200K)
    "claude-3": 200_000,
    // Aliases used by Copilot CLI / Claude Code
    "opus": 200_000,
    "sonnet": 200_000,
    "haiku": 200_000,

    // ── Google Gemini ───────────────────────────────────────────────
    // Gemini 3.x (1M context, preview)
    "gemini-3": 1_048_576,
    // Gemini 2.5 series (1M context)
    "gemini-2.5-pro": 1_048_576,
    "gemini-2.5-flash": 1_048_576,
    "gemini-2.5-flash-lite": 1_048_576,
    // Gemini 2.0 series (1M context)
    "gemini-2.0-flash": 1_048_576,
    "gemini-2.0-flash-lite": 1_048_576,
    // Gemini 1.5 series
    "gemini-1.5-pro": 2_097_152,
    "gemini-1.5-flash": 1_048_576,
    // Gemini Pro legacy
    "gemini-pro": 32_768,

    // ── xAI ─────────────────────────────────────────────────────────
    "grok-4": 1_000_000,
    "grok-3": 131_072,
    "grok-3-mini": 131_072,
    "grok-2": 131_072,

    // ── Meta Llama (Ollama defaults) ────────────────────────────────
    "llama4": 1_000_000,
    "llama3.3": 131_072,
    "llama3.2": 131_072,
    "llama3.1": 131_072,
    "llama3": 8_192,
    "llama2": 4_096,

    // ── Mistral ─────────────────────────────────────────────────────
    "mistral-large": 131_072,
    "mistral-medium": 131_072,
    "mistral-small": 131_072,
    "pixtral": 131_072,
    "mistral": 32_768,
    "mixtral": 32_768,
    "codestral": 256_000,

    // ── Deepseek ────────────────────────────────────────────────────
    "deepseek-chat": 128_000,
    "deepseek-coder": 128_000,
    "deepseek-reasoner": 128_000,
    "deepseek-r1": 128_000,
    "deepseek-v3": 128_000,
    "deepseek-v2": 128_000,

    // ── Qwen ────────────────────────────────────────────────────────
    "qwen3": 131_072,
    "qwen2.5": 131_072,
    "qwen2": 32_768,

    // ── Other Ollama models ─────────────────────────────────────────
    "gemma2": 8_192,
    "gemma3": 131_072,
    "phi3": 128_000,
    "phi4": 128_000,
    "codellama": 16_384,
    "starcoder2": 16_384,
    "command-r": 128_000,
    "command-r-plus": 128_000,

    // ── Perplexity ──────────────────────────────────────────────────
    "sonar": 127_072,
    "sonar-pro": 200_000,
    "sonar-reasoning": 127_072,
    "sonar-deep-research": 127_072,
};

// OpenRouter model catalog — 327 models with context window sizes.
// Used as a fallback when a model isn't in our curated list above.
import openRouterData from "./openrouter-context-windows.json" with { type: "json" };
const OPENROUTER_CONTEXT_WINDOWS: Readonly<Record<string, number>> =
    openRouterData as Readonly<Record<string, number>>;

export const DEFAULT_CONTEXT_WINDOW = 4_096;

export function resolveModelContextWindow(modelId: string): number {
    // 1. Exact match in curated list
    const exact = MODEL_CONTEXT_WINDOWS[modelId];
    if (exact !== undefined) {
        return exact;
    }

    // 2. Prefix match in curated list (e.g. "claude-sonnet-4" matches "claude-sonnet-4-6-20260101")
    let bestLength = 0;
    let bestSize = 0;
    for (const [prefix, size] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
        if (modelId.startsWith(prefix) && prefix.length > bestLength) {
            bestLength = prefix.length;
            bestSize = size;
        }
    }
    if (bestSize > 0) {
        return bestSize;
    }

    // 3. Exact match in OpenRouter catalog
    const orExact = OPENROUTER_CONTEXT_WINDOWS[modelId];
    if (orExact !== undefined && orExact > 0) {
        return orExact;
    }

    // 4. Prefix match in OpenRouter catalog
    bestLength = 0;
    bestSize = 0;
    for (const [prefix, size] of Object.entries(OPENROUTER_CONTEXT_WINDOWS)) {
        if (modelId.startsWith(prefix) && prefix.length > bestLength) {
            bestLength = prefix.length;
            bestSize = size;
        }
    }
    if (bestSize > 0) {
        return bestSize;
    }

    return DEFAULT_CONTEXT_WINDOW;
}
