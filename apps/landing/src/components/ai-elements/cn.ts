/**
 * Simple class name merge utility.
 * Filters falsy values and joins with spaces.
 */
export function cn(
    ...inputs: (string | undefined | false | null)[]
): string {
    return inputs.filter(Boolean).join(" ");
}
