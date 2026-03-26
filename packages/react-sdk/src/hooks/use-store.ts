"use client";

import { useContext, useSyncExternalStore } from "react";
import { BYOMContext } from "../provider/byom-context.js";
import type { ClientSnapshot } from "../store/snapshot.js";
import type { ClientStore } from "../store/client-store.js";

export function useBYOMContext(): { store: ClientStore; transportAvailable: boolean } {
  const ctx = useContext(BYOMContext);
  if (ctx === null) {
    throw new Error(
      "BYOM hooks must be used within a <BYOMProvider>. " +
      "Wrap your component tree with <BYOMProvider appId=\"...\">.",
    );
  }
  return ctx;
}

export function useStoreSnapshot(): ClientSnapshot {
  const { store } = useBYOMContext();
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  );
}

export function useStoreSelector<T>(selector: (snapshot: ClientSnapshot) => T): T {
  const { store } = useBYOMContext();
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => selector(store.getSnapshot()),
    () => selector(store.getSnapshot()),
  );
}
