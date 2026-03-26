const MODEL_CONTEXT_WINDOWS: Readonly<Record<string, number>> = {
    // Ollama / local
    "llama3.2": 131_072,
    "llama3.1": 131_072,
    "llama3": 8_192,
    "mistral": 32_768,
    "qwen2.5": 32_768,
    "gemma2": 8_192,
    "phi3": 4_096,
    "codellama": 16_384,
    "deepseek-coder": 16_384,
    // Anthropic
    "claude-sonnet-4": 200_000,
    "claude-haiku-4": 200_000,
    "claude-opus-4": 200_000,
    // OpenAI
    "gpt-4o": 128_000,
    "gpt-4o-mini": 128_000,
    "gpt-4-turbo": 128_000,
    "gpt-4": 8_192,
    "gpt-3.5-turbo": 16_385,
    "o1": 200_000,
    "o1-mini": 128_000,
    // Google
    "gemini-2.0-flash": 1_048_576,
    "gemini-1.5-pro": 2_097_152,
    "gemini-1.5-flash": 1_048_576,
    // Perplexity
    "sonar": 127_072,
};

export const DEFAULT_CONTEXT_WINDOW = 4_096;

export function resolveModelContextWindow(modelId: string): number {
    const exact = MODEL_CONTEXT_WINDOWS[modelId];
    if (exact !== undefined) {
        return exact;
    }
    let bestLength = 0;
    let bestSize = DEFAULT_CONTEXT_WINDOW;
    for (const [prefix, size] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
        if (modelId.startsWith(prefix) && prefix.length > bestLength) {
            bestLength = prefix.length;
            bestSize = size;
        }
    }
    return bestSize;
}
