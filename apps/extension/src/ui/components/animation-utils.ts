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

/** Creates a click-ping effect on a button element */
export function triggerClickPing(button: HTMLElement): void {
  const rect = button.getBoundingClientRect();
  const ping = document.createElement("div");
  
  Object.assign(ping.style, {
    position: "fixed",
    left: `${rect.left + rect.width / 2}px`,
    top: `${rect.top + rect.height / 2}px`,
    width: "8px",
    height: "8px",
    marginLeft: "-4px",
    marginTop: "-4px",
    borderRadius: "50%",
    background: "var(--color-brand)",
    opacity: "0.5",
    pointerEvents: "none",
    zIndex: "9999",
  });
  
  const wave = document.createElement("div");
  Object.assign(wave.style, {
    position: "fixed",
    left: `${rect.left + rect.width / 2}px`,
    top: `${rect.top + rect.height / 2}px`,
    width: "8px",
    height: "8px",
    marginLeft: "-4px",
    marginTop: "-4px",
    borderRadius: "50%",
    border: "2px solid var(--color-brand)",
    opacity: "0",
    pointerEvents: "none",
    zIndex: "9999",
    animation: "ping-wave 600ms cubic-bezier(0, 0, 0.2, 1) forwards",
  });
  
  document.body.appendChild(ping);
  document.body.appendChild(wave);
  
  setTimeout(() => {
    ping.remove();
    wave.remove();
  }, 700);
}
