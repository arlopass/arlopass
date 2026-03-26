import { useEffect, useState } from "react";
import { Box, Button, Center, Collapse, Divider, Group, ScrollArea, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import { MetadataDivider } from "./MetadataDivider.js";
import { PrimaryButton } from "./PrimaryButton.js";
import { loadApps, removeApp, type ConnectedApp } from "./app-connect/app-storage.js";
import { tokens } from "./theme.js";

function formatAge(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${String(mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${String(hours)}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${String(days)}d ago`;
  if (days < 30) return `${String(Math.floor(days / 7))} week${Math.floor(days / 7) > 1 ? "s" : ""} ago`;
  const months = Math.floor(days / 30);
  return `${String(months)} month${months > 1 ? "s" : ""} ago`;
}

function extractDomain(origin: string): string {
  try { return new URL(origin).hostname; } catch { return origin; }
}

export function AppsTabContent() {
  const [apps, setApps] = useState<ConnectedApp[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadApps().then((loaded) => {
      setApps(loaded);
      setLoading(false);
    });

    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && "byom.wallet.apps.v1" in changes) {
        void loadApps().then(setApps);
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
        {!loading && apps.length === 0 && (
          <Center py="xl">
            <Stack gap={8} align="center">
              <Text fz="sm" fw={500} c={tokens.color.textPrimary}>Connected Apps</Text>
              <Text fz="xs" c={tokens.color.textSecondary} ta="center" maw={280}>
                Apps that connect to your wallet will appear here. Visit a web app that uses BYOM to get started.
              </Text>
            </Stack>
          </Center>
        )}
        {!loading && apps.length > 0 && (
          <Stack gap={tokens.spacing.sectionGap}>
            {apps.map((app) => (
              <AppCard key={app.id} app={app} onRemove={(origin) => void removeApp(origin)} />
            ))}
          </Stack>
        )}
      </ScrollArea>
      <PrimaryButton>Manage apps</PrimaryButton>
    </>
  );
}

function AppCard({ app, onRemove }: { app: ConnectedApp; onRemove: (origin: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Box style={{ width: "100%", background: tokens.color.bgCard, border: `1px solid ${tokens.color.border}`, borderRadius: tokens.radius.card, overflow: "hidden" }}>
      <UnstyledButton
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: tokens.spacing.cardPadding, cursor: "pointer", gap: 10 }}
      >
        {app.iconUrl ? (
          <img src={app.iconUrl} alt="" width={28} height={28} style={{ borderRadius: 6, flexShrink: 0 }} />
        ) : (
          <Box style={{ width: 28, height: 28, borderRadius: 6, background: "var(--mantine-color-blue-1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Text fz={12} fw={700} c="blue">{app.displayName[0]?.toUpperCase() ?? "A"}</Text>
          </Box>
        )}
        <Stack gap={0} style={{ overflow: "hidden", minWidth: 0, flex: 1 }}>
          <Group gap={4} wrap="nowrap">
            <Text fw={600} fz="sm" c={tokens.color.textPrimary} truncate>{app.displayName}</Text>
            <Text fw={400} fz="xs" c={tokens.color.textSecondary}>({extractDomain(app.origin)})</Text>
          </Group>
          <Group gap={tokens.spacing.metadataGap} wrap="nowrap" style={{ overflow: "hidden" }}>
            {app.description && (
              <>
                <Text fw={500} fz="xs" c={tokens.color.textSecondary} truncate style={{ whiteSpace: "nowrap" }}>
                  {app.description}
                </Text>
                <MetadataDivider />
              </>
            )}
            <Text fw={500} fz="xs" c={tokens.color.textSecondary} style={{ whiteSpace: "nowrap" }}>
              {app.status === "active" ? "Full permissions" : "Disabled"}
            </Text>
            <MetadataDivider />
            <Text fw={500} fz="xs" c={tokens.color.textSecondary} style={{ whiteSpace: "nowrap" }}>
              Last used {formatAge(app.lastUsedAt)}
            </Text>
          </Group>
        </Stack>
        <IconChevronDown size={20} color={tokens.color.textSecondary} style={{ transform: expanded ? undefined : "rotate(-90deg)", transition: "transform 150ms ease", flexShrink: 0 }} aria-hidden />
      </UnstyledButton>
      <Collapse in={expanded}>
        <Box style={{ padding: `0 ${tokens.spacing.cardPadding}px ${tokens.spacing.cardPadding}px` }}>
          <Divider mb={tokens.spacing.sectionGap} color={tokens.color.border} />
          <Stack gap={8}>
            <Group justify="space-between">
              <Text fz="xs" c={tokens.color.textSecondary}>Origin</Text>
              <Text fz="xs" fw={500} c={tokens.color.textPrimary} truncate maw={200}>{app.origin}</Text>
            </Group>
            <Group justify="space-between">
              <Text fz="xs" c={tokens.color.textSecondary}>Providers</Text>
              <Text fz="xs" fw={500} c={tokens.color.textPrimary}>{app.enabledProviderIds.length} enabled</Text>
            </Group>
            <Group justify="space-between">
              <Text fz="xs" c={tokens.color.textSecondary}>Models</Text>
              <Text fz="xs" fw={500} c={tokens.color.textPrimary}>{app.enabledModelIds.length} enabled</Text>
            </Group>
            <Group justify="space-between">
              <Text fz="xs" c={tokens.color.textSecondary}>Status</Text>
              <Text fz="xs" fw={500} c={app.status === "active" ? "#137333" : "#8e2e2e"}>{app.status}</Text>
            </Group>
            <Group gap={8} mt={4}>
              <Button size="compact-xs" variant="light" color="red" radius={tokens.radius.card} onClick={() => onRemove(app.origin)}>
                Disconnect
              </Button>
            </Group>
          </Stack>
        </Box>
      </Collapse>
    </Box>
  );
}
