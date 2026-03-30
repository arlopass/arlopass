"use client";

import type { ReactNode, CSSProperties, MouseEvent } from "react";

const DEFAULT_INSTALL_URL = "https://arlopass.com/install";

export type ArlopassInstallButtonProps = Readonly<{
  /** URL to the extension store page. */
  installUrl?: string;
  /** Open in new tab. Default: true. */
  newTab?: boolean;
  /** Button label. Default: "Install Arlopass". */
  children?: ReactNode;
  /** CSS class for the button. */
  className?: string;
  /** Inline styles. */
  style?: CSSProperties;
  /** Called when clicked, receives the event. */
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
}>;

/**
 * Styled anchor button that links to the Arlopass extension install page.
 * Use inside `<ArlopassNotInstalled>` or any "not installed" fallback.
 *
 * ```tsx
 * <ArlopassNotInstalled>
 *   <p>You need the Arlopass extension.</p>
 *   <ArlopassInstallButton />
 * </ArlopassNotInstalled>
 * ```
 */
export function ArlopassInstallButton({
  installUrl = DEFAULT_INSTALL_URL,
  newTab = true,
  children,
  className,
  style,
  onClick,
}: ArlopassInstallButtonProps): ReactNode {
  return (
    <a
      href={installUrl}
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noopener noreferrer" : undefined}
      role="button"
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 20px",
        borderRadius: 8,
        fontWeight: 600,
        fontSize: 14,
        textDecoration: "none",
        cursor: "pointer",
        ...style,
      }}
      onClick={onClick}
    >
      {children ?? "Install Arlopass"}
    </a>
  );
}
