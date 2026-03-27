// apps/extension/src/ui/components/VaultSetup.tsx
import { useState, useCallback } from "react";
import { Box, Text, Button, Stack, PasswordInput } from "@mantine/core";
import { tokens } from "./theme.js";

export type VaultSetupProps = {
  onSetup: (password: string) => Promise<void>;
};

export function VaultSetup({ onSetup }: VaultSetupProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const passwordsMatch = password.length > 0 && password === confirm;
  const passwordTooShort = password.length > 0 && password.length < 8;

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
        style={{ color: tokens.color.textSecondary, textAlign: "center", maxWidth: 280 }}
      >
        Your credentials are encrypted with a master password. Choose something strong — the bridge never sees your password in plaintext.
      </Text>

      <Stack gap="sm" style={{ width: "100%", maxWidth: 280, marginTop: 8 }}>
        <PasswordInput
          label="Master password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          error={passwordTooShort ? "Must be at least 8 characters" : undefined}
          autoFocus
        />
        <PasswordInput
          label="Confirm password"
          placeholder="Re-enter your password"
          value={confirm}
          onChange={(e) => setConfirm(e.currentTarget.value)}
          error={confirm.length > 0 && !passwordsMatch ? "Passwords don't match" : undefined}
        />
        {error !== null && (
          <Text size="xs" style={{ color: tokens.color.danger }}>
            {error}
          </Text>
        )}
        <Button
          fullWidth
          loading={loading}
          disabled={!passwordsMatch || passwordTooShort}
          onClick={handleSubmit}
          style={{ marginTop: 8 }}
        >
          Create vault
        </Button>
      </Stack>

      <Text
        size="xs"
        style={{ color: tokens.color.textTertiary, textAlign: "center", maxWidth: 280, marginTop: "auto", paddingBottom: 16 }}
      >
        If you forget this password, you'll need to reset the vault and re-add your providers.
      </Text>
    </Box>
  );
}
