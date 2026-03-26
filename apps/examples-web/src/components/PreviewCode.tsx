import { useState, type ReactNode } from "react";
import { Box, Group, SegmentedControl, Stack } from "@mantine/core";
import { IconCode, IconEye } from "@tabler/icons-react";
import { CodeBlock, type CodeVariant } from "./CodeBlock";

export type PreviewCodeProps = {
  /** Live preview content */
  preview: ReactNode;
  /** Code string for single-SDK display */
  code?: string;
  /** Multi-SDK code variants */
  variants?: CodeVariant[];
  /** Title for the code block header */
  title?: string;
  /** Optional run handler for the code block */
  onRun?: (() => void) | undefined;
  /** Default tab */
  defaultTab?: "preview" | "code";
};

export function PreviewCode({
  preview,
  code,
  variants,
  title,
  onRun,
  defaultTab = "preview",
}: PreviewCodeProps) {
  const [tab, setTab] = useState<string>(defaultTab);

  return (
    <Stack gap={0} style={{ border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8, overflow: "hidden" }}>
      {/* Tab header */}
      <Group
        px="md"
        py={8}
        justify="space-between"
        style={{ borderBottom: "1px solid var(--mantine-color-gray-3)", background: "var(--mantine-color-gray-0)" }}
      >
        <SegmentedControl
          size="xs"
          value={tab}
          onChange={setTab}
          data={[
            { value: "preview", label: <Group gap={4} wrap="nowrap"><IconEye size={14} /> Preview</Group> },
            { value: "code", label: <Group gap={4} wrap="nowrap"><IconCode size={14} /> Code</Group> },
          ]}
        />
      </Group>

      {/* Content */}
      {tab === "preview" && (
        <Box p="md" style={{ background: "white" }}>
          {preview}
        </Box>
      )}
      {tab === "code" && (
        <CodeBlock
          title={title}
          code={code}
          variants={variants}
          onRun={onRun}
          compact={false}
        />
      )}
    </Stack>
  );
}
