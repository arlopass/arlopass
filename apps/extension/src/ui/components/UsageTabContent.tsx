import { Box, Center, Group, Loader, ScrollArea, Stack, Text, ActionIcon, Tooltip } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { useTokenUsage } from "../hooks/useTokenUsage.js";
import { tokens } from "./theme.js";

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

function shortenOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    return url.hostname;
  } catch {
    return origin;
  }
}

export function UsageTabContent() {
  const { summaries, loading, resetAll, resetOrigin } = useTokenUsage();

  if (loading) {
    return (
      <Center py="xl">
        <Loader size="sm" color={tokens.color.textSecondary} />
      </Center>
    );
  }

  if (summaries.length === 0) {
    return (
      <Center py="xl">
        <Text fz="sm" c={tokens.color.textSecondary} ta="center">
          No token usage recorded yet.
        </Text>
      </Center>
    );
  }

  const totalTokens = summaries.reduce(
    (sum, s) => sum + s.totalInputTokens + s.totalOutputTokens,
    0,
  );

  return (
    <Stack gap={8} style={{ flex: 1, minHeight: 0 }}>
      <Group justify="space-between" px={0}>
        <Text fz="xs" fw={600} c={tokens.color.textPrimary}>
          Total: {formatTokenCount(totalTokens)} tokens
        </Text>
        <Tooltip label="Reset all usage" position="left">
          <ActionIcon
            variant="subtle"
            size="xs"
            color="red"
            onClick={() => void resetAll()}
          >
            <IconTrash size={12} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <ScrollArea style={{ flex: 1, minHeight: 0 }} type="scroll" offsetScrollbars scrollbarSize={6}>
        <Stack gap={6}>
          {summaries.map((summary) => (
            <Box
              key={summary.origin}
              style={{
                background: tokens.color.bgCard,
                borderRadius: tokens.radius.card,
                padding: "8px 10px",
              }}
            >
              <Group justify="space-between" mb={4}>
                <Text fz={11} fw={600} c={tokens.color.textPrimary} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
                  {shortenOrigin(summary.origin)}
                </Text>
                <Group gap={6}>
                  <Text fz={10} c={tokens.color.textSecondary}>
                    {formatTokenCount(summary.totalInputTokens + summary.totalOutputTokens)}
                  </Text>
                  <Tooltip label="Reset this app" position="left">
                    <ActionIcon
                      variant="subtle"
                      size={14}
                      color="red"
                      onClick={() => void resetOrigin(summary.origin)}
                    >
                      <IconTrash size={10} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>

              {summary.byProvider.map((p) => (
                <Group key={`${p.providerId}-${p.modelId}`} justify="space-between" pl={6}>
                  <Text fz={10} c={tokens.color.textSecondary} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
                    {p.modelId}
                  </Text>
                  <Text fz={10} c={tokens.color.textSecondary}>
                    ↑{formatTokenCount(p.inputTokens)} ↓{formatTokenCount(p.outputTokens)}
                  </Text>
                </Group>
              ))}
            </Box>
          ))}
        </Stack>
      </ScrollArea>
    </Stack>
  );
}
