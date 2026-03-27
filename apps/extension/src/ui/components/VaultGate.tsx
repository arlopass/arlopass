// apps/extension/src/ui/components/VaultGate.tsx
import type { ReactNode } from "react";
import { Box, Text, Button, Loader, Modal } from "@mantine/core";
import { tokens } from "./theme.js";
import { VaultSetup } from "./VaultSetup.js";
import { VaultUnlock } from "./VaultUnlock.js";
import type { VaultStatus } from "../hooks/useVault.js";

export type VaultGateProps = {
  status: VaultStatus;
  onSetup: (password: string) => Promise<void>;
  onUnlock: (password: string) => Promise<void>;
  onRetry: () => void;
  /** When true, vault was unlocked then auto-locked. Show unlock as overlay, not full gate. */
  needsReauth: boolean;
  children: ReactNode;
};

export function VaultGate({ status, onSetup, onUnlock, onRetry, needsReauth, children }: VaultGateProps) {
  // Auto-lock mid-session: show unlock overlay on top of existing content
  if (needsReauth && (status.state === "locked" || status.state === "locked_out")) {
    return (
      <>
        {children}
        <Modal
          opened
          onClose={() => {/* cannot dismiss — must unlock */}}
          withCloseButton={false}
          centered
          size="sm"
          overlayProps={{ backgroundOpacity: 0.7 }}
        >
          {status.state === "locked_out" ? (
            <VaultUnlock onUnlock={onUnlock} lockedOut secondsRemaining={status.secondsRemaining} />
          ) : (
            <VaultUnlock onUnlock={onUnlock} />
          )}
        </Modal>
      </>
    );
  }

  if (status.state === "connecting") {
    return (
      <Box style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 400, flexDirection: "column", gap: 12 }}>
        <Loader size="sm" color={tokens.color.brand} />
        <Text size="sm" style={{ color: tokens.color.textSecondary }}>
          Connecting to bridge...
        </Text>
      </Box>
    );
  }

  if (status.state === "bridge-unavailable") {
    return (
      <Box style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 400, flexDirection: "column", gap: 12, padding: tokens.spacing.contentHPadding }}>
        <Text size="lg" fw={600} style={{ color: tokens.color.textPrimary }}>
          Bridge not connected
        </Text>
        <Text size="sm" style={{ color: tokens.color.textSecondary, textAlign: "center", maxWidth: 280 }}>
          {status.error}
        </Text>
        <Button variant="outline" onClick={onRetry} style={{ marginTop: 8 }}>
          Retry
        </Button>
      </Box>
    );
  }

  if (status.state === "uninitialized") {
    return <VaultSetup onSetup={onSetup} />;
  }

  if (status.state === "locked") {
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
