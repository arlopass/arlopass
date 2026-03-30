"use client";

import type { ReactNode } from "react";
import { useArlopassContext } from "../hooks/use-store.js";

export type ArlopassExtensionGateProps = Readonly<{
  /**
   * Rendered when the Arlopass extension is not installed.
   * Use for per-feature "this feature requires Arlopass" prompts.
   * Default: null (hides the feature silently).
   */
  fallback?: ReactNode | ((props: { installUrl: string }) => ReactNode);
  /** Extension install URL. Default: "https://arlopass.com/install". */
  installUrl?: string;
  children: ReactNode;
}>;

/**
 * Feature-level gate that hides or replaces a feature when the Arlopass
 * extension is not installed.  Unlike `ArlopassRequiredGate` (which blocks
 * the entire app), this gate is for individual features that need Arlopass.
 *
 * ```tsx
 * <ArlopassExtensionGate
 *   fallback={({ installUrl }) => (
 *     <div>
 *       <p>This feature requires Arlopass.</p>
 *       <ArlopassInstallButton installUrl={installUrl} />
 *     </div>
 *   )}
 * >
 *   <AIPoweredSearch />
 * </ArlopassExtensionGate>
 *
 * {/* Or hide silently: *\/}
 * <ArlopassExtensionGate>
 *   <AIChatWidget />
 * </ArlopassExtensionGate>
 * ```
 */
export function ArlopassExtensionGate({
  fallback = null,
  installUrl = "https://arlopass.com/install",
  children,
}: ArlopassExtensionGateProps): ReactNode {
  const { transportAvailable } = useArlopassContext();

  if (transportAvailable) {
    return children;
  }

  return typeof fallback === "function" ? fallback({ installUrl }) : fallback;
}
