import { useEffect, useRef, useState } from "react";
import {
  Stack,
  Text,
  Button,
  Box,
  Group,
  Select,
  CopyButton,
  ActionIcon,
  Accordion,
} from "@mantine/core";
import {
  IconDownload,
  IconCircleCheck,
  IconCircleX,
  IconCopy,
  IconCheck,
} from "@tabler/icons-react";
import { tokens } from "../theme.js";
import { detectBridge } from "./setup-state.js";
import { OnboardingBanner } from "./OnboardingBanner.js";

type BridgeInstallGuideProps = {
  onBridgeDetected: () => void;
  onBack: () => void;
};

type OS = "windows" | "macos" | "linux";

type VerifyState =
  | { status: "idle" }
  | { status: "polling" }
  | { status: "connected"; version?: string }
  | { status: "failed" };

function detectOS(): OS {
  const ua = navigator.userAgent.toLowerCase();
  const platform = navigator.platform.toLowerCase();
  if (platform.includes("win") || ua.includes("win")) return "windows";
  if (platform.includes("mac") || ua.includes("mac")) return "macos";
  return "linux";
}

const OS_LABELS: Record<OS, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
};

const DOWNLOAD_URL =
  "https://github.com/AltClick/byom-web/releases/latest/download/byom-bridge-win-x64.exe";
const INSTALL_COMMAND = "curl -fsSL https://byomai.com/install.sh | sh";

function WindowsInstructions() {
  return (
    <Stack gap={12}>
      <Group gap={6} align="center">
        <Text size="sm" fw={600} c={tokens.color.textPrimary}>
          ①
        </Text>
        <Text size="sm" fw={600} c={tokens.color.textPrimary}>
          Download
        </Text>
      </Group>

      <Button
        component="a"
        href={DOWNLOAD_URL}
        target="_blank"
        rel="noopener noreferrer"
        fullWidth
        color={tokens.color.btnPrimaryBg}
        c={tokens.color.btnPrimaryText}
        size="md"
        fw={500}
        radius={4}
        leftSection={<IconDownload size={16} stroke={1.5} />}
      >
        <Stack gap={0} align="center">
          <Text size="md" fw={500} c={tokens.color.btnPrimaryText}>
            Download BYOM Bridge for Windows
          </Text>
          <Text
            size="xs"
            fw={500}
            c={tokens.color.btnPrimaryText}
            opacity={0.7}
          >
            byom-bridge-win-x64.exe
          </Text>
        </Stack>
      </Button>

      <Group gap={6} align="center">
        <Text size="sm" fw={600} c={tokens.color.textPrimary}>
          ②
        </Text>
        <Text size="sm" fw={600} c={tokens.color.textPrimary}>
          Run the installer
        </Text>
      </Group>

      <Text size="sm" c={tokens.color.textSecondary}>
        Open your Downloads folder and double-click the file.
      </Text>

      <Box
        p={12}
        style={{
          background: "#fff8e1",
          border: "1px solid #ffe082",
          borderRadius: 4,
        }}
      >
        <Text size="sm" c={tokens.color.textPrimary}>
          If Windows SmartScreen appears, click {"'"}More info{"'"} then {"'"}
          Run anyway{"'"} — the installer is safe.
        </Text>
      </Box>

      <Group gap={6} align="center">
        <Text size="sm" fw={600} c={tokens.color.textPrimary}>
          ③
        </Text>
        <Text size="sm" fw={600} c={tokens.color.textPrimary}>
          That{"'"}s it!
        </Text>
      </Group>

      <Text size="sm" c={tokens.color.textSecondary}>
        The Bridge starts automatically. Come back here and click the button
        below.
      </Text>
    </Stack>
  );
}

function UnixInstructions({ os }: { os: "macos" | "linux" }) {
  const terminalShortcut =
    os === "macos"
      ? "Press ⌘ + Space, type 'Terminal', press Enter"
      : "Press Ctrl + Alt + T";

  return (
    <Stack gap={12}>
      <Group gap={6} align="center">
        <Text size="sm" fw={600} c={tokens.color.textPrimary}>
          ①
        </Text>
        <Text size="sm" fw={600} c={tokens.color.textPrimary}>
          Copy and run this command
        </Text>
      </Group>

      <Box
        p={12}
        style={{
          background: "#f8f9fa",
          border: `1px solid ${tokens.color.border}`,
          borderRadius: 4,
          fontFamily: "monospace",
          fontSize: 12,
          position: "relative" as const,
        }}
      >
        <Group justify="space-between" align="center" wrap="nowrap">
          <Text
            size="sm"
            c={tokens.color.textPrimary}
            style={{ fontFamily: "monospace", wordBreak: "break-all" }}
          >
            {INSTALL_COMMAND}
          </Text>
          <CopyButton value={INSTALL_COMMAND}>
            {({ copied, copy }) => (
              <ActionIcon
                variant="subtle"
                color={copied ? "teal" : "gray"}
                onClick={copy}
                size="sm"
              >
                {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
              </ActionIcon>
            )}
          </CopyButton>
        </Group>
      </Box>

      <Text size="sm" c={tokens.color.textSecondary}>
        Open Terminal: {terminalShortcut}
      </Text>
      <Text size="sm" c={tokens.color.textSecondary}>
        Paste the command and press Enter.
      </Text>
    </Stack>
  );
}

function StatusDot({ color }: { color: string }) {
  return (
    <Box
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

function PulsingDot() {
  return (
    <Box
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: tokens.color.textSecondary,
        flexShrink: 0,
        animation: "pulse 1.5s ease-in-out infinite",
      }}
    />
  );
}

export function BridgeInstallGuide({
  onBridgeDetected,
  onBack,
}: BridgeInstallGuideProps) {
  const [selectedOS, setSelectedOS] = useState<OS>(detectOS);
  const [verifyState, setVerifyState] = useState<VerifyState>({
    status: "idle",
  });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = () => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = () => {
    stopPolling();
    setVerifyState({ status: "polling" });

    const poll = () => {
      void detectBridge().then((result) => {
        if (result.connected) {
          stopPolling();
          setVerifyState(
            result.version != null
              ? { status: "connected", version: result.version }
              : { status: "connected" },
          );
        }
      });
    };

    poll();
    pollRef.current = setInterval(poll, 3000);
  };

  const handleManualCheck = () => {
    stopPolling();
    setVerifyState({ status: "polling" });
    void detectBridge().then((result) => {
      if (result.connected) {
        setVerifyState(
          result.version != null
            ? { status: "connected", version: result.version }
            : { status: "connected" },
        );
      } else {
        setVerifyState({ status: "failed" });
      }
    });
  };

  // Auto-advance when connected
  useEffect(() => {
    if (verifyState.status === "connected") {
      autoAdvanceRef.current = setTimeout(onBridgeDetected, 2000);
    }
    return () => {
      if (autoAdvanceRef.current !== null) {
        clearTimeout(autoAdvanceRef.current);
        autoAdvanceRef.current = null;
      }
    };
  }, [verifyState.status, onBridgeDetected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  return (
    <Box style={{ maxWidth: 600, margin: "0 auto" }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>

      <OnboardingBanner step={1} totalSteps={3} label="Install the Bridge" />

      <Stack gap={16} p={16}>
        <Text
          size="xs"
          c={tokens.color.textSecondary}
          style={{ cursor: "pointer" }}
          onClick={onBack}
        >
          ← Back
        </Text>

        {/* Description */}
        <Stack gap={8}>
          <Text size="lg" fw={600} c={tokens.color.textPrimary}>
            Install the BYOM Bridge
          </Text>
          <Text size="md" c={tokens.color.textSecondary}>
            The Bridge is a small app that runs quietly in the background. It
            connects this extension to your AI providers — like Ollama, ChatGPT,
            or Claude — without exposing your credentials to websites.
          </Text>
        </Stack>

        {/* OS Detection */}
        <Box
          p={12}
          style={{
            background: "#f8f9fa",
            border: `1px solid ${tokens.color.border}`,
            borderRadius: 4,
          }}
        >
          <Group gap={8} align="center">
            <Text size="sm" fw={500} c={tokens.color.textPrimary}>
              Detected: {OS_LABELS[selectedOS]}
            </Text>
            <Select
              size="xs"
              variant="unstyled"
              value={selectedOS}
              onChange={(val) => {
                if (val) setSelectedOS(val as OS);
              }}
              data={[
                { value: "windows", label: "Windows" },
                { value: "macos", label: "macOS" },
                { value: "linux", label: "Linux" },
              ]}
              styles={{
                input: {
                  color: tokens.color.textSecondary,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  minWidth: 90,
                  textDecoration: "underline",
                },
              }}
            />
          </Group>
        </Box>

        {/* OS-specific instructions */}
        {selectedOS === "windows" && <WindowsInstructions />}
        {(selectedOS === "macos" || selectedOS === "linux") && (
          <UnixInstructions os={selectedOS} />
        )}

        {/* Verify section */}
        <Stack gap={12}>
          {verifyState.status === "idle" && (
            <Button
              fullWidth
              color={tokens.color.btnPrimaryBg}
              c={tokens.color.btnPrimaryText}
              size="md"
              fw={500}
              radius={4}
              onClick={startPolling}
            >
              {"I've installed it — check now"}
            </Button>
          )}

          {verifyState.status === "polling" && (
            <Box
              p={12}
              style={{
                background: "#f8f9fa",
                border: `1px solid ${tokens.color.border}`,
                borderRadius: 4,
              }}
            >
              <Group gap={8} align="center">
                <PulsingDot />
                <Text size="sm" c={tokens.color.textSecondary}>
                  Waiting for Bridge…
                </Text>
              </Group>
            </Box>
          )}

          {verifyState.status === "connected" && (
            <>
              <Box
                p={12}
                style={{
                  background: "#f8f9fa",
                  border: `1px solid ${tokens.color.border}`,
                  borderRadius: 4,
                }}
              >
                <Group gap={8} align="center">
                  <StatusDot color="#2b8a3e" />
                  <Group gap={4}>
                    <IconCircleCheck size={16} color="#2b8a3e" stroke={1.5} />
                    <Text size="sm" fw={500} c={tokens.color.textPrimary}>
                      Bridge connected!
                      {verifyState.version != null &&
                        ` v${verifyState.version}`}
                    </Text>
                  </Group>
                </Group>
              </Box>
              <Button
                fullWidth
                color={tokens.color.btnPrimaryBg}
                c={tokens.color.btnPrimaryText}
                size="md"
                fw={500}
                radius={4}
                onClick={onBridgeDetected}
              >
                {"Continue →"}
              </Button>
            </>
          )}

          {verifyState.status === "failed" && (
            <>
              <Box
                p={12}
                style={{
                  background: "#f8f9fa",
                  border: `1px solid ${tokens.color.border}`,
                  borderRadius: 4,
                }}
              >
                <Group gap={8} align="center">
                  <StatusDot color="#e03131" />
                  <Group gap={4}>
                    <IconCircleX size={16} color="#e03131" stroke={1.5} />
                    <Text size="sm" c={tokens.color.textPrimary}>
                      Couldn{"'"}t reach the Bridge
                    </Text>
                  </Group>
                </Group>
              </Box>
              <Button
                fullWidth
                variant="outline"
                color={tokens.color.textPrimary}
                size="md"
                fw={500}
                radius={4}
                onClick={handleManualCheck}
              >
                Try again
              </Button>
            </>
          )}
        </Stack>

        {/* Troubleshooting */}
        <Accordion variant="contained" radius={4}>
          <Accordion.Item value="not-detected">
            <Accordion.Control>
              <Text size="sm" fw={500} c={tokens.color.textPrimary}>
                Bridge not detected after installing?
              </Text>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap={4}>
                <Text size="sm" c={tokens.color.textSecondary}>
                  • Close and reopen your browser completely.
                </Text>
                <Text size="sm" c={tokens.color.textSecondary}>
                  • Check if your antivirus is blocking the Bridge process.
                </Text>
                <Text size="sm" c={tokens.color.textSecondary}>
                  • Make sure the Bridge app is running in your system tray.
                </Text>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="not-recognized">
            <Accordion.Control>
              <Text size="sm" fw={500} c={tokens.color.textPrimary}>
                Getting a {"'"}not recognized{"'"} error?
              </Text>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap={4}>
                <Text size="sm" c={tokens.color.textSecondary}>
                  • On macOS/Linux: run{" "}
                  <Text span size="sm" style={{ fontFamily: "monospace" }}>
                    chmod +x
                  </Text>{" "}
                  on the downloaded file.
                </Text>
                <Text size="sm" c={tokens.color.textSecondary}>
                  • Check your system{"'"}s security settings to allow apps from
                  identified developers.
                </Text>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="still-stuck">
            <Accordion.Control>
              <Text size="sm" fw={500} c={tokens.color.textPrimary}>
                Still stuck?
              </Text>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap={4}>
                <Text size="sm" c={tokens.color.textSecondary}>
                  • Read the{" "}
                  <Text
                    span
                    size="sm"
                    component="a"
                    href="https://docs.byomai.com/bridge"
                    target="_blank"
                    rel="noopener noreferrer"
                    c={tokens.color.textPrimary}
                    td="underline"
                  >
                    installation docs
                  </Text>
                </Text>
                <Text size="sm" c={tokens.color.textSecondary}>
                  • Ask for help on{" "}
                  <Text
                    span
                    size="sm"
                    component="a"
                    href="https://discord.gg/byom"
                    target="_blank"
                    rel="noopener noreferrer"
                    c={tokens.color.textPrimary}
                    td="underline"
                  >
                    Discord
                  </Text>
                </Text>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Stack>
    </Box>
  );
}
