import { useCallback, useEffect, useState } from "react";
import {
    normalizeWalletSnapshot,
    type WalletProvider,
    type WalletSnapshot,
} from "../popup-state.js";
import type { ProviderCardData } from "../components/ProviderCard.js";

/** Map provider type/name to a providerKey for the icon avatar. */
function deriveProviderKey(provider: WalletProvider): string {
    const nameLower = provider.name.toLowerCase();
    const methodId = provider.metadata?.["methodId"] ?? "";

    if (methodId.startsWith("anthropic.") || nameLower.includes("anthropic")) return "anthropic";
    if (methodId.startsWith("openai.") || nameLower.includes("openai")) return "openai";
    if (methodId.startsWith("gemini.") || nameLower.includes("gemini")) return "gemini";
    if (methodId.startsWith("bedrock.") || nameLower.includes("bedrock")) return "bedrock";
    if (methodId.startsWith("vertex.") || nameLower.includes("vertex")) return "google";
    if (methodId.startsWith("perplexity.") || nameLower.includes("perplexity")) return "perplexity";
    if (methodId.startsWith("foundry.") || nameLower.includes("foundry") || nameLower.includes("microsoft")) return "microsoft";
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
    const [providers, setProviders] = useState<ProviderCardData[]>([]);
    const [rawProviders, setRawProviders] = useState<WalletProvider[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        setLoading(true);
        setError(null);

        chrome.storage.local.get(
            [
                "arlopass.wallet.providers.v1",
                "arlopass.wallet.activeProvider.v1",
                "arlopass.wallet.ui.lastError.v1",
            ],
            (result: Record<string, unknown>) => {
                try {
                    const snapshot: WalletSnapshot = normalizeWalletSnapshot(result);
                    if (snapshot.warnings.length > 0) {
                        console.warn("Arlopass Wallet: snapshot warnings", snapshot.warnings);
                    }
                    setProviders(snapshot.providers.map(toProviderCardData));
                    setRawProviders(snapshot.providers);
                } catch (err) {
                    console.error("Arlopass Wallet: failed to load wallet state", err);
                    setError("Failed to load wallet state.");
                } finally {
                    setLoading(false);
                }
            },
        );
    }, []);

    useEffect(() => {
        load();

        // Re-load when storage changes (e.g. provider connected/disconnected)
        const listener = (
            changes: Record<string, chrome.storage.StorageChange>,
            area: string,
        ) => {
            if (area === "local" && "arlopass.wallet.providers.v1" in changes) {
                load();
            }
        };
        chrome.storage.onChanged.addListener(listener);
        return () => chrome.storage.onChanged.removeListener(listener);
    }, [load]);

    return { providers, rawProviders, loading, error, refresh: load };
}
