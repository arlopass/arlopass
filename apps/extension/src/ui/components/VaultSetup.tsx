// apps/extension/src/ui/components/VaultSetup.tsx
import { useState, useCallback } from "react";
import { PasswordInput } from "@mantine/core";
import { PrimaryButton } from "./PrimaryButton.js";

export type VaultSetupProps = {
  onSetup: (password: string) => Promise<void>;
  onSetupKeychain: () => Promise<void>;
  minPasswordLength?: number;
};

export function VaultSetup({
  onSetup,
  onSetupKeychain,
  minPasswordLength = 8,
}: VaultSetupProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [keychainLoading, setKeychainLoading] = useState(false);

  const passwordsMatch = password.length > 0 && password === confirm;
  const passwordTooShort =
    password.length > 0 && password.length < minPasswordLength;

  const handleSubmit = useCallback(async () => {
    if (!passwordsMatch || passwordTooShort) return;
    setLoading(true);
    setError(null);
    try {
      await onSetup(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed.");
    } finally {
      setLoading(false);
    }
  }, [password, passwordsMatch, passwordTooShort, onSetup]);

  const handleKeychain = useCallback(async () => {
    setKeychainLoading(true);
    setError(null);
    try {
      await onSetupKeychain();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Keychain setup failed.");
    } finally {
      setKeychainLoading(false);
    }
  }, [onSetupKeychain]);

  return (
    <div className="flex flex-col items-center px-3 pt-8 min-h-[400px] animate-fade-in-up">
      {/* Shield icon */}
      <div className="w-14 h-14 rounded-full bg-[var(--ap-brand-subtle)] border border-[var(--color-brand)]/20 flex items-center justify-center mb-5">
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
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      </div>

      <h2 className="text-lg font-bold text-[var(--ap-text-primary)] mb-2">
        Set up your vault
      </h2>
      <p className="text-xs text-[var(--ap-text-secondary)] text-center max-w-[280px] mb-6">
        Your credentials are encrypted at rest. Choose how to protect the
        encryption key.
      </p>

      <div className="flex flex-col gap-3 w-full max-w-[280px]">
        <PasswordInput
          label="Master password"
          placeholder={`At least ${minPasswordLength} characters`}
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          error={
            passwordTooShort
              ? `Must be at least ${minPasswordLength} characters`
              : undefined
          }
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
        <PasswordInput
          label="Confirm password"
          placeholder="Re-enter your password"
          value={confirm}
          onChange={(e) => setConfirm(e.currentTarget.value)}
          error={
            confirm.length > 0 && !passwordsMatch
              ? "Passwords don't match"
              : undefined
          }
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

        {error !== null && (
          <span className="text-[10px] text-[var(--color-danger)] animate-fade-in">
            {error}
          </span>
        )}

        <PrimaryButton
          onClick={handleSubmit}
          disabled={!passwordsMatch || passwordTooShort || keychainLoading}
          loading={loading}
        >
          Create vault with password
        </PrimaryButton>

        {/* Divider */}
        <div className="flex items-center gap-3 my-1">
          <div className="flex-1 h-px bg-[var(--ap-border)]" />
          <span className="text-[10px] text-[var(--ap-text-tertiary)]">or</span>
          <div className="flex-1 h-px bg-[var(--ap-border)]" />
        </div>

        <PrimaryButton
          variant="secondary"
          onClick={handleKeychain}
          disabled={loading}
          loading={keychainLoading}
        >
          Use OS keychain instead
        </PrimaryButton>

        <p className="text-[10px] text-[var(--ap-text-tertiary)] text-center">
          The encryption key is stored in your system's credential manager. No
          password needed — unlocks automatically.
        </p>
      </div>

      {/* Footer security info */}
      <div className="flex items-center gap-1.5 mt-auto pb-4 pt-4">
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-brand)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
        <span className="text-[8px] text-[var(--ap-text-tertiary)]">
          AES-256-GCM · PBKDF2 210K iterations
        </span>
      </div>
    </div>
  );
}
