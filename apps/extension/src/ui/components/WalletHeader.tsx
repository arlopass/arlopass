import { IconChevronLeft, IconSettings } from "@tabler/icons-react";

export type HeaderMenuItem = {
  label: string;
  subtitle?: string | undefined;
  active?: boolean | undefined;
  onClick: () => void;
};

export type WalletHeaderProps = {
  title: string;
  subtitle?: string | undefined;
  /** Clickable link above the title to navigate elsewhere (e.g. "Go to Wallet →") */
  navLink?: { label: string; onClick: () => void } | undefined;
  /** Back button handler — shows a ← arrow */
  onBack?: (() => void) | undefined;
  /** Step indicator text (e.g. "Step 1 of 3") */
  stepLabel?: string | undefined;
  collapsed?: boolean | undefined;
  onToggleCollapse?: (() => void) | undefined;
  onSettingsClick?: (() => void) | undefined;
  menuItems?: readonly HeaderMenuItem[] | undefined;
};

export function WalletHeader({
  title,
  subtitle,
  navLink,
  onBack,
  stepLabel,
  collapsed,
  onToggleCollapse,
  onSettingsClick,
  menuItems,
}: WalletHeaderProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 bg-[var(--ap-bg-surface)] border-b border-[var(--ap-border)] shrink-0 animate-fade-in gap-3">
      {/* Left side: back/collapse + title stack */}
      <div className="flex items-center gap-2 overflow-hidden min-w-0 flex-1">
        {/* Back button or collapse toggle */}
        {onBack != null ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Go back"
            className="flex items-center justify-center w-6 h-6 rounded-sm bg-transparent border-none cursor-pointer text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] hover:bg-[var(--ap-bg-elevated)] transition-all duration-150 active:scale-95 shrink-0"
          >
            <IconChevronLeft size={16} aria-hidden />
          </button>
        ) : null}

        {/* Title + nav link */}
        <div className="flex flex-col min-w-0 overflow-hidden">
          {navLink != null && (
            <button
              type="button"
              onClick={navLink.onClick}
              className="text-[10px]! font-medium text-[var(--color-brand)] bg-transparent border-none cursor-pointer p-0 text-left truncate hover:underline transition-colors duration-150"
            >
              {navLink.label}
            </button>
          )}
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-sm font-semibold text-[var(--ap-text-primary)] truncate leading-tight">
              {title}
            </span>
            {subtitle != null && (
              <span className="text-[9px] text-[var(--ap-text-secondary)] truncate leading-tight shrink-0">
                {subtitle}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right side: step label + settings */}
      <div className="flex items-center gap-2 shrink-0">
        {stepLabel != null && (
          <span className="text-[9px] text-[var(--ap-text-tertiary)] whitespace-nowrap">
            {stepLabel}
          </span>
        )}
        {onSettingsClick != null && (
          <button
            type="button"
            onClick={onSettingsClick}
            aria-label="Settings"
            className="flex items-center justify-center w-7 h-7 rounded-md bg-transparent border-none cursor-pointer text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] hover:bg-[var(--ap-bg-elevated)] transition-all duration-150 active:scale-95"
          >
            <IconSettings size={16} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
