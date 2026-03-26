import { useEffect, useState } from "react";
import { Box, Button, Collapse, Divider, Group, ScrollArea, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import { ProviderAvatar } from "./ProviderAvatar.js";
import { MetadataDivider } from "./MetadataDivider.js";
import { PrimaryButton } from "./PrimaryButton.js";
import { loadCredentials, deleteCredential, type StoredCredential } from "./onboarding/credential-storage.js";
import { tokens } from "./theme.js";

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

function formatAge(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Last refreshed just now";
  if (mins < 60) return `Last refreshed ${String(mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Last refreshed ${String(hours)}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Last refreshed ${String(days)}d ago`;
  if (days < 30) return `Last refreshed ${String(Math.floor(days / 7))} week${Math.floor(days / 7) > 1 ? "s" : ""} ago`;
  const months = Math.floor(days / 30);
  return `Last refreshed ${String(months)} month${months > 1 ? "s" : ""} ago`;
}

export function VaultTabContent() {
  const [credentials, setCredentials] = useState<StoredCredential[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = () => void loadCredentials().then(setCredentials);

  useEffect(() => {
    void loadCredentials().then((creds) => {
      setCredentials(creds);
      setLoading(false);
    });

    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && "byom.wallet.credentials.v1" in changes) {
        reload();
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  return (
    <>
      <ScrollArea style={{ flex: 1, minHeight: 0 }} type="scroll" offsetScrollbars scrollbarSize={6}>
        {loading && (
          <Text fz="sm" c={tokens.color.textSecondary} ta="center" py="xl">Loading…</Text>
        )}
        {!loading && credentials.length === 0 && (
          <Text fz="sm" c={tokens.color.textSecondary} ta="center" py="xl">
            No credentials stored. Add a provider to create credentials.
          </Text>
        )}
        {!loading && credentials.length > 0 && (
          <Stack gap={tokens.spacing.sectionGap}>
            {credentials.map((cred) => (
              <CredentialCard key={cred.id} credential={cred} onDelete={(id) => void deleteCredential(id)} />
            ))}
          </Stack>
        )}
      </ScrollArea>
      <PrimaryButton>Manage credentials</PrimaryButton>
    </>
  );
}

function CredentialCard({ credential, onDelete }: { credential: StoredCredential; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const created = new Date(credential.createdAt).toLocaleDateString();
  return (
    <Box style={{ width: "100%", background: tokens.color.bgCard, border: `1px solid ${tokens.color.border}`, borderRadius: tokens.radius.card, overflow: "hidden" }}>
      <UnstyledButton
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: tokens.spacing.cardPadding, cursor: "pointer" }}
      >
        <Group gap={tokens.spacing.iconTextGap} align="center" wrap="nowrap" style={{ overflow: "hidden", flex: 1, minWidth: 0 }}>
          <ProviderAvatar providerKey={deriveProviderKeyFromConnectorId(credential.connectorId)} size={tokens.size.providerIcon} />
          <Stack gap={0} style={{ overflow: "hidden", minWidth: 0 }}>
            <Text fw={600} fz="sm" c={tokens.color.textPrimary} truncate>{credential.name}</Text>
            <Text fw={500} fz="xs" c={tokens.color.textSecondary} style={{ whiteSpace: "nowrap" }}>{formatAge(credential.lastUsedAt)}</Text>
          </Stack>
        </Group>
        <IconChevronDown size={20} color={tokens.color.textSecondary} style={{ transform: expanded ? undefined : "rotate(-90deg)", transition: "transform 150ms ease", flexShrink: 0 }} aria-hidden />
      </UnstyledButton>
      <Collapse in={expanded}>
        <Box style={{ padding: `0 ${tokens.spacing.cardPadding}px ${tokens.spacing.cardPadding}px` }}>
          <Divider mb={tokens.spacing.sectionGap} color={tokens.color.border} />
          <Stack gap={8}>
            <Group justify="space-between">
              <Text fz="xs" c={tokens.color.textSecondary}>Connector</Text>
              <Text fz="xs" fw={500} c={tokens.color.textPrimary}>{credential.connectorId}</Text>
            </Group>
            <Group justify="space-between">
              <Text fz="xs" c={tokens.color.textSecondary}>Created</Text>
              <Text fz="xs" fw={500} c={tokens.color.textPrimary}>{created}</Text>
            </Group>
            <Group gap={8} mt={4}>
              <Button size="compact-xs" variant="light" color="red" radius={tokens.radius.card} onClick={() => onDelete(credential.id)}>
                Delete
              </Button>
            </Group>
          </Stack>
        </Box>
      </Collapse>
    </Box>
  );
}
