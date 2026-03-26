"use client";

import type { BYOMClient } from "@byom-ai/web-sdk";
import { useBYOMContext, useStoreSnapshot } from "./use-store.js";

export function useClient(): BYOMClient | null {
  const { store, transportAvailable } = useBYOMContext();
  const snapshot = useStoreSnapshot();

  if (!transportAvailable) return null;
  if (snapshot.state === "disconnected" || snapshot.state === "failed") return null;
  return store.client;
}
