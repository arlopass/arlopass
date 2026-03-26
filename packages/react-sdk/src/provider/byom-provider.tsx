"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { BYOMClient } from "@byom-ai/web-sdk";
import type { BYOMSDKError } from "@byom-ai/web-sdk";
import { ClientStore } from "../store/client-store.js";
import { getInjectedTransport } from "../transport/injected.js";
import { BYOMContext, type BYOMContextValue } from "./byom-context.js";
import type { BYOMProviderProps } from "../types.js";

export function BYOMProvider({
  appId,
  defaultProvider,
  defaultModel,
  autoConnect = true,
  onError,
  children,
}: BYOMProviderProps): ReactNode {
  const storeRef = useRef<ClientStore | null>(null);
  const transportAvailableRef = useRef(false);

  if (storeRef.current === null) {
    const transport = getInjectedTransport();
    transportAvailableRef.current = transport !== null;

    if (transport !== null) {
      const client = new BYOMClient(
        typeof window !== "undefined"
          ? { transport, origin: window.location.origin }
          : { transport },
      );
      storeRef.current = new ClientStore(client);
    } else {
      const dummyTransport = {
        async request() { throw new Error("BYOM extension not installed."); },
        async stream() { throw new Error("BYOM extension not installed."); },
      };
      const client = new BYOMClient({ transport: dummyTransport });
      storeRef.current = new ClientStore(client);
    }
  }

  const store = storeRef.current;
  const transportAvailable = transportAvailableRef.current;

  useEffect(() => {
    if (!autoConnect || !transportAvailable || store === null) return;

    let cancelled = false;

    async function connectAndSelect(): Promise<void> {
      try {
        await store!.client.connect({ appId });
        store!.refreshSnapshot();

        if (!cancelled && defaultProvider !== undefined && defaultModel !== undefined) {
          try {
            await store!.client.selectProvider({ providerId: defaultProvider, modelId: defaultModel });
            store!.refreshSnapshot();
          } catch (selectError) {
            store!.setError(selectError as BYOMSDKError);
            onError?.(selectError as BYOMSDKError);
          }
        }
      } catch (connectError) {
        if (!cancelled) {
          store!.setError(connectError as BYOMSDKError);
          store!.refreshSnapshot();
          onError?.(connectError as BYOMSDKError);
        }
      }
    }

    void connectAndSelect();
    return () => { cancelled = true; };
  }, [appId, autoConnect, defaultModel, defaultProvider, onError, store, transportAvailable]);

  useEffect(() => {
    return () => {
      if (store !== null) {
        void store.client.disconnect().catch(() => {});
        store.destroy();
      }
    };
  }, [store]);

  const contextValue = useMemo<BYOMContextValue>(
    () => ({ store, transportAvailable }),
    [store, transportAvailable],
  );

  return <BYOMContext.Provider value={contextValue}>{children}</BYOMContext.Provider>;
}
