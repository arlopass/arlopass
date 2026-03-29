/**
 * Map of model ID patterns to their @lobehub/icons-static-svg slug.
 * Matches model IDs by prefix/substring to the appropriate icon.
 */
const modelSlugRules: readonly { match: (id: string) => boolean; slug: string }[] = [
  // Claude models
  { match: (id) => id.startsWith("claude-") || id.includes("claude"), slug: "claude-color" },
  // GPT / OpenAI models
  { match: (id) => id.startsWith("gpt-") || id.startsWith("chatgpt-") || id.startsWith("o1") || id.startsWith("o3") || id.startsWith("o4"), slug: "openai" },
  // Gemini models
  { match: (id) => id.startsWith("gemini-") || id.startsWith("gemma-"), slug: "gemini-color" },
  // DeepSeek models
  { match: (id) => id.startsWith("deepseek") || id.includes("deepseek"), slug: "deepseek-color" },
  // Mistral models
  { match: (id) => id.startsWith("mistral") || id.startsWith("mixtral") || id.startsWith("codestral") || id.startsWith("pixtral") || id.includes("mistral"), slug: "mistral-color" },
  // Llama / Meta models
  { match: (id) => id.startsWith("llama") || id.includes("llama") || id.startsWith("meta-llama"), slug: "meta-color" },
  // Cohere models
  { match: (id) => id.startsWith("command") || id.includes("cohere"), slug: "cohere-color" },
  // Qwen models
  { match: (id) => id.startsWith("qwen") || id.includes("qwen"), slug: "qwen-color" },
  // Yi models
  { match: (id) => id.startsWith("yi-") || id.includes("/yi-"), slug: "yi-color" },
  // Phi models (Microsoft)
  { match: (id) => id.startsWith("phi-") || id.includes("phi-"), slug: "microsoft-color" },
  // DALL-E / image models
  { match: (id) => id.startsWith("dall-e") || id.startsWith("dalle"), slug: "dalle-color" },
  // Stable Diffusion / Stability
  { match: (id) => id.includes("stable-diffusion") || id.includes("stability") || id.startsWith("sdxl"), slug: "stability-color" },
  // Whisper (OpenAI)
  { match: (id) => id.startsWith("whisper"), slug: "openai" },
  // Sonar / Perplexity models
  { match: (id) => id.startsWith("sonar") || id.includes("perplexity"), slug: "perplexity-color" },
  // Codex / OpenAI code
  { match: (id) => id.startsWith("codex") || id.includes("codex"), slug: "codex-color" },
  // Nova / Amazon
  { match: (id) => id.startsWith("amazon.nova") || id.startsWith("nova-"), slug: "nova-color" },
  // Bedrock-prefixed models (Anthropic on Bedrock)
  { match: (id) => id.startsWith("anthropic.claude"), slug: "claude-color" },
  // Bedrock Titan
  { match: (id) => id.startsWith("amazon.titan"), slug: "bedrock-color" },
  // Grok / xAI
  { match: (id) => id.startsWith("grok") || id.includes("grok"), slug: "xai" },
  // Cerebras
  { match: (id) => id.includes("cerebras"), slug: "cerebras-color" },
  // NVIDIA models
  { match: (id) => id.startsWith("nvidia/") || id.includes("nemotron"), slug: "nvidia-color" },
];

/**
 * Icons that use dark fills and need brightness inversion
 * to remain visible on the dark stone background.
 */
const modelNeedsInvert = new Set(["openai", "xai"]);

function resolveModelSlug(modelId: string): string | null {
  const lower = modelId.toLowerCase();
  for (const rule of modelSlugRules) {
    if (rule.match(lower)) {
      return rule.slug;
    }
  }
  return null;
}

export type ModelAvatarProps = {
  modelId: string;
  /** Fallback provider key used if the model can't be identified */
  providerKey?: string;
  size: number;
};

export function ModelAvatar({ modelId, providerKey, size }: ModelAvatarProps) {
  const slug = resolveModelSlug(modelId);

  if (slug != null) {
    const invert = modelNeedsInvert.has(slug);
    const imgSize = invert ? size : Math.round(size * 0.75);
    return (
      <div
        className="flex items-center justify-center shrink-0 rounded-sm"
        style={{
          width: size,
          height: size,
          background: invert ? "transparent" : "rgba(250, 250, 249, 0.1)",
        }}
      >
        <img
          src={`icons/${slug}.svg`}
          alt=""
          width={imgSize}
          height={imgSize}
          className="shrink-0 object-contain"
          style={
            invert
              ? { filter: "brightness(0) invert(1) opacity(0.9)" }
              : undefined
          }
        />
      </div>
    );
  }

  // Fall back to provider icon if available
  if (providerKey != null) {
    // Delegate to ProviderAvatar import would create circular dependency,
    // just render the monogram fallback
    return (
      <div
        className="flex items-center justify-center shrink-0 rounded-full bg-[var(--ap-bg-elevated)] text-[var(--ap-text-secondary)] font-semibold"
        style={{ width: size, height: size, fontSize: size * 0.4 }}
        aria-hidden
      >
        {modelId.charAt(0).toUpperCase()}
      </div>
    );
  }

  // Fallback: first-letter circle
  return (
    <div
      className="flex items-center justify-center shrink-0 rounded-full bg-[var(--ap-bg-elevated)] text-[var(--ap-text-secondary)] font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden
    >
      {modelId.charAt(0).toUpperCase()}
    </div>
  );
}
