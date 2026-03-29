import { Alert } from "@mantine/core";

export function Callout({ type = "info", title, children }: { type?: string; title?: string; children: React.ReactNode }) {
  const color = type === "warning" ? "yellow" : type === "success" ? "green" : type === "tip" ? "gray" : "orange";
  return <Alert title={title} color={color} variant="light" my="md">{children}</Alert>;
}
