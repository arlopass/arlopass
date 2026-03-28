import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  Collapse,
  Divider,
  Group,
  PasswordInput,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { IconChevronDown, IconKey, IconShieldLock } from "@tabler/icons-react";
import { ProviderAvatar } from "./ProviderAvatar.js";
import { PrimaryButton } from "./PrimaryButton.js";
import { useVaultContext } from "../hooks/VaultContext.js";
import { tokens } from "./theme.js";

type VaultCredential = {
  id: string;
  connectorId: string;
  name: string;
  createdAt: string;
  lastUsedAt: string;
};

function deriveProviderKeyFromConnectorId(connectorId: string): string {
  if (connectorId === "cli-claude-code") return "claude";
  if (connectorId.includes("anthropic")) return "anthropic";
  if (connectorId.includes("openai")) return "openai";
  if (connectorId.includes("gemini")) return "gemini";
  if (connectorId.includes("foundry")) return "microsoft";
  if (connectorId.includes("bedrock")) return "bedrock";
  if (connectorId.includes("perplexity")) return "perplexity";
  if (connectorId.includes("vertex")) return "google";
  if (connectorId.includes("ollama")) return "ollama";
  if (connectorId.includes("cli")) return "githubcopilot";
  return "openai";
}

function formatAge(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Last refreshed just now";
  if (mins < 60) return `Last refreshed ${String(mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Last refreshed ${String(hours)}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Last refreshed ${String(days)}d ago`;
  if (days < 30)
    return `Last refreshed ${String(Math.floor(days / 7))} week${Math.floor(days / 7) > 1 ? "s" : ""} ago`;
  const months = Math.floor(days / 30);
  return `Last refreshed ${String(months)} month${months > 1 ? "s" : ""} ago`;
}

export function VaultTabContent() {
  const [credentials, setCredentials] = useState<VaultCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyMode, setKeyMode] = useState<"password" | "keychain" | null>(null);
  const [minPasswordLength, setMinPasswordLength] = useState(8);
  const { sendVaultMessage } = useVaultContext();

  const reload = () =>
    void sendVaultMessage({ type: "vault.credentials.list" }).then((resp) =>
      setCredentials((resp.credentials ?? []) as VaultCredential[]),
    );

  useEffect(() => {
    void Promise.all([
      sendVaultMessage({ type: "vault.credentials.list" }),
      sendVaultMessage({ type: "vault.status" }),
    ]).then(([credResp, statusResp]) => {
      setCredentials((credResp.credentials ?? []) as VaultCredential[]);
      const mode = statusResp["keyMode"] as string | undefined;
      if (mode === "password" || mode === "keychain") {
        setKeyMode(mode);
      }
      const minPw = statusResp["minPasswordLength"];
      if (typeof minPw === "number" && minPw > 0) {
        setMinPasswordLength(minPw);
      }
      setLoading(false);
    });
  }, [sendVaultMessage]);

  return (
    <>
      <ScrollArea
        style={{ flex: 1, minHeight: 0 }}
        type="scroll"
        offsetScrollbars
        scrollbarSize={6}
      >
        {loading && (
          <Text fz="sm" c={tokens.color.textSecondary} ta="center" py="xl">
            Loading…
          </Text>
        )}
        {!loading && (
          <Stack gap={tokens.spacing.sectionGap}>
            <VaultSecuritySection
              keyMode={keyMode}
              minPasswordLength={minPasswordLength}
              sendVaultMessage={sendVaultMessage}
              onKeyModeChange={setKeyMode}
            />
            <Divider color={tokens.color.border} />
            <Text fw={600} fz="sm" c={tokens.color.textPrimary}>
              Stored credentials
            </Text>
            {credentials.length === 0 && (
              <Text fz="sm" c={tokens.color.textSecondary} ta="center" py="md">
                No credentials stored. Add a provider to create credentials.
              </Text>
            )}
            {credentials.map((cred) => (
              <CredentialCard
                key={cred.id}
                credential={cred}
                onDelete={(id) => {
                  void sendVaultMessage({
                    type: "vault.credentials.delete",
                    credentialId: id,
                  }).then(() => reload());
                }}
              />
            ))}
          </Stack>
        )}
      </ScrollArea>
      <PrimaryButton>Manage credentials</PrimaryButton>
    </>
  );
}

// ---------------------------------------------------------------------------
// Vault Security Settings
// ---------------------------------------------------------------------------

function VaultSecuritySection({
  keyMode,
  minPasswordLength,
  sendVaultMessage,
  onKeyModeChange,
}: {
  keyMode: "password" | "keychain" | null;
  minPasswordLength: number;
  sendVaultMessage: (
    msg: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  onKeyModeChange: (mode: "password" | "keychain") => void;
}) {
  const [switching, setSwitching] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const passwordsMatch = password.length > 0 && password === confirm;
  const tooShort = password.length > 0 && password.length < minPasswordLength;

  const handleSwitchToKeychain = useCallback(async () => {
    setSwitching(true);
    setError(null);
    try {
      const resp = await sendVaultMessage({ type: "vault.rekey.keychain" });
      if (resp["type"] === "error") {
        setError(
          (resp["message"] as string) ?? "Failed to switch to keychain.",
        );
      } else {
        onKeyModeChange("keychain");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Switch failed.");
    } finally {
      setSwitching(false);
    }
  }, [sendVaultMessage, onKeyModeChange]);

  const handleSwitchToPassword = useCallback(async () => {
    if (!passwordsMatch || tooShort) return;
    setSwitching(true);
    setError(null);
    try {
      const resp = await sendVaultMessage({ type: "vault.rekey", password });
      if (resp["type"] === "error") {
        setError(
          (resp["message"] as string) ?? "Failed to switch to password.",
        );
      } else {
        onKeyModeChange("password");
        setShowPasswordForm(false);
        setPassword("");
        setConfirm("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Switch failed.");
    } finally {
      setSwitching(false);
    }
  }, [sendVaultMessage, password, passwordsMatch, tooShort, onKeyModeChange]);

  return (
    <Box
      style={{
        background: tokens.color.bgSurface,
        border: `1px solid ${tokens.color.border}`,
        borderRadius: tokens.radius.card,
        padding: tokens.spacing.cardPadding,
      }}
    >
      <Group gap={8} mb={8}>
        {keyMode === "password" ? (
          <IconShieldLock size={18} color={tokens.color.brand} />
        ) : (
          <IconKey size={18} color={tokens.color.brand} />
        )}
        <Text fw={600} fz="sm" c={tokens.color.textPrimary}>
          Vault security
        </Text>
      </Group>

      <Text fz="xs" c={tokens.color.textSecondary} mb={8}>
        {keyMode === "password"
          ? "Your vault is protected by a master password."
          : keyMode === "keychain"
            ? "Your vault is protected by the OS credential store. Unlocks automatically."
            : "Loading…"}
      </Text>

      {error !== null && (
        <Text fz="xs" c={tokens.color.danger} mb={8}>
          {error}
        </Text>
      )}

      {keyMode === "password" && !showPasswordForm && (
        <Button
          size="compact-xs"
          variant="light"
          loading={switching}
          onClick={handleSwitchToKeychain}
        >
          Switch to OS keychain
        </Button>
      )}

      {keyMode === "keychain" && !showPasswordForm && (
        <Button
          size="compact-xs"
          variant="light"
          onClick={() => setShowPasswordForm(true)}
        >
          Switch to master password
        </Button>
      )}

      {showPasswordForm && (
        <Stack gap="xs" mt={8}>
          <PasswordInput
            size="xs"
            label="New master password"
            placeholder={`At least ${String(minPasswordLength)} characters`}
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            error={
              tooShort
                ? `Must be at least ${String(minPasswordLength)} characters`
                : undefined
            }
          />
          <PasswordInput
            size="xs"
            label="Confirm password"
            placeholder="Re-enter password"
            value={confirm}
            onChange={(e) => setConfirm(e.currentTarget.value)}
            error={
              confirm.length > 0 && !passwordsMatch
                ? "Passwords don't match"
                : undefined
            }
          />
          <Group gap={8}>
            <Button
              size="compact-xs"
              loading={switching}
              disabled={!passwordsMatch || tooShort}
              onClick={handleSwitchToPassword}
            >
              Set password
            </Button>
            <Button
              size="compact-xs"
              variant="subtle"
              onClick={() => {
                setShowPasswordForm(false);
                setPassword("");
                setConfirm("");
                setError(null);
              }}
            >
              Cancel
            </Button>
          </Group>
        </Stack>
      )}
    </Box>
  );
}

function CredentialCard({
  credential,
  onDelete,
}: {
  credential: VaultCredential;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const created = new Date(credential.createdAt).toLocaleDateString();
  return (
    <Box
      style={{
        width: "100%",
        background: tokens.color.bgSurface,
        border: `1px solid ${tokens.color.border}`,
        borderRadius: tokens.radius.card,
        overflow: "hidden",
      }}
    >
      <UnstyledButton
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: tokens.spacing.cardPadding,
          cursor: "pointer",
        }}
      >
        <Group
          gap={tokens.spacing.iconTextGap}
          align="center"
          wrap="nowrap"
          style={{ overflow: "hidden", flex: 1, minWidth: 0 }}
        >
          <ProviderAvatar
            providerKey={deriveProviderKeyFromConnectorId(
              credential.connectorId,
            )}
            size={tokens.size.providerIcon}
          />
          <Stack gap={0} style={{ overflow: "hidden", minWidth: 0 }}>
            <Text fw={600} fz="sm" c={tokens.color.textPrimary} truncate>
              {credential.name}
            </Text>
            <Text
              fw={500}
              fz="xs"
              c={tokens.color.textSecondary}
              style={{ whiteSpace: "nowrap" }}
            >
              {formatAge(credential.lastUsedAt)}
            </Text>
          </Stack>
        </Group>
        <IconChevronDown
          size={20}
          color={tokens.color.textSecondary}
          style={{
            transform: expanded ? undefined : "rotate(-90deg)",
            transition: "transform 150ms ease",
            flexShrink: 0,
          }}
          aria-hidden
        />
      </UnstyledButton>
      <Collapse in={expanded}>
        <Box
          style={{
            padding: `0 ${tokens.spacing.cardPadding}px ${tokens.spacing.cardPadding}px`,
          }}
        >
          <Divider mb={tokens.spacing.sectionGap} color={tokens.color.border} />
          <Stack gap={8}>
            <Group justify="space-between">
              <Text fz="xs" c={tokens.color.textSecondary}>
                Connector
              </Text>
              <Text fz="xs" fw={500} c={tokens.color.textPrimary}>
                {credential.connectorId}
              </Text>
            </Group>
            <Group justify="space-between">
              <Text fz="xs" c={tokens.color.textSecondary}>
                Created
              </Text>
              <Text fz="xs" fw={500} c={tokens.color.textPrimary}>
                {created}
              </Text>
            </Group>
            <Group gap={8} mt={4}>
              <Button
                size="compact-xs"
                variant="light"
                color="red"
                radius={tokens.radius.card}
                onClick={() => onDelete(credential.id)}
              >
                Delete
              </Button>
            </Group>
          </Stack>
        </Box>
      </Collapse>
    </Box>
  );
}
