"use client";

import type { ReactNode } from "react";
import { useStoreSnapshot } from "../hooks/use-store.js";

type Props = Readonly<{
  children: ReactNode | (() => ReactNode);
}>;

export function ArlopassChatReady({ children }: Props): ReactNode {
  const snapshot = useStoreSnapshot();

  const isConnected =
    snapshot.state === "connected" || snapshot.state === "degraded";
  const hasProvider = snapshot.selectedProvider !== null;

  if (!isConnected || !hasProvider) return null;

  return typeof children === "function" ? children() : children;
}
