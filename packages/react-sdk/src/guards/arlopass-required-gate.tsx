"use client";

import type { ReactNode } from "react";
import { useArlopassContext } from "../hooks/use-store.js";

export type ArlopassRequiredGateProps = Readonly<{
  /**
   * Rendered when the Arlopass extension is not installed.
   * This is the full-page "you need Arlopass" experience.
   * Receives `installUrl` as a convenience.
   */
  fallback: ReactNode | ((props: { installUrl: string }) => ReactNode);
  /** Extension install URL. Default: "https://arlopass.com/install". */
  installUrl?: string;
  children: ReactNode;
}>;

/**
 * App-level gate that blocks the entire app when the Arlopass extension
 * is not installed.  Unlike `ArlopassConnectionGate` (which also checks
 * connection state), this gate ONLY checks for extension presence.
 *
 * Use this at the top of your app when _everything_ depends on Arlopass:
 *
 * ```tsx
 * <ArlopassProvider appId="my-app">
 *   <ArlopassRequiredGate
 *     fallback={({ installUrl }) => (
 *       <FullPageInstallPrompt url={installUrl} />
 *     )}
 *   >
 *     <App />
 *   </ArlopassRequiredGate>
 * </ArlopassProvider>
 * ```
 */
export function ArlopassRequiredGate({
  fallback,
  installUrl = "https://arlopass.com/install",
  children,
}: ArlopassRequiredGateProps): ReactNode {
  const { transportAvailable } = useArlopassContext();

  if (transportAvailable) {
    return children;
  }

  return typeof fallback === "function" ? fallback({ installUrl }) : fallback;
}
