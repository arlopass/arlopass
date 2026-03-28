"use client";

import { useMemo, type ReactNode } from "react";
import { useStoreSnapshot } from "../hooks/use-store.js";

type ArlopassFeatureGateProps = Readonly<{
  /** Models to check for. */
  models: readonly string[];
  /** If true, ALL models must be available. Default: false (at least one). */
  requireAll?: boolean;
  /** Rendered when the model check fails. Default: null (hides the feature). */
  fallback?: ReactNode;
  children: ReactNode;
}>;

/**
 * Per-feature gate for conditional rendering based on specific model
 * availability. Independent of app-wide model requirements.
 *
 * ```tsx
 * <ArlopassFeatureGate models={["gpt-4o"]} requireAll>
 *   <GPT4oFeature />
 * </ArlopassFeatureGate>
 *
 * <ArlopassFeatureGate models={["claude-sonnet-4", "claude-opus-4"]} fallback={<p>Needs Claude</p>}>
 *   <ClaudeFeature />
 * </ArlopassFeatureGate>
 * ```
 */
export function ArlopassFeatureGate({
  models,
  requireAll = false,
  fallback = null,
  children,
}: ArlopassFeatureGateProps): ReactNode {
  const snapshot = useStoreSnapshot();

  const available = useMemo(() => {
    const allModels = new Set<string>();
    for (const provider of snapshot.providers) {
      for (const model of provider.models) {
        allModels.add(model);
      }
    }

    if (requireAll) {
      return models.every((m) => allModels.has(m));
    }
    return models.length === 0 || models.some((m) => allModels.has(m));
  }, [snapshot.providers, models, requireAll]);

  if (available) {
    return children;
  }

  return fallback;
}
