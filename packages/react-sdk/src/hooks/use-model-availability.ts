"use client";

import { useMemo } from "react";
import { checkModelAvailability } from "@arlopass/web-sdk";
import type { ModelAvailabilityStatus, ModelRequirements } from "../types.js";
import { useArlopassContext, useStoreSnapshot } from "./use-store.js";

/**
 * Checks whether the user's available providers satisfy model requirements.
 *
 * Without arguments, uses the app-wide `supportedModels` / `requiredModels`
 * from `<ArlopassProvider>`. Pass an override to check per-feature requirements.
 *
 * Recomputes reactively when the provider list changes.
 */
export function useModelAvailability(
    override?: ModelRequirements,
): ModelAvailabilityStatus {
    const { modelRequirements } = useArlopassContext();
    const snapshot = useStoreSnapshot();

    const requirements = override ?? modelRequirements;

    return useMemo(() => {
        if (requirements === null || requirements === undefined) {
            // No requirements specified — everything is satisfied
            return {
                satisfied: true,
                availableSupported: [],
                missingSupported: [],
                availableRequired: [],
                missingRequired: [],
                hasSupportedModel: true,
                hasAllRequired: true,
            };
        }

        return checkModelAvailability(snapshot.providers, requirements);
    }, [snapshot.providers, requirements]);
}
