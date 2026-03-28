type OnboardingBannerProps = {
  step: number;
  totalSteps: number;
  label: string;
  bridgeConnected?: boolean;
};

export function OnboardingBanner({
  step,
  totalSteps,
  label,
  bridgeConnected,
}: OnboardingBannerProps) {
  return (
    <div className="px-4 py-3 bg-[var(--ap-bg-surface)] border-b border-[var(--ap-border)]">
      <div className="flex items-center gap-1.5">
        {bridgeConnected && (
          <span className="text-xs font-medium text-[var(--color-success)]">
            ✓ Bridge connected ·
          </span>
        )}
        <span className="text-xs font-medium text-[var(--ap-text-primary)]">
          Step {step} of {totalSteps}: {label}
        </span>
      </div>
    </div>
  );
}
