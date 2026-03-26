import { Group, Text, UnstyledButton } from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import { tokens } from "./theme.js";

export type CategorySelectorProps = {
  label: string;
  onClick?: (() => void) | undefined;
};

export function CategorySelector({ label, onClick }: CategorySelectorProps) {
  return (
    <UnstyledButton onClick={onClick} aria-haspopup="listbox" aria-label={`Filter: ${label}`}>
      <Group gap={4} align="center" justify="flex-start">
        <Text fw={500} fz="sm" c={tokens.color.textPrimary} lh="normal" style={{ whiteSpace: "nowrap" }}>
          {label}
        </Text>
        <IconChevronDown
          size={tokens.size.categorySelectorIcon}
          color={tokens.color.textPrimary}
          aria-hidden
        />
      </Group>
    </UnstyledButton>
  );
}
