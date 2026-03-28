// apps/extension/src/ui/components/VaultGate.tsx
import { useState, type ReactNode } from "react";
import { Box, Text, Button, Loader, Modal } from "@mantine/core";
import { tokens } from "./theme.js";
import { VaultSetup } from "./VaultSetup.js";
import { VaultUnlock } from "./VaultUnlock.js";
import type { VaultStatus } from "../hooks/useVault.js";

export type VaultGateProps = {
  status: VaultStatus;
  onSetup: (password: string) => Promise<void>;
  onSetupKeychain: () => Promise<void>;
  onUnlock: (password: string) => Promise<void>;
  onUnlockKeychain: () => Promise<void>;
  onDestroyVault: () => Promise<void>;
  onRetry: () => void;
  /** When true, vault was unlocked then auto-locked. Show unlock as overlay, not full gate. */
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
  // Auto-lock mid-session: show unlock overlay on top of existing content
  if (
    needsReauth &&
    (status.state === "locked" || status.state === "locked_out")
  ) {
    return (
      <>
        {children}
        <Modal
          opened
          onClose={() => {
            /* cannot dismiss — must unlock */
          }}
          withCloseButton={false}
          centered
          size="sm"
          overlayProps={{ backgroundOpacity: 0.7 }}
        >
          {status.state === "locked_out" ? (
            <VaultUnlock
              onUnlock={onUnlock}
              lockedOut
              secondsRemaining={status.secondsRemaining}
            />
          ) : (
            <VaultUnlock onUnlock={onUnlock} />
          )}
        </Modal>
      </>
    );
  }

  if (status.state === "connecting") {
    return (
      <Box
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: 400,
          flexDirection: "column",
          gap: 12,
        }}
      >
        <Loader size="sm" color={tokens.color.brand} />
        <Text size="sm" style={{ color: tokens.color.textSecondary }}>
          Connecting to bridge...
        </Text>
      </Box>
    );
  }

  if (status.state === "bridge-unavailable") {
    return (
      <Box
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: 400,
          flexDirection: "column",
          gap: 12,
          padding: tokens.spacing.contentHPadding,
        }}
      >
        <Text size="lg" fw={600} style={{ color: tokens.color.textPrimary }}>
          Bridge not connected
        </Text>
        <Text
          size="sm"
          style={{
            color: tokens.color.textSecondary,
            textAlign: "center",
            maxWidth: 280,
          }}
        >
          {status.error}
        </Text>
        <Button variant="outline" onClick={onRetry} style={{ marginTop: 8 }}>
          Retry
        </Button>
      </Box>
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
    // Keychain mode: auto-unlock in progress or failed.
    if (status.keyMode === "keychain") {
      // Keychain unlock failed — show error with retry and reset
      if (status.keychainError) {
        return (
          <KeychainErrorView
            error={status.keychainError}
            onRetry={onRetry}
            onDestroyVault={onDestroyVault}
          />
        );
      }
      // Auto-unlock in progress
      return (
        <Box
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: 400,
            flexDirection: "column",
            gap: 12,
          }}
        >
          <Loader size="sm" color={tokens.color.brand} />
          <Text size="sm" style={{ color: tokens.color.textSecondary }}>
            Unlocking vault...
          </Text>
        </Box>
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

  // state === "unlocked"
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Keychain error with reset option
// ---------------------------------------------------------------------------

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
    <Box
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: 400,
        flexDirection: "column",
        gap: 12,
        padding: tokens.spacing.contentHPadding,
      }}
    >
      <Text size="lg" fw={600} style={{ color: tokens.color.textPrimary }}>
        Keychain unlock failed
      </Text>
      <Text
        size="sm"
        style={{
          color: tokens.color.textSecondary,
          textAlign: "center",
          maxWidth: 280,
        }}
      >
        {error}
      </Text>
      <Box style={{ display: "flex", gap: 8, marginTop: 8 }}>
        {!isMismatch && (
          <Button variant="outline" onClick={onRetry}>
            Retry
          </Button>
        )}
        {!confirmReset ? (
          <Button
            variant="outline"
            color="red"
            onClick={() => setConfirmReset(true)}
          >
            Reset vault
          </Button>
        ) : (
          <Button
            color="red"
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
          </Button>
        )}
      </Box>
      {confirmReset && !resetting && (
        <Text
          size="xs"
          style={{
            color: tokens.color.textSecondary,
            textAlign: "center",
            maxWidth: 280,
          }}
        >
          This will permanently delete all saved providers, credentials, and app
          connections. You'll need to set everything up again.
        </Text>
      )}
    </Box>
  );
}
