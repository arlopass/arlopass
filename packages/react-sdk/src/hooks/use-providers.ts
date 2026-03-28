"use client";

import { useCallback, useEffect, useState } from "react";
import type { ArlopassSDKError, ProviderDescriptor, SelectProviderInput } from "../types.js";
import { useArlopassContext, useStoreSnapshot } from "./use-store.js";

type UseProvidersReturn = Readonly<{
    providers: readonly ProviderDescriptor[];
    selectedProvider: Readonly<{ providerId: string; modelId: string }> | null;
    isLoading: boolean;
    error: ArlopassSDKError | null;
    listProviders: () => Promise<void>;
    selectProvider: (input: SelectProviderInput) => Promise<void>;
    retry: (() => Promise<void>) | null;
}>;

export function useProviders(): UseProvidersReturn {
    const { store } = useArlopassContext();
    const snapshot = useStoreSnapshot();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<ArlopassSDKError | null>(null);

    const listProviders = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const result = await store.client.listProviders();
            store.setProviders(result.providers);
        } catch (err) {
            setError(err as ArlopassSDKError);
        } finally {
            setIsLoading(false);
        }
    }, [store]);

    const selectProvider = useCallback(async (input: SelectProviderInput) => {
        setIsLoading(true);
        setError(null);
        try {
            await store.client.selectProvider(input);
            store.refreshSnapshot();
        } catch (err) {
            setError(err as ArlopassSDKError);
        } finally {
            setIsLoading(false);
        }
    }, [store]);

    const retry = error !== null && (error as ArlopassSDKError & { retryable?: boolean }).retryable === true
        ? async () => {
            setError(null);
            await listProviders();
        }
        : null;

    useEffect(() => {
        if (snapshot.state === "connected" || snapshot.state === "degraded") {
            void listProviders();
        }
    }, [snapshot.state, listProviders]);

    // Auto-refresh when extension signals provider/app changes
    useEffect(() => {
        if (snapshot.state !== "connected" && snapshot.state !== "degraded") return;
        const unsubscribe = store.client.onProvidersChanged((event) => {
            // SDK already updated its internal providers + invalidated selection
            store.setProviders(event.providers);
            if (event.selectionInvalidated) {
                store.refreshSnapshot(); // clears selectedProvider in React state
            }
        });
        return unsubscribe;
    }, [store, snapshot.state]);

    return {
        providers: snapshot.providers,
        selectedProvider: snapshot.selectedProvider,
        isLoading,
        error,
        listProviders,
        selectProvider,
        retry,
    };
}
