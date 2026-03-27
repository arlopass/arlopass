import { useState, useCallback, useEffect } from "react";
import { Box, Text, Button, Stack, PasswordInput } from "@mantine/core";
import { tokens } from "./theme.js";

export type VaultUnlockProps = {
  onUnlock: (password: string) => Promise<void>;
  lockedOut?: boolean;
  secondsRemaining?: number;
};

export function VaultUnlock({
  onUnlock,
  lockedOut,
  secondsRemaining: initialSeconds,
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
    <Box
      style={{
        padding: tokens.spacing.contentHPadding,
        paddingTop: 48,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        minHeight: 400,
      }}
    >
      <Text size="xl" fw={700} style={{ color: tokens.color.textPrimary }}>
        Unlock your vault
      </Text>
      <Text
        size="sm"
        style={{
          color: tokens.color.textSecondary,
          textAlign: "center",
          maxWidth: 280,
        }}
      >
        Enter your master password to access your providers and credentials.
      </Text>

      <Stack gap="sm" style={{ width: "100%", maxWidth: 280, marginTop: 8 }}>
        {lockedOut === true && countdown > 0 ? (
          <Text
            size="sm"
            style={{ color: tokens.color.warning, textAlign: "center" }}
          >
            Too many failed attempts. Try again in {countdown} seconds.
          </Text>
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
          />
        )}
        {error !== null && (
          <Text size="xs" style={{ color: tokens.color.danger }}>
            {error}
          </Text>
        )}
        <Button
          fullWidth
          loading={loading}
          disabled={isDisabled}
          onClick={handleSubmit}
        >
          Unlock
        </Button>
      </Stack>
    </Box>
  );
}
