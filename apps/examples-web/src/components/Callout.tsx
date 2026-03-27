import type { ReactNode } from "react";
import { Alert, Text } from "@mantine/core";
import { IconAlertTriangle, IconBulb, IconCircleCheck, IconInfoCircle } from "@tabler/icons-react";

export type CalloutProps = {
  type?: "info" | "warning" | "success" | "tip";
  title?: string;
  children: ReactNode;
};

const CONFIG = {
  info: { color: "blue", icon: IconInfoCircle },
  warning: { color: "orange", icon: IconAlertTriangle },
  success: { color: "teal", icon: IconCircleCheck },
  tip: { color: "grape", icon: IconBulb },
} as const;

export function Callout({ type = "info", title, children }: CalloutProps) {
  const { color, icon: Icon } = CONFIG[type];
  return (
    <Alert
      color={color}
      variant="light"
      radius="md"
      icon={<Icon size={18} />}
      title={title}
    >
      {typeof children === "string" ? <Text fz="sm">{children}</Text> : children}
    </Alert>
  );
}
