import type { ReactNode } from "react";

export type PopupShellProps = {
  children: ReactNode;
};

/**
 * Root container for the extension popup.
 * 360px fixed width, full viewport height, warm stone surface.
 * Matches the landing page preview card aesthetic.
 */
export function PopupShell({ children }: PopupShellProps) {
  return (
    <div className="w-[360px] min-w-[360px] max-w-[360px] h-screen max-h-screen bg-[var(--ap-bg-base)] p-2.5 overflow-hidden">
      <div className="flex flex-col h-full bg-[var(--ap-bg-surface)] border border-[var(--ap-border)] rounded-lg overflow-hidden">
        {children}
      </div>
    </div>
  );
}
