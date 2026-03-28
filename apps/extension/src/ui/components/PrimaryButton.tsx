import { useRef } from "react";
import { triggerClickPing } from "./animation-utils.js";

export type PrimaryButtonProps = {
  children: string;
  onClick?: (() => void) | undefined;
  disabled?: boolean | undefined;
  loading?: boolean | undefined;
  variant?: "primary" | "secondary" | "danger" | undefined;
};

/**
 * Full-width action button with press animation and click-ping effect.
 * Matches the landing page preview button interactions.
 */
export function PrimaryButton({
  children,
  onClick,
  disabled,
  loading,
  variant = "primary",
}: PrimaryButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);

  const handleClick = () => {
    if (disabled || loading) return;
    if (ref.current) triggerClickPing(ref.current);
    onClick?.();
  };

  const baseClasses =
    "w-full py-2 rounded-sm text-[12px]! font-medium border-none cursor-pointer transition-all duration-200 flex items-center justify-center gap-2 active:scale-[0.96]";

  const variantClasses = {
    primary:
      "bg-[var(--color-brand)] text-[var(--ap-text-primary)] hover:bg-[var(--color-brand-hover)]",
    secondary:
      "bg-[var(--ap-bg-surface)] text-[var(--ap-text-primary)] border border-[var(--ap-border)] hover:bg-[var(--ap-bg-elevated)]",
    danger:
      "bg-[var(--color-danger)] text-[var(--ap-text-primary)] hover:bg-[#991b1b]",
  };

  const disabledClasses = "opacity-40 cursor-not-allowed active:scale-100";

  return (
    <button
      ref={ref}
      type="button"
      onClick={handleClick}
      disabled={disabled || loading}
      className={`${baseClasses} ${variantClasses[variant]} ${disabled || loading ? disabledClasses : ""}`}
    >
      {loading && (
        <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin-slow" />
      )}
      {children}
    </button>
  );
}
