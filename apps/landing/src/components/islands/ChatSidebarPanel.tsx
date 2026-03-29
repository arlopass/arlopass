import { MantineProvider, createTheme } from "@mantine/core";
import { ArlopassProvider } from "@arlopass/react";
import { ChatSidebar } from "./ChatSidebar";
import { useEffect, useRef } from "react";

// Individual component CSS (layer versions — won't bleed global resets)
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

// Force dark mode vars on the panel. The default-css-variables.layer.css
// defines dark vars under :root[data-mantine-color-scheme='dark'] which
// doesn't work reliably as a React island. This inline approach is bulletproof.
const DARK_VARS_CSS = `
#arlopass-chat-panel,
#arlopass-chat-panel *,
#arlopass-chat-panel [data-mantine-color-scheme] {
  --mantine-color-scheme: dark;
  --mantine-color-body: #1c1917;
  --mantine-color-text: #d6d3d1;
  --mantine-color-dimmed: #78716c;
  --mantine-color-white: #fff;
  --mantine-color-black: #000;
  --mantine-color-default: #292524;
  --mantine-color-default-hover: #3d3835;
  --mantine-color-default-color: #d6d3d1;
  --mantine-color-default-border: #44403c;
  --mantine-color-bright: #d6d3d1;
  --mantine-color-anchor: #db4d12;
  --mantine-color-dark-filled: #292524;
  --mantine-color-dark-filled-hover: #3d3835;
  --mantine-color-dark-light: rgba(255,255,255,0.06);
  --mantine-color-dark-light-hover: rgba(255,255,255,0.1);
  --mantine-color-dark-light-color: #d6d3d1;
  --mantine-color-dark-outline: #44403c;
  --mantine-color-dark-outline-hover: rgba(255,255,255,0.06);
  color-scheme: dark;
}
`;

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
  const containerRef = useRef<HTMLDivElement>(null);

  // Inject dark vars stylesheet once on mount
  useEffect(() => {
    const id = "arlopass-chat-dark-vars";
    if (!document.getElementById(id)) {
      const style = document.createElement("style");
      style.id = id;
      style.textContent = DARK_VARS_CSS;
      document.head.appendChild(style);
    }
    return () => {
      document.getElementById(id)?.remove();
    };
  }, []);

  return (
    <MantineProvider
      theme={theme}
      forceColorScheme="dark"
      getRootElement={() => containerRef.current || document.body}
    >
      <ArlopassProvider>
        <div
          ref={containerRef}
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
            colorScheme: "dark",
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
