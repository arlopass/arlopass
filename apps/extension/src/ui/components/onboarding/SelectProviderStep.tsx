import { useEffect, useState } from "react";
import {
  Group,
  Menu,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import { ProviderAvatar } from "../ProviderAvatar.js";
import { PrimaryButton } from "../PrimaryButton.js";
import {
  PROVIDER_CATEGORIES,
  filterProviders,
  type ProviderCategory,
  type ProviderEntry,
} from "./provider-registry.js";
import { loadCredentials } from "./credential-storage.js";
import { tokens } from "../theme.js";

export type SelectProviderStepProps = {
  selectedConnectorId: string | null;
  onSelect: (connectorId: string) => void;
  onNext: () => void;
};

export function SelectProviderStep({
  selectedConnectorId,
  onSelect,
  onNext,
}: SelectProviderStepProps) {
  const [category, setCategory] = useState<ProviderCategory>("all");
  const [credCounts, setCredCounts] = useState<Record<string, number>>({});
  const filtered = filterProviders(category);
  const categoryLabel =
    PROVIDER_CATEGORIES.find((c) => c.id === category)?.label ??
    "All Providers";

  useEffect(() => {
    void loadCredentials().then((creds) => {
      const counts: Record<string, number> = {};
      for (const c of creds) {
        counts[c.connectorId] = (counts[c.connectorId] ?? 0) + 1;
      }
      setCredCounts(counts);
    });
  }, []);

  return (
    <>
      <Menu shadow="sm" position="bottom-start" withinPortal={false}>
        <Menu.Target>
          <UnstyledButton>
            <Group gap={4} align="center" justify="flex-start">
              <Text
                fw={500}
                fz="sm"
                c={tokens.color.textPrimary}
                style={{ whiteSpace: "nowrap" }}
              >
                {categoryLabel}
              </Text>
              <IconChevronDown
                size={12}
                color={tokens.color.textPrimary}
                aria-hidden
              />
            </Group>
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          {PROVIDER_CATEGORIES.map((cat) => (
            <Menu.Item
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              style={cat.id === category ? { fontWeight: 600 } : undefined}
            >
              {cat.label}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>

      <ScrollArea
        style={{ flex: 1, minHeight: 0 }}
        type="scroll"
        offsetScrollbars
        scrollbarSize={6}
      >
        <Stack gap={tokens.spacing.sectionGap}>
          {filtered.map((entry) => (
            <ProviderSelectCard
              key={entry.connectorId}
              entry={entry}
              selected={selectedConnectorId === entry.connectorId}
              credentialCount={credCounts[entry.connectorId] ?? 0}
              onSelect={() => onSelect(entry.connectorId)}
            />
          ))}
        </Stack>
      </ScrollArea>

      <PrimaryButton onClick={onNext} disabled={selectedConnectorId === null}>
        Select provider
      </PrimaryButton>
    </>
  );
}

function ProviderSelectCard({
  entry,
  selected,
  credentialCount,
  onSelect,
}: {
  entry: ProviderEntry;
  selected: boolean;
  credentialCount: number;
  onSelect: () => void;
}) {
  return (
    <UnstyledButton
      onClick={onSelect}
      style={{
        display: "flex",
        alignItems: "center",
        gap: tokens.spacing.iconTextGap,
        width: "100%",
        padding: tokens.spacing.cardPadding,
        background: tokens.color.bgCard,
        border: selected
          ? "2px solid #2f70ff"
          : `1px solid ${tokens.color.border}`,
        borderRadius: tokens.radius.card,
        cursor: "pointer",
        transition: "border-color 150ms ease",
      }}
    >
      <ProviderAvatar
        providerKey={entry.providerKey}
        size={tokens.size.providerIcon}
      />
      <Stack gap={0} style={{ overflow: "hidden", minWidth: 0 }}>
        <Text fw={600} fz="sm" c={tokens.color.textPrimary} truncate>
          {entry.shortLabel}
        </Text>
        <Text fw={500} fz="xs" c={tokens.color.textSecondary}>
          {credentialCount > 0
            ? `${String(credentialCount)} credential${credentialCount > 1 ? "s" : ""} available`
            : "No credentials available"}
        </Text>
      </Stack>
    </UnstyledButton>
  );
}
