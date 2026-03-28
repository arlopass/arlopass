"use client";

import { createContext } from "react";
import type { ClientStore } from "../store/client-store.js";
import type { ModelRequirements } from "../types.js";

export type ArlopassContextValue = Readonly<{
    store: ClientStore;
    transportAvailable: boolean;
    modelRequirements: ModelRequirements | null;
}> | null;

export const ArlopassContext = createContext<ArlopassContextValue>(null);
