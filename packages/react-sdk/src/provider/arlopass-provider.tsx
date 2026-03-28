"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { ArlopassClient } from "@arlopass/web-sdk";
import type { ArlopassSDKError } from "@arlopass/web-sdk";
import { ClientStore } from "../store/client-store.js";
import { getInjectedTransport } from "../transport/injected.js";
import {
  ArlopassContext,
  type ArlopassContextValue,
} from "./arlopass-context.js";
import type { ArlopassProviderProps } from "../types.js";

export function ArlopassProvider({
  appId,
  appSuffix,
  appName,
  appDescription,
  appIcon,
  defaultProvider,
  defaultModel,
  supportedModels,
  requiredModels,
  autoConnect = true,
  onError,
  children,
}: ArlopassProviderProps): ReactNode {
  const storeRef = useRef<ClientStore | null>(null);
  const transportAvailableRef = useRef(false);

  if (storeRef.current === null) {
    const transport = getInjectedTransport();
    transportAvailableRef.current = transport !== null;

    if (transport !== null) {
      const client = new ArlopassClient(
        typeof window !== "undefined"
          ? { transport, origin: window.location.origin }
          : { transport },
      );
      storeRef.current = new ClientStore(client);
    } else {
      const dummyTransport = {
        async request() {
          throw new Error("Arlopass extension not installed.");
        },
        async stream() {
          throw new Error("Arlopass extension not installed.");
        },
      };
      const client = new ArlopassClient({ transport: dummyTransport });
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
        await store!.client.connect({
          ...(appId !== undefined ? { appId } : {}),
          ...(appSuffix !== undefined ? { appSuffix } : {}),
          ...(appName !== undefined ? { appName } : {}),
          ...(appDescription !== undefined ? { appDescription } : {}),
          ...(appIcon !== undefined ? { appIcon } : {}),
          ...(supportedModels !== undefined ? { supportedModels } : {}),
          ...(requiredModels !== undefined ? { requiredModels } : {}),
        });
        store!.refreshSnapshot();

        if (
          !cancelled &&
          defaultProvider !== undefined &&
          defaultModel !== undefined
        ) {
          try {
            await store!.client.selectProvider({
              providerId: defaultProvider,
              modelId: defaultModel,
            });
            store!.refreshSnapshot();
          } catch (selectError) {
            store!.setError(selectError as ArlopassSDKError);
            onError?.(selectError as ArlopassSDKError);
          }
        }
      } catch (connectError) {
        if (!cancelled) {
          store!.setError(connectError as ArlopassSDKError);
          store!.refreshSnapshot();
          onError?.(connectError as ArlopassSDKError);
        }
      }
    }

    void connectAndSelect();
    return () => {
      cancelled = true;
    };
  }, [
    appId,
    appSuffix,
    appName,
    appDescription,
    appIcon,
    autoConnect,
    defaultModel,
    defaultProvider,
    supportedModels,
    requiredModels,
    onError,
    store,
    transportAvailable,
  ]);

  useEffect(() => {
    return () => {
      if (store !== null) {
        void store.client.disconnect().catch(() => {});
        store.destroy();
      }
    };
  }, [store]);

  const modelRequirements = useMemo(() => {
    if (supportedModels === undefined && requiredModels === undefined)
      return null;
    return {
      ...(supportedModels !== undefined ? { supported: supportedModels } : {}),
      ...(requiredModels !== undefined ? { required: requiredModels } : {}),
    };
  }, [supportedModels, requiredModels]);

  const contextValue = useMemo<ArlopassContextValue>(
    () => ({ store, transportAvailable, modelRequirements }),
    [store, transportAvailable, modelRequirements],
  );

  return (
    <ArlopassContext.Provider value={contextValue}>
      {children}
    </ArlopassContext.Provider>
  );
}
