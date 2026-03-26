"use client";

import { useCallback } from "react";
import type { BYOMSDKError } from "@byom-ai/web-sdk";
import type { ClientState } from "../types.js";
import { useBYOMContext, useStoreSnapshot } from "./use-store.js";

type UseConnectionReturn = Readonly<{
  state: ClientState;
  sessionId: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: BYOMSDKError | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  retry: (() => Promise<void>) | null;
}>;

export function useConnection(): UseConnectionReturn {
  const { store } = useBYOMContext();
  const snapshot = useStoreSnapshot();

  const connect = useCallback(async () => {
    store.clearError();
    try {
      await store.client.connect({ appId: "default" });
      store.refreshSnapshot();
    } catch (error) {
      store.setError(error as BYOMSDKError);
      store.refreshSnapshot();
      throw error;
    }
  }, [store]);

  const disconnect = useCallback(async () => {
    try {
      await store.client.disconnect();
    } finally {
      store.refreshSnapshot();
    }
  }, [store]);

  const retry = snapshot.error !== null && (snapshot.error as BYOMSDKError).retryable === true
    ? async () => {
        store.clearError();
        await connect();
      }
    : null;

  return {
    state: snapshot.state,
    sessionId: snapshot.sessionId,
    isConnected: snapshot.state === "connected" || snapshot.state === "degraded",
    isConnecting: snapshot.state === "connecting" || snapshot.state === "reconnecting",
    error: snapshot.error,
    connect,
    disconnect,
    retry,
  };
}
