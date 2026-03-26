"use client";

import type { ReactNode } from "react";
import type { BYOMSDKError } from "@byom-ai/web-sdk";
import { useBYOMContext, useStoreSnapshot } from "../hooks/use-store.js";
import { useConnection } from "../hooks/use-connection.js";

type Props = Readonly<{
  connectingFallback?: ReactNode;
  notInstalledFallback?: ReactNode;
  providerFallback?: ReactNode;
  errorFallback?: (props: { error: BYOMSDKError; retry: (() => Promise<void>) | null }) => ReactNode;
  children: ReactNode;
}>;

export function BYOMChatReadyGate({
  connectingFallback = null,
  notInstalledFallback,
  providerFallback = null,
  errorFallback,
  children,
}: Props): ReactNode {
  const { transportAvailable } = useBYOMContext();
  const snapshot = useStoreSnapshot();
  const { retry } = useConnection();

  if (!transportAvailable && notInstalledFallback !== undefined) {
    return notInstalledFallback;
  }

  const isConnected = snapshot.state === "connected" || snapshot.state === "degraded";

  if (!isConnected) {
    if (
      snapshot.state === "failed" &&
      snapshot.error !== null &&
      errorFallback !== undefined
    ) {
      return errorFallback({ error: snapshot.error, retry });
    }
    return connectingFallback;
  }

  if (snapshot.selectedProvider === null) {
    return providerFallback;
  }

  return children;
}
