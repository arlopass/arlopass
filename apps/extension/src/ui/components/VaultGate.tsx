// apps/extension/src/ui/components/VaultGate.tsx
import { useState, type ReactNode } from "react";
import { VaultSetup } from "./VaultSetup.js";
import { VaultUnlock } from "./VaultUnlock.js";
import type { VaultStatus } from "../hooks/useVault.js";
import { PrimaryButton } from "./PrimaryButton.js";

export type VaultGateProps = {
  status: VaultStatus;
  onSetup: (password: string) => Promise<void>;
  onSetupKeychain: () => Promise<void>;
  onUnlock: (password: string) => Promise<void>;
  onUnlockKeychain: () => Promise<void>;
  onDestroyVault: () => Promise<void>;
  onRetry: () => void;
  needsReauth: boolean;
  children: ReactNode;
};

export function VaultGate({
  status,
  onSetup,
  onSetupKeychain,
  onUnlock,
  onUnlockKeychain,
  onDestroyVault,
  onRetry,
  needsReauth,
  children,
}: VaultGateProps) {
  // Auto-lock mid-session: show unlock overlay
  if (
    needsReauth &&
    (status.state === "locked" || status.state === "locked_out")
  ) {
    return (
      <>
        {children}
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ap-bg-base)]/80 backdrop-blur-sm animate-fade-in">
          <div className="w-[320px] bg-[var(--ap-bg-surface)] border border-[var(--ap-border)] rounded-lg p-6 animate-scale-in shadow-xl">
            {status.state === "locked_out" ? (
              <VaultUnlock
                onUnlock={onUnlock}
                lockedOut
                secondsRemaining={status.secondsRemaining}
                compact
              />
            ) : (
              <VaultUnlock onUnlock={onUnlock} compact />
            )}
          </div>
        </div>
      </>
    );
  }

  if (status.state === "connecting") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 animate-fade-in">
        <div className="w-6 h-6 border-2 border-[var(--color-brand)]/30 border-t-[var(--color-brand)] rounded-full animate-spin-slow" />
        <span className="text-xs text-[var(--ap-text-secondary)]">
          Connecting to bridge...
        </span>
      </div>
    );
  }

  if (status.state === "bridge-unavailable") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 px-3 animate-fade-in-up">
        <div className="w-12 h-12 rounded-full bg-[var(--color-danger-subtle)] flex items-center justify-center">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-danger)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <span className="text-base font-semibold text-[var(--ap-text-primary)]">
          Bridge not connected
        </span>
        <span className="text-xs text-[var(--ap-text-secondary)] text-center max-w-[280px]">
          {status.error}
        </span>
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 text-[11px]! font-medium text-[var(--ap-text-primary)] bg-transparent border border-[var(--ap-border)] rounded-sm cursor-pointer hover:bg-[var(--ap-bg-elevated)] hover:border-[var(--ap-border-strong)] transition-all duration-150 active:scale-95 mt-2"
        >
          Retry
        </button>
      </div>
    );
  }

  if (status.state === "uninitialized") {
    return (
      <VaultSetup
        onSetup={onSetup}
        onSetupKeychain={onSetupKeychain}
        {...(status.minPasswordLength !== undefined
          ? { minPasswordLength: status.minPasswordLength }
          : {})}
      />
    );
  }

  if (status.state === "locked") {
    if (status.keyMode === "keychain") {
      if (status.keychainError) {
        return (
          <KeychainErrorView
            error={status.keychainError}
            onRetry={onRetry}
            onDestroyVault={onDestroyVault}
          />
        );
      }
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 animate-fade-in">
          <div className="w-6 h-6 border-2 border-[var(--color-brand)]/30 border-t-[var(--color-brand)] rounded-full animate-spin-slow" />
          <span className="text-xs text-[var(--ap-text-secondary)]">
            Unlocking vault...
          </span>
        </div>
      );
    }
    return <VaultUnlock onUnlock={onUnlock} />;
  }

  if (status.state === "locked_out") {
    return (
      <VaultUnlock
        onUnlock={onUnlock}
        lockedOut
        secondsRemaining={status.secondsRemaining}
      />
    );
  }

  return <>{children}</>;
}

function KeychainErrorView({
  error,
  onRetry,
  onDestroyVault,
}: {
  error: string;
  onRetry: () => void;
  onDestroyVault: () => Promise<void>;
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const isMismatch =
    error.includes("does not match") || error.includes("deleted or replaced");

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 px-3 animate-fade-in-up">
      <div className="w-12 h-12 rounded-full bg-[var(--color-danger-subtle)] flex items-center justify-center">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-danger)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
          <line x1="12" y1="16" x2="12" y2="16.01" />
        </svg>
      </div>
      <span className="text-base font-semibold text-[var(--ap-text-primary)]">
        Keychain unlock failed
      </span>
      <span className="text-xs text-[var(--ap-text-secondary)] text-center max-w-[280px]">
        {error}
      </span>
      <div className="flex gap-2 mt-2">
        {!isMismatch && (
          <button
            type="button"
            onClick={onRetry}
            className="px-3 py-1.5 text-[11px]! font-medium text-[var(--ap-text-primary)] bg-transparent border border-[var(--ap-border)] rounded-sm cursor-pointer hover:bg-[var(--ap-bg-elevated)] transition-all duration-150 active:scale-95"
          >
            Retry
          </button>
        )}
        {!confirmReset ? (
          <PrimaryButton variant="danger" onClick={() => setConfirmReset(true)}>
            Reset vault
          </PrimaryButton>
        ) : (
          <PrimaryButton
            variant="danger"
            loading={resetting}
            onClick={async () => {
              setResetting(true);
              try {
                await onDestroyVault();
              } catch {
                setResetting(false);
              }
            }}
          >
            Confirm — erase all data
          </PrimaryButton>
        )}
      </div>
      {confirmReset && !resetting && (
        <span className="text-[10px] text-[var(--ap-text-secondary)] text-center max-w-[280px]">
          This will permanently delete all saved providers, credentials, and app
          connections. You'll need to set everything up again.
        </span>
      )}
    </div>
  );
}
