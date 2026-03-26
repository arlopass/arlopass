import { Image } from "@mantine/core";

/**
 * Map of provider keys to their @lobehub/icons-static-svg slug.
 * SVG files are copied into dist/icons/ at build time.
 * Color variants are preferred when available.
 */
const slugMap: Record<string, string> = {
  anthropic: "anthropic",
  openai: "openai",
  ollama: "ollama",
  gemini: "gemini-color",
  microsoft: "microsoft-color",
  githubcopilot: "githubcopilot",
  opencode: "opencode",
  bedrock: "bedrock-color",
  perplexity: "perplexity-color",
  claude: "claude-color",
  google: "google-color",
};

export type ProviderAvatarProps = {
  providerKey: string;
  size: number;
};

export function ProviderAvatar({ providerKey, size }: ProviderAvatarProps) {
  const slug = slugMap[providerKey];
  if (slug != null) {
    return (
      <Image
        src={`icons/${slug}.svg`}
        alt=""
        w={size}
        h={size}
        fit="contain"
        style={{ flexShrink: 0 }}
      />
    );
  }
  // Fallback: first-letter circle for unknown providers
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "#dfe1e8",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.4,
        fontWeight: 600,
        color: "#202225",
        flexShrink: 0,
      }}
      aria-hidden
    >
      {providerKey.charAt(0).toUpperCase()}
    </div>
  );
}
