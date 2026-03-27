"use client";

import type { ArlopassClient } from "@arlopass/web-sdk";
import { useArlopassContext, useStoreSnapshot } from "./use-store.js";

export function useClient(): ArlopassClient | null {
    const { store, transportAvailable } = useArlopassContext();
    const snapshot = useStoreSnapshot();

    if (!transportAvailable) return null;
    if (snapshot.state === "disconnected" || snapshot.state === "failed") return null;
    return store.client;
}
