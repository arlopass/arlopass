"use client";

import { useContext, useSyncExternalStore } from "react";
import { ArlopassContext } from "../provider/arlopass-context.js";
import type { ClientSnapshot } from "../store/snapshot.js";
import type { ClientStore } from "../store/client-store.js";

export function useArlopassContext(): { store: ClientStore; transportAvailable: boolean } {
    const ctx = useContext(ArlopassContext);
    if (ctx === null) {
        throw new Error(
            "Arlopass hooks must be used within a <ArlopassProvider>. " +
            "Wrap your component tree with <ArlopassProvider appId=\"...\">.",
        );
    }
    return ctx;
}

export function useStoreSnapshot(): ClientSnapshot {
    const { store } = useArlopassContext();
    return useSyncExternalStore(
        (cb) => store.subscribe(cb),
        () => store.getSnapshot(),
        () => store.getSnapshot(),
    );
}

export function useStoreSelector<T>(selector: (snapshot: ClientSnapshot) => T): T {
    const { store } = useArlopassContext();
    return useSyncExternalStore(
        (cb) => store.subscribe(cb),
        () => selector(store.getSnapshot()),
        () => selector(store.getSnapshot()),
    );
}
