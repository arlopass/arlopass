import { PrimaryButton } from "../PrimaryButton.js";

export type ApproveStepProps = {
  origin: string;
  displayName: string;
  iconUrl?: string | undefined;
  description?: string | undefined;
  supportedModels?: readonly string[] | undefined;
  requiredModels?: readonly string[] | undefined;
  onApprove: () => void;
  onDecline: () => void;
};

/**
 * Connection approval screen matching the AppConnectionApproval landing preview.
 * Centered layout with app info, badge, and dual action buttons.
 */
export function ApproveStep({
  origin,
  displayName,
  iconUrl,
  description,
  supportedModels,
  requiredModels,
  onApprove,
  onDecline,
}: ApproveStepProps) {
  const hasModelRequirements =
    (supportedModels !== undefined && supportedModels.length > 0) ||
    (requiredModels !== undefined && requiredModels.length > 0);

  return (
    <>
      <div className="flex-1 flex items-center justify-center animate-fade-in-up">
        <div className="flex flex-col items-center gap-4 max-w-[300px]">
          {/* App icon */}
          {iconUrl ? (
            <img
              src={iconUrl}
              alt=""
              width={48}
              height={48}
              className="rounded-lg"
            />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-[var(--ap-bg-elevated)] border border-[var(--ap-border)] flex items-center justify-center">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--ap-text-secondary)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </div>
          )}

          {/* "New request" badge */}
          <span className="px-2 py-0.5 text-[9px] font-semibold bg-[var(--color-brand)]/10 text-[var(--color-brand)] border border-[var(--color-brand)]/20 rounded-full">
            New request
          </span>

          <h3 className="text-base font-semibold text-[var(--ap-text-primary)] text-center">
            {displayName}
          </h3>
          <span className="text-[10px] text-[var(--ap-text-secondary)] text-center font-mono">
            {origin}
          </span>
          {description && (
            <span className="text-[10px] text-[var(--ap-text-secondary)] text-center">
              {description}
            </span>
          )}
          <span className="text-xs text-[var(--ap-text-secondary)] text-center">
            This app wants to connect to your Arlopass wallet to use AI
            providers and models.
          </span>

          {/* Model requirements */}
          {hasModelRequirements && (
            <div className="flex flex-col gap-2 w-full">
              {requiredModels !== undefined && requiredModels.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-semibold text-[var(--ap-text-secondary)] uppercase tracking-wide">
                    Required models
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {requiredModels.map((m) => (
                      <span
                        key={m}
                        className="px-1.5 py-0.5 text-[9px] bg-[var(--color-danger-subtle)] text-[var(--color-danger)] border border-[var(--color-danger)]/20 rounded-sm"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {supportedModels !== undefined && supportedModels.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-semibold text-[var(--ap-text-secondary)] uppercase tracking-wide">
                    Supported models
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {supportedModels.map((m) => (
                      <span
                        key={m}
                        className="px-1.5 py-0.5 text-[9px] bg-[var(--ap-brand-subtle)] text-[var(--color-brand)] border border-[var(--color-brand)]/20 rounded-sm"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-2">
        <PrimaryButton onClick={onApprove}>Allow connection</PrimaryButton>
        <PrimaryButton variant="secondary" onClick={onDecline}>
          Decline
        </PrimaryButton>
      </div>
    </>
  );
}
