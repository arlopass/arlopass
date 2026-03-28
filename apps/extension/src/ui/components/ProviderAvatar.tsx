/**
 * Map of provider keys to their @lobehub/icons-static-svg slug.
 * SVG files are copied into dist/icons/ at build time.
 */
const slugMap: Record<string, string> = {
  anthropic: "anthropic",
  openai: "openai",
  ollama: "ollama",
  gemini: "gemini-color",
  microsoft: "azureai-color",
  githubcopilot: "githubcopilot",
  opencode: "opencode",
  bedrock: "bedrock-color",
  perplexity: "perplexity-color",
  claude: "claude-color",
  claudecode: "claudecode-color",
  google: "google-color",
};

/**
 * Icons that use dark fills and need brightness inversion
 * to remain visible on the dark stone background.
 */
const needsInvert = new Set([
  "anthropic",
  "openai",
  "githubcopilot",
  "opencode",
  "ollama",
]);

export type ProviderAvatarProps = {
  providerKey: string;
  size: number;
};

export function ProviderAvatar({ providerKey, size }: ProviderAvatarProps) {
  const slug = slugMap[providerKey];
  if (slug != null) {
    const invert = needsInvert.has(providerKey);
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
  // Fallback: first-letter circle
  return (
    <div
      className="flex items-center justify-center shrink-0 rounded-full bg-[var(--ap-bg-elevated)] text-[var(--ap-text-secondary)] font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden
    >
      {providerKey.charAt(0).toUpperCase()}
    </div>
  );
}
