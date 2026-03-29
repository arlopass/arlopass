import { useState, type ReactNode } from "react";
import { Box, Code, Group, SegmentedControl, Stack } from "@mantine/core";

type PreviewCodeProps = {
  preview: ReactNode;
  code?: string;
  title?: string;
  defaultTab?: "preview" | "code";
};

export function PreviewCode({
  preview,
  code,
  title,
  defaultTab = "preview",
}: PreviewCodeProps) {
  const [tab, setTab] = useState<string>(defaultTab);

  return (
    <Stack
      gap={0}
      style={{
        border: "1px solid var(--mantine-color-default-border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <Group
        px="md"
        py={8}
        justify="space-between"
        style={{
          borderBottom: "1px solid var(--mantine-color-default-border)",
        }}
      >
        <SegmentedControl
          size="xs"
          value={tab}
          onChange={setTab}
          data={[
            { value: "preview", label: "Preview" },
            { value: "code", label: "Code" },
          ]}
        />
        {title && (
          <Box style={{ fontSize: "0.75rem", opacity: 0.6 }}>{title}</Box>
        )}
      </Group>
      <Box p="md">
        {tab === "preview" ? (
          preview
        ) : (
          <Code block style={{ fontSize: "0.8rem", whiteSpace: "pre-wrap" }}>
            {code ?? ""}
          </Code>
        )}
      </Box>
    </Stack>
  );
}
