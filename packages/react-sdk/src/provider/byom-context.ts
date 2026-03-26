"use client";

import { createContext } from "react";
import type { ClientStore } from "../store/client-store.js";

export type BYOMContextValue = Readonly<{
  store: ClientStore;
  transportAvailable: boolean;
}> | null;

export const BYOMContext = createContext<BYOMContextValue>(null);
