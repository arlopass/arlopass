// apps/extension/src/ui/components/VaultSetup.tsx
import { useState, useCallback } from "react";
import {
  Box,
  Text,
  Button,
  Stack,
  PasswordInput,
  Divider,
} from "@mantine/core";
import { tokens } from "./theme.js";

export type VaultSetupProps = {
  onSetup: (password: string) => Promise<void>;
  onSetupKeychain: () => Promise<void>;
  minPasswordLength?: number;
};

export function VaultSetup({ onSetup, onSetupKeychain, minPasswordLength = 8 }: VaultSetupProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [keychainLoading, setKeychainLoading] = useState(false);

  const passwordsMatch = password.length > 0 && password === confirm;
  const passwordTooShort = password.length > 0 && password.length < minPasswordLength;

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
    <Box
      style={{
        padding: tokens.spacing.contentHPadding,
        paddingTop: 32,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        minHeight: 400,
      }}
    >
      <Text size="xl" fw={700} style={{ color: tokens.color.textPrimary }}>
        Set up your vault
      </Text>
      <Text
        size="sm"
        style={{
          color: tokens.color.textSecondary,
          textAlign: "center",
          maxWidth: 280,
        }}
      >
        Your credentials are encrypted at rest. Choose how to protect the
        encryption key.
      </Text>

      <Stack gap="sm" style={{ width: "100%", maxWidth: 280, marginTop: 8 }}>
        <PasswordInput
          label="Master password"
          placeholder={`At least ${minPasswordLength} characters`}
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          error={passwordTooShort ? `Must be at least ${minPasswordLength} characters` : undefined}
          autoFocus
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
        />
        {error !== null && (
          <Text size="xs" style={{ color: tokens.color.danger }}>
            {error}
          </Text>
        )}
        <Button
          fullWidth
          loading={loading}
          disabled={!passwordsMatch || passwordTooShort || keychainLoading}
          onClick={handleSubmit}
          style={{ marginTop: 8 }}
        >
          Create vault with password
        </Button>

        <Divider
          label="or"
          labelPosition="center"
          style={{ marginTop: 4, marginBottom: 4 }}
        />

        <Button
          fullWidth
          variant="outline"
          loading={keychainLoading}
          disabled={loading}
          onClick={handleKeychain}
        >
          Use OS keychain instead
        </Button>
        <Text
          size="xs"
          style={{
            color: tokens.color.textTertiary,
            textAlign: "center",
          }}
        >
          The encryption key is stored in your system's credential manager. No
          password needed — unlocks automatically.
        </Text>
      </Stack>

      <Text
        size="xs"
        style={{
          color: tokens.color.textTertiary,
          textAlign: "center",
          maxWidth: 280,
          marginTop: "auto",
          paddingBottom: 16,
        }}
      >
        If you forget your password or lose keychain access, you'll need to
        reset the vault and re-add your providers.
      </Text>
    </Box>
  );
}
