/**
 * Shared animation utilities for the Arlopass extension UI.
 * Matches the landing page preview micro-interactions.
 */

/** CSS transition defaults matching the preview components */
export const transitions = {
  fast: "150ms cubic-bezier(0.25, 1, 0.5, 1)",
  normal: "250ms cubic-bezier(0.25, 1, 0.5, 1)",
  slow: "400ms cubic-bezier(0.16, 1, 0.3, 1)",
} as const;

/** Inline stagger delay for list items */
export function staggerDelay(index: number, baseMs = 50): React.CSSProperties {
  return { animationDelay: `${index * baseMs}ms` };
}


