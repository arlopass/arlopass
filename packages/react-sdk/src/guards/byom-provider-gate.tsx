"use client";

import type { ReactNode } from "react";
import { useStoreSnapshot } from "../hooks/use-store.js";
import { useProviders } from "../hooks/use-providers.js";

type Props = Readonly<{
  fallback?: ReactNode;
  loadingFallback?: ReactNode;
  children: ReactNode;
}>;

export function BYOMProviderGate({
  fallback = null,
  loadingFallback,
  children,
}: Props): ReactNode {
  const snapshot = useStoreSnapshot();
  const { isLoading } = useProviders();

  if (isLoading) {
    return loadingFallback !== undefined ? loadingFallback : fallback;
  }

  if (snapshot.selectedProvider === null) {
    return fallback;
  }

  return children;
}
