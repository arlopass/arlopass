import { Image } from "@mantine/core";
import { tokens } from "./theme.js";

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
 * Icons that use dark fills and need a light container to remain
 * visible on the dark stone background.
 */
const needsLightBg = new Set([
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
    const invertToWhite = needsLightBg.has(providerKey);
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: tokens.radius.button,
          background: invertToWhite ? "transparent" : "rgba(250, 250, 249, 0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Image
          src={`icons/${slug}.svg`}
          alt=""
          w={invertToWhite ? size : Math.round(size * 0.75)}
          h={invertToWhite ? size : Math.round(size * 0.75)}
          fit="contain"
          style={{
            flexShrink: 0,
            ...(invertToWhite ? { filter: "brightness(0) invert(1) opacity(0.9)" } : {}),
          }}
        />
      </div>
    );
  }
  // Fallback: first-letter circle for unknown providers
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: tokens.color.bgElevated,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.4,
        fontWeight: 600,
        color: tokens.color.textSecondary,
        flexShrink: 0,
      }}
      aria-hidden
    >
      {providerKey.charAt(0).toUpperCase()}
    </div>
  );
}
