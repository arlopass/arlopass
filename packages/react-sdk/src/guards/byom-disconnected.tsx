"use client";

import type { ReactNode } from "react";
import { useStoreSnapshot } from "../hooks/use-store.js";

type Props = Readonly<{
  children: ReactNode | (() => ReactNode);
}>;

export function BYOMDisconnected({ children }: Props): ReactNode {
  const snapshot = useStoreSnapshot();

  if (snapshot.state === "connected" || snapshot.state === "degraded") {
    return null;
  }

  return typeof children === "function" ? children() : children;
}
