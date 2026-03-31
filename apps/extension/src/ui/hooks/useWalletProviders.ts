import { useCallback, useEffect, useState } from "react";
import type { WalletProvider } from "../popup-state.js";
import type { ProviderCardData } from "../components/ProviderCard.js";
import { useVaultContext } from "./VaultContext.js";

/** Map provider type/name to a providerKey for the icon avatar. */
function deriveProviderKey(provider: WalletProvider): string {
    const nameLower = provider.name.toLowerCase();
    const methodId = provider.metadata?.["methodId"] ?? "";

    if (methodId.startsWith("anthropic.") || nameLower.includes("anthropic")) return "anthropic";
    if (methodId.startsWith("openai.") || nameLower.includes("openai")) return "openai";
    if (methodId.startsWith("gemini.") || nameLower.includes("gemini")) return "gemini";
    if (methodId.startsWith("bedrock.") || nameLower.includes("bedrock")) return "bedrock";
    if (methodId.startsWith("vertex.") || nameLower.includes("vertex")) return "vertexai";
    if (methodId.startsWith("perplexity.") || nameLower.includes("perplexity")) return "perplexity";
    if (methodId.startsWith("foundry.") || nameLower.includes("foundry") || nameLower.includes("microsoft")) return "microsoft";
    if (nameLower.includes("deepseek")) return "deepseek";
    if (nameLower.includes("mistral") || nameLower.includes("mixtral")) return "mistral";
    if (nameLower.includes("cohere")) return "cohere";
    if (nameLower.includes("grok")) return "grok";
    if (nameLower.includes("together")) return "together";
    if (nameLower.includes("fireworks")) return "fireworks";
    if (nameLower.includes("replicate")) return "replicate";
    if (nameLower.includes("hugging") || nameLower.includes("huggingface")) return "huggingface";
    if (nameLower.includes("xai") || nameLower.includes("grok")) return "xai";
    if (nameLower.includes("cerebras")) return "cerebras";
    if (nameLower.includes("sambanova")) return "sambanova";
    if (nameLower.includes("cloudflare")) return "cloudflare";
    if (nameLower.includes("openrouter")) return "openrouter";
    if (nameLower.includes("deepinfra")) return "deepinfra";
    if (nameLower.includes("lm studio") || nameLower.includes("lmstudio")) return "lmstudio";
    if (nameLower.includes("nvidia") || nameLower.includes("nim")) return "nvidia";
    if (provider.type === "local" || nameLower.includes("ollama")) return "ollama";
    if (nameLower.includes("claude code") || nameLower.includes("claude-code") || (provider.type === "cli" && nameLower.includes("claude"))) return "claudecode";
    if (provider.type === "cli" || nameLower.includes("copilot")) return "githubcopilot";
    if (nameLower.includes("claude")) return "claude";
    if (nameLower.includes("opencode")) return "opencode";
    return provider.name.toLowerCase().replace(/[^a-z]/g, "");
}

const TYPE_LABELS: Record<string, string> = {
    local: "Local",
    cloud: "Cloud",
    cli: "CLI Bridge",
};

function toProviderCardData(provider: WalletProvider): ProviderCardData {
    return {
        id: provider.id,
        name: provider.name,
        providerKey: deriveProviderKey(provider),
        status: provider.status,
        modelsAvailable: provider.models.length,
        providerType: TYPE_LABELS[provider.type] ?? provider.type,
    };
}

export type UseWalletResult = {
    providers: ProviderCardData[];
    rawProviders: WalletProvider[];
    loading: boolean;
    error: string | null;
    refresh: () => void;
};

export function useWalletProviders(): UseWalletResult {
    const { sendVaultMessage } = useVaultContext();
    const [providers, setProviders] = useState<ProviderCardData[]>([]);
    const [rawProviders, setRawProviders] = useState<WalletProvider[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const resp = await sendVaultMessage({ type: "vault.providers.list" });
            const vaultProviders = resp["providers"] as Array<{
                id: string;
                name: string;
                type: string;
                status: string;
                models: string[];
                metadata?: Record<string, string>;
            }>;

            const mapped: WalletProvider[] = (vaultProviders ?? []).map((vp) => ({
                id: vp.id,
                name: vp.name,
                type: vp.type as WalletProvider["type"],
                status: (vp.status || "disconnected") as WalletProvider["status"],
                models: vp.models.map((m) => ({ id: m, name: m })),
                ...(vp.metadata != null && { metadata: vp.metadata }),
            }));

            setProviders(mapped.map(toProviderCardData));
            setRawProviders(mapped);
        } catch (err) {
            console.error("Arlopass Wallet: failed to load wallet state", err);
            setError("Failed to load wallet state.");
        } finally {
            setLoading(false);
        }
    }, [sendVaultMessage]);

    useEffect(() => {
        load();
    }, [load]);

    return { providers, rawProviders, loading, error, refresh: load };
}
