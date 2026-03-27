import { useState } from "react";
import {
  Box,
  Button,
  Collapse,
  Divider,
  Group,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import { ProviderAvatar } from "./ProviderAvatar.js";
import { MetadataDivider } from "./MetadataDivider.js";
import { tokens } from "./theme.js";

const STATUS_LABELS: Record<string, string> = {
  connected: "Connected",
  disconnected: "Disconnected",
  attention: "Attention",
  reconnecting: "Reconnecting",
  failed: "Failed",
  revoked: "Revoked",
  degraded: "Degraded",
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function statusColor(status: string): string {
  if (status === "connected") return "#137333";
  if (
    status === "attention" ||
    status === "degraded" ||
    status === "reconnecting"
  )
    return "#9f580a";
  if (status === "failed" || status === "revoked" || status === "disconnected")
    return "#8e2e2e";
  return tokens.color.textSecondary;
}

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

export type ProviderCardData = {
  id: string;
  name: string;
  providerKey: string;
  status: string;
  modelsAvailable: number;
  providerType: string;
};

export type ProviderCardProps = {
  provider: ProviderCardData;
  /** Total tokens (input+output) for this provider, from usage tracking. */
  tokenUsage?: number | undefined;
  onClick?: ((providerId: string) => void) | undefined;
  onRemove?: ((providerId: string) => void) | undefined;
  onEdit?: ((providerId: string) => void) | undefined;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ProviderCard({
  provider,
  tokenUsage,
  onClick: _onClick,
  onRemove,
  onEdit,
}: ProviderCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Box
      style={{
        width: "100%",
        background: tokens.color.bgSurface,
        border: `1px solid ${tokens.color.border}`,
        borderRadius: tokens.radius.card,
        overflow: "hidden",
        transition: "border-color 150ms ease",
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
            providerKey={provider.providerKey}
            size={tokens.size.providerIcon}
          />
          <Stack
            gap={0}
            justify="center"
            style={{ overflow: "hidden", minWidth: 0 }}
          >
            <Text
              fw={600}
              fz="sm"
              c={tokens.color.textPrimary}
              lh="normal"
              truncate
            >
              {provider.name}
            </Text>
            <Group
              gap={tokens.spacing.metadataGap}
              wrap="nowrap"
              style={{ overflow: "hidden" }}
            >
              <Text
                fw={500}
                fz="xs"
                c={tokens.color.textSecondary}
                lh="normal"
                style={{ whiteSpace: "nowrap" }}
              >
                {provider.modelsAvailable}{" "}
                {provider.modelsAvailable === 1 ? "model" : "models"}
              </Text>
              <MetadataDivider />
              <Text
                fw={500}
                fz="xs"
                c={tokens.color.textSecondary}
                lh="normal"
                style={{ whiteSpace: "nowrap" }}
              >
                {provider.providerType}
              </Text>
              {tokenUsage != null && tokenUsage > 0 && (
                <>
                  <MetadataDivider />
                  <Text
                    fw={500}
                    fz="xs"
                    c={tokens.color.textSecondary}
                    lh="normal"
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {formatTokenCount(tokenUsage)} tokens
                  </Text>
                </>
              )}
              <MetadataDivider />
              <Text
                fw={500}
                fz="xs"
                c={statusColor(provider.status)}
                lh="normal"
                truncate
              >
                {statusLabel(provider.status)}
              </Text>
            </Group>
          </Stack>
        </Group>
        <IconChevronDown
          size={tokens.size.cardChevronIcon}
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
                Status
              </Text>
              <Text fz="xs" fw={500} c={statusColor(provider.status)}>
                {statusLabel(provider.status)}
              </Text>
            </Group>
            <Group justify="space-between">
              <Text fz="xs" c={tokens.color.textSecondary}>
                Type
              </Text>
              <Text fz="xs" fw={500} c={tokens.color.textPrimary}>
                {provider.providerType}
              </Text>
            </Group>
            <Group justify="space-between">
              <Text fz="xs" c={tokens.color.textSecondary}>
                Models
              </Text>
              <Text fz="xs" fw={500} c={tokens.color.textPrimary}>
                {provider.modelsAvailable} available
              </Text>
            </Group>
            {tokenUsage != null && tokenUsage > 0 && (
              <Group justify="space-between">
                <Text fz="xs" c={tokens.color.textSecondary}>
                  Token usage
                </Text>
                <Text fz="xs" fw={500} c={tokens.color.textPrimary}>
                  {formatTokenCount(tokenUsage)}
                </Text>
              </Group>
            )}
            <Group gap={8} mt={4}>
              {onEdit != null && (
                <Button
                  size="compact-xs"
                  variant="light"
                  color="gray"
                  radius={tokens.radius.card}
                  onClick={() => onEdit(provider.id)}
                >
                  Edit
                </Button>
              )}
              {onRemove != null && (
                <Button
                  size="compact-xs"
                  variant="light"
                  color="red"
                  radius={tokens.radius.card}
                  onClick={() => onRemove(provider.id)}
                >
                  Remove
                </Button>
              )}
            </Group>
          </Stack>
        </Box>
      </Collapse>
    </Box>
  );
}

