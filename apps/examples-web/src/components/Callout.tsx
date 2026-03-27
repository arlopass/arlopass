import type { ReactNode } from "react";
import { Alert, Text } from "@mantine/core";
import {
  IconAlertTriangle,
  IconBulb,
  IconCircleCheck,
  IconInfoCircle,
} from "@tabler/icons-react";

export type CalloutProps = {
  type?: "info" | "warning" | "success" | "tip";
  title?: string;
  children: ReactNode;
};

const CONFIG = {
  info: {
    icon: IconInfoCircle,
    style: {
      background: "var(--ap-brand-subtle-dark)",
      border: "1px solid var(--ap-border)",
      color: "var(--ap-text-body)",
    },
    iconColor: "var(--ap-brand)",
  },
  warning: {
    icon: IconAlertTriangle,
    style: {
      background: "var(--ap-warning-subtle)",
      border: "1px solid var(--ap-border)",
      color: "var(--ap-text-body)",
    },
    iconColor: "var(--ap-warning)",
  },
  success: {
    icon: IconCircleCheck,
    style: {
      background: "var(--ap-success-subtle)",
      border: "1px solid var(--ap-border)",
      color: "var(--ap-text-body)",
    },
    iconColor: "var(--ap-success)",
  },
  tip: {
    icon: IconBulb,
    style: {
      background: "var(--ap-warning-subtle)",
      border: "1px solid var(--ap-border)",
      color: "var(--ap-text-body)",
    },
    iconColor: "var(--ap-amber)",
  },
} as const;

export function Callout({ type = "info", title, children }: CalloutProps) {
  const { icon: Icon, style, iconColor } = CONFIG[type];
  return (
    <Alert
      radius="md"
      icon={<Icon size={18} style={{ color: iconColor }} />}
      title={title}
      styles={{
        root: style,
        title: { color: "var(--ap-text-primary)" },
      }}
    >
      {typeof children === "string" ? (
        <Text fz="sm">{children}</Text>
      ) : (
        children
      )}
    </Alert>
  );
}
