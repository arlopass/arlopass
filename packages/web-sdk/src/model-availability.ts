import type {
    ModelAvailabilityStatus,
    ModelRequirements,
    ProviderDescriptor,
} from "./types.js";

/**
 * Checks whether the user's available providers satisfy the app's model
 * requirements.  Pure function — no side effects, no network calls.
 *
 * @param providers - The provider descriptors from `listProviders()`.
 * @param requirements - The app's declared model requirements.
 * @returns A detailed availability status.
 */
export function checkModelAvailability(
    providers: readonly ProviderDescriptor[],
    requirements: ModelRequirements,
): ModelAvailabilityStatus {
    const allModels = new Set<string>();
    for (const provider of providers) {
        for (const model of provider.models) {
            allModels.add(model);
        }
    }

    const supported = requirements.supported ?? [];
    const required = requirements.required ?? [];

    const availableSupported: string[] = [];
    const missingSupported: string[] = [];
    for (const model of supported) {
        if (allModels.has(model)) {
            availableSupported.push(model);
        } else {
            missingSupported.push(model);
        }
    }

    const availableRequired: string[] = [];
    const missingRequired: string[] = [];
    for (const model of required) {
        if (allModels.has(model)) {
            availableRequired.push(model);
        } else {
            missingRequired.push(model);
        }
    }

    const hasSupportedModel =
        supported.length === 0 || availableSupported.length > 0;
    const hasAllRequired =
        required.length === 0 || missingRequired.length === 0;
    const satisfied = hasSupportedModel && hasAllRequired;

    return {
        satisfied,
        availableSupported,
        missingSupported,
        availableRequired,
        missingRequired,
        hasSupportedModel,
        hasAllRequired,
    };
}
