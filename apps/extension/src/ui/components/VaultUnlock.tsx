import { useState, useCallback, useEffect } from "react";
import { PasswordInput } from "@mantine/core";
import { PrimaryButton } from "./PrimaryButton.js";

export type VaultUnlockProps = {
  onUnlock: (password: string) => Promise<void>;
  lockedOut?: boolean;
  secondsRemaining?: number;
  compact?: boolean;
};

export function VaultUnlock({
  onUnlock,
  lockedOut,
  secondsRemaining: initialSeconds,
  compact,
}: VaultUnlockProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(initialSeconds ?? 0);

  useEffect(() => {
    if (!lockedOut || countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockedOut, countdown]);

  const handleSubmit = useCallback(async () => {
    if (password.length === 0 || (lockedOut && countdown > 0)) return;
    setLoading(true);
    setError(null);
    try {
      await onUnlock(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unlock failed.");
      setPassword("");
    } finally {
      setLoading(false);
    }
  }, [password, onUnlock, lockedOut, countdown]);

  const isDisabled =
    password.length === 0 || (lockedOut === true && countdown > 0);

  return (
    <div
      className={`flex flex-col items-center px-3 animate-fade-in-up ${compact ? "gap-3" : "pt-12 min-h-[400px] gap-4"}`}
    >
      {/* Lock icon */}
      {!compact && (
        <div className="w-14 h-14 rounded-full bg-[var(--ap-brand-subtle)] border border-[var(--color-brand)]/20 flex items-center justify-center mb-2">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-brand)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </div>
      )}

      <h2
        className={`font-bold text-[var(--ap-text-primary)] ${compact ? "text-sm" : "text-lg"}`}
      >
        Unlock your vault
      </h2>
      {!compact && (
        <p className="text-xs text-[var(--ap-text-secondary)] text-center max-w-[280px]">
          Enter your master password to access your providers and credentials.
        </p>
      )}

      <div className="flex flex-col gap-3 w-full max-w-[280px]">
        {lockedOut === true && countdown > 0 ? (
          <div className="flex items-center gap-2 py-3 px-3 bg-[var(--color-warning-subtle)] border border-[var(--color-warning)]/20 rounded-md animate-fade-in">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-warning)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span className="text-xs text-[var(--color-warning)]">
              Too many failed attempts. Try again in {countdown}s.
            </span>
          </div>
        ) : (
          <PasswordInput
            label="Master password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSubmit();
            }}
            autoFocus
            size="xs"
            styles={{
              label: {
                color: "var(--ap-text-body)",
                fontSize: 11,
                fontWeight: 500,
                marginBottom: 4,
              },
              input: {
                background: "var(--ap-bg-base)",
                borderColor: "var(--ap-border)",
                color: "var(--ap-text-primary)",
                fontSize: 12,
                "&:focus": { borderColor: "var(--color-brand)" },
              },
            }}
          />
        )}

        {error !== null && (
          <span className="text-[10px] text-[var(--color-danger)] animate-fade-in">
            {error}
          </span>
        )}

        <PrimaryButton
          onClick={() => void handleSubmit()}
          disabled={isDisabled}
          loading={loading}
        >
          Unlock
        </PrimaryButton>
      </div>
    </div>
  );
}
