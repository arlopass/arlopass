"use client";

import type { ReactNode } from "react";
import { useBYOMContext } from "../hooks/use-store.js";

type Props = Readonly<{
  children: ReactNode | (() => ReactNode);
}>;

export function BYOMNotInstalled({ children }: Props): ReactNode {
  const { transportAvailable } = useBYOMContext();

  if (transportAvailable) return null;

  return typeof children === "function" ? children() : children;
}
