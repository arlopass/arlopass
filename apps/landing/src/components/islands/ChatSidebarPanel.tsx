import { MantineProvider, createTheme } from "@mantine/core";
import { ArlopassProvider } from "@arlopass/react";
import { ChatSidebar } from "./ChatSidebar";

// Mantine CSS is imported HERE — inside the lazy chunk.
// It only loads when the user actually opens the chat panel.
import "@mantine/core/styles.css";

const theme = createTheme({
  primaryColor: "brand",
  defaultRadius: "sm",
  cssVariablesSelector: "#arlopass-chat-panel",
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
});

export default function ChatSidebarPanel({
  onClose,
}: {
  onClose: () => void;
}) {
  return (
    <MantineProvider
      theme={theme}
      defaultColorScheme="dark"
      getRootElement={() =>
        document.getElementById("arlopass-chat-panel") || document.body
      }
    >
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
