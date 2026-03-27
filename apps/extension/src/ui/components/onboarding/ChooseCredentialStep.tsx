import { useEffect, useState } from "react";
import {
  Button,
  Group,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { ProviderAvatar } from "../ProviderAvatar.js";
import { MetadataDivider } from "../MetadataDivider.js";
import type { ProviderEntry } from "./provider-registry.js";
import { useVaultContext } from "../../hooks/VaultContext.js";
import { tokens } from "../theme.js";

type VaultCredential = {
  id: string;
  connectorId: string;
  name: string;
  createdAt: string;
  lastUsedAt: string;
};

export type ChooseCredentialStepProps = {
  provider: ProviderEntry;
  selectedCredentialId: string | null;
  onSelectCredential: (credential: VaultCredential) => void;
  onCreateNew: () => void;
  onUseSelected: () => void;
};

export function ChooseCredentialStep({
  provider,
  selectedCredentialId,
  onSelectCredential,
  onCreateNew,
  onUseSelected,
}: ChooseCredentialStepProps) {
  const [credentials, setCredentials] = useState<VaultCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const { sendVaultMessage } = useVaultContext();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const resp = await sendVaultMessage({ type: "vault.credentials.list" });
      const allCreds = (resp.credentials ?? []) as Array<{
        id: string;
        connectorId: string;
        name: string;
        createdAt: string;
        lastUsedAt: string;
      }>;
      const filtered = allCreds.filter(
        (c) => c.connectorId === provider.connectorId,
      );
      if (!cancelled) {
        setCredentials(filtered);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [provider.connectorId, sendVaultMessage]);

  return (
    <>
      {/* Provider header card */}
      <Stack
        gap={tokens.spacing.sectionGap}
        style={{
          padding: tokens.spacing.cardPadding,
          border: `1px solid ${tokens.color.border}`,
          borderRadius: tokens.radius.card,
        }}
      >
        <Group
          gap={tokens.spacing.iconTextGap}
          align="center"
          wrap="nowrap"
          style={{
            paddingBottom: tokens.spacing.sectionGap,
            borderBottom: `1px solid ${tokens.color.border}`,
          }}
        >
          <ProviderAvatar
            providerKey={provider.providerKey}
            size={tokens.size.providerIcon}
          />
          <Stack gap={0} style={{ overflow: "hidden", minWidth: 0 }}>
            <Text fw={600} fz="sm" c={tokens.color.textPrimary} truncate>
              {provider.shortLabel}
            </Text>
            <Group gap={8} wrap="nowrap">
              <Text fw={500} fz="xs" c={tokens.color.textSecondary}>
                {credentials.length}{" "}
                {credentials.length === 1 ? "credential" : "credentials"}{" "}
                available
              </Text>
              <MetadataDivider />
            </Group>
          </Stack>
        </Group>

        {/* Credential list */}
        <Text fw={500} fz="sm" c={tokens.color.textPrimary}>
          Available credentials
        </Text>

        {loading && (
          <Text fz="xs" c={tokens.color.textSecondary}>
            Loading…
          </Text>
        )}

        {!loading && credentials.length === 0 && (
          <Text fz="xs" c={tokens.color.textSecondary}>
            No saved credentials. Create one to get started.
          </Text>
        )}

        {!loading && credentials.length > 0 && (
          <ScrollArea
            style={{ maxHeight: 200 }}
            type="scroll"
            offsetScrollbars
            scrollbarSize={6}
          >
            <Stack gap={8}>
              {credentials.map((cred) => (
                <CredentialCard
                  key={cred.id}
                  credential={cred}
                  providerKey={provider.providerKey}
                  selected={selectedCredentialId === cred.id}
                  onSelect={() => onSelectCredential(cred)}
                />
              ))}
            </Stack>
          </ScrollArea>
        )}
      </Stack>

      {/* Bottom buttons */}
      <Group gap={tokens.spacing.iconTextGap} grow>
        <Button
          variant="default"
          radius={tokens.radius.button}
          fz="md"
          fw={500}
          onClick={onCreateNew}
          styles={{
            root: {
              height: "auto",
              padding: `${tokens.spacing.buttonPaddingY}px 0`,
              background: tokens.color.bgSurface,
              borderColor: tokens.color.bgSurface,
              color: tokens.color.textPrimary,
            },
          }}
        >
          Create new credential
        </Button>
        <Button
          radius={tokens.radius.button}
          fz="md"
          fw={500}
          color={tokens.color.btnPrimaryBg}
          disabled={selectedCredentialId === null}
          onClick={onUseSelected}
          styles={{
            root: {
              height: "auto",
              padding: `${tokens.spacing.buttonPaddingY}px 0`,
              "&:disabled": { backgroundColor: "#c0c0c0", color: "#f3f3f3" },
            },
          }}
        >
          Select credential
        </Button>
      </Group>
    </>
  );
}

function CredentialCard({
  credential,
  providerKey,
  selected,
  onSelect,
}: {
  credential: VaultCredential;
  providerKey: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const age = formatAge(credential.lastUsedAt);

  return (
    <UnstyledButton
      onClick={onSelect}
      style={{
        display: "flex",
        alignItems: "center",
        gap: tokens.spacing.iconTextGap,
        width: "100%",
        padding: tokens.spacing.cardPadding,
        background: tokens.color.bgSurface,
        border: selected ? "2px solid #2f70ff" : `2px solid transparent`,
        borderRadius: tokens.radius.card,
        cursor: "pointer",
        transition: "border-color 150ms ease",
      }}
    >
      <ProviderAvatar providerKey={providerKey} size={16} />
      <Text
        fw={600}
        fz="sm"
        c={tokens.color.textPrimary}
        style={{ whiteSpace: "nowrap" }}
      >
        {credential.name}
      </Text>
      <Text
        fw={400}
        fz={8}
        c={tokens.color.textSecondary}
        style={{ whiteSpace: "nowrap" }}
      >
        ({age})
      </Text>
    </UnstyledButton>
  );
}

function formatAge(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Last used just now";
  if (minutes < 60) return `Last used ${String(minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last used ${String(hours)}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Last used ${String(days)}d ago`;
  const months = Math.floor(days / 30);
  return `Last used ${String(months)} month${months > 1 ? "s" : ""} ago`;
}
