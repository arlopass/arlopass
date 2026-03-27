"use client";

import type { ReactNode } from "react";
import { useArlopassContext } from "../hooks/use-store.js";

type Props = Readonly<{
  children: ReactNode | (() => ReactNode);
}>;

export function ArlopassNotInstalled({ children }: Props): ReactNode {
  const { transportAvailable } = useArlopassContext();

  if (transportAvailable) return null;

  return typeof children === "function" ? children() : children;
}
