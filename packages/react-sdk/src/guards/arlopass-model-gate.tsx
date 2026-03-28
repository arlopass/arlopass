"use client";

import type { ReactNode } from "react";
import type { ModelAvailabilityStatus, ModelRequirements } from "../types.js";
import { useModelAvailability } from "../hooks/use-model-availability.js";

type ArlopassModelGateProps = Readonly<{
  /** Rendered when model requirements aren't met. */
  fallback: ReactNode | ((status: ModelAvailabilityStatus) => ReactNode);
  /** Override supported models (defaults to ArlopassProvider's supportedModels). */
  supported?: readonly string[];
  /** Override required models (defaults to ArlopassProvider's requiredModels). */
  required?: readonly string[];
  children: ReactNode;
}>;

/**
 * App-wide gate that blocks rendering until the user's providers satisfy
 * the declared model requirements.
 *
 * Without `supported`/`required` props, uses the app-wide requirements
 * from `<ArlopassProvider>`.
 */
export function ArlopassModelGate({
  fallback,
  supported,
  required,
  children,
}: ArlopassModelGateProps): ReactNode {
  const override: ModelRequirements | undefined =
    supported !== undefined || required !== undefined
      ? {
          ...(supported !== undefined ? { supported } : {}),
          ...(required !== undefined ? { required } : {}),
        }
      : undefined;

  const status = useModelAvailability(override);

  if (status.satisfied) {
    return children;
  }

  return typeof fallback === "function" ? fallback(status) : fallback;
}
