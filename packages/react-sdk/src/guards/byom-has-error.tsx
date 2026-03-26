"use client";

import type { ReactNode } from "react";
import type { BYOMSDKError } from "@byom-ai/web-sdk";
import { useStoreSnapshot } from "../hooks/use-store.js";
import { useConnection } from "../hooks/use-connection.js";

type Props = Readonly<{
  children: (props: { error: BYOMSDKError; retry: (() => Promise<void>) | null }) => ReactNode;
}>;

export function BYOMHasError({ children }: Props): ReactNode {
  const snapshot = useStoreSnapshot();
  const { retry } = useConnection();

  if (snapshot.error === null) return null;

  return children({ error: snapshot.error, retry });
}
