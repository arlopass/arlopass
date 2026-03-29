import { MantineProvider, createTheme } from "@mantine/core";
import { ArlopassProvider } from "@arlopass/react";
import { ChatSidebar } from "./ChatSidebar";

// Import ONLY the component CSS files we actually use (layer versions).
// These use @layer mantine, so they cannot override the page's own styles.
import "@mantine/core/styles/global.layer.css";
import "@mantine/core/styles/default-css-variables.layer.css";
import "@mantine/core/styles/UnstyledButton.layer.css";
import "@mantine/core/styles/Button.layer.css";
import "@mantine/core/styles/ActionIcon.layer.css";
import "@mantine/core/styles/Text.layer.css";
import "@mantine/core/styles/Input.layer.css";
import "@mantine/core/styles/ScrollArea.layer.css";
import "@mantine/core/styles/Menu.layer.css";
import "@mantine/core/styles/Popover.layer.css";
import "@mantine/core/styles/Pill.layer.css";
import "@mantine/core/styles/Tooltip.layer.css";
import "@mantine/core/styles/ModalBase.layer.css";
import "@mantine/core/styles/Overlay.layer.css";
import "@mantine/core/styles/Loader.layer.css";
import "@mantine/core/styles/CloseButton.layer.css";

const theme = createTheme({
  fontFamily:
    "'Geist Sans Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  fontFamilyMonospace:
    "'Geist Mono Variable', ui-monospace, SFMono-Regular, Menlo, monospace",
  primaryColor: "brand",
  defaultRadius: "sm",
  colors: {
    brand: [
      "#FFF7ED",
      "#FFEDD5",
      "#FED7AA",
      "#FDBA74",
      "#FB923C",
      "#F97316",
      "#EA580C",
      "#DB4D12",
      "#9A3412",
      "#7C2D12",
    ],
  },
  fontSizes: {
    xs: "12px",
    sm: "14px",
    md: "16px",
    lg: "18px",
    xl: "20px",
  },
});

export default function ChatSidebarPanel({
  onClose,
}: {
  onClose: () => void;
}) {
  return (
    <MantineProvider theme={theme} forceColorScheme="dark">
      <ArlopassProvider>
        <div
          id="arlopass-chat-panel"
          data-mantine-color-scheme="dark"
          style={{
            position: "fixed",
            right: 0,
            top: 56,
            bottom: 0,
            width: 340,
            zIndex: 50,
            borderLeft: "1px solid var(--ap-border)",
            background: "var(--ap-bg-surface)",
          }}
        >
          <ChatSidebar
            onClose={onClose}
            onNavigate={(pageId) => {
              window.location.href = "/docs/" + pageId;
            }}
          />
        </div>
      </ArlopassProvider>
    </MantineProvider>
  );
}
