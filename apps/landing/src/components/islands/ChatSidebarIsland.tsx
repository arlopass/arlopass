import { useEffect, useState } from "react";
import { MantineProvider, createTheme } from "@mantine/core";
import { ArlopassProvider } from "@arlopass/react";
import { ChatSidebar } from "./ChatSidebar";

import "@mantine/core/styles.css";

const theme = createTheme({
  primaryColor: "brand",
  defaultRadius: "sm",
  colors: {
    brand: [
      "#FFF7ED", "#FFEDD5", "#FED7AA", "#FDBA74", "#FB923C",
      "#F97316", "#EA580C", "#DB4D12", "#9A3412", "#7C2D12",
    ],
  },
});

export default function ChatSidebarIsland() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    document.addEventListener("toggle-chat", handler);
    return () => document.removeEventListener("toggle-chat", handler);
  }, []);

  if (!open) return null;

  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <ArlopassProvider>
        <div
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
            onClose={() => setOpen(false)}
            onNavigate={(pageId) => {
              window.location.href = "/docs/" + pageId;
            }}
          />
        </div>
      </ArlopassProvider>
    </MantineProvider>
  );
}
