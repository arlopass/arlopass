"use client";

import { createContext } from "react";
import type { ClientStore } from "../store/client-store.js";

export type ArlopassContextValue = Readonly<{
    store: ClientStore;
    transportAvailable: boolean;
}> | null;

export const ArlopassContext = createContext<ArlopassContextValue>(null);
