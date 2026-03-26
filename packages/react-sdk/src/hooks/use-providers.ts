"use client";

import { useCallback, useEffect, useState } from "react";
import type { BYOMSDKError, ProviderDescriptor, SelectProviderInput } from "../types.js";
import { useBYOMContext, useStoreSnapshot } from "./use-store.js";

type UseProvidersReturn = Readonly<{
  providers: readonly ProviderDescriptor[];
  selectedProvider: Readonly<{ providerId: string; modelId: string }> | null;
  isLoading: boolean;
  error: BYOMSDKError | null;
  listProviders: () => Promise<void>;
  selectProvider: (input: SelectProviderInput) => Promise<void>;
  retry: (() => Promise<void>) | null;
}>;

export function useProviders(): UseProvidersReturn {
  const { store } = useBYOMContext();
  const snapshot = useStoreSnapshot();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<BYOMSDKError | null>(null);

  const listProviders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await store.client.listProviders();
      store.setProviders(result.providers);
    } catch (err) {
      setError(err as BYOMSDKError);
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
      setError(err as BYOMSDKError);
    } finally {
      setIsLoading(false);
    }
  }, [store]);

  const retry = error !== null && (error as BYOMSDKError & { retryable?: boolean }).retryable === true
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
