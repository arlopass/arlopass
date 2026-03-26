"use client";

import type { ReactNode } from "react";
import type { BYOMSDKError } from "@byom-ai/web-sdk";
import { useBYOMContext, useStoreSnapshot } from "../hooks/use-store.js";
import { useConnection } from "../hooks/use-connection.js";

type Props = Readonly<{
  fallback?: ReactNode;
  errorFallback?: (props: { error: BYOMSDKError; retry: (() => Promise<void>) | null }) => ReactNode;
  notInstalledFallback?: ReactNode;
  children: ReactNode;
}>;

export function BYOMConnectionGate({
  fallback = null,
  errorFallback,
  notInstalledFallback,
  children,
}: Props): ReactNode {
  const { transportAvailable } = useBYOMContext();
  const snapshot = useStoreSnapshot();
  const { retry } = useConnection();

  if (!transportAvailable && notInstalledFallback !== undefined) {
    return notInstalledFallback;
  }

  if (snapshot.state === "connected" || snapshot.state === "degraded") {
    return children;
  }

  if (
    snapshot.state === "failed" &&
    snapshot.error !== null &&
    errorFallback !== undefined
  ) {
    return errorFallback({ error: snapshot.error, retry });
  }

  return fallback;
}
