import { useState, useMemo } from "react";
import {
  ActionIcon,
  Box,
  CopyButton,
  Group,
  Menu,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconPlayerPlay,
} from "@tabler/icons-react";
import Editor from "@monaco-editor/react";
import { useSDK } from "./SDKContext";

export type CodeVariant = {
  sdkId: string;
  code: string;
  label?: string;
};

export type CodeBlockProps = {
  /** Title shown in the header bar (e.g. "Command Line", "client.ts") */
  title?: string | undefined;
  /** Single code string — uses the active SDK context */
  code?: string | undefined;
  /** Multiple SDK variants — shows a switcher */
  variants?: CodeVariant[] | undefined;
  /** Override language for syntax hint */
  language?: string | undefined;
  /** Show a run/execute button */
  onRun?: (() => void) | undefined;
  /** Compact mode — no header */
  compact?: boolean | undefined;
  /** INTERNAL, do not use. Used to adjust styling when rendered inside a PreviewCode component */
  inPreview?: boolean | undefined;
};

export function CodeBlock({ title, code, variants, language, onRun, compact, inPreview }: CodeBlockProps) {
  const { activeSDK, setActiveSDK, sdks } = useSDK();
  const [localSDK, setLocalSDK] = useState(activeSDK);

    const hasVariants = variants != null && variants.length > 0;

  // Resolve the code to display
  let displayCode = code ?? "";
  let displayLabel = sdks.find((s) => s.id === activeSDK)?.label ?? "TypeScript";

  if (hasVariants) {
    const match = variants.find((v) => v.sdkId === localSDK) ?? variants[0];
    if (match != null) {
      displayCode = match.code;
      displayLabel = match.label ?? sdks.find((s) => s.id === match.sdkId)?.label ?? match.sdkId;
    }
  }

  const handleSDKChange = (id: string) => {
    setLocalSDK(id);
    setActiveSDK(id);
  };

  // Resolve Monaco language
  const monacoLang = useMemo(() => {
    if (language) return language;
    const sdk = sdks.find((s) => s.id === localSDK);
    return sdk?.language ?? "typescript";
  }, [language, localSDK, sdks]);

  // Calculate editor height from line count
  const lineCount = displayCode.split("\n").length;
  const editorHeight = Math.min(Math.max(lineCount * 20 + 16, 60), 500);

  if (compact) {
    return (
      <Box style={inPreview ? {} : { overflow: "hidden", border: "1px solid var(--mantine-color-gray-3)" }}>
        <Editor
          height={editorHeight}
          language={monacoLang}
          value={displayCode}
          theme="light"
          options={{ readOnly: true, minimap: { enabled: false }, scrollBeyondLastLine: false, lineNumbers: "off", folding: false, fontSize: 13, padding: { top: 8, bottom: 8 }, renderLineHighlight: "none", overviewRulerLanes: 0, scrollbar: { vertical: "hidden", horizontal: "auto", handleMouseWheel: false, alwaysConsumeMouseWheel: false } }}
        />
      </Box>
    );
  }

  return (
    <Box style={inPreview ? {} : { border: "1px solid var(--mantine-color-gray-3)", borderRadius: 8, overflow: "hidden" }}>
      {/* Header bar */}
      <Group
        justify="space-between"
        px="md"
        py={8}
        style={{
          background: "var(--mantine-color-gray-0)",
          borderBottom: "1px solid var(--mantine-color-gray-3)",
        }}
      >
        <Group gap="xs">
          {title && (
            <Text fz="xs" fw={500} c="dimmed">
              {title}
            </Text>
          )}
        </Group>

        <Group gap={4}>
          {/* SDK/Language switcher */}
          {hasVariants && variants.length > 1 ? (
            <Menu shadow="md" position="bottom-end" withinPortal>
              <Menu.Target>
                <Group
                  gap={4}
                  style={{
                    cursor: "pointer",
                    padding: "2px 10px",
                    borderRadius: 4,
                    background: "var(--mantine-color-gray-2)",
                  }}
                >
                  <Text fz="xs" fw={500}>{displayLabel}</Text>
                  <IconChevronDown size={12} />
                </Group>
              </Menu.Target>
              <Menu.Dropdown>
                {variants.map((v) => {
                  const sdk = sdks.find((s) => s.id === v.sdkId);
                  const label = v.label ?? sdk?.label ?? v.sdkId;
                  return (
                    <Menu.Item
                      key={v.sdkId}
                      onClick={() => handleSDKChange(v.sdkId)}
                      rightSection={localSDK === v.sdkId ? <IconCheck size={14} /> : null}
                    >
                      {label}
                    </Menu.Item>
                  );
                })}
              </Menu.Dropdown>
            </Menu>
          ) : (
            <Text fz="xs" fw={500} c="dimmed">{displayLabel}</Text>
          )}

          {/* Copy button */}
          <CopyButton value={displayCode} timeout={2000}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? "Copied" : "Copy"} withArrow>
                <ActionIcon variant="subtle" color={copied ? "teal" : "gray"} size="sm" onClick={copy}>
                  {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>

          {/* Run button */}
          {onRun != null && (
            <Tooltip label="Run" withArrow>
              <ActionIcon variant="subtle" color="teal" size="sm" onClick={onRun}>
                <IconPlayerPlay size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Group>

      {/* Code content — Monaco Editor with light theme */}
      <Editor
        height={editorHeight}
        language={monacoLang}
        value={displayCode}
        theme="light"
        options={{
          readOnly: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          lineNumbers: "on",
          folding: false,
          fontSize: 13,
          padding: { top: 12, bottom: 12 },
          renderLineHighlight: "none",
          overviewRulerLanes: 0,
          scrollbar: { vertical: "hidden", horizontal: "auto", handleMouseWheel: false, alwaysConsumeMouseWheel: false },
          contextmenu: false,
          domReadOnly: true,
        }}
      />
    </Box>
  );
}
