import { ActionIcon, Group, Menu, Text, UnstyledButton } from "@mantine/core";
import { IconChevronDown, IconSettings } from "@tabler/icons-react";
import { tokens } from "./theme.js";

export type HeaderMenuItem = {
  label: string;
  subtitle?: string | undefined;
  active?: boolean | undefined;
  onClick: () => void;
};

export type WalletHeaderProps = {
  title: string;
  subtitle?: string | undefined;
  collapsed?: boolean | undefined;
  onToggleCollapse?: (() => void) | undefined;
  onSettingsClick?: (() => void) | undefined;
  menuItems?: readonly HeaderMenuItem[] | undefined;
};

export function WalletHeader({
  title,
  subtitle,
  collapsed,
  onToggleCollapse,
  onSettingsClick,
  menuItems,
}: WalletHeaderProps) {
  const hasMenu = menuItems != null && menuItems.length > 0;

  const titleContent = (
    <Group gap={8}>
      <IconChevronDown
        size={tokens.size.headerCollapseIcon}
        color={tokens.color.textPrimary}
        style={{
          transform: collapsed === true ? "rotate(-90deg)" : undefined,
          transition: "transform 150ms ease",
        }}
        aria-hidden
      />
      <Group gap={4} align="baseline">
        <Text
          fw={600}
          fz="lg"
          c={tokens.color.textPrimary}
          lh="normal"
          style={{ whiteSpace: "nowrap" }}
        >
          {title}
        </Text>
        {subtitle != null && (
          <Text fz="xs" c={tokens.color.textSecondary} lh="normal" style={{ whiteSpace: "nowrap" }}>
            ({subtitle})
          </Text>
        )}
      </Group>
    </Group>
  );

  return (
    <Group
      justify="space-between"
      style={{
        padding: tokens.spacing.headerPadding,
        background: tokens.color.bgSurface,
        borderBottom: `1px solid ${tokens.color.bgSurface}`,
      }}
    >
      {hasMenu ? (
        <Menu shadow="sm" position="bottom-start" withinPortal={false}>
          <Menu.Target>
            <UnstyledButton aria-label="Switch view">
              {titleContent}
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown>
            {menuItems.map((item, i) => (
              <Menu.Item
                key={i}
                onClick={item.onClick}
                style={item.active === true ? { fontWeight: 600 } : undefined}
              >
                <Group gap={4}>
                  <Text fz="sm" fw={item.active === true ? 600 : 400}>{item.label}</Text>
                  {item.subtitle != null && (
                    <Text fz="xs" c={tokens.color.textSecondary}>({item.subtitle})</Text>
                  )}
                </Group>
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      ) : (
        <UnstyledButton
          onClick={onToggleCollapse}
          aria-label={collapsed === true ? "Expand wallet" : "Collapse wallet"}
        >
          {titleContent}
        </UnstyledButton>
      )}
      <ActionIcon
        variant="subtle"
        color={tokens.color.textSecondary}
        onClick={onSettingsClick}
        aria-label="Settings"
        size={tokens.size.headerSettingsIcon}
      >
        <IconSettings size={tokens.size.headerSettingsIcon} aria-hidden />
      </ActionIcon>
    </Group>
  );
}

